/**
 * OS PEDIDOS E O INÍCIO, do lado do painel — o formato das respostas e os
 * nomes da tela.
 *
 * Quem decide onde o pedido está, o que travou e o que cada papel vê é o
 * backend (`apps/backend/src/lib/painel/`), e as rotas `/dashboard/inicio` e
 * `/dashboard/pedidos` são o contrato: os tipos daqui são uma cópia dos de
 * lá — quem mudar um, muda o outro.
 */

export type Situacao =
  "pix" | "vencido" | "analise" | "separacao" | "enviado" | "entregue" | "cancelado" | "combinar"

export type Problema = "estorno" | "nota" | "frenet" | "entrega"

export type Forma = "pix" | "cartao"

export type LinhaDaLista = {
  id: string
  numero: number
  quando: string
  criadoEm: string
  cliente: { nome: string; cidade: string; uf: string }
  itens: string
  unidades: number
  forma: Forma | null
  situacao: Situacao
  problema: Problema | null
  despachar: boolean
  total: number
}

export const FILTROS = [
  { id: "todos", nome: "Todos" },
  { id: "despachar", nome: "Pra despachar" },
  { id: "pagamento", nome: "Esperando pagamento" },
  { id: "problemas", nome: "Com problema" },
  { id: "enviado", nome: "Enviados" },
  { id: "entregue", nome: "Entregues" },
  { id: "cancelado", nome: "Cancelados" },
] as const

export type Filtro = (typeof FILTROS)[number]["id"]

export const ehFiltro = (v: unknown): v is Filtro =>
  typeof v === "string" && FILTROS.some((f) => f.id === v)

export type ListaDePedidos = {
  pedidos: LinhaDaLista[]
  contagem: Record<Filtro, number>
  filtro: Filtro
  busca: string
  limite: number
}

export type Passo = { nome: string; estado: "feito" | "agora" | "erro" | ""; texto: string }

export type DetalheDoPedido = {
  id: string
  numero: number
  quando: string
  situacao: Situacao
  problema: Problema | null
  despachar: boolean
  total: number
  faixas: { nivel: "grave" | "atencao" | "info"; titulo: string; texto: string }[]
  caminho: Passo[]
  cancelado: string | null
  itens: {
    nome: string
    variante: string | null
    sku: string | null
    imagem: string | null
    quantidade: number
    unitario: number
    cheio: number | null
    total: number
  }[]
  totais: {
    produtos: number
    cupons: { codigo: string; valor: number }[]
    frete: number
    formaDeEntrega: string
    total: number
  }
  historico: { quando: string; em: string; titulo: string; detalhe: string }[]
  pagamento: { forma: string; detalhe: string }
  nota: string | null
  entrega: {
    nome: string
    linha1: string
    linha2: string
    cidadeUf: string
    cep: string
    forma: string
    frenet: string | null
    rastreios: { codigo: string; texto: string; url: string | null }[]
  } | null
  cliente: {
    nome: string
    email: string
    celular: string | null
    documento: { tipo: "cpf" | "cnpj"; mascarado: string; inteiro: string | null } | null
    conta: boolean
  }
}

export type ItemDaFila = {
  nivel: "grave" | "atencao" | "" | "ok"
  icone: "caminhao" | "nota" | "pix" | "cartao" | "alerta" | "email" | "produtos"
  titulo: string
  texto: string
  href: string
}

export type Inicio = {
  numeros: {
    vendasHoje: { valor: number; pedidos: number }
    esperando: { valor: number; pix: number; analise: number }
    semana: { valor: number; pedidos: number; ticket: number }
  }
  grafico: { rotulo: string; valor: number; pedidos: number; hoje: boolean }[]
  fila: ItemDaFila[]
  pedidosDeHoje: LinhaDaLista[] | null
  maisVendidos: { nome: string; unidades: number; imagem: string | null }[]
}

/* ── os nomes e o dinheiro ────────────────────────────────────────────────── */

export const NOME_DA_SITUACAO: Record<Situacao, string> = {
  pix: "Aguardando Pix",
  vencido: "Pix vencido",
  analise: "Em análise",
  separacao: "Em separação",
  enviado: "Enviado",
  entregue: "Entregue",
  cancelado: "Cancelado",
  combinar: "A combinar",
}

export const NOME_DO_PROBLEMA: Record<Problema, string> = {
  estorno: "Estorno falhou",
  nota: "Nota com problema",
  frenet: "Fora da Frenet",
  entrega: "Problema na entrega",
}

const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
export const reais = (v: number) => REAIS.format(v)

/** "R$ 404" — o rótulo curto das barras do gráfico. */
const REAIS_CURTO = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
})
export const reaisCurto = (v: number) => REAIS_CURTO.format(v)

/** Um id de pedido do Medusa: `order_` e um ULID. Nada mais vai pra API. */
export const ehIdDePedido = (v: string) => /^order_[0-9A-Z]{10,40}$/.test(v)
