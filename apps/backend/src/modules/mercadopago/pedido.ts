import type { EntradaDaLoja } from "../../lib/pagamento/entrada"
import type { CorpoDoPix } from "./client"

/**
 * O PIX QUE VAI PRO MERCADO PAGO, montado da entrada que a loja mandou (já
 * conferida — `lib/pagamento/entrada.ts`).
 *
 * O VALOR é o da sessão, nunca o da loja: o `valor` que chega aqui é o
 * `amount` que o Medusa calculou (ver a caixa "QUEM DECIDE O VALOR" do
 * `modules/pagarme/pedido.ts`). Do comprador vai o que o Pix pede — nome,
 * e-mail e CPF/CNPJ; o endereço e os itens ficam com a loja.
 */

/** O Mercado Pago recusa Pix que vale menos que isto, contado na chegada lá. */
export const MINUTOS_MINIMOS_DO_PIX = 30

/**
 * A folga do caminho: um Pix de 30 minutos que chega lá com 29:59 é
 * recusado. Com ela, vale 31 — o que a conciliação espera antes de dar o Pix
 * por vencido vem da data que o próprio Mercado Pago devolver.
 */
const FOLGA_DA_VALIDADE_MS = 60_000

/**
 * A validade do QR no formato dos exemplos da documentação deles, com o fuso
 * escrito: "2026-09-27T15:31:00.000-03:00" — no horário de Brasília, que não
 * tem mais horário de verão.
 */
export function validadeDoPix(agora: Date, minutos: number): string {
  const ms = Math.max(minutos, MINUTOS_MINIMOS_DO_PIX) * 60_000 + FOLGA_DA_VALIDADE_MS
  const emBrasilia = new Date(agora.getTime() + ms - 3 * 60 * 60 * 1000)
  return emBrasilia.toISOString().replace(/Z$/, "-03:00")
}

export function montarPix(
  entrada: EntradaDaLoja,
  valor: number,
  codigo: string,
  minutos: number,
  origem: string,
  agora = new Date()
): CorpoDoPix {
  const [primeiro, ...resto] = entrada.comprador.nome.split(" ")
  return {
    transaction_amount: Math.round(valor) / 100,
    description: "Pedido na FuckingBarba",
    payment_method_id: "pix",
    external_reference: codigo,
    date_of_expiration: validadeDoPix(agora, minutos),
    payer: {
      email: entrada.comprador.email,
      first_name: primeiro,
      last_name: resto.join(" ") || primeiro,
      identification: {
        type: entrada.comprador.tipoDocumento === "cnpj" ? "CNPJ" : "CPF",
        number: entrada.comprador.documento,
      },
    },
    metadata: { origem, sessao: codigo },
  }
}
