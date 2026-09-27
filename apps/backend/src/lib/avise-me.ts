import type { MedusaContainer } from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  getTotalVariantAvailability,
  Modules,
} from "@medusajs/framework/utils"
import { AVISE_ME } from "../modules/avise-me"
import type AviseMeService from "../modules/avise-me/service"
import { emailNoLog, enviarEmail } from "./email"
import { emailDeVolta } from "./emails/avise-me"
import { avisarALoja } from "./revalidar"

/**
 * O AVISE-ME — quem pediu, na página de um produto esgotado, pra saber
 * quando ele voltar. A rodada (`avisarQuemEspera`) roda no job
 * `avisar-quem-espera`, de 5 em 5 minutos, logo depois da cópia do estoque
 * do Bling, e em `POST /admin/avise-me/rodar`.
 *
 * ┌─ A RODADA FAZ DUAS COISAS, NESTA ORDEM ────────────────────────────────┐
 * │ 1. AVISA A LOJA do produto que esgotou ou voltou desde a última        │
 * │    rodada. A página do produto fica em cache por horas, e o estoque    │
 * │    muda sem ninguém avisar: a última unidade vendida é uma reserva,    │
 * │    não uma mudança no nível, e o pedido cancelado devolve a reserva    │
 * │    calado — só a cópia do Bling avisava a loja. Sem isto, a página     │
 * │    seguia com "Adicionar à sacola" por uma hora depois de esgotar, ou  │
 * │    com "Esgotado" depois de voltar.                                    │
 * │ 2. MANDA O E-MAIL de quem espera um produto que voltou — DEPOIS de      │
 * │    avisar a loja, pra quem clicar no e-mail já achar a página nova.    │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * A RÉGUA DE "TEM PRA VENDER" É A DA LOJA (`temEstoque`, em
 * `apps/loja/src/lib/medusa.ts`): sem controle de estoque ou com venda sem
 * estoque (`allow_backorder`), sempre; com controle, pelo menos uma. O número
 * é o do painel (`estoquesDos`): o guardado menos o reservado, em todos os
 * locais — a loja tem um só.
 *
 * O E-MAIL SAI UMA VEZ, e a linha fica SEM o endereço (`avisado_em`, e o
 * `email` nulo): a finalidade acabou. A chave de idempotência do Resend
 * (`avise-me/<id>`) cobre o instante entre ele aceitar e a linha mudar.
 */

/** Quem espera mais que isto sai da lista (a Política de Privacidade promete). */
export const EXPIRA_EM_DIAS = 180
/** O avisado (já sem o e-mail) fica pra conta do painel por este tempo. */
export const GUARDA_EM_DIAS = 90
/**
 * E-mails por rodada. O Resend aceita 2 pedidos por segundo por conta, e a
 * rodada manda um de cada vez com `PAUSA_ENTRE_EMAILS_MS` entre eles: 60 dão
 * uns 40 segundos. O resto sai na rodada seguinte, 5 minutos depois — na
 * ordem de quem pediu primeiro.
 */
export const POR_RODADA = 60
export const PAUSA_ENTRE_EMAILS_MS = 600
/** Tentativas que falharam (o Resend fora) antes de desistir: duas horas de rodadas. */
export const FALHAS_ATE_DESISTIR = 24

const DIA_MS = 24 * 60 * 60 * 1000
const data = (d: Date | string) => (d instanceof Date ? d : new Date(d))

/* ── a conta, sem efeito ──────────────────────────────────────────────────── */

/** A variante no catálogo, com o que a rodada precisa pra decidir e pro e-mail. */
export type Situacao = {
  varianteId: string
  produtoId: string
  handle: string | null
  nome: string
  imagem: string | null
  publicado: boolean
  /** Dá pra comprar uma agora (`vendeAgora`). */
  vende: boolean
}

/** A mesma régua do `temEstoque` da loja. `disponivel` nulo: não dá pra saber — vende. */
export function vendeAgora(
  variante: { manage_inventory?: boolean | null; allow_backorder?: boolean | null },
  disponivel: number | null | undefined
): boolean {
  if (!variante.manage_inventory) return true
  if (variante.allow_backorder) return true
  return typeof disponivel === "number" ? disponivel >= 1 : true
}

export type AvisoCru = {
  id: string
  email: string | null
  variante_id: string
  produto_id: string
  consentido_em: Date | string
  avisado_em: Date | string | null
  falhas?: number | null
}

