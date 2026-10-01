import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, ProductStatus } from "@medusajs/framework/utils"
import { lerSituacoes, precosDasVariantes } from "../avise-me"
import { emReais } from "../emails/moldura"
import { lerPdp, type AjusteDeLayout, type ConteudoDaPdp } from "../pdp"
import { faixasComPromocao, totalDaFaixa } from "../precos-por-quantidade"
import { promocoesParaALoja } from "../promocoes-ativas"

/**
 * O CATÁLOGO QUE O ATENDENTE DO WHATSAPP SABE DE COR — os produtos
 * publicados, com o preço de agora, o desconto por quantidade, a promoção
 * que vale, o esgotado e o conteúdo da página de cada um (o que é, como usar,
 * pra quem é, a linha do tempo, as dúvidas).
 *
 * ┌─ A MESMA FONTE DA LOJA ────────────────────────────────────────────────┐
 * │ Nada aqui é escrito à mão: o preço é o do Medusa (`precosDasVariantes`,│
 * │ o mesmo dos e-mails), as faixas são as da lista "Desconto por          │
 * │ quantidade" (a mesma conta, `totalDaFaixa`), a promoção é a que a loja │
 * │ mostra (`promocoesParaALoja`), e o texto é o da página do produto,     │
 * │ editado no painel (`fb_pdp`). Mudou no painel, o atendente muda junto  │
 * │ — em até `MEMORIA_MS`. Seção escondida na página fica de fora aqui     │
 * │ também: o atendente não fala do que a loja tirou do ar.                │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * O texto é DETERMINÍSTICO (sempre a mesma ordem, sem hora): é o pedaço
 * grande e fixo do pedido à IA, e fica guardado no cache dela — mudou um
 * byte, paga de novo.
 */

export type VarianteDoAtendente = {
  nome: string | null
  preco: number | null
  precoCheio: number | null
  vende: boolean
}

export type ProdutoDoAtendente = {
  nome: string
  handle: string
  categorias: string[]
  resumo: string | null
  variantes: VarianteDoAtendente[]
  /** As promoções que valem agora neste produto: "Leve 3, pague 2", e até quando. */
  promocoes: { etiqueta: string; comprando: number; ate: number | null }[]
  conteudo: ConteudoDaPdp
  /** Os nomes dos produtos do "Leve junto" da página. */
  levaJunto: string[]
}

/** Quanto tempo o catálogo lido fica na memória. A promoção que acaba vale até aqui. */
export const MEMORIA_MS = 2 * 60_000

/** O endereço do produto, com a marca de que a visita veio do atendimento do WhatsApp. */
export function linkDoProduto(loja: string, handle: string): string {
  return `${loja}/produtos/${encodeURIComponent(handle)}?utm_source=whatsapp&utm_medium=atendimento&utm_campaign=atendente`
}

