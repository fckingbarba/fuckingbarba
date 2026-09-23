import { createHash, randomBytes, timingSafeEqual } from "node:crypto"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { ERP } from "../../modules/erp"
import type ErpService from "../../modules/erp/service"
import { avisarAEquipe } from "./avisos"
import { abrir, fechar } from "./cofre"
import type { Acesso, Credenciais, ErpDaLoja, PermissaoNoErp } from "./contrato"
import { emailDaConexaoQueCaiu } from "../emails/erp"

/**
 * A CONEXÃO COM O ERP — os tokens, guardados cifrados, e quem pega.
 *
 * ┌─ CONECTAR ─────────────────────────────────────────────────────────────┐
 * │ No admin, "Conectar" (`POST /admin/erp/conectar`) cria um `estado`     │
 * │ aleatório, grava, e manda o navegador pra tela de autorização do ERP.  │
 * │ O ERP devolve o navegador pra `/hooks/erp/<id>/autorizado` com um      │
 * │ código; a loja confere o `estado` (tem de ser o gravado, e de menos de │
 * │ 10 minutos), APAGA o estado e só então troca o código por tokens.      │
 * │ Nessa ordem: no Bling, o código é de uso único e reusar um REVOGA o    │
 * │ usuário — um F5 na página de volta não pode trocar de novo.            │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * O TOKEN VENCE (no Bling, em 6 horas) e é renovado sozinho, com a trava do
 * Medusa: dois pedidos pagos ao mesmo tempo não renovam duas vezes — o
 * segundo espera e lê o que o primeiro gravou. Se o ERP recusar a
 * renovação (o token de renovação venceu ou foi revogado), a conexão CAI:
 * as credenciais saem, o motivo fica, e a equipe recebe um e-mail (um por
 * dia, enquanto ninguém conectar de novo).
 */

const VALIDADE_DO_ESTADO_MS = 10 * 60 * 1000
/** Renova antes de vencer: o token não pode morrer no meio de uma nota. */
const FOLGA_DO_TOKEN_MS = 5 * 60 * 1000
const DIA_MS = 24 * 60 * 60 * 1000

export type LinhaDaConexao = {
  id: string
  erp: string
  empresa: string | null
  credenciais: string | null
  conectado_em: Date | string | null
  notas_desde: Date | string | null
  estado: string | null
  estado_em: Date | string | null
  queda: string | null
  queda_avisada_em: Date | string | null
  estoque: Record<string, unknown> | null
  janela_da_nota: number | null
}

/**
 * A janela de cancelamento antes da nota, quando ninguém escolheu outra.
 * Decidida em 23/09: 2 horas; no mesmo dia, 5 minutos (a nota sai entre 5 e
 * 10 minutos depois do pagamento — a varredura é de 5 em 5).
 */
export const JANELA_PADRAO_DA_NOTA_MIN = 5
/** A maior: a varredura das notas olha três dias pra trás, e a etiqueta espera a nota. */
export const JANELA_MAXIMA_DA_NOTA_MIN = 24 * 60

/** Os minutos da janela: o que a tela do ERP escolheu, ou o padrão. */
export function minutosDaJanela(linha: Pick<LinhaDaConexao, "janela_da_nota"> | null | undefined) {
  const m = linha?.janela_da_nota
  return typeof m === "number" && Number.isInteger(m) && m >= 0
    ? Math.min(m, JANELA_MAXIMA_DA_NOTA_MIN)
    : JANELA_PADRAO_DA_NOTA_MIN
}

const servico = (container: MedusaContainer) => container.resolve<ErpService>(ERP)

const iguais = (a: string, b: string) => {
  const x = createHash("sha256").update(a).digest()
  const y = createHash("sha256").update(b).digest()
  return timingSafeEqual(x, y)
}

export async function lerConexao(
  container: MedusaContainer,
  erp: ErpDaLoja
): Promise<LinhaDaConexao | null> {
  const [linha] = await servico(container).listConexoes({ erp: erp.id }, { take: 1 })
  return (linha as LinhaDaConexao | undefined) ?? null
}

async function garantirConexao(container: MedusaContainer, erp: ErpDaLoja) {
  return (
    (await lerConexao(container, erp)) ??
    ((await servico(container).createConexoes({ erp: erp.id })) as LinhaDaConexao)
  )
}

