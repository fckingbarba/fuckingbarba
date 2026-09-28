import {
  CHAVE_NO_METADATA,
  lerPdp,
  SECOES_DE_CONTEUDO,
  type ConteudoDaPdp,
  type Pdp,
  type Pergunta,
} from "../pdp"

/**
 * A PÁGINA DO FATOR NOS KITS DELE — pedido do dono em 28/09 (entrega 0200):
 * a página do Fator de Crescimento em todos os kits que trazem o Fator, com
 * os vídeos; o preço, cada um o seu.
 *
 * Os kits são os quatro que trazem o frasco (o `SKUS` de
 * `lib/crm/etiquetas.ts`): 2x, 3x, 6x e o Fator + Shampoo — os mesmos que
 * dizem `copiaDe` do Fator no `scripts/dados/secoes-da-pdp.json`. O Kit
 * Completo não traz o Fator (Shampoo, Balm e Óleo).
 *
 * VEM DO FATOR, como estiver gravado nele: todas as seções de texto (os
 * Benefícios, o antes e depois, a Linha do tempo, a faixa, a Rotina, o Como
 * funciona e modo de uso, a Comparação, o Pra quem é, as Perguntas, o título
 * dos relacionados), a ordem e as seções ligadas, os fundos e os vídeos do
 * "Vê na prática". Os vídeos são os MESMOS arquivos: tirar um vídeo de um
 * produto no painel não apaga o arquivo (só o envio que falha no meio sai do
 * armazenamento), então um vídeo pode morar em vários produtos.
 *
 * FICA DE CADA KIT: a caixa de compra (os cartões de quantidade ou o "Leve
 * junto") e a descrição do Google. O nome, as fotos, o preço e as
 * avaliações nem moram no `fb_pdp`.
 *
 * O KIT FATOR + SHAMPOO (escolha do dono): a Rotina ("O que completa o kit")
 * e o Como funciona e modo de uso continuam os do kit, que falam do shampoo
 * que vem junto — e, se o kit não tiver vídeo no modo de uso, entra o do
 * Fator. Nas Perguntas, as do Fator, na ordem dele (na pergunta que o kit
 * também responde, a resposta do kit: a da pele sensível fala dos dois
 * produtos), e no fim as do kit sobre o shampoo.
 *
 * É uma CÓPIA, não uma ligação: a migração `pagina-do-fator-nos-kits.ts`
 * aplica uma vez, no deploy, e dali em diante cada página muda no painel.
 */

export const FATOR = "fator-de-crescimento-para-barba"

export const KITS_DO_FATOR = [
  "kit-2-fator-de-crescimento-para-barba",
  "kit-3-fator-de-crescimento-para-barba",
  "kit-6-fator-de-crescimento-para-barba",
  "kit-fator-de-crescimento-para-barba-e-shampoo",
] as const

/** O kit que traz outro produto junto — e as partes da página que falam dele. */
const COM_SHAMPOO = "kit-fator-de-crescimento-para-barba-e-shampoo"

const falaDoShampoo = (p: Pergunta) => /shampoo/i.test(p.pergunta)

/** A mesma pergunta, escrita com outra caixa ou outro espaço. */
const chave = (p: Pergunta) => p.pergunta.replace(/\s+/g, " ").trim().toLocaleLowerCase("pt-BR")

const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** As seções do Fator, com as do Kit Fator + Shampoo que falam do shampoo. */
function comOShampoo(fator: ConteudoDaPdp, kit: ConteudoDaPdp): ConteudoDaPdp {
  const conteudo: ConteudoDaPdp = { ...fator }
  if (kit.rotina) conteudo.rotina = kit.rotina
  if (kit.funciona) {
    const usoVideo = kit.funciona.usoVideo ?? fator.funciona?.usoVideo
    conteudo.funciona = { ...kit.funciona, ...(usoVideo ? { usoVideo } : {}) }
  }
  const doKit = kit.duvidas?.perguntas ?? []
  const respostaDoKit = new Map(doKit.map((p) => [chave(p), p]))
  const doFator = (fator.duvidas?.perguntas ?? []).map((p) => respostaDoKit.get(chave(p)) ?? p)
  const jaTem = new Set(doFator.map(chave))
  const doShampoo = doKit.filter((p) => falaDoShampoo(p) && !jaTem.has(chave(p)))
  const titulo = fator.duvidas?.titulo ?? kit.duvidas?.titulo
  if (titulo && (doFator.length || doShampoo.length))
    conteudo.duvidas = { titulo, perguntas: [...doFator, ...doShampoo] }
  return conteudo
}

export type PaginaDoKit = {
  /** A página do kit, já passada na peneira da loja (é o que ela vai ler). */
  pdp: Pdp
  /**
   * O que mudou em relação à página de antes do kit: as seções (as chaves de
   * `conteudo`), "layout" (a ordem e as ligadas), "fundos" e "videos". Vazio
   * quando já era a do Fator — rodar de novo não troca nada.
   */
  mudou: string[]
}

/**
 * A página do kit com a do Fator. `null` quando o Fator não tem seção
 * nenhuma: copiar uma página vazia esvaziaria a do kit.
 */
export function paginaDoFatorNoKit(fator: Pdp, kit: Pdp, handle: string): PaginaDoKit | null {
  if (!Object.keys(fator.conteudo).length) return null

  const conteudo =
    handle === COM_SHAMPOO ? comOShampoo(fator.conteudo, kit.conteudo) : fator.conteudo
  const pdp = lerPdp({
    [CHAVE_NO_METADATA]: {
      conteudo,
      layout: fator.layout,
      fundos: fator.fundos,
      videos: fator.videos,
      combinada: kit.combinada,
      ...(kit.seo ? { seo: kit.seo } : {}),
    },
  })

  const mudou = [
    ...SECOES_DE_CONTEUDO.filter((s) => !igual(kit.conteudo[s], pdp.conteudo[s])),
    ...(["layout", "fundos", "videos"] as const).filter((p) => !igual(kit[p], pdp[p])),
  ]
  return { pdp, mudou }
}