export type PlanoDaRodada = {
  /** Os que saem nesta rodada, de quem pediu primeiro. */
  mandar: AvisoCru[]
  /** Os que saem da tabela: esperaram demais, a variante sumiu, ou avisados há muito. */
  apagar: string[]
  /** Os que seguem esperando: o produto ainda esgotado, fora do site, ou a próxima rodada. */
  esperando: number
}

/**
 * Quem recebe o e-mail agora, e quem sai da lista.
 *
 * Sai o pedido de variante que não existe mais (o produto foi apagado: não há
 * o que avisar) e o que esperou mais de `EXPIRA_EM_DIAS`. O produto que foi
 * pra rascunho segue esperando — ele pode voltar pro site. Recebe quem espera
 * um produto no site e com estoque, de quem pediu primeiro, até `limite`.
 */
export function planoDaRodada(
  avisos: AvisoCru[],
  situacoes: Map<string, Situacao>,
  agora: Date,
  limite = POR_RODADA
): PlanoDaRodada {
  const apagar: string[] = []
  const prontos: AvisoCru[] = []
  let esperando = 0
  for (const a of avisos) {
    if (a.avisado_em) {
      if (agora.getTime() - data(a.avisado_em).getTime() > GUARDA_EM_DIAS * DIA_MS)
        apagar.push(a.id)
      continue
    }
    const s = situacoes.get(a.variante_id)
    if (
      !a.email ||
      !s ||
      agora.getTime() - data(a.consentido_em).getTime() > EXPIRA_EM_DIAS * DIA_MS
    ) {
      apagar.push(a.id)
      continue
    }
    if (s.publicado && s.vende && s.handle) prontos.push(a)
    else esperando++
  }
  prontos.sort((a, b) => data(a.consentido_em).getTime() - data(b.consentido_em).getTime())
  return {
    mandar: prontos.slice(0, limite),
    apagar,
    esperando: esperando + Math.max(0, prontos.length - limite),
  }
}

/**
 * Os produtos que a loja precisa redesenhar: os de variante que esgotou ou
 * voltou desde a última rodada (`antes`, variante → vende). Sem a rodada de
 * antes — o processo acabou de subir, e a loja pode ter ficado com qualquer
 * coisa —, todos os do site.
 */
export function produtosQueMudaram(
  antes: ReadonlyMap<string, boolean> | null,
  agora: ReadonlyMap<string, Situacao>
): string[] {
  const handles = new Set<string>()
  for (const s of agora.values()) {
    if (!s.handle || !s.publicado) continue
    if (!antes || antes.get(s.varianteId) !== s.vende) handles.add(s.handle)
  }
  return [...handles].sort()
}

/* ── a leitura ────────────────────────────────────────────────────────────── */

type VarianteLida = {
  id: string
  manage_inventory?: boolean | null
  allow_backorder?: boolean | null
}

type ProdutoLido = {
  id: string
  handle?: string | null
  title?: string | null
  status?: string | null
  thumbnail?: string | null
  variants?: (VarianteLida | null)[] | null
}

const CAMPOS_DO_PRODUTO = [
  "id",
  "handle",
  "title",
  "status",
  "thumbnail",
  "variants.id",
  "variants.manage_inventory",
  "variants.allow_backorder",
]

/**
 * As variantes do catálogo (a loja tem poucas), com o "vende agora" de cada
 * uma. `produtoId`: só as de um produto — a rota do pedido de aviso.
 */
export async function lerSituacoes(
  container: MedusaContainer,
  { produtoId }: { produtoId?: string } = {}
): Promise<Map<string, Situacao>> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: produtos } = await query.graph({
    entity: "product",
    fields: CAMPOS_DO_PRODUTO,
    ...(produtoId ? { filters: { id: produtoId } } : {}),
    pagination: { take: 500 },
  })
  const lidos = produtos as unknown as ProdutoLido[]
  const controladas = lidos.flatMap((p) =>
    (p.variants ?? []).flatMap((v) => (v?.manage_inventory ? [v.id] : []))
  )
  const disponivel = controladas.length
    ? await getTotalVariantAvailability(query, { variant_ids: controladas })
    : {}

  const situacoes = new Map<string, Situacao>()
  for (const p of lidos) {
    for (const v of p.variants ?? []) {
      if (!v?.id) continue
      situacoes.set(v.id, {
        varianteId: v.id,
        produtoId: p.id,
        handle: p.handle ?? null,
        nome: (p.title ?? "").trim() || "o produto",
        imagem: p.thumbnail ?? null,
        publicado: p.status === "published",
        vende: vendeAgora(v, disponivel[v.id]?.availability),
      })
    }
  }
  return situacoes
}