export async function atualizarConexao(
  container: MedusaContainer,
  erp: ErpDaLoja,
  dados: Partial<Omit<LinhaDaConexao, "id" | "erp">>
) {
  const linha = await garantirConexao(container, erp)
  await servico(container).updateConexoes({ id: linha.id, ...dados } as never)
}

/* ── conectar ─────────────────────────────────────────────────────────────── */

/** Pra onde mandar o navegador de quem clicou em "Conectar". */
export async function iniciarAutorizacao(
  container: MedusaContainer,
  erp: ErpDaLoja
): Promise<string> {
  const estado = randomBytes(24).toString("base64url")
  await atualizarConexao(container, erp, { estado, estado_em: new Date() })
  return erp.urlDeAutorizacao(estado)
}

export type Conclusao = { ok: true; empresa: string | null } | { ok: false; motivo: string }

export async function concluirAutorizacao(
  container: MedusaContainer,
  erp: ErpDaLoja,
  codigo: string,
  estado: string,
  agora = new Date()
): Promise<Conclusao> {
  return container.resolve(Modules.LOCKING).execute(
    `erp-conexao:${erp.id}`,
    async (): Promise<Conclusao> => {
      const linha = await lerConexao(container, erp)
      if (!linha?.estado || !estado || !iguais(estado, linha.estado)) {
        return { ok: false, motivo: "esta autorização não saiu deste admin, ou já foi usada" }
      }
      // O estado é de uso único: sai ANTES de o código ser trocado.
      await atualizarConexao(container, erp, { estado: null, estado_em: null })
      const desde = linha.estado_em ? new Date(linha.estado_em).getTime() : 0
      if (agora.getTime() - desde > VALIDADE_DO_ESTADO_MS) {
        return {
          ok: false,
          motivo: "a autorização demorou mais de 10 minutos — comece de novo pelo admin",
        }
      }
      if (!codigo) return { ok: false, motivo: "o ERP voltou sem o código de autorização" }

      const r = await erp.concluirAutorizacao(codigo)
      if (!r.ok) return r
      await atualizarConexao(container, erp, {
        credenciais: fechar(r.credenciais, erp.segredoDoCofre(), erp.id),
        empresa: r.empresa,
        conectado_em: agora,
        notas_desde: linha.notas_desde ?? agora,
        queda: null,
        queda_avisada_em: null,
      })
      memoria.set(erp.id, r.credenciais)
      // A nota que esperava (a conexão, ou a permissão que faltava no app)
      // tenta de novo na próxima varredura, em vez de esperar a vez dela.
      await servico(container).updateNotas({
        selector: { erp: erp.id, situacao: "a-emitir", definitivo: false },
        data: { proxima_em: null },
      })
      container
        .resolve(ContainerRegistrationKeys.LOGGER)
        .info(`[erp] ${erp.nome} conectado${r.empresa ? ` (${r.empresa})` : ""}`)
      return { ok: true, empresa: r.empresa }
    },
    { timeout: 30 }
  )
}

/* ── o token de cada chamada ──────────────────────────────────────────────── */

/** O token de agora, por processo — evita abrir o cofre a cada chamada. */
const memoria = new Map<string, Credenciais>()

async function guardadas(container: MedusaContainer, erp: ErpDaLoja): Promise<Credenciais | null> {
  const linha = await lerConexao(container, erp)
  if (!linha?.credenciais || linha.queda) return null
  return abrir(linha.credenciais, erp.segredoDoCofre(), erp.id)
}

const valeAinda = (c: Credenciais) => Date.parse(c.expiraEm) - Date.now() > FOLGA_DO_TOKEN_MS

export class ErpDesconectado extends Error {
  constructor(erp: ErpDaLoja, motivo = "desconectado — conecte no admin") {
    super(`${erp.nome}: ${motivo}`)
    this.name = "ErpDesconectado"
  }
}

