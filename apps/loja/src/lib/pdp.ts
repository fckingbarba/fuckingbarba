import "server-only"
import type { ConteudoDaPdp } from "@/conteudo/produto"
import type { AjusteDeLayout } from "@/lib/secoes/layout"
import { buscarProdutoPorHandle, precosDe, temEstoque } from "./medusa"

/**
 * O CONTEÚDO EDITORIAL DA PDP, lido do produto no Medusa.
 *
 * Era um objeto escrito em `src/conteudo/produto.ts`: trocar uma frase de um
 * produto exigia deploy, e quem escreve o texto precisava abrir o
 * repositório. Agora mora no `metadata` do produto e é editado na própria
 * página do produto no admin.
 *
 * ┌─ POR QUE ISTO NÃO CUSTA UMA BUSCA POR SEÇÃO ───────────────────────────┐
 * │ As oito seções chamam `conteudoDaPdp(handle)` cada uma, e cada chamada │
 * │ cai em `buscarProdutoPorHandle`, que é `"use cache"`. Na prática é UMA │
 * │ leitura por render, não oito — e nenhuma depois que o cache esquenta.  │
 * │                                                                         │
 * │ Manter cada seção buscando o que precisa, em vez de a página passar    │
 * │ tudo por prop, é o que permite ligar e desligar seção no registro sem  │
 * │ mexer em assinatura de componente nenhuma.                             │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * GÊMEO NO BACKEND: `apps/backend/src/lib/pdp.ts` tem os mesmos tipos e a
 * validação COMPLETA, que roda na gravação. Aqui a peneira é deliberadamente
 * menor — só o que evita quebrar a página —, porque repetir duzentas linhas
 * de validação dos dois lados de uma API cria justamente a divergência que
 * ela deveria evitar. Quem confere que os dois concordam é o
 * `ferramentas/conferir-pdp.mjs`.
 */

export const CHAVE_NO_METADATA = "fb_pdp"

/**
 * A imagem de fundo de uma seção. Sem ela, a seção fica como sempre foi.
 * `imagemCelular`: a do celular, em pé — sem ela, o celular usa a do
 * computador, cortada no meio.
 */
export type FundoDaSecao = { imagem: string; imagemCelular?: string; veu?: number }

/**
 * A CAIXA DE COMPRA, logo abaixo do preço: UMA coisa ou outra (decidido em
 * 23/09) — os cartões "Quantas unidades" (`modo: "unidades"`) ou o "Leve
 * junto" (`modo: "junto"`, com os `produtos`, até 2). Sem `modo` (o que foi
 * salvo antes dele), os cartões, a não ser que `kits` seja `false`.
 *
 * `notaDoAvulso` é a linha embaixo de "1 unidade": o `subtitle` do produto
 * descreve o PRODUTO, e não a quantidade.
 */
export type VendaCombinada = {
  modo?: "unidades" | "junto"
  kits?: boolean
  notaDoAvulso?: string
  produtos?: string[]
}

/** O que a caixa mostra, com o de antes do `modo` resolvido. */
export function modoDaCaixa(c: VendaCombinada): "unidades" | "junto" {
  return c.modo ?? (c.kits === false && c.produtos?.length ? "junto" : "unidades")
}

export type Pdp = {
  conteudo: ConteudoDaPdp
  layout: AjusteDeLayout
  fundos: Record<string, FundoDaSecao>
  combinada: VendaCombinada
}

export const PDP_VAZIA: Pdp = { conteudo: {}, layout: {}, fundos: {}, combinada: {} }

/**
 * As listas que cada seção percorre com `.map`.
 *
 * É a única coisa que a loja PRECISA conferir: um texto errado desenha
 * torto, mas um `.map` num valor que não é lista derruba a página inteira do
 * produto. Seção cuja lista obrigatória não for lista é descartada.
 */
const LISTAS: Record<string, readonly string[]> = {
  promessa: ["itens"],
  tempo: ["passos"],
  rotina: ["itens"],
  funciona: ["comoTexto", "usoPassos"],
  versus: ["nosso", "deles"],
  quem: ["sim", "nao"],
  duvidas: ["perguntas"],
}

/**
 * A foto de fundo passa pelo otimizador de imagem do Next, que só abre os
 * hosts de `next.config.ts`: o Supabase Storage e, na máquina de quem
 * desenvolve, o Medusa local. Endereço de fora (o admin antigo aceitava
 * qualquer um) quebraria a página em desenvolvimento e sairia como imagem
 * quebrada em produção — fica de fora, e a seção sai com a cor dela.
 */
function ehDoArmazenamento(url: string): boolean {
  const ref = process.env.NEXT_PUBLIC_SUPABASE_REF
  if (ref && url.startsWith(`https://${ref}.supabase.co/storage/v1/object/public/`)) return true
  const medusaLocal = /\/\/(localhost|127\.0\.0\.1)/.test(process.env.MEDUSA_BACKEND_URL ?? "")
  return medusaLocal && url.startsWith("http://localhost:9000/static/")
}

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v)
}