/**
 * O preço de uma unidade agora e o riscado da promoção, como a loja mostra
 * (`precosDe`). Também dos exemplos dos e-mails do CRM (`lib/emails/crm.ts`).
 */
export async function precosDasVariantes(
  container: MedusaContainer,
  variantes: string[]
): Promise<Map<string, { preco: number; precoCheio: number | null }>> {
  if (!variantes.length) return new Map()
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "product_variant",
    fields: ["id", "price_set.id"],
    filters: { id: variantes },
  })
  const conjuntoDe = new Map(
    (data as { id: string; price_set?: { id?: string } | null }[]).flatMap((v) =>
      v.price_set?.id ? [[v.price_set.id, v.id] as const] : []
    )
  )
  if (!conjuntoDe.size) return new Map()
  const calculados = await container
    .resolve(Modules.PRICING)
    .calculatePrices({ id: [...conjuntoDe.keys()] }, { context: { currency_code: "brl" } })
  const precos = new Map<string, { preco: number; precoCheio: number | null }>()
  for (const c of calculados) {
    const variante = conjuntoDe.get(c.id)
    const preco = Number(c.calculated_amount)
    if (!variante || !Number.isFinite(preco) || preco <= 0) continue
    const original = Number(c.original_amount)
    precos.set(variante, {
      preco,
      precoCheio: Number.isFinite(original) && original > preco ? original : null,
    })
  }
  return precos
}

/* ── a rodada ─────────────────────────────────────────────────────────────── */

export type RelatorioDoAviseMe = {
  /** Os produtos que a loja foi avisada de redesenhar (esgotou ou voltou). */
  lojaAvisada: string[]
  avisados: number
  /** Endereço que o Resend não aceita (422): o pedido sai da lista. */
  recusados: number
  /** Não saiu agora (o Resend fora); tenta na próxima rodada. */
  falharam: number
  apagados: number
  esperando: number
}

/**
 * O "vende agora" de cada variante na última rodada — na memória, de
 * propósito: o que ela guarda é "o que a loja já sabe", e depois de um
 * reinício a resposta certa é "não sei" (a primeira rodada avisa a loja de
 * todos os produtos, uma vez).
 */
let ultimaFoto: Map<string, boolean> | null = null

