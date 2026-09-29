import "server-only"
import { ehCodigoDeBump } from "./bump"
import { lerCarrinho } from "./carrinho"
import {
  codigoDoCupom,
  cuponsDoCarrinho,
  ehCupomDeFrete,
  esquecerCupomPendente,
  guardarCupomPendente,
  lerCupomPendente,
  type CupomPendente,
} from "./cupom-pendente"
import { cliente } from "./medusa"
import { ehCodigoDePromocao } from "./promocoes"

/**
 * O CUPOM DIGITADO — a mesma regra no checkout e na sacola (entrega 0207).
 *
 * Até a 0207 isto morava dentro da ação do checkout. A sacola ganhou o campo
 * do cupom (no celular, o do checkout fica no resumo fechado, e os clientes
 * não achavam), e duas cópias da regra um dia discordariam: o mesmo código
 * valendo num lugar e não no outro.
 *
 * QUEM VALIDA É O MEDUSA. Não existe lista de cupom neste código, e não pode
 * existir: cupom escrito no navegador é desconto que qualquer um lê no
 * código-fonte e aplica sozinho. A tela só pergunta e mostra a resposta.
 *
 * O Medusa responde 400 pra código que não existe, e também aceita 200 sem
 * aplicar nada quando o código existe mas não vale pra este carrinho. Os dois
 * casos dão no mesmo pra quem está comprando — então a checagem que vale é
 * RELER o carrinho e ver se o código entrou na lista.
 *
 * MAIÚSCULA E MINÚSCULA NÃO IMPORTAM PRA QUEM DIGITA, e importam pro Medusa:
 * ele procura o código exatamente como foi cadastrado. A loja punha tudo em
 * maiúsculas, e um cupom cadastrado como "bemvindo10" nunca valia (24/09).
 * Agora vai como foi digitado, depois em maiúsculas, depois em minúsculas —
 * a primeira que entrar vale, e a conferência não liga pra caixa.
 *
 * UM CUPOM POR PEDIDO, como na Nuvemshop (0128): o novo troca o de antes. O
 * de antes sai primeiro — o Medusa recusa um segundo cupom no carrinho — e
 * volta se o novo não entrar.
 *
 * FRETE GRÁTIS ANTES DA ENTREGA: o Medusa só desconta o frete de uma entrega
 * escolhida, e sem ela recusa o cupom como se não existisse. Quando o código
 * é de frete (o Medusa diz, `ehCupomDeFrete`), ele fica guardado e entra
 * sozinho quando a entrega for escolhida (`lib/cupom-pendente.ts`).
 */

export type Cupom =
  | { situacao: "entrou" }
  /** De frete grátis, esperando a entrega (ou a econômica) — `lib/cupom-pendente.ts`. */
  | { situacao: "guardado"; guardado: CupomPendente }
  | { situacao: "recusado" }
  /** Sem sacola, ou o Medusa não respondeu a leitura dela. */
  | { situacao: "sem-carrinho" }

/** Os campos que a regra lê: os cupons e se já há entrega. */
const CAMPOS = "id,*promotions,*shipping_methods"

function registrar(e: unknown, contexto: string) {
  console.warn(`[cupom] ${contexto}: ${e instanceof Error ? e.message : String(e)}`)
}

/** Põe o código digitado no carrinho do cookie. `digitado` já vem sem espaço nas pontas. */
export async function porCupom(digitado: string): Promise<Cupom> {
  // O código da oferta do checkout (BUMP-) e o das promoções automáticas
  // (PROMO-) não são cupom: entram sozinhos, pela caixinha e pelo Medusa.
  const maiusculo = digitado.toUpperCase()
  if (!digitado || ehCodigoDeBump(maiusculo) || ehCodigoDePromocao(maiusculo))
    return { situacao: "recusado" }

  const sdk = cliente()
  const carrinho = sdk ? await lerCarrinho(CAMPOS) : null
  if (!sdk || !carrinho) return { situacao: "sem-carrinho" }

  const mesmoCodigo = (c: string | null | undefined) =>
    (c ?? "").toLowerCase() === digitado.toLowerCase()
  const antes = cuponsDoCarrinho(carrinho.promotions)
  if (antes.some(mesmoCodigo)) return { situacao: "entrou" }
  if (antes.length) {
    try {
      await sdk.store.cart.removePromotions(carrinho.id, { promo_codes: antes })
    } catch (e) {
      registrar(e, `tirar o cupom de antes (${antes.join(", ")})`)
    }
  }

  let entrou = false
  for (const codigo of new Set([digitado, maiusculo, digitado.toLowerCase()])) {
    try {
      await sdk.store.cart.addPromotions(carrinho.id, { promo_codes: [codigo] })
    } catch {
      // 400 é a resposta pra código inexistente. Não é exceção nossa.
    }
    const depois = await lerCarrinho(CAMPOS)
    entrou = (depois?.promotions ?? []).some((p) => mesmoCodigo(p?.code))
    if (entrou) break
  }

  if (entrou) {
    // O que a pessoa digitou manda: um cupom guardado de antes (o do link) sai.
    await esquecerCupomPendente()
    return { situacao: "entrou" }
  }

  const codigo = codigoDoCupom(digitado)
  const semEntrega = !carrinho.shipping_methods?.length
  if (codigo) {
    const tipo = await ehCupomDeFrete(codigo)
    // Sem entrega, qualquer cupom de frete espera; com ela, o "só na mais
    // barata" espera a pessoa escolher a econômica. O de antes NÃO volta: a
    // pessoa trocou por este, e com dois o guardado nunca entraria.
    if (tipo.frete && (semEntrega || tipo.soMaisBarato)) {
      const guardado = { codigo, ...tipo }
      await guardarCupomPendente(guardado)
      return { situacao: "guardado", guardado }
    }
  }

  if (antes.length) {
    try {
      await sdk.store.cart.addPromotions(carrinho.id, { promo_codes: antes })
    } catch (e) {
      registrar(e, `devolver o cupom de antes (${antes.join(", ")})`)
    }
  }
  return { situacao: "recusado" }
}

/** Tira o cupom do carrinho — e o guardado, se era o mesmo (o do link não volta sozinho). */
export async function tirarCupom(codigo: string): Promise<void> {
  const sdk = cliente()
  const carrinho = sdk && codigo ? await lerCarrinho("id") : null
  if (!sdk || !carrinho) return

  try {
    await sdk.store.cart.removePromotions(carrinho.id, { promo_codes: [codigo] })
  } catch (e) {
    registrar(e, `remover cupom ${codigo}`)
  }
  if ((await lerCupomPendente())?.codigo === codigoDoCupom(codigo)) await esquecerCupomPendente()
}
