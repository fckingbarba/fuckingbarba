"use server"

import {
  CAMPOS_CARRINHO,
  CARRINHO_VAZIO,
  garantirCarrinho,
  lerCarrinho,
  paraVisivel,
  type CarrinhoVisivel,
} from "@/lib/carrinho"
import { cliente } from "@/lib/medusa"

/**
 * AS AÇÕES DO CARRINHO
 *
 * Tudo que escreve no carrinho passa por aqui. São server actions: o
 * navegador manda o pedido, o servidor fala com o Medusa e devolve o
 * resultado — nenhuma chave, nenhum preço e nenhuma regra de desconto
 * chegam a existir no bundle do cliente.
 *
 * CADA AÇÃO DEVOLVE O CARRINHO INTEIRO (no formato enxuto de `CarrinhoVisivel`).
 * Podia devolver só "deu certo" e mandar a página recarregar, mas aí todo
 * clique em "+" custaria uma ida e volta a mais, e o total piscaria no meio
 * do caminho. Devolvendo o estado novo, a gaveta troca o conteúdo de uma vez
 * e o número do cabeçalho vem junto — e continua sendo o servidor quem diz
 * qual é o total, não uma conta refeita no navegador.
 *
 * Não tem `revalidatePath` de propósito: carrinho lê cookie, então nunca
 * esteve em cache nenhum. Chamar revalidate aqui derrubaria o cache do
 * catálogo inteiro a cada item adicionado, de graça.
 *
 * O FORMATO DA RESPOSTA é sempre `{ ok }` com um `erro` legível, nunca uma
 * exceção: ação que estoura atravessa o boundary do React como "An error
 * occurred in the Server Components render", e aí o cliente não tem o que
 * mostrar além de "algo deu errado".
 */

export type Resultado =
  { ok: true; carrinho: CarrinhoVisivel } | { ok: false; erro: string; carrinho: CarrinhoVisivel }

const GENERICO = "Não consegui falar com a loja agora. Tenta de novo em instantes."

async function agora(): Promise<CarrinhoVisivel> {
  return paraVisivel(await lerCarrinho())
}

/**
 * As duas mensagens que o cliente precisa entender são estoque e produto
 * indisponível; o resto vira texto genérico de propósito, porque mensagem de
 * erro de backend na tela é por onde vazam nome de tabela e id interno.
 *
 * Os dois padrões abaixo foram conferidos contra a produção:
 *   "Some variant does not have the required inventory"
 *   "Variants ... do not exist or belong to a product that is not published"
 */
async function falha(erro: unknown, contexto: string): Promise<Resultado> {
  const msg = erro instanceof Error ? erro.message : String(erro)
  console.warn(`[carrinho] ${contexto}: ${msg}`)

  const texto = /inventory|insufficient|not enough|stock/i.test(msg)
    ? "Não temos essa quantidade em estoque."
    : /variant|do not exist|not found|not published/i.test(msg)
      ? "Esse produto não está mais disponível."
      : GENERICO

  return { ok: false, erro: texto, carrinho: await agora() }
}

/** Põe (ou soma) uma variante na sacola. O Medusa junta linhas da mesma variante. */
export async function adicionar(varianteId: string, quantidade = 1): Promise<Resultado> {
  const sdk = cliente()
  if (!sdk) return { ok: false, erro: GENERICO, carrinho: CARRINHO_VAZIO }

  const qtd = Math.max(1, Math.min(Math.trunc(quantidade) || 1, 99))

  try {
    const id = await garantirCarrinho()
    if (!id) return { ok: false, erro: GENERICO, carrinho: CARRINHO_VAZIO }

    const { cart } = await sdk.store.cart.createLineItem(
      id,
      { variant_id: varianteId, quantity: qtd },
      { fields: CAMPOS_CARRINHO }
    )
    return { ok: true, carrinho: paraVisivel(cart) }
  } catch (e) {
    return falha(e, `adicionar ${varianteId}`)
  }
}

/**
 * Várias variantes de uma vez — é o "levar a rotina", que põe shampoo,
 * tratamento e óleo na sacola num clique.
 *
 * VAI UMA POR VEZ, EM SÉRIE, e não em paralelo: o Medusa recalcula o
 * carrinho inteiro a cada linha, e duas escritas simultâneas no mesmo
 * carrinho é a receita pra uma sobrescrever o total da outra. Três idas e
 * voltas de rede num clique que a pessoa deu de propósito é preço justo.
 *
 * SE UMA FALHAR, as anteriores FICAM na sacola. É deliberado: o cliente
 * escolheu três produtos, um está sem estoque, e esvaziar tudo por causa
 * dele seria punir a escolha inteira. Ele recebe o aviso do que não entrou,
 * com o carrinho que de fato existe.
 */
export async function adicionarVarios(
  variantes: { varianteId: string; quantidade?: number }[]
): Promise<Resultado> {
  if (!variantes.length) return { ok: true, carrinho: await agora() }

  let ultimo: Resultado = { ok: true, carrinho: CARRINHO_VAZIO }
  for (const v of variantes) {
    ultimo = await adicionar(v.varianteId, v.quantidade ?? 1)
    if (!ultimo.ok) return ultimo
  }
  return ultimo
}

/** Muda a quantidade de uma linha. Zero remove, que é o que quem clica espera. */
export async function mudarQuantidade(linhaId: string, quantidade: number): Promise<Resultado> {
  const qtd = Math.trunc(quantidade) || 0
  if (qtd <= 0) return remover(linhaId)

  const sdk = cliente()
  if (!sdk) return { ok: false, erro: GENERICO, carrinho: CARRINHO_VAZIO }

  try {
    const carrinho = await lerCarrinho()
    if (!carrinho) return { ok: false, erro: GENERICO, carrinho: CARRINHO_VAZIO }

    const { cart } = await sdk.store.cart.updateLineItem(
      carrinho.id,
      linhaId,
      { quantity: Math.min(qtd, 99) },
      { fields: CAMPOS_CARRINHO }
    )
    return { ok: true, carrinho: paraVisivel(cart) }
  } catch (e) {
    return falha(e, `quantidade ${linhaId}`)
  }
}

export async function remover(linhaId: string): Promise<Resultado> {
  const sdk = cliente()
  if (!sdk) return { ok: false, erro: GENERICO, carrinho: CARRINHO_VAZIO }

  try {
    const carrinho = await lerCarrinho()
    if (!carrinho) return { ok: false, erro: GENERICO, carrinho: CARRINHO_VAZIO }

    await sdk.store.cart.deleteLineItem(carrinho.id, linhaId)
    return { ok: true, carrinho: await agora() }
  } catch (e) {
    return falha(e, `remover ${linhaId}`)
  }
}

/** A gaveta pede isto quando abre, pra não confiar num estado velho da aba. */
export async function sincronizar(): Promise<CarrinhoVisivel> {
  return agora()
}