/** Só pro teste: começa como um processo novo. */
export function esquecerAUltimaRodada() {
  ultimaFoto = null
}

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function avisarQuemEspera(
  container: MedusaContainer,
  { agora = new Date(), pausaMs = PAUSA_ENTRE_EMAILS_MS }: { agora?: Date; pausaMs?: number } = {}
): Promise<RelatorioDoAviseMe> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  return container.resolve(Modules.LOCKING).execute(
    "avise-me",
    async (): Promise<RelatorioDoAviseMe> => {
      const relatorio: RelatorioDoAviseMe = {
        lojaAvisada: [],
        avisados: 0,
        recusados: 0,
        falharam: 0,
        apagados: 0,
        esperando: 0,
      }
      const situacoes = await lerSituacoes(container)

      /* 1. a loja */
      const mudaram = produtosQueMudaram(ultimaFoto, situacoes)
      let lojaSabe = true
      if (mudaram.length) {
        const aviso = await avisarALoja(
          ["produtos", ...mudaram.map((h) => `produto:${h}`)],
          logger,
          // A pessoa que clica no e-mail — ou a próxima que chega na página —
          // precisa da página nova, e não da velha enquanto a nova se refaz.
          "agora"
        )
        // Sem LOJA_URL (o ambiente local) não há o que avisar. Com a loja fora
        // do ar, a foto não anda: a próxima rodada avisa de novo.
        lojaSabe = aviso.avisou || aviso.motivo === "não configurado"
        if (aviso.avisou) relatorio.lojaAvisada = mudaram
      }
      if (lojaSabe) ultimaFoto = new Map([...situacoes].map(([id, s]) => [id, s.vende]))

      /* 2. quem espera */
      const servico = container.resolve<AviseMeService>(AVISE_ME)
      const avisos = (await servico.listAvisos(
        {},
        { take: 10_000, order: { consentido_em: "ASC" } }
      )) as unknown as AvisoCru[]
      const plano = planoDaRodada(avisos, situacoes, agora)
      relatorio.esperando = plano.esperando
      if (plano.apagar.length) {
        await servico.deleteAvisos(plano.apagar)
        relatorio.apagados = plano.apagar.length
      }
      if (!plano.mandar.length) return relatorio

      const precos = await precosDasVariantes(container, [
        ...new Set(plano.mandar.map((a) => a.variante_id)),
      ])
      // Quieto: o porquê do Resend vai no resumo do fim, não numa linha por e-mail.
      const avisosDoEmail: string[] = []
      const registro = {
        info: (m: string) => logger.info(m),
        warn: (m: string) => void avisosDoEmail.push(m.replace(/^\[email\] /, "")),
        error: (m: string) => logger.error(m),
      }
      const nomes = new Set<string>()
      for (const [i, a] of plano.mandar.entries()) {
        if (i > 0 && pausaMs > 0) await pausa(pausaMs)
        const s = situacoes.get(a.variante_id)!
        const preco = precos.get(a.variante_id)
        const r = await enviarEmail(
          emailDeVolta({
            para: a.email!,
            produto: {
              nome: s.nome,
              handle: s.handle!,
              imagem: s.imagem,
              preco: preco?.preco ?? null,
              precoCheio: preco?.precoCheio ?? null,
            },
          }),
          registro,
          { idempotencia: `avise-me/${a.id}` }
        )
        if (r.ok) {
          await servico.updateAvisos({ id: a.id, email: null, avisado_em: agora })
          relatorio.avisados++
          nomes.add(s.handle!)
          continue
        }
        if (r.status === 422) {
          // Endereço que nunca vai aceitar: insistir não muda nada.
          await servico.deleteAvisos(a.id)
          relatorio.recusados++
          logger.warn(
            `[avise-me] o Resend recusou ${emailNoLog(a.email!)} (${s.handle}): saiu da lista`
          )
          continue
        }
        // Queda (ou o limite do Resend): este conta uma falha, e o resto da
        // rodada espera a próxima — insistir agora só bate na mesma parede.
        relatorio.falharam++
        const falhas = (a.falhas ?? 0) + 1
        const desisti = falhas >= FALHAS_ATE_DESISTIR
        if (desisti) {
          await servico.deleteAvisos(a.id)
          logger.warn(
            `[avise-me] desisti de avisar ${emailNoLog(a.email!)} (${s.handle}) depois de ${falhas} tentativas`
          )
        } else {
          await servico.updateAvisos({ id: a.id, falhas })
        }
        relatorio.esperando += plano.mandar.length - i - (desisti ? 1 : 0)
        break
      }

      logger.info(
        `[avise-me] ${relatorio.avisados} avisado(s) (${[...nomes].join(", ") || "nenhum"})` +
          (relatorio.recusados ? `, ${relatorio.recusados} recusado(s)` : "") +
          (relatorio.falharam
            ? `, não saiu agora: ${avisosDoEmail[0] ?? "sem motivo no log"}`
            : "") +
          (relatorio.esperando ? `; ${relatorio.esperando} esperando` : "")
      )
      return relatorio
    },
    { timeout: 120 }
  )
}

/* ── o painel ─────────────────────────────────────────────────────────────── */

/** Quantos esperam e quantos já foram avisados, pelo produto. */
export async function avisosDoProduto(
  container: MedusaContainer,
  produtoId: string
): Promise<{ esperando: number; avisados: number }> {
  const avisos = (await container
    .resolve<AviseMeService>(AVISE_ME)
    .listAvisos(
      { produto_id: produtoId },
      { select: ["id", "email", "avisado_em"], take: 10_000 }
    )) as unknown as Pick<AvisoCru, "id" | "email" | "avisado_em">[]
  return {
    esperando: avisos.filter((a) => a.email && !a.avisado_em).length,
    avisados: avisos.filter((a) => a.avisado_em).length,
  }
}

/** Apaga os pedidos de aviso de um e-mail (o "Tirar" da newsletter, a LGPD). Quantos saíram. */
export async function tirarDoAviseMe(container: MedusaContainer, email: string): Promise<number> {
  const servico = container.resolve<AviseMeService>(AVISE_ME)
  const avisos = await servico.listAvisos({ email }, { select: ["id"], take: 1000 })
  if (avisos.length) await servico.deleteAvisos(avisos.map((a) => a.id))
  return avisos.length
}