/** Tira o HTML da descrição do Bling e corta num tamanho que a IA lê sem gastar à toa. */
export function semHtml(html: string | null | undefined, limite = 600): string | null {
  if (!html) return null
  const t = html
    .replace(/<\s*(br|\/p|\/li|\/h\d)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim()
  if (!t) return null
  return t.length > limite ? `${t.slice(0, limite).replace(/\s+\S*$/, "")}…` : t
}

/** A seção que a página do produto esconde (`layout.visibilidade`) não entra. */
function visivel(conteudo: ConteudoDaPdp, layout: AjusteDeLayout): ConteudoDaPdp {
  const escondida = new Set(
    Object.entries(layout.visibilidade ?? {})
      .filter(([, v]) => v === false)
      .map(([id]) => id.replace(/^produto\./, ""))
  )
  return Object.fromEntries(
    Object.entries(conteudo).filter(([nome]) => !escondida.has(nome))
  ) as ConteudoDaPdp
}

type ProdutoLido = {
  id: string
  title?: string | null
  handle?: string | null
  subtitle?: string | null
  description?: string | null
  metadata?: Record<string, unknown> | null
  categories?: ({ name?: string | null } | null)[] | null
  variants?: ({ id: string; title?: string | null } | null)[] | null
}

/** Lê o catálogo do Medusa (sem memória — quem guarda é `catalogoDoAtendente`). */
export async function lerCatalogo(container: MedusaContainer): Promise<ProdutoDoAtendente[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "handle",
      "subtitle",
      "description",
      "metadata",
      "categories.name",
      "variants.id",
      "variants.title",
    ],
    filters: { status: ProductStatus.PUBLISHED },
    pagination: { take: 200 },
  })
  const produtos = (data as unknown as ProdutoLido[]).filter((p) => p.handle)
  const idsDasVariantes = produtos.flatMap((p) =>
    (p.variants ?? []).flatMap((v) => (v?.id ? [v.id] : []))
  )
  const [precos, situacoes, promocoes] = await Promise.all([
    precosDasVariantes(container, idsDasVariantes),
    lerSituacoes(container),
    promocoesParaALoja(container).catch(() => []),
  ])
  const nomePorHandle = new Map(
    produtos.map((p) => [p.handle!, (p.title ?? "").trim() || p.handle!])
  )

  return produtos.map((p) => {
    const pdp = lerPdp(p.metadata)
    const variantes = (p.variants ?? []).flatMap((v) => {
      if (!v?.id) return []
      const preco = precos.get(v.id)
      const titulo = (v.title ?? "").trim()
      return [
        {
          // A variação única do Medusa se chama "Default" ou repete o produto: não diz nada.
          nome:
            titulo && !/^default/i.test(titulo) && titulo !== (p.title ?? "").trim()
              ? titulo
              : null,
          preco: preco?.preco ?? null,
          precoCheio: preco?.precoCheio ?? null,
          vende: situacoes.get(v.id)?.vende ?? true,
        },
      ]
    })
    return {
      nome: nomePorHandle.get(p.handle!)!,
      handle: p.handle!,
      categorias: (p.categories ?? [])
        .map((c) => (c?.name ?? "").trim())
        .filter(Boolean)
        .sort(),
      resumo: pdp.seo?.descricao ?? semHtml(p.description) ?? (p.subtitle?.trim() || null),
      variantes,
      promocoes: promocoes
        .filter((pr) => pr.produtos.includes(p.id))
        .map((pr) => ({ etiqueta: pr.etiqueta, comprando: pr.comprando, ate: pr.ate }))
        .sort((a, b) => a.comprando - b.comprando),
      conteudo: visivel(pdp.conteudo, pdp.layout),
      levaJunto: (pdp.combinada.produtos ?? []).flatMap((h) => {
        const nome = nomePorHandle.get(h)
        return nome ? [nome] : []
      }),
    }
  })
}

/* ── o texto ──────────────────────────────────────────────────────────────── */

const DATA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
})

function precoEmTexto(v: VarianteDoAtendente): string {
  if (v.preco === null) return "sem preço no momento"
  return v.precoCheio !== null && v.precoCheio > v.preco
    ? `${emReais(v.preco)} (de ${emReais(v.precoCheio)})`
    : emReais(v.preco)
}

/** "2 unidades: R$ 249,90 (R$ 124,95 cada)" — a conta da lista de preço da loja. */
function faixasEmTexto(preco: number, promocoes: ProdutoDoAtendente["promocoes"]): string[] {
  return faixasComPromocao(promocoes[0]?.comprando).flatMap((f) => {
    const total = totalDaFaixa(preco, f.unidades, f.desconto)
    if (total === null) return []
    const quantas = f.ate === null ? `${f.unidades} ou mais unidades` : `${f.unidades} unidades`
    return [
      `${quantas}: ${emReais(total / 100 / f.unidades)} cada (${f.desconto}% a menos; ${f.unidades} saem ${emReais(total / 100)})`,
    ]
  })
}

