import "server-only"
import { cliente } from "@/lib/medusa"

/**
 * A OFERTA OCULTA AINDA VALE? — o checkout pergunta antes de ler o carrinho
 * (`app/checkout/page.tsx`). A linha da sacola guarda o preço de quando
 * entrou, e o Medusa não refaz sozinho: sem esta pergunta, quem deixou a
 * sacola cheia pagaria o preço da oferta depois do fim. Se ela acabou
 * (pelo fim, pausada ou encerrada no painel), o backend tira a marca e volta
 * as linhas pro preço da vitrine (`POST /store/ofertas/conferir`), e a tela
 * avisa com o título que volta daqui.
 *
 * Só pergunta o carrinho que tem a marca (`ofertaOculta`, lida junto com o
 * resto do checkout): o checkout de todo mundo não ganha uma ida a mais. Vale
 * também pra quem volta pelo link do e-mail em outro aparelho — a marca é do
 * carrinho, não do navegador. Quando ela acaba, a marca sai, e a pergunta
 * não se repete.
 *
 * Sem resposta, `null`: o checkout segue (a oferta não acabou pra ele, e a
 * próxima abertura pergunta de novo).
 */
export async function conferirOferta(carrinho: string): Promise<string | null> {
  const sdk = cliente()
  if (!sdk) return null
  try {
    const { acabou } = await sdk.client.fetch<{ acabou?: string | null }>(
      "/store/ofertas/conferir",
      { method: "POST", body: { carrinho } }
    )
    return typeof acabou === "string" && acabou ? acabou : null
  } catch (e) {
    console.warn(`[oferta] conferir no checkout: ${e instanceof Error ? e.message : e}`)
    return null
  }
}