/** Troca o token recusado por um novo — ou pelo que outro processo já renovou. */
async function renovarSobTrava(
  container: MedusaContainer,
  erp: ErpDaLoja,
  recusado: string | null
): Promise<string> {
  return container.resolve(Modules.LOCKING).execute(
    `erp-conexao:${erp.id}`,
    async () => {
      const c = await guardadas(container, erp)
      if (!c) throw new ErpDesconectado(erp)
      if (c.acesso !== recusado && valeAinda(c)) {
        memoria.set(erp.id, c)
        return c.acesso
      }
      const r = await erp.renovar(c)
      if (!r.ok) {
        if (r.caiu) await registrarQueda(container, erp, r.motivo)
        throw new ErpDesconectado(erp, r.motivo)
      }
      await atualizarConexao(container, erp, {
        credenciais: fechar(r.credenciais, erp.segredoDoCofre(), erp.id),
      })
      memoria.set(erp.id, r.credenciais)
      return r.credenciais.acesso
    },
    { timeout: 30 }
  )
}

/**
 * Como o tradutor pega o token — ou `null` se o ERP não está conectado (aí
 * quem chamou não faz nada: sem conexão, nota e estoque ficam como estão).
 */
export async function acessoAoErp(
  container: MedusaContainer,
  erp: ErpDaLoja
): Promise<Acesso | null> {
  const inicial = memoria.get(erp.id) ?? (await guardadas(container, erp))
  if (!inicial) return null
  memoria.set(erp.id, inicial)
  return {
    async token() {
      const c = memoria.get(erp.id) ?? (await guardadas(container, erp))
      if (!c) throw new ErpDesconectado(erp)
      return valeAinda(c) ? c.acesso : renovarSobTrava(container, erp, c.acesso)
    },
    renovado: (recusado) => renovarSobTrava(container, erp, recusado),
  }
}

/* ── a queda ──────────────────────────────────────────────────────────────── */

async function registrarQueda(container: MedusaContainer, erp: ErpDaLoja, motivo: string) {
  memoria.delete(erp.id)
  const linha = await lerConexao(container, erp)
  await atualizarConexao(container, erp, { credenciais: null, queda: motivo })
  container
    .resolve(ContainerRegistrationKeys.LOGGER)
    .error(`[erp] a conexão com o ${erp.nome} caiu: ${motivo} — conecte de novo no admin`)
  await avisarQuedaSeForAHora(container, erp, linha?.queda_avisada_em ?? null, motivo)
}

/** Um e-mail por dia enquanto a conexão estiver caída (a varredura chama). */
export async function avisarQuedaSeForAHora(
  container: MedusaContainer,
  erp: ErpDaLoja,
  avisadaEm: Date | string | null,
  motivo: string,
  agora = new Date()
) {
  if (avisadaEm && agora.getTime() - new Date(avisadaEm).getTime() < DIA_MS) return
  const saiu = await avisarAEquipe(
    container,
    (para) => emailDaConexaoQueCaiu(para, { erp: erp.nome, motivo }),
    `erp-caiu/${erp.id}/${agora.toISOString().slice(0, 10)}`
  )
  if (saiu) await atualizarConexao(container, erp, { queda_avisada_em: agora })
}

/* ── pra tela do admin ────────────────────────────────────────────────────── */

/** Cada escopo que a loja usa, conferido no ERP agora. `null`: desconectado. */
export async function conferirPermissoes(
  container: MedusaContainer,
  erp: ErpDaLoja
): Promise<PermissaoNoErp[] | null> {
  const acesso = await acessoAoErp(container, erp)
  return acesso ? erp.conferirPermissoes(acesso) : null
}

export type SituacaoDaConexao = {
  erp: { id: string; nome: string }
  configurado: boolean
  conectado: boolean
  empresa: string | null
  conectadoEm: string | null
  notasDesde: string | null
  /** Quantos minutos a nota espera depois do pagamento (0: na hora). */
  janelaDaNota: number
  queda: string | null
  estoque: Record<string, unknown> | null
}

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null)

export async function situacaoDaConexao(
  container: MedusaContainer,
  erp: ErpDaLoja
): Promise<SituacaoDaConexao> {
  const linha = await lerConexao(container, erp)
  const conectado = Boolean(
    erp.configurado() && linha?.credenciais && !linha.queda && (await guardadas(container, erp))
  )
  return {
    erp: { id: erp.id, nome: erp.nome },
    configurado: erp.configurado(),
    conectado,
    empresa: linha?.empresa ?? null,
    conectadoEm: iso(linha?.conectado_em),
    notasDesde: iso(linha?.notas_desde),
    janelaDaNota: minutosDaJanela(linha),
    queda: linha?.queda ?? null,
    estoque: linha?.estoque ?? null,
  }
}
