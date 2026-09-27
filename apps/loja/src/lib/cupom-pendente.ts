import "server-only"
import { cookies } from "next/headers"
import { ehCodigoDeBump } from "./bump"
import { lerCarrinho } from "./carrinho"
import { cabecalhosDeQuemPede } from "./conta"
import { cliente } from "./medusa"
import { ehCodigoDePromocao } from "./promocoes"

/**
 * O CUPOM QUE AINDA NÃO PÔDE ENTRAR — guardado num cookie até poder.
 *
 * Dois jeitos de ele nascer (entrega 0128):
 *   - o LINK DO CUPOM, `/discount/<CÓDIGO>` — o mesmo caminho da Nuvemshop,
 *     então os links que já circulam (bio, e-mail, story) seguem valendo
 *     depois da virada. A pessoa clica antes de ter sacola, e o cupom espera;
 *   - o cupom de FRETE GRÁTIS digitado antes da entrega: o Medusa só desconta
 *     o frete de uma entrega escolhida, e recusaria o cupom como se ele não
 *     existisse. A loja pergunta ao Medusa se o código é de frete
 *     (`/store/cupons/frete`) e guarda.
 *
 * A loja tenta de novo nas horas certas: quando o checkout abre
 * (`app/checkout/page.tsx`) e sempre que uma entrega é escolhida, no checkout
 * e na sacola. Entrou, o cookie sai (nas ações e na rota; a página não pode
 * mexer em cookie, e o cupom que já está no carrinho não é posto de novo).
 * Sai também quando a pessoa tira o cupom, digita outro, ou fecha o pedido.
 * Sete dias sem entrar, o navegador apaga.
 *
 * UM CUPOM POR PEDIDO: se o carrinho já tem outro cupom, o guardado espera —
 * a pessoa escolhe qual fica.
 */

export const COOKIE_DO_CUPOM = "cupom"

const OPCOES = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
} as const

const CODIGO = /^[A-Z0-9][A-Z0-9_-]{2,29}$/

export type CupomPendente = { codigo: string; frete: boolean; soMaisBarato: boolean }

/** O código como o link e o campo trazem — sem espaço, em maiúsculas —, ou null. */
export function codigoDoCupom(v: unknown): string | null {
  if (typeof v !== "string") return null
  let texto = v
  try {
    texto = decodeURIComponent(v)
  } catch {
    // Um "%" solto: fica o texto como veio.
  }
  const codigo = texto.replace(/\s+/g, "").toUpperCase()
  return CODIGO.test(codigo) && !ehCodigoDeBump(codigo) && !ehCodigoDePromocao(codigo)
    ? codigo
    : null
}

/** O cookie tem o código e, quando se sabe, o tipo: "BARBA20", "FRETEG~frete", "FRETEG~barato". */
export async function lerCupomPendente(): Promise<CupomPendente | null> {
  const bruto = (await cookies()).get(COOKIE_DO_CUPOM)?.value ?? ""
  const [parte, tipo] = bruto.split("~")
  const codigo = codigoDoCupom(parte)
  if (!codigo) return null
  return { codigo, frete: tipo === "frete" || tipo === "barato", soMaisBarato: tipo === "barato" }
}

/** Só em ação ou rota: a página não pode escrever cookie. */
export async function guardarCupomPendente(c: CupomPendente) {
  const tipo = c.frete ? (c.soMaisBarato ? "~barato" : "~frete") : ""
  ;(await cookies()).set(COOKIE_DO_CUPOM, `${c.codigo}${tipo}`, OPCOES)
}

/** Só em ação ou rota. */
export async function esquecerCupomPendente() {
  const jar = await cookies()
  if (jar.get(COOKIE_DO_CUPOM)) jar.delete(COOKIE_DO_CUPOM)
}

/**
 * O código é de um cupom de frete grátis valendo? Pergunta ao Medusa, com a
 * assinatura da loja e o IP de quem pede (a rota tem limite). Sem resposta,
 * "não" — e o cupom é recusado como antes.
 */
export async function ehCupomDeFrete(
  codigo: string
): Promise<{ frete: boolean; soMaisBarato: boolean }> {
  const sdk = cliente()
  if (!sdk) return { frete: false, soMaisBarato: false }
  try {
    const r = await sdk.client.fetch<{ frete?: boolean; soMaisBarato?: boolean }>(
      "/store/cupons/frete",
      { method: "GET", query: { codigo }, headers: await cabecalhosDeQuemPede() }
    )
    return { frete: r.frete === true, soMaisBarato: r.soMaisBarato === true }
  } catch (e) {
    console.warn(`[cupom] não consegui perguntar se ${codigo} é de frete: ${e}`)
    return { frete: false, soMaisBarato: false }
  }
}

/** Os códigos de cupom de um carrinho — não os da oferta do checkout, nem os das promoções automáticas. */
export const cuponsDoCarrinho = (
  promocoes: ({ code?: string | null } | null)[] | null | undefined
) =>
  (promocoes ?? [])
    .map((p) => p?.code ?? "")
    .filter((c) => c && !ehCodigoDeBump(c) && !ehCodigoDePromocao(c))

/**
 * Põe o cupom guardado no carrinho, se der: `"entrou"` (entrou agora, ou já
 * estava), `"esperando"` (não entrou — falta a entrega, o valor, ou há outro
 * cupom) ou `null` (nada guardado, ou sem carrinho). Não mexe no cookie:
 * quem pode apagar é quem chamou.
 */
export async function tentarCupomPendente(
  guardado?: CupomPendente
): Promise<"entrou" | "esperando" | null> {
  // A rota do link passa o que acabou de guardar: o cookie novo ainda não
  // está no que a requisição trouxe.
  const pendente = guardado ?? (await lerCupomPendente())
  const sdk = cliente()
  if (!pendente || !sdk) return null
  const carrinho = await lerCarrinho("id,*promotions,*shipping_methods")
  if (!carrinho) return null
  const cupons = cuponsDoCarrinho(carrinho.promotions)
  if (cupons.some((c) => c.toUpperCase() === pendente.codigo)) return "entrou"
  if (cupons.length) return "esperando"
  // O de frete só entra com uma entrega escolhida: sem ela, nem pergunta.
  if (pendente.frete && !carrinho.shipping_methods?.length) return "esperando"
  try {
    const { cart } = await sdk.store.cart.addPromotions(
      carrinho.id,
      { promo_codes: [pendente.codigo] },
      { fields: "id,*promotions" }
    )
    return cuponsDoCarrinho(cart?.promotions).some((c) => c.toUpperCase() === pendente.codigo)
      ? "entrou"
      : "esperando"
  } catch {
    // 400 é o Medusa dizendo que o código não vale (ainda). Fica guardado.
    return "esperando"
  }
}
