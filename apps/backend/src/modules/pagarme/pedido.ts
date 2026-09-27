import type { EntradaDaLoja } from "../../lib/pagamento/entrada"
import type { Forma } from "../../lib/pagamento/estado"
import { emCentavos, type CorpoDoPedido, type EnderecoPagarme } from "./client"

/**
 * O PEDIDO: o que a loja manda, conferido, e o que vai pro Pagar.me.
 *
 * ┌─ QUEM DECIDE O VALOR ──────────────────────────────────────────────────┐
 * │ NUNCA a loja. O valor cobrado é o `amount` da sessão de pagamento, que │
 * │ o Medusa tira da coleção de pagamento do carrinho — a loja não tem     │
 * │ como mexer nele pela API. O que a loja manda (itens, frete) serve pra  │
 * │ o pedido aparecer DISCRIMINADO no painel do Pagar.me e na análise de   │
 * │ fraude; se a soma do que ela mandou não bater com o valor da sessão,   │
 * │ centavo por centavo, os itens viram uma linha só com o valor certo.    │
 * │                                                                         │
 * │ Ou seja: a loja pode errar a descrição, e o cliente continua pagando   │
 * │ exatamente o que o Medusa calculou. O contrário nunca.                 │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * POR QUE O COMPRADOR VEM DA LOJA E NÃO DO CARRINHO: o provedor de pagamento
 * é um módulo isolado do Medusa e não enxerga o módulo de carrinho. A
 * `authorizePayment` recebe só os dados da sessão. Então a ação de finalizar
 * da loja, que roda no servidor e lê o carrinho do próprio Medusa, entrega o
 * comprador na hora de abrir a sessão — e tudo é conferido de novo aqui,
 * porque a rota que abre sessão é pública.
 */

/** Pix ou cartão — a forma é da língua comum dos parceiros (`lib/pagamento/estado.ts`). */
export type { Forma }

/*
 * A entrada da loja (o tipo, a conferência e os limites das parcelas) mora
 * em `lib/pagamento/entrada.ts` desde a 0140: é a mesma pro Mercado Pago.
 * Continua saindo daqui, pra quem já importava deste arquivo.
 */
export {
  conferirEntrada,
  PARCELA_MINIMA_CENTAVOS,
  PARCELAS_MAXIMAS,
  type EntradaDaLoja,
} from "../../lib/pagamento/entrada"

/**
 * O nome que aparece na fatura do cartão. No modelo PSP do Pagar.me o limite
 * é 13 caracteres — "FUCKINGBARBA" tem 12. Fatura com nome que a pessoa não
 * reconhece vira contestação ("não fui eu que comprei").
 */
export const DESCRITOR_NA_FATURA = "FUCKINGBARBA"

/* ── montagem ─────────────────────────────────────────────────────────────── */

const corta = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s)

/**
 * "Número, Rua, Bairro — nesta ordem e separados por vírgula" é a regra da
 * `line_1` do Pagar.me, e é ao contrário do jeito brasileiro de escrever. A
 * antifraude lê o número de lá.
 */
function endereco(e: EntradaDaLoja["endereco"]): EnderecoPagarme {
  return {
    line_1: corta(`${e.numero}, ${e.rua}, ${e.bairro}`, 256),
    ...(e.complemento ? { line_2: corta(e.complemento, 128) } : {}),
    zip_code: e.cep,
    city: corta(e.cidade, 64),
    state: e.uf,
    country: "BR",
  }
}

/**
 * +5547999998888 → DDD 47, número 999998888. Nove dígitos é celular; oito é
 * fixo — e o Pagar.me guarda os dois em campos diferentes.
 */
function telefone(t: string) {
  const so = t.replace(/\D/g, "").replace(/^55/, "")
  const fone = { country_code: "55", area_code: so.slice(0, 2), number: so.slice(2) }
  return so.length === 11 ? { mobile_phone: fone } : { home_phone: fone }
}

