import type { LinhaDaLista } from "@/lib/pedidos"

/**
 * OS CLIENTES DO PAINEL — os tipos, como o backend devolve
 * (`apps/backend/src/lib/painel/clientes.ts`, pelas rotas
 * `/dashboard/clientes` e `/dashboard/newsletter`).
 *
 * Quem decide o que cada papel vê é o backend: o que não vem, a tela não
 * mostra. O marketing recebe só quem aceitou ofertas, sem cidade, celular,
 * CPF, endereço nem os pedidos; o CPF inteiro só chega pro dono.
 */

export type LinhaDoCliente = {
  /** O cliente do Medusa que abre a ficha. */
  id: string
  nome: string
  email: string
  /** "São Paulo/SP" — `null` pro marketing. */
  cidade: string | null
  pedidos: number
  gastou: number
  /** "hoje, 20:52": o último pedido (ou quando a conta nasceu). */
  ultimo: string
  conta: boolean
  /** "e-mail · desde 22/09" — `null` quando não aceitou ofertas. */
  ofertas: string | null
}

export type ListaDeClientes = {
  clientes: LinhaDoCliente[]
  /** Quantas pessoas a loja tem. */
  total: number
  /** Quantas aceitaram ofertas, por e-mail ou WhatsApp. */
  comOfertas: number
  busca: string
}

export type FichaDoCliente = {
  id: string
  nome: string
  email: string
  conta: boolean
  /** "12/09": o primeiro cadastro na loja. */
  desde: string
  /** Cada "sim" pra receber ofertas: o canal, onde (na conta, no rodapé) e desde quando. */
  ofertas: { canal: string; onde: string; desde: string }[]
  /** `null` pro marketing. */
  dados: {
    celular: string | null
    documento: { tipo: "cpf" | "cnpj"; mascarado: string; inteiro: string | null } | null
    endereco: string | null
  } | null
  resumo: { pedidos: number; gastou: number }
  /** `null` pro marketing: o detalhe é da operação. */
  pedidos: LinhaDaLista[] | null
}

export type Inscrito = {
  email: string
  /** "22/09", "hoje". */
  desde: string
  /** ISO — o CSV leva. */
  desdeEm: string
  /** "rodapé", "conta" ou "rodapé e conta". */
  origem: string
  /** A ficha, quando o e-mail é de um cliente. */
  clienteId: string | null
}

export type Newsletter = {
  inscritos: Inscrito[]
  numeros: { total: number; semana: number; rodape: number; conta: number }
}

/** "1 pedido", "3 pedidos". */
export const vezes = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/** Um id de cliente do Medusa: `cus_` e um ULID. Nada mais vai pra API. */
export const ehIdDeCliente = (v: string) => /^cus_[0-9A-Z]{10,40}$/.test(v)