function conteudoEmTexto(c: ConteudoDaPdp, linhas: string[], nomes: ReadonlyMap<string, string>) {
  if (c.promessa?.itens.length) linhas.push(`O que entrega: ${c.promessa.itens.join("; ")}`)
  if (c.funciona) {
    const f = c.funciona
    if (f.comoTexto.length) linhas.push(`Como funciona: ${f.comoTexto.join(" ")}`)
    if (f.usoPassos.length)
      linhas.push(`Como usar: ${f.usoPassos.map((p, i) => `${i + 1}) ${p}`).join(" ")}`)
    if (f.dica) linhas.push(`Dica de uso: ${f.dica}`)
  }
  if (c.tempo?.passos.length)
    linhas.push(
      `Linha do tempo do resultado: ${c.tempo.passos.map((p) => `${p.quando}: ${p.titulo}${p.texto ? ` (${p.texto})` : ""}`).join("; ")}`
    )
  if (c.quem) {
    if (c.quem.sim.length) linhas.push(`Pra quem é: ${c.quem.sim.join("; ")}`)
    if (c.quem.nao.length) linhas.push(`Pra quem NÃO é: ${c.quem.nao.join("; ")}`)
  }
  if (c.rotina?.itens.length)
    linhas.push(
      `Rotina recomendada: ${c.rotina.itens.map((i) => `${i.passo} (${nomes.get(i.handle) ?? i.handle}): ${i.para}`).join("; ")}`
    )
  if (c.versus)
    linhas.push(
      `Comparado com ${c.versus.nomeDeles}: o nosso ${c.versus.nosso.join("; ")}. ${c.versus.nomeDeles}: ${c.versus.deles.join("; ")}`
    )
  if (c.duvidas?.perguntas.length) {
    linhas.push("Dúvidas deste produto:")
    for (const p of c.duvidas.perguntas)
      linhas.push(`- P: ${p.pergunta} R: ${p.resposta.join(" ")}`)
  }
}

/** O catálogo em texto, na ordem do nome. Puro: o mesmo catálogo dá o mesmo texto. */
export function catalogoEmTexto(produtos: readonly ProdutoDoAtendente[], loja: string): string {
  const nomes = new Map(produtos.map((p) => [p.handle, p.nome]))
  const blocos = [...produtos]
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    .map((p) => {
      const linhas = [`## ${p.nome}`, `Link: ${linkDoProduto(loja, p.handle)}`]
      if (p.categorias.length) linhas.push(`Categorias: ${p.categorias.join(", ")}`)
      if (p.resumo) linhas.push(`Resumo: ${p.resumo.replace(/\s*\n\s*/g, " ")}`)
      const aVenda = p.variantes.filter((v) => v.vende)
      if (!aVenda.length) linhas.push("ESGOTADO agora: não dá pra comprar.")
      if (p.variantes.length === 1) {
        linhas.push(`Preço: ${precoEmTexto(p.variantes[0])}`)
      } else {
        for (const v of p.variantes)
          linhas.push(`- ${v.nome ?? "Opção"}: ${precoEmTexto(v)}${v.vende ? "" : " (esgotada)"}`)
      }
      const base = aVenda[0]?.preco
      if (base) {
        const faixas = faixasEmTexto(base, p.promocoes)
        if (faixas.length) linhas.push(`Levando mais do mesmo: ${faixas.join("; ")}`)
      }
      for (const pr of p.promocoes)
        linhas.push(
          `PROMOÇÃO valendo agora: ${pr.etiqueta}${pr.ate ? ` (até ${DATA.format(pr.ate)})` : ""} — o desconto entra sozinho na sacola`
        )
      if (p.levaJunto.length) linhas.push(`Combina com: ${p.levaJunto.join(", ")}`)
      conteudoEmTexto(p.conteudo, linhas, nomes)
      return linhas.join("\n")
    })
  return blocos.join("\n\n")
}

let guardado: { texto: string; ate: number; loja: string } | null = null

/** O catálogo em texto, lido de novo a cada `MEMORIA_MS`. */
export async function catalogoDoAtendente(
  container: MedusaContainer,
  loja: string,
  agora = Date.now()
): Promise<string> {
  if (guardado && guardado.ate > agora && guardado.loja === loja) return guardado.texto
  const texto = catalogoEmTexto(await lerCatalogo(container), loja)
  guardado = { texto, ate: agora + MEMORIA_MS, loja }
  return texto
}