/**
 * Os itens como o Pagar.me quer, somando EXATAMENTE `valor − frete`.
 *
 * Cada linha vai com o preço unitário quando o total da linha divide certo
 * pela quantidade. Quando não divide (desconto de R$ 10 em 3 unidades), a
 * linha vai inteira, com quantidade 1 e "(3 un.)" na descrição — preço
 * unitário com fração de centavo não existe, e arredondar mudaria a soma.
 *
 * E se a soma de tudo não bater com o valor da sessão (desconto no frete,
 * promoção no pedido inteiro, qualquer conta que o Medusa fez e a lista não
 * mostra), vira uma linha só. O painel fica menos bonito; a cobrança fica
 * certa.
 */
function itens(entrada: EntradaDaLoja, valor: number, frete: number) {
  const linhas = entrada.itens
    .map((i) => {
      const total = emCentavos(i.total)
      const descricao = corta(i.descricao, 200)
      const codigo = corta(i.codigo, 52)
      return total > 0 && total % i.quantidade === 0
        ? {
            amount: total / i.quantidade,
            quantity: i.quantidade,
            description: descricao,
            code: codigo,
          }
        : {
            amount: total,
            quantity: 1,
            description: corta(`${descricao} (${i.quantidade} un.)`, 200),
            code: codigo,
          }
    })
    .filter((l) => l.amount > 0)

  const soma = linhas.reduce((s, l) => s + l.amount * l.quantity, 0)
  if (linhas.length && soma === valor - frete) return linhas

  return [
    {
      amount: valor - frete,
      quantity: 1,
      description: "Compra na FuckingBarba",
      code: "pedido",
    },
  ]
}

/**
 * O corpo do `POST /orders`.
 *
 * `codigo` é o id da sessão de pagamento do Medusa — é por ele que o webhook
 * volta pra sessão certa, e é ele que impede o mesmo pagamento de virar dois
 * pedidos (ver `buscarPorCodigo`).
 */
export function montarPedido(
  entrada: EntradaDaLoja,
  valor: number,
  codigo: string,
  pixMinutos: number,
  origem: string
): CorpoDoPedido {
  // Frete maior que o total não existe; se chegar, é conta que a lista não
  // explica, e o total inteiro vira item (frete zero pro Pagar.me).
  const freteBruto = Math.max(0, emCentavos(entrada.frete.total))
  const frete = freteBruto < valor ? freteBruto : 0

  const cobranca = endereco(entrada.endereco)
  const doc = entrada.comprador.tipoDocumento === "cnpj"
  const nome = corta(entrada.comprador.nome, 64)

  return {
    code: codigo,
    items: itens(entrada, valor, frete),
    customer: {
      name: nome,
      email: entrada.comprador.email,
      document: entrada.comprador.documento,
      document_type: doc ? "CNPJ" : "CPF",
      type: doc ? "company" : "individual",
      phones: telefone(entrada.comprador.telefone),
      address: cobranca,
    },
    shipping: {
      amount: frete,
      description: corta(entrada.frete.descricao || "Entrega", 64),
      recipient_name: nome,
      recipient_phone: entrada.comprador.telefone.replace(/\D/g, "").replace(/^55/, ""),
      address: cobranca,
    },
    payments: [
      entrada.forma === "pix"
        ? { payment_method: "pix", amount: valor, pix: { expires_in: pixMinutos * 60 } }
        : {
            payment_method: "credit_card",
            amount: valor,
            credit_card: {
              installments: entrada.parcelas,
              statement_descriptor: DESCRITOR_NA_FATURA,
              // SÓ AUTORIZA. A cobrança vem depois de a análise de fraude
              // aprovar (`podeCobrar`, no `situacao.ts`): com
              // `auth_and_capture`, a compra que a análise reprovava era
              // cobrada e devolvida — o valor aparecia e sumia da fatura.
              operation_type: "auth_only",
              card_token: entrada.token ?? "",
              card: { billing_address: cobranca },
            },
          },
    ],
    ...(entrada.ip ? { ip: entrada.ip } : {}),
    metadata: { origem },
    closed: true,
  }
}
