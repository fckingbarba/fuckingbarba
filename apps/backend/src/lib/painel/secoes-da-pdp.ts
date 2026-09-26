import { MedusaError } from "@medusajs/framework/utils"
import TEXTOS from "../../scripts/dados/secoes-da-pdp.json"
import { lerSecao, lerSeo, type ConteudoDaPdp, type Pdp } from "../pdp"

/**
 * AS SETE SEÇÕES DE TODOS OS PRODUTOS — pedido do dono em 26/09 (entrega
 * 0105): "ative e escreva" Benefícios, Linha do tempo, Rotina com outros
 * produtos, Como funciona e modo de uso, Comparação, Pra quem é e Perguntas
 * frequentes, nos 15 produtos; os kits do Fator iguais ao Fator.
 *
 * O TEXTO mora em `scripts/dados/secoes-da-pdp.json`, por handle. Os kits do
 * Fator (e o Kit 2x Shampoo, do Shampoo) dizem `copiaDe` e trazem só o que
 * muda — o aviso de quantos meses o kit cobre, as fotos. A descrição do
 * Google de cada um vai no `seo`.
 *
 * AS FOTOS de "como funciona" e do modo de uso são "a foto N do produto X"
 * (`{ de, n }`), e viram o endereço dela na hora de gravar, lido do banco:
 * a 2ª foto — a que a loja pega sem escolha — é uma arte de anúncio em
 * vários produtos ("88% de eficácia", antes e depois). Foto que não existe
 * não entra, e a loja volta pra 2ª.
 *
 * A migração `secoes-da-pdp.ts` aplica uma vez, no deploy: troca as sete
 * seções (o que houver nelas vai pro registro), liga as que estiverem
 * desligadas e grava a descrição do Google. O resto da página — antes e
 * depois, faixa, fundos, caixa de compra, vídeos, ordem — fica como está.
 * Dali em diante, quem muda é o painel.
 */

export const SECOES_ESCRITAS = [
  "promessa",
  "tempo",
  "rotina",
  "funciona",
  "versus",
  "quem",
  "duvidas",
] as const
export type SecaoEscrita = (typeof SECOES_ESCRITAS)[number]

/** A seção do registro da loja (o que a ordem e a visibilidade guardam). */
const ID_DA_SECAO: Record<SecaoEscrita, string> = {
  promessa: "produto.promessa",
  tempo: "produto.tempo",
  rotina: "produto.rotina",
  funciona: "produto.funciona",
  versus: "produto.versus",
  quem: "produto.quem",
  duvidas: "produto.duvidas",
}

/** "A foto N do produto X" (N a partir de 1) → o endereço dela, ou `null`. */
export type FotoDoProduto = (handle: string, n: number) => string | null

type TextosDoProduto = Partial<Record<SecaoEscrita, unknown>> & { seo?: string }
type NoArquivo = TextosDoProduto & { copiaDe?: string }

const ARQUIVO = TEXTOS as Record<string, NoArquivo>

/** Os handles com texto escrito aqui. */
export const HANDLES_COM_TEXTO = Object.keys(ARQUIVO)

/** Os textos de um produto, com o `copiaDe` resolvido; `null` pra quem não tem. */
export function textosDoProduto(handle: string): TextosDoProduto | null {
  const proprio = ARQUIVO[handle]
  if (!proprio) return null
  const { copiaDe, ...resto } = proprio
  const base = copiaDe ? (textosDoProduto(copiaDe) ?? {}) : {}
  return { ...base, ...resto }
}

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null

/** As referências de foto da seção "como funciona" viram endereço (ou saem). */
function comAsFotos(funciona: unknown, foto: FotoDoProduto): unknown {
  const f = obj(funciona)
  if (!f) return funciona
  const saida: Record<string, unknown> = { ...f }
  for (const campo of ["comoFoto", "usoFoto"]) {
    const ref = obj(f[campo])
    delete saida[campo]
    if (!ref || typeof ref.de !== "string" || typeof ref.n !== "number") continue
    const url = foto(ref.de, ref.n)
    if (url) saida[campo] = url
  }
  return saida
}

const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export type PdpComTextos = {
  pdp: Pdp
  /** As seções que mudaram (as iguais ficam de fora: rodar de novo não troca nada). */
  trocadas: SecaoEscrita[]
  /** As que estavam desligadas e foram ligadas. */
  ligadas: SecaoEscrita[]
  /** O que havia nas seções trocadas que tinham texto — vai pro registro. */
  antes: Partial<ConteudoDaPdp>
}

/**
 * A página do produto com os textos daqui. `null` pra produto sem texto
 * aqui. Seção do arquivo que não passa na peneira do `lerSecao` é erro do
 * arquivo — e os testes (`secoes-da-pdp.unit.spec.ts`) travam antes do deploy.
 */
export function comOsTextos(atual: Pdp, handle: string, foto: FotoDoProduto): PdpComTextos | null {
  const textos = textosDoProduto(handle)
  if (!textos) return null

  const conteudo: ConteudoDaPdp = { ...atual.conteudo }
  const trocadas: SecaoEscrita[] = []
  const antes: Partial<ConteudoDaPdp> = {}
  for (const chave of SECOES_ESCRITAS) {
    const escrita = chave === "funciona" ? comAsFotos(textos.funciona, foto) : textos[chave]
    const { secao, faltando } = lerSecao(chave, escrita)
    if (!secao || faltando.length)
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `[pdp] ${handle}: a seção ${chave} do arquivo não fecha (${faltando.join(", ")})`
      )
    const era = atual.conteudo[chave]
    if (igual(era, secao)) continue
    if (era) Object.assign(antes, { [chave]: era })
    Object.assign(conteudo, { [chave]: secao })
    trocadas.push(chave)
  }

  // A visibilidade guarda só a diferença do padrão (ligada): ligar é tirar o `false`.
  const visibilidade = { ...(atual.layout.visibilidade ?? {}) }
  const ligadas = SECOES_ESCRITAS.filter((c) => visibilidade[ID_DA_SECAO[c]] === false)
  for (const c of ligadas) delete visibilidade[ID_DA_SECAO[c]]
  const layout = {
    ...atual.layout,
    ...(Object.keys(visibilidade).length ? { visibilidade } : {}),
  }
  if (!Object.keys(visibilidade).length) delete layout.visibilidade

  const seo = lerSeo({ descricao: textos.seo }) ?? atual.seo
  return {
    pdp: { ...atual, conteudo, layout, ...(seo ? { seo } : {}) },
    trocadas,
    ligadas,
    antes,
  }
}
