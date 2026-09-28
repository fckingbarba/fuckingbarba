import type { MedusaContainer } from "@medusajs/framework/types"
import { createPromotionsWorkflow } from "@medusajs/medusa/core-flows"
import { randomInt } from "node:crypto"
import { promocaoDoCupom, type CupomNovo } from "../cupons"
import { PREFIXO_DO_CUPOM, VALIDADE_DO_CUPOM } from "./fluxos"

/**
 * O CUPOM DOS FLUXOS — o desconto do e-mail de 24 horas (`lib/crm/fluxos.ts`):
 * um código só da pessoa (`VOLTA-7KQ2MX`), de uso único, que vence em 2 dias
 * (3 no carrinho abandonado: `validadeDoCupom`).
 * É uma promoção do Medusa como as do painel (`promocaoDoCupom`), com as
 * mesmas regras da loja: um cupom de campanha por pedido, e o uso volta se o
 * pedido for cancelado (o Pix que venceu).
 *
 * SOMA com o preço promocional: quase todo produto da loja tem o "de/por", e
 * o cupom que não somasse daria desconto em nada. Fica fora da lista de
 * cupons do painel — quem mostra é a aba Fluxos do CRM.
 *
 * O cupom da 1ª compra (o do pop-up, entrega 0177) é o mesmo, com outro
 * começo (`BEMVINDO-`) e a regra de só valer pra quem nunca comprou — a
 * mesma "primeira compra" dos cupons do painel.
 */

/** Sem 0/O, 1/I/L: o código também é lido e digitado por gente. */
const LETRAS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"

export function codigoDoCupom(
  sorteio: (max: number) => number = randomInt,
  prefixo = PREFIXO_DO_CUPOM
): string {
  let codigo = prefixo
  for (let i = 0; i < 6; i++) codigo += LETRAS[sorteio(LETRAS.length)]
  return codigo
}

/** "2026-09-29T15:30", em Brasília — o `ate` do cupom do painel. */
export function emBrasilia(d: Date): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d)
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? "00"
  return `${p("year")}-${p("month")}-${p("day")}T${p("hour")}:${p("minute")}`
}

/** O cupom como o painel o descreveria: % na loja toda, uma vez, até `ate`. */
export function cupomDoFluxo(
  codigo: string,
  porcento: number,
  ate: Date,
  { primeiraCompra = false }: { primeiraCompra?: boolean } = {}
): CupomNovo {
  return {
    codigo,
    tipo: "porcento",
    valor: porcento,
    soMaisBarato: false,
    aplicarA: "loja",
    alvos: [],
    combina: true,
    limite: 1,
    porCliente: null,
    primeiraCompra,
    de: null,
    ate: emBrasilia(ate),
    minimo: null,
  }
}

/** Cria o cupom no Medusa. Código repetido (1 em 800 milhões): tenta outro. */
export async function criarCupomDoFluxo(
  container: MedusaContainer,
  {
    porcento,
    agora,
    validade = VALIDADE_DO_CUPOM,
    prefixo = PREFIXO_DO_CUPOM,
    primeiraCompra = false,
    campanha = "CRM (fluxos)",
  }: {
    porcento: number
    agora: Date
    validade?: number
    prefixo?: string
    primeiraCompra?: boolean
    campanha?: string
  }
): Promise<{ codigo: string; ate: Date; id: string }> {
  const ate = new Date(agora.getTime() + validade)
  let erro: unknown = null
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const codigo = codigoDoCupom(randomInt, prefixo)
    try {
      const { result } = await createPromotionsWorkflow(container).run({
        input: {
          promotionsData: [
            promocaoDoCupom(
              cupomDoFluxo(codigo, porcento, ate, { primeiraCompra }),
              campanha,
              agora
            ),
          ] as never,
        },
      })
      return { codigo, ate, id: (result as { id: string }[])[0].id }
    } catch (e) {
      erro = e
    }
  }
  throw erro
}