export function lerPdp(metadata: unknown): Pdp {
  const raiz = ehObjeto(metadata) ? metadata[CHAVE_NO_METADATA] : null
  if (!ehObjeto(raiz)) return PDP_VAZIA

  const bruto = ehObjeto(raiz.conteudo) ? raiz.conteudo : {}
  const conteudo: Record<string, unknown> = {}

  for (const [nome, secao] of Object.entries(bruto)) {
    if (!ehObjeto(secao)) continue
    const obrigatorias = LISTAS[nome] ?? []
    if (obrigatorias.some((campo) => !Array.isArray(secao[campo]))) continue

    // `duvidas.perguntas[].resposta` é a única lista de segundo nível.
    if (nome === "duvidas") {
      const ok = (secao.perguntas as unknown[]).every(
        (p) => ehObjeto(p) && Array.isArray(p.resposta)
      )
      if (!ok) continue
    }

    conteudo[nome] = secao
  }

  const l = ehObjeto(raiz.layout) ? raiz.layout : {}
  const layout: AjusteDeLayout = {
    ...(ehObjeto(l.visibilidade)
      ? { visibilidade: l.visibilidade as Record<string, boolean> }
      : {}),
    ...(Array.isArray(l.ordem) ? { ordem: l.ordem as string[] } : {}),
  }

  /*
    O backend já validou a URL e a faixa do véu na gravação. Aqui só sobra
    conferir que existe imagem — sem ela o embrulho desenharia um retângulo
    translúcido por cima de nada, escurecendo a seção sem motivo — e que ela
    mora onde o otimizador de imagem abre (`ehDoArmazenamento`).
  */
  const fundos: Record<string, FundoDaSecao> = {}
  const f = ehObjeto(raiz.fundos) ? raiz.fundos : {}
  for (const [id, valor] of Object.entries(f)) {
    if (!ehObjeto(valor) || typeof valor.imagem !== "string") continue
    if (!ehDoArmazenamento(valor.imagem)) continue
    fundos[id] = {
      imagem: valor.imagem,
      ...(typeof valor.imagemCelular === "string" && ehDoArmazenamento(valor.imagemCelular)
        ? { imagemCelular: valor.imagemCelular }
        : {}),
      ...(typeof valor.veu === "number" ? { veu: valor.veu } : {}),
    }
  }

  const c = ehObjeto(raiz.combinada) ? raiz.combinada : {}
  const combinada: VendaCombinada = {
    ...(c.modo === "unidades" || c.modo === "junto" ? { modo: c.modo } : {}),
    ...(c.kits === false ? { kits: false } : {}),
    ...(typeof c.notaDoAvulso === "string" && c.notaDoAvulso.trim()
      ? { notaDoAvulso: c.notaDoAvulso.trim() }
      : {}),
    ...(Array.isArray(c.produtos)
      ? { produtos: c.produtos.filter((h): h is string => typeof h === "string") }
      : {}),
  }

  return { conteudo: conteudo as ConteudoDaPdp, layout, fundos, combinada }
}

/** Só os fundos, pro montador de seções. */
export async function lerFundos(handle: string): Promise<Record<string, FundoDaSecao>> {
  return (await pdpDoProduto(handle)).fundos
}

/** A PDP de um produto. Produto que não existe devolve a vazia, não erro. */
export async function pdpDoProduto(handle: string): Promise<Pdp> {
  const produto = await buscarProdutoPorHandle(handle)
  return produto ? lerPdp(produto.metadata) : PDP_VAZIA
}

/* ── os produtos que combinam ────────────────────────────────────────────
 *
 * Resolve os handles escolhidos no admin em produto, preço e variante —
 * tudo o que a caixa de compra precisa pra oferecer "leve junto" sem falar
 * com o Medusa de dentro do navegador.
 *
 * Handle que não existe mais, produto sem preço e produto sem estoque saem
 * da lista em silêncio. São três maneiras de a oferta virar frustração: a
 * pessoa marca, clica em comprar e leva um erro — depois de já ter decidido.
 */
export type ProdutoQueCombina = {
  handle: string
  nome: string
  foto: string | null
  varianteId: string
  preco: number
}

export async function produtosQueCombinam(
  handles: string[],
  proprio: string
): Promise<ProdutoQueCombina[]> {
  if (!handles.length) return []

  const achados = await Promise.all(
    handles.filter((h) => h && h !== proprio).map((h) => buscarProdutoPorHandle(h))
  )

  return achados.flatMap((p) => {
    if (!p?.handle) return []
    const precos = precosDe(p)
    const variante = (p.variants ?? []).find((v) => temEstoque(v)) ?? p.variants?.[0]
    if (!precos || !variante || !temEstoque(variante)) return []
    return [
      {
        handle: p.handle,
        nome: p.title,
        /* A capa, ou a primeira foto se ninguém marcou capa no admin. São
           dois campos diferentes no Medusa e é comum ter um sem o outro. */
        foto: p.thumbnail ?? p.images?.[0]?.url ?? null,
        varianteId: variante.id,
        preco: precos.atual,
      },
    ]
  })
}
