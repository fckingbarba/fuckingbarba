import "server-only"
import { cookies, headers } from "next/headers"
import { COOKIE_CONSENTIMENTO, lerConsentimento } from "@/lib/consentimento"
import { cliente } from "@/lib/medusa"
import { site } from "@/lib/site"

/**
 * O RASTRO DA COMPRA — o que o Medusa precisa pra avisar a Meta, o GA4 e o
 * TikTok da compra, pelo servidor, quando o pagamento entrar
 * (`apps/backend/src/lib/anuncios/`): a resposta sobre os cookies; de quem
 * não disse não, os do GA4 e o navegador (o GA4 conta todo mundo desde a
 * primeira página, como as visitas — 0166 —, e o navegador diz o aparelho da
 * compra no Funil do painel, pra mesma gente); e, só com o sim, os da Meta e
 * do TikTok, o IP e a página.
 *
 * É lido AGORA, na ação de finalizar (os cookies e o cabeçalho só existem no
 * pedido de quem comprou), e mandado DEPOIS da resposta (`registrarRastro`,
 * no `after()`): a tela de obrigado não espera por isto.
 *
 * POR QUE NÃO NO METADATA DO CARRINHO (que o Medusa copia pro pedido):
 * qualquer mudança no carrinho refaz a cotação do frete e a sessão de
 * pagamento — na hora de pagar, seria uma cotação a mais e um total que
 * pode mudar debaixo do botão. E o carrinho a própria pessoa escreve; a rota
 * do rastro só a loja chama, assinada.
 */

export type RastroDaCompra = Record<string, unknown>

export async function rastroDaCompra(
  ga4: string | null,
  ip: string | null
): Promise<RastroDaCompra> {
  const jar = await cookies()
  const c = lerConsentimento(jar.get(COOKIE_CONSENTIMENTO)?.value)
  const base = { em: new Date().toISOString(), consentimento: c?.resposta ?? null }
  if (c?.resposta === "nao") return base
  const h = await headers()
  const valor = (nome: string) => jar.get(nome)?.value?.slice(0, 600) ?? null
  const medicao = {
    ...base,
    ga: ga4 ? { cookie: valor("_ga"), sessao: valor(`_ga_${ga4.slice(2)}`) } : null,
    navegador: h.get("user-agent")?.slice(0, 500) ?? null,
  }
  if (c?.resposta !== "sim") return medicao
  return {
    ...medicao,
    parceiros: c.parceiros,
    meta: { fbp: valor("_fbp"), fbc: valor("_fbc") },
    tiktok: { ttp: valor("_ttp") },
    ip,
    pagina: `${site.url}/checkout`,
  }
}

/** Manda o rastro pro pedido (`POST /store/pedidos/rastro`, assinada). Falhar só custa a medição. */
export async function registrarRastro(pedidoId: string, rastro: RastroDaCompra): Promise<void> {
  const sdk = cliente()
  const segredo = process.env.REVALIDAR_SEGREDO
  if (!sdk || !segredo) return
  try {
    await sdk.client.fetch("/store/pedidos/rastro", {
      method: "POST",
      headers: { "x-loja-segredo": segredo },
      body: { pedido: pedidoId, rastro },
    })
  } catch (e) {
    console.warn(
      `[rastro] o rastro do pedido ${pedidoId} não foi: ${e instanceof Error ? e.message : String(e)}`
    )
  }
}
