import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { Papel } from "../equipe/regras"
import { situacaoDaConexao } from "../erp/conexao"
import { erpDaTela } from "../erp/erps"
import { configuracaoDoGa4 } from "../painel/ga4"
import { chaveDoDia } from "../painel/formato"
import {
  noArNaTela,
  problemaDasRotinasParadas,
  podeVer,
  telaDaObservabilidade,
  type LinhaDaRotina,
  type LinhaDoProblema,
  type LinhaDoSinal,
  type TelaDaObservabilidade,
} from "../painel/observabilidade"
import { ERP } from "../../modules/erp"
import type ErpService from "../../modules/erp/service"
import { OBSERVABILIDADE } from "../../modules/observabilidade"
import type ObservabilidadeService from "../../modules/observabilidade/service"
import { vigiarNaTela } from "./vigia"

/**
 * O QUE A TELA DE OBSERVABILIDADE LÊ — a tabela em dia (o vigia, se não
 * rodou há pouco), os problemas abertos e os resolvidos nos últimos 30 dias,
 * as rotinas, os sinais de hoje, a conexão do ERP, a loja agora, o tempo no
 * ar dos últimos 30 dias e a velocidade dos últimos 28.
 */

const DIA = 24 * 60 * 60 * 1000
/** Quando este processo do Medusa ligou. */
const LIGADO_EM = new Date(Date.now() - process.uptime() * 1000)

/*
  A LOJA AGORA — uma ida ao endereço dela, guardada por 1 minuto: a tela
  aberta em várias abas não vira uma visita por aba.
*/
type Loja = { configurada: boolean; ok: boolean; ms: number | null; motivo: string | null }

/** Os dias da conferência da loja (o job do vigia, de 5 em 5 minutos) dos últimos 30. */
const TRINTA_DIAS = 29 * 24 * 60 * 60 * 1000
const VINTE_E_OITO_DIAS = 28 * 24 * 60 * 60 * 1000
let lojaGuardada: { em: number; loja: Loja } | null = null

async function lojaAgora(agora: Date): Promise<Loja> {
  const url = (process.env.LOJA_URL ?? "").trim()
  if (!/^https?:\/\//.test(url)) return { configurada: false, ok: false, ms: null, motivo: null }
  if (lojaGuardada && agora.getTime() - lojaGuardada.em < 60_000) return lojaGuardada.loja
  const inicio = Date.now()
  let loja: Loja
  try {
    const r = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5000) })
    await r.body?.cancel().catch(() => undefined)
    loja =
      r.status < 500
        ? { configurada: true, ok: true, ms: Date.now() - inicio, motivo: null }
        : { configurada: true, ok: false, ms: null, motivo: `respondeu ${r.status}` }
  } catch (e) {
    const tempo = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")
    loja = {
      configurada: true,
      ok: false,
      ms: null,
      motivo: tempo ? "não respondeu em 5 segundos" : "fora do ar",
    }
  }
  lojaGuardada = { em: agora.getTime(), loja }
  return loja
}

export async function lerTela(
  container: MedusaContainer,
  papel: Papel,
  agora = new Date()
): Promise<TelaDaObservabilidade> {
  await vigiarNaTela(container, agora).catch((e) =>
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(`[observabilidade] o vigia falhou na tela: ${e instanceof Error ? e.message : e}`)
  )
  const obs = container.resolve<ObservabilidadeService>(OBSERVABILIDADE)
  const erp = erpDaTela()
  const [problemas, rotinas, sinais, conexao, notas, loja, noAr, velocidade] = await Promise.all([
    obs.listProblemas(
      {
        $or: [
          { situacao: "aberto" },
          { resolvido_em: { $gte: new Date(agora.getTime() - 30 * DIA) } },
        ],
      },
      { take: 300, order: { ultima_em: "DESC" } }
    ),
    obs.listRotinas({}, { take: 50 }),
    obs.listSinaisDasIntegracoes({ dia: chaveDoDia(agora) }, { take: 50 }),
    situacaoDaConexao(container, erp),
    container
      .resolve<ErpService>(ERP)
      .listNotas(
        { situacao: "autorizada" },
        { select: ["emitida_em"], order: { emitida_em: "DESC" }, take: 1 }
      )
      .catch(() => []),
    lojaAgora(agora),
    obs.listSinaisDasIntegracoes(
      { integracao: "loja-no-ar", dia: { $gte: chaveDoDia(agora.getTime() - TRINTA_DIAS) } },
      { take: 40 }
    ),
    obs.velocidade(new Date(agora.getTime() - VINTE_E_OITO_DIAS)),
  ])
  const diasNoAr = noAr as unknown as LinhaDoSinal[]
  const ultimaNota = (notas as { emitida_em?: Date | string | null }[])[0]?.emitida_em

  return telaDaObservabilidade(papel, {
    agora,
    problemas: problemas as unknown as LinhaDoProblema[],
    rotinas: rotinas as unknown as LinhaDaRotina[],
    integracoes: {
      agora,
      producao: process.env.NODE_ENV === "production",
      loja: { ...loja, noAr: noArNaTela(diasNoAr, agora).valor },
      medusaDesde: LIGADO_EM,
      pagarme: Boolean(process.env.PAGARME_SECRET_KEY),
      frenet: Boolean(process.env.FRENET_TOKEN),
      resend: Boolean(process.env.RESEND_API_KEY),
      ga4: typeof configuracaoDoGa4() === "object",
      erp: {
        nome: erp.nome,
        configurado: conexao.configurado,
        conectado: conexao.conectado,
        queda: conexao.queda,
        ultimaNota: ultimaNota ? new Date(ultimaNota) : null,
      },
      sinais: sinais as unknown as LinhaDoSinal[],
    },
    velocidade,
    noAr: diasNoAr,
  })
}

/**
 * O número vermelho do menu: quantos problemas graves abertos o papel vê —
 * com as rotinas paradas, que não moram na tabela.
 */
export async function gravesAbertos(container: MedusaContainer, papel: Papel, agora = new Date()) {
  const obs = container.resolve<ObservabilidadeService>(OBSERVABILIDADE)
  const [graves, rotinas] = await Promise.all([
    obs.listProblemas({ situacao: "aberto", nivel: "grave" }, { select: ["so_dono"], take: 100 }),
    obs.listRotinas({}, { select: ["nome", "ultima_inicio"], take: 50 }),
  ])
  const paradas = problemaDasRotinasParadas(rotinas as unknown as LinhaDaRotina[], agora)
  return (
    (graves as { so_dono?: boolean | null }[]).filter((p) => podeVer(papel, p)).length +
    (paradas ? 1 : 0)
  )
}
