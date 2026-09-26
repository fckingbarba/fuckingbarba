"use server"

import { cookies } from "next/headers"
import {
  CAMPOS_CARRINHO,
  CARRINHO_VAZIO,
  COOKIE_CARRINHO,
  carrinhoAcabou,
  criarCarrinhoCom,
  idDoCarrinho,
  leituraDoCarrinho,
  paraVisivel,
  situacaoDoCarrinho,
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
 *
 * NA FALHA, `carrinho: null` quer dizer "não consegui ler" — o Medusa não
 * respondeu —, e a tela fica com a sacola que já mostrava. Não é a sacola
 * vazia: com o vazio no lugar, cada deploy do backend esvaziava a gaveta de
 * quem mexia nela, e quem pusesse os produtos de novo ficava com o dobro.
 *
 * UMA IDA AO MEDUSA POR CLIQUE, sempre que dá (entrega 0104). Cada escrita
 * na sacola é um workflow inteiro no Medusa — preço, estoque, promoção,
 * frete e imposto refeitos, umas cem idas e voltas ao banco — e custava de
 * 0,6 a 0,9 s na produção; a pergunta que vinha antes ("o carrinho ainda
 * vale?", ou a sacola inteira lida só pra saber o id) somava mais uma ida.
 * Adicionar e mudar a quantidade agora escrevem direto no id do cookie: o
 * próprio Medusa recusa carrinho que já virou pedido, e a recusa é que diz
 * "acabou" (`carrinhoAcabou`). Remover continua perguntando antes, mas a
 * pergunta curta: a remoção do Medusa não confere isso (ver
 * `situacaoDoCarrinho`).
 */

export type Resultado =
  | { ok: true; carrinho: CarrinhoVisivel }
  | { ok: false; erro: string; carrinho: CarrinhoVisivel | null }

const GENERICO = "Não consegui falar com a loja agora. Tenta de novo em instantes."

/** A sacola de agora, ou null se o Medusa não respondeu. */
async function agora(): Promise<CarrinhoVisivel | null> {
  const lido = await leituraDoCarrinho()
  return lido === "sem-resposta" ? null : paraVisivel(lido)
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

/**
 * Põe (ou soma) uma variante na sacola. O Medusa junta linhas da mesma variante.
 *
 * Sem carrinho, cria já com o item, numa ida só (`criarCarrinhoCom`). Com
 * carrinho, escreve direto nele; se a escrita voltar dizendo que ele acabou
 * (virou pedido), um carrinho novo nasce com o item — o que a pergunta de
 * antes fazia, só que sem a pergunta no caminho de todo mundo.
 */
export async function adicionar(varianteId: string, quantidade = 1): Promise<Resultado> {
  const sdk = cliente()
  if (!sdk) return { ok: false, erro: GENERICO, carrinho: null }

  const item = {
    variant_id: varianteId,
    quantity: Math.max(1, Math.min(Math.trunc(quantidade) || 1, 99)),
  }

  try {
    const id = await idDoCarrinho()
    if (id) {
      try {
        const { cart } = await sdk.store.cart.createLineItem(id, item, {
          fields: CAMPOS_CARRINHO,
        })
        return { ok: true, carrinho: paraVisivel(cart) }
      } catch (e) {
        if (!carrinhoAcabou(e)) throw e
        ;(await cookies()).delete(COOKIE_CARRINHO)
      }
    }
    const cart = await criarCarrinhoCom(item)
    return cart
      ? { ok: true, carrinho: paraVisivel(cart) }
      : { ok: false, erro: GENERICO, carrinho: null }
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
  if (!variantes.length) {
    const carrinho = await agora()
    return carrinho ? { ok: true, carrinho } : { ok: false, erro: GENERICO, carrinho: null }
  }

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
  if (!sdk) return { ok: false, erro: GENERICO, carrinho: null }

  const id = await idDoCarrinho()
  if (!id) return { ok: false, erro: GENERICO, carrinho: CARRINHO_VAZIO }

  try {
    // Direto, sem ler a sacola antes: carrinho que virou pedido o Medusa recusa.
    const { cart } = await sdk.store.cart.updateLineItem(
      id,
      linhaId,
      { quantity: Math.min(qtd, 99) },
      { fields: CAMPOS_CARRINHO }
    )
    return { ok: true, carrinho: paraVisivel(cart) }
  } catch (e) {
    if (carrinhoAcabou(e)) return { ok: false, erro: GENERICO, carrinho: CARRINHO_VAZIO }
    return falha(e, `quantidade ${linhaId}`)
  }
}

export async function remover(linhaId: string): Promise<Resultado> {
  const sdk = cliente()
  if (!sdk) return { ok: false, erro: GENERICO, carrinho: null }

  const id = await idDoCarrinho()
  if (!id) return { ok: false, erro: GENERICO, carrinho: CARRINHO_VAZIO }

  try {
    // A pergunta curta, e não a sacola inteira: a remoção do Medusa não
    // confere se o carrinho já virou pedido (ver `situacaoDoCarrinho`).
    const situacao = await situacaoDoCarrinho(id)
    if (situacao === "sem-resposta") return { ok: false, erro: GENERICO, carrinho: null }
    if (situacao === "acabou") return { ok: false, erro: GENERICO, carrinho: CARRINHO_VAZIO }

    // A resposta da remoção já traz o carrinho de depois (`parent`), com os
    // campos da gaveta — sem uma segunda ida só pra reler.
    const { parent } = await sdk.store.cart.deleteLineItem(id, linhaId, {
      fields: CAMPOS_CARRINHO,
    })
    const depois = parent ? paraVisivel(parent) : await agora()
    return depois ? { ok: true, carrinho: depois } : { ok: false, erro: GENERICO, carrinho: null }
  } catch (e) {
    return falha(e, `remover ${linhaId}`)
  }
}

/*
 * A LEITURA NÃO MORA AQUI. Era a `sincronizar`, uma action — e o Next roda as
 * actions de uma aba uma por vez: uma leitura presa na rede segurava o "+"
 * atrás dela. Quem lê é o GET `/api/sacola`.
 */
