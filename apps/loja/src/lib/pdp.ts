import "server-only"
import type { ConteudoDaPdp } from "@/conteudo/produto"
import type { AjusteDeLayout } from "@/lib/secoes/layout"
import { buscarProdutoPorHandle } from "./medusa"

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

/** A imagem de fundo de uma seção. Sem ela, a seção fica como sempre foi. */
export type FundoDaSecao = { imagem: string; veu?: number }

/** Quem aparece depois do preço. Lista vazia = automático, não vazio. */
export type VendaCombinada = { kits?: boolean; produtos?: string[] }

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
    ...(ehObjeto(l.visibilidade) ? { visibilidade: l.visibilidade as Record<string, boolean> } : {}),
    ...(Array.isArray(l.ordem) ? { ordem: l.ordem as string[] } : {}),
  }

  /*
    O backend já validou a URL e a faixa do véu na gravação. Aqui só sobra
    conferir que existe imagem: sem ela o embrulho desenharia um retângulo
    translúcido por cima de nada, escurecendo a seção sem motivo.
  */
  const fundos: Record<string, FundoDaSecao> = {}
  const f = ehObjeto(raiz.fundos) ? raiz.fundos : {}
  for (const [id, valor] of Object.entries(f)) {
    if (!ehObjeto(valor) || typeof valor.imagem !== "string" || !valor.imagem) continue
    fundos[id] = valor as unknown as FundoDaSecao
  }

  const c = ehObjeto(raiz.combinada) ? raiz.combinada : {}
  const combinada: VendaCombinada = {
    ...(c.kits === false ? { kits: false } : {}),
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
