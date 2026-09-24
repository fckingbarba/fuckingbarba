import { MedusaError } from "@medusajs/framework/utils"
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

export type Forma = "pix" | "cartao"

/**
 * Parcelas sem juros e a menor parcela aceita.
 *
 * PRECISAM BATER com `PARCELAS_SEM_JUROS` e `PARCELA_MINIMA` de
 * `apps/loja/src/lib/site.ts`: lá é o que a vitrine anuncia ("3x sem
 * juros"), aqui é o que o backend aceita. Se a loja oferecer 4x e o backend
 * recusar, quem descobre é o cliente, no último clique. O conferidor de
 * pagamento compra em 3x pra travar isso.
 */
export const PARCELAS_MAXIMAS = 3
export const PARCELA_MINIMA_CENTAVOS = 500

/**
 * O nome que aparece na fatura do cartão. No modelo PSP do Pagar.me o limite
 * é 13 caracteres — "FUCKINGBARBA" tem 12. Fatura com nome que a pessoa não
 * reconhece vira contestação ("não fui eu que comprei").
 */
export const DESCRITOR_NA_FATURA = "FUCKINGBARBA"

/** O que a loja manda em `data.pagarme` ao abrir a sessão. */
export type EntradaDaLoja = {
  forma: Forma
  /** 1 no Pix. */
  parcelas: number
  /** `token_…` do cartão, gerado NO NAVEGADOR. Vale 60 segundos e uma vez só. */
  token: string | null
  comprador: {
    nome: string
    email: string
    /** Só letras e dígitos (o CNPJ novo tem letra). */
    documento: string
    tipoDocumento: "cpf" | "cnpj"
    /** +55DDDNÚMERO — é como o checkout grava. */
    telefone: string
  }
  endereco: {
    rua: string
    numero: string
    complemento: string
    bairro: string
    cidade: string
    uf: string
    cep: string
  }
  /** `total` em REAIS, da linha inteira, já com desconto — como o Medusa devolve. */
  itens: { codigo: string; descricao: string; quantidade: number; total: number }[]
  frete: { total: number; descricao: string }
  ip: string | null
}

/* ── conferência ──────────────────────────────────────────────────────────── */

const invalido = (motivo: string) =>
  new MedusaError(MedusaError.Types.INVALID_DATA, `Pagamento recusado antes de sair: ${motivo}`)

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "")

const objeto = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {}

/**
 * Confere o que a loja mandou e devolve só o que interessa, limpo.
 *
 * Tudo que existe no navegador existe de novo aqui pelo mesmo motivo das
 * ações da loja: a rota que abre sessão de pagamento é pública, e qualquer
 * um manda o corpo que quiser. O que passa daqui vira pedido no Pagar.me.
 */
export function conferirEntrada(bruto: unknown, valor: number): EntradaDaLoja {
  const e = objeto(bruto)

  const forma = e.forma
  if (forma !== "pix" && forma !== "cartao") throw invalido("forma de pagamento desconhecida")

  let parcelas = 1
  let token: string | null = null
  if (forma === "cartao") {
    parcelas = Number(e.parcelas ?? 1)
    if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > PARCELAS_MAXIMAS) {
      throw invalido(`parcelas fora de 1 a ${PARCELAS_MAXIMAS}`)
    }
    if (parcelas > 1 && valor / parcelas < PARCELA_MINIMA_CENTAVOS) {
      throw invalido("parcela abaixo do mínimo")
    }
    token = texto(e.token)
    if (!/^token_[A-Za-z0-9]{6,64}$/.test(token)) throw invalido("cartão sem token")
  }

  const c = objeto(e.comprador)
  const nome = texto(c.nome).replace(/\s+/g, " ")
  const email = texto(c.email).toLowerCase()
  const documento = texto(c.documento)
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
  const tipoDocumento = c.tipoDocumento === "cnpj" ? "cnpj" : "cpf"
  const telefone = texto(c.telefone).replace(/[^\d+]/g, "")

  if (nome.length < 2) throw invalido("falta o nome do comprador")
  // 64 é o limite do Pagar.me pro e-mail; acima disso ele recusa o pedido
  // inteiro, então é melhor recusar aqui com o motivo certo.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 64) {
    throw invalido("e-mail do comprador inválido")
  }
  if (
    tipoDocumento === "cpf" ? !/^\d{11}$/.test(documento) : !/^[0-9A-Z]{12}\d{2}$/.test(documento)
  ) {
    throw invalido("documento do comprador inválido")
  }
  if (!/^\+55\d{10,11}$/.test(telefone)) throw invalido("telefone do comprador inválido")

  const en = objeto(e.endereco)
  const endereco = {
    rua: texto(en.rua),
    numero: texto(en.numero),
    complemento: texto(en.complemento),
    bairro: texto(en.bairro),
    cidade: texto(en.cidade),
    uf: texto(en.uf).toUpperCase(),
    cep: texto(en.cep).replace(/\D/g, ""),
  }
  if (!endereco.rua || !endereco.numero || !endereco.bairro || !endereco.cidade) {
    throw invalido("endereço incompleto")
  }
  if (!/^[A-Z]{2}$/.test(endereco.uf) || !/^\d{8}$/.test(endereco.cep)) {
    throw invalido("estado ou CEP inválido")
  }

  const itensBrutos = Array.isArray(e.itens) ? e.itens : []
  if (!itensBrutos.length || itensBrutos.length > 100) throw invalido("lista de itens vazia")
  const itens = itensBrutos.map((bruto) => {
    const i = objeto(bruto)
    const quantidade = Number(i.quantidade)
    const total = Number(i.total)
    if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 999) {
      throw invalido("quantidade de item inválida")
    }
    if (!Number.isFinite(total) || total < 0) throw invalido("valor de item inválido")
    return {
      codigo: texto(i.codigo) || "item",
      descricao: texto(i.descricao) || "Produto",
      quantidade,
      total,
    }
  })

  const f = objeto(e.frete)
  const frete = { total: Number(f.total ?? 0), descricao: texto(f.descricao) }
  if (!Number.isFinite(frete.total) || frete.total < 0) throw invalido("valor de frete inválido")

  // O IP é só pra análise de fraude. Formato estranho não é motivo pra
  // recusar ninguém: some, e o pedido segue sem ele.
  const ipBruto = texto(e.ip)
  const ip = /^[0-9a-fA-F:.]{3,45}$/.test(ipBruto) ? ipBruto : null

  return {
    forma,
    parcelas,
    token,
    comprador: { nome, email, documento, tipoDocumento, telefone },
    endereco,
    itens,
    frete,
    ip,
  }
}

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
