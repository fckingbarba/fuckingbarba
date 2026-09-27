import { MedusaError } from "@medusajs/framework/utils"
import type { Forma } from "./estado"

/**
 * A ENTRADA — o que a loja manda ao abrir a sessão de pagamento (quem
 * compra, o que, pra onde, e a escolha: Pix ou cartão), conferido aqui antes
 * de virar cobrança em qualquer parceiro. Morava no `modules/pagarme/pedido.ts`
 * (que continua exportando tudo isto); saiu de lá quando o Mercado Pago
 * chegou (0140), porque é a mesma entrada pros dois.
 *
 * Por que o comprador vem da loja, e não do carrinho, está na caixa do
 * `modules/pagarme/pedido.ts`: o provedor não enxerga o carrinho.
 */

/**
 * Parcelas sem juros e a menor parcela aceita.
 *
 * As parcelas PRECISAM BATER com `PARCELAS_SEM_JUROS` de
 * `apps/loja/src/lib/site.ts`: lá é o que a vitrine anuncia ("3x sem
 * juros"), aqui é o que o backend aceita. Se a loja oferecer 4x e o backend
 * recusar, quem descobre é o cliente, no último clique. O conferidor de
 * pagamento compra em 3x pra travar isso.
 *
 * A PARCELA MÍNIMA daqui é o PISO DO BANCO: parcela menor que R$ 5,00 o
 * banco do cartão recusa. A da loja — maior ou igual a esta — mora nas
 * Configurações (`pagamento.parcelaMinima`, 0157), e quem confere é a porta
 * da sessão de pagamento (`lib/pagamento/parcela.ts`).
 */
export const PARCELAS_MAXIMAS = 3
export const PARCELA_MINIMA_CENTAVOS = 500

/** O que a loja manda em `data.entrada` ao abrir a sessão — a mesma pra todo parceiro. */
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
  /**
   * HÁ OUTRO PARCEIRO ESPERANDO, se este Pix não nascer — a loja manda quando
   * tem pra onde ir no mesmo clique (`finalizar`). Com ele, o provedor
   * desiste cedo: espera menos a criação e não pergunta de novo se nasceu —
   * quem compra não fica meio minuto parado num parceiro fora do ar, se o
   * outro gera o QR em dois segundos. O Pix que nasceu tarde lá não chega a
   * ninguém (e não cobra ninguém): a conciliação fecha. Sem ele, o de sempre.
   * Só no Pix: cartão não vai pro outro parceiro.
   */
  reserva: boolean
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
 * um manda o corpo que quiser. O que passa daqui vira cobrança no parceiro.
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
    // Só `true` de verdade, e só no Pix. Quem manda `true` por fora só faz o
    // PRÓPRIO Pix desistir mais cedo.
    reserva: forma === "pix" && e.reserva === true,
  }
}
