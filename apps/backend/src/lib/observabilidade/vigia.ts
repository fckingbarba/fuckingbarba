import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { lerConfiguracoes } from "../configuracoes"
import { lerConexao } from "../erp/conexao"
import { erpDaLoja } from "../erp/erps"
import { chaveDoDia } from "../painel/formato"
import { enviosDos, notasDos, pedidosRecentes } from "../painel/ler"
import {
  conciliarProblemas,
  problemaDoErp,
  problemasDasRotinas,
  problemasDosPedidos,
  problemasDosSinais,
  SOZINHA,
  type LinhaDaRotina,
  type LinhaDoSinal,
  type ProblemaAchado,
  type ProblemaGravado,
} from "../painel/observabilidade"
import { OBSERVABILIDADE } from "../../modules/observabilidade"
import type ObservabilidadeService from "../../modules/observabilidade/service"
import { semDadoPessoal } from "./sinal"

/**
 * O VIGIA — de 5 em 5 minutos (o job `vigiar-a-loja`), e na hora em que
 * alguém abre a tela de Observabilidade: lê a loja, acha os problemas
 * (`lib/painel/observabilidade.ts`) e põe a tabela `obs_problema` em dia —
 * cria o novo, atualiza o aberto, reabre o que voltou, e dá como resolvido
 * sozinho o de estado que sumiu.
 *
 * Lê o mesmo que o Início: os pedidos dos últimos 45 dias (até 500), com as
 * notas e os envios. E a conexão do ERP, as rotinas e os sinais de hoje e de
 * ontem (a falha das 23:58 não fica pra trás na virada do dia).
 */

const DIA = 24 * 60 * 60 * 1000

/** `MEDUSA_BACKEND_URL`, pros botões que abrem o admin do Medusa. */
export function urlDoAdmin(): string | null {
  const base = (process.env.MEDUSA_BACKEND_URL ?? "").trim().replace(/\/+$/, "")
  return /^https?:\/\//.test(base) ? base : null
}

async function vigiarAgora(container: MedusaContainer, agora: Date): Promise<void> {
  const obs = container.resolve<ObservabilidadeService>(OBSERVABILIDADE)
  const erp = erpDaLoja()

  const pedidos = await pedidosRecentes(container, { limite: 500, dias: 45, agora })
  const ids = pedidos.map((o) => o.id)
  const [notas, envios, conexao, rotinas, sinais, lojas] = await Promise.all([
    notasDos(container, ids),
    enviosDos(container, ids),
    erp ? lerConexao(container, erp) : null,
    obs.listRotinas({}, { take: 50 }),
    obs.listSinaisDasIntegracoes(
      { dia: [chaveDoDia(agora), chaveDoDia(agora.getTime() - DIA)] },
      { take: 50 }
    ),
    container.resolve(Modules.STORE).listStores({}, { select: ["metadata"], take: 1 }),
  ])
  const admin = urlDoAdmin()

  const doErp = problemaDoErp(
    erp
      ? {
          id: erp.id,
          nome: erp.nome,
          configurado: erp.configurado(),
          queda: conexao?.queda ?? null,
        }
      : null,
    { agora, admin }
  )
  const achados: ProblemaAchado[] = [
    ...problemasDosPedidos(
      pedidos.map((o) => ({ o, nota: notas.get(o.id) ?? null, envios: envios.get(o.id) ?? [] })),
      agora
    ),
    ...(doErp ? [doErp] : []),
    ...problemasDasRotinas(rotinas as unknown as LinhaDaRotina[], agora),
    ...problemasDosSinais(sinais as unknown as LinhaDoSinal[], {
      agora,
      emergencia: lerConfiguracoes(lojas[0]?.metadata).cotacao.precoDeEmergencia,
      admin,
    }),
  ]

  const chaves = achados.map((a) => a.chave)
  const gravados = (await obs.listProblemas(
    chaves.length ? { $or: [{ situacao: "aberto" }, { chave: chaves }] } : { situacao: "aberto" },
    { take: 1000 }
  )) as unknown as ProblemaGravado[]

  const m = conciliarProblemas(gravados, achados, new Set(ids))
  const oQueMuda = (a: ProblemaAchado) => ({
    nivel: a.nivel,
    area: a.area,
    titulo: a.titulo,
    texto: a.texto,
    acao: a.acao,
    // A linha técnica vem do Bling, do Pagar.me, da Frenet: sem e-mail e sem CPF.
    detalhe: semDadoPessoal(a.detalhe),
    vezes: a.vezes,
    // O de estado foi "visto" agora; o de evento, na última vez que aconteceu.
    ultima_em: a.sozinho ? agora : a.ocorreu,
  })

  if (m.criar.length) {
    await obs.createProblemas(
      m.criar.map((a) => ({
        ...oQueMuda(a),
        chave: a.chave,
        pedido_id: a.pedidoId,
        primeira_em: a.ocorreu,
        sozinho: a.sozinho,
        so_dono: a.soDono,
        situacao: "aberto" as const,
      }))
    )
  }
  if (m.atualizar.length) {
    await obs.updateProblemas(
      m.atualizar.map(({ id, achado, reabrir }) => ({
        id,
        ...oQueMuda(achado),
        ...(reabrir
          ? {
              situacao: "aberto" as const,
              primeira_em: achado.ocorreu,
              resolvido_em: null,
              resolvido_por: null,
              resolvido_nome: null,
            }
          : {}),
      }))
    )
  }
  if (m.resolver.length) {
    await obs.updateProblemas(
      m.resolver.map((id) => ({
        id,
        situacao: "resolvido" as const,
        resolvido_em: agora,
        resolvido_por: SOZINHA,
      }))
    )
  }

  await obs.limpar(agora)
}

/*
  NUNCA DUAS AO MESMO TEMPO: o job e a tela (ou duas abas) esperam a mesma
  conta — duas juntas criariam o mesmo problema duas vezes, e a segunda
  bateria na chave única.
*/
let andando: Promise<void> | null = null

export function vigiar(container: MedusaContainer, agora = new Date()): Promise<void> {
  andando ??= vigiarAgora(container, agora).finally(() => {
    andando = null
  })
  return andando
}

/** Na tela, no máximo uma vez a cada 30 segundos: recarregar não refaz a conta. */
const FOLGA_MS = 30_000
let ultimaNaTela = 0

export async function vigiarNaTela(container: MedusaContainer, agora = new Date()) {
  if (!andando && agora.getTime() - ultimaNaTela < FOLGA_MS) return
  ultimaNaTela = agora.getTime()
  await vigiar(container, agora)
}
