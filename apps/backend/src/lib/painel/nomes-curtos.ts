import { temNomeDaLoja } from "../erp/marcas"

/**
 * OS NOMES CURTOS DA LOJA — aprovados pelo dono em 25/09 (entrega 0099).
 *
 * Os nomes que vinham do Bling tinham de 43 a 88 letras ("Fator de
 * Crescimento para Barba 30ml — Crescimento, Densidade e Preenchimento da
 * Barba") e davam 4 linhas no título da página no celular, e até 7 no
 * computador. Estes cabem em 2 linhas, do celular de 360 px ao computador
 * (com o título de 38 px), medidos com a fonte da loja. No Google aparecem
 * inteiros: com o "· FuckingBarba" do fim, 35 a 51 letras, contra 84 a 103.
 *
 * Ficou o que a pessoa busca, no começo (o produto, "para Barba", o
 * tamanho); saíram a marca (já vem no fim do título da aba) e as frases de
 * benefício (estão nas seções da página e na descrição). O spray ganhou "para
 * Cabelo", que é pra onde ele é.
 *
 * A migração `nomes-curtos-na-loja.ts` aplica uma vez, com a marca
 * `fb_nome`: dali em diante o nome é da loja, e o painel muda.
 */
export const NOMES_CURTOS: Record<string, string> = {
  "balm-para-barba": "Balm Modelador para Barba 90g",
  "oleo-para-barba": "Óleo para Barba 30ml",
  "shampoo-para-barba": "Shampoo para Barba 120ml",
  "kit-completo-para-barba": "Kit Completo para Barba",
  "spray-modelador-matte-100ml-fucking-barba": "Spray Modelador Matte para Cabelo",
  "fator-de-crescimento-para-barba": "Fator de Crescimento para Barba 30ml",
  "kit-2-fator-de-crescimento-para-barba": "Kit 2x Fator de Crescimento",
}

type ProdutoComNome = {
  id: string
  handle: string
  title: string | null
  metadata?: Record<string, unknown> | null
}

/**
 * Os produtos que ficam com o nome curto: os da lista que ainda não têm nome
 * dado no painel (o que alguém já escolheu fica). O que já está com o nome
 * certo ganha só a marca — sem ela, a próxima importação do Bling trocaria.
 */
export function nomesPraTrocar(
  produtos: ProdutoComNome[],
  nomes: Record<string, string> = NOMES_CURTOS
): { id: string; handle: string; de: string; para: string }[] {
  return produtos.flatMap((p) => {
    const para = nomes[p.handle]
    if (!para || temNomeDaLoja(p.metadata)) return []
    return [{ id: p.id, handle: p.handle, de: p.title ?? "", para }]
  })
}
