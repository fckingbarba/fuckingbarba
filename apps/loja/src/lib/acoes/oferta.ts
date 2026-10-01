"use server"

import { adicionar, type Resultado } from "@/lib/acoes/carrinho"
import { criarCarrinhoCom, idDoCarrinho } from "@/lib/carrinho"
import { cliente } from "@/lib/medusa"
import { ehEnderecoDeOferta } from "@/lib/ofertas"

/**
 * O "COMPRAR" DA PÁGINA DA OFERTA OCULTA (`lib/ofertas.ts`): marca o
 * carrinho com a oferta (`POST /store/oferta/:endereco/carrinho`, assinado)
 * e só então põe o produto — com a marca, o Medusa cobra o preço da oferta
 * desde a primeira conta. O que já estava na sacola também passa pro preço
 * da oferta (o backend refaz as linhas).
 *
 * Sem carrinho, ou com um que já virou pedido, nasce um vazio, é marcado, e
 * o produto entra: três idas, só na primeira vez. Depois, duas (a marca de
 * novo não muda nada, e é o que confere se a oferta ainda vale).
 *
 * O checkout confere, quando abre, se a oferta da marca ainda vale
 * (`conferirOferta`).
 */

const GENERICO = "Não consegui falar com a loja agora. Tenta de novo em instantes."
const ACABOU = "Essa oferta acabou. O produto segue na loja pelo preço de sempre."

type Marca = "ok" | "sem-carrinho" | "acabou" | "falhou"

async function marcar(endereco: string, carrinho: string): Promise<Marca> {
  const sdk = cliente()
  if (!sdk) return "falhou"
  try {
    await sdk.client.fetch(`/store/oferta/${endereco}/carrinho`, {
      method: "POST",
      body: { carrinho },
    })
    return "ok"
  } catch (e) {
    const status = (e as { status?: unknown }).status
    const msg = e instanceof Error ? e.message : String(e)
    if (/carrinho_fechado|carrinho_nao_existe/.test(msg)) return "sem-carrinho"
    if (status === 404 || status === 409) return "acabou"
    console.warn(`[oferta] marcar o carrinho na ${endereco}: ${msg}`)
    return "falhou"
  }
}

export async function adicionarDaOferta(
  endereco: string,
  varianteId: string,
  quantidade = 1
): Promise<Resultado> {
  if (!ehEnderecoDeOferta(endereco) || !cliente())
    return { ok: false, erro: GENERICO, carrinho: null }

  const id = await idDoCarrinho()
  let marca: Marca = id ? await marcar(endereco, id) : "sem-carrinho"
  if (marca === "sem-carrinho") {
    let novo: Awaited<ReturnType<typeof criarCarrinhoCom>> = null
    try {
      novo = await criarCarrinhoCom(null)
    } catch (e) {
      console.warn(`[oferta] criar o carrinho: ${e instanceof Error ? e.message : e}`)
    }
    if (!novo) return { ok: false, erro: GENERICO, carrinho: null }
    marca = await marcar(endereco, novo.id)
  }
  if (marca === "acabou") return { ok: false, erro: ACABOU, carrinho: null }
  if (marca !== "ok") return { ok: false, erro: GENERICO, carrinho: null }

  return adicionar(varianteId, quantidade)
}
