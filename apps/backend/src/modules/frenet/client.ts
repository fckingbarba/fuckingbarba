/**
 * O CLIENTE DA FRENET — uma função, uma chamada HTTP.
 *
 *   POST https://api.frenet.com.br/shipping/quote
 *   cabeçalho: token: <FRENET_TOKEN>
 *
 * Separado do provider de propósito: aqui mora tudo que é FORMATO DELES
 * (nomes de campo, unidades, o preço que vem como texto), e do outro lado
 * mora tudo que é regra NOSSA (qual faixa, frete grátis, emergência). Quando
 * a Frenet mudar um nome de campo, muda este arquivo e só ele — e o teste do
 * provider continua valendo, porque ele fala a nossa língua.
 *
 * ┌─ AS TRÊS ARMADILHAS DESTA API, TODAS JÁ PAGAS ─────────────────────────┐
 * │ 1. `ShippingSevicesArray`. Não é erro de digitação meu: é o nome que   │
 * │    a API devolve, sem o "r" de "Services". Escrever o nome certo faz o │
 * │    array vir `undefined` e a loja ficar sem frete nenhum, sem erro.    │
 * │                                                                         │
 * │ 2. `ShippingPrice` vem como TEXTO ("24.90"), não número. Somar direto  │
 * │    concatena em vez de somar, e comparar "9.90" < "24.90" dá o         │
 * │    resultado errado em ordem alfabética sem reclamar.                  │
 * │                                                                         │
 * │ 3. Serviço com `Error: true` vem DENTRO da lista, junto dos bons, com  │
 * │    preço zerado. Quem não filtrar oferece frete grátis por acidente —  │
 * │    e "a mais barata" passa a ser sempre a que falhou.                  │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * UNIDADES: peso em QUILOS e medidas em CENTÍMETROS, que é o que toda
 * transportadora brasileira usa e o que os exemplos deles mostram (2.1 com
 * 14×20×15). O Medusa guarda o peso em gramas — a conversão acontece aqui,
 * num lugar só, e está anotada no `medidas.ts`, que é quem escreve as gramas.
 */

/**
 * O endereço da cotação.
 *
 * `FRENET_URL` existe pra UM propósito: o `conferir-frete.mjs` sobe uma
 * Frenet falsa e aponta o backend pra ela. Sem isso, o único jeito de testar
 * a integração seria cotando de verdade — o que gasta o limite da conta, não
 * dá pra reproduzir (o preço muda) e não tem como forçar a queda, que é
 * justamente o caminho mais importante de testar.
 *
 * Em produção a variável não existe e vale o endereço deles.
 */
const ENDERECO = process.env.FRENET_URL || "https://api.frenet.com.br/shipping/quote"

/** Uma opção de entrega já traduzida pra nossa língua. */
export type ServicoCotado = {
  /** `ServiceCode` da Frenet: o que identifica o serviço na hora de despachar. */
  codigo: string
  /** "Correios", "Loggi", "JadLog"… */
  transportadora: string
  /** "PAC", "SEDEX", "Loggi Express"… */
  servico: string
  /** Em reais. */
  preco: number
  /** Dias úteis. */
  prazo: number
}

export type ItemPraCotar = {
  /** Gramas, como o Medusa guarda. A conversão pra quilo é feita aqui. */
  pesoEmGramas: number
  /** Centímetros. */
  comprimento: number
  largura: number
  altura: number
  quantidade: number
  sku?: string
}

export type PedidoDeCotacao = {
  token: string
  cepDeOrigem: string
  cepDeDestino: string
  /** Valor dos produtos, em reais. Vale por declaração e por seguro. */
  valor: number
  itens: ItemPraCotar[]
  /** Milissegundos até desistir. Isto roda no caminho do checkout. */
  tempoLimite?: number
}

/**
 * O MÍNIMO DOS CORREIOS, aplicado aqui e não no cadastro.
 *
 * Encomenda menor que 16 × 11 × 2 cm é cobrada como se tivesse esse tamanho
 * — a regra é da transportadora, não nossa. Mandar 5 × 5 × 5 faria a cotação
 * vir mais barata que a etiqueta que vamos pagar depois, e a diferença sai
 * do bolso da loja em todo pedido pequeno, que aqui é quase todo pedido.
 *
 * Aumentar a medida antes de cotar não é inventar número: é cotar o pacote
 * que os Correios vão de fato medir no balcão.
 */
const MINIMO = { comprimento: 16, largura: 11, altura: 2 }

/** O teto dos Correios, e o sinal de que alguém digitou quilo em vez de grama. */
const PESO_MAXIMO_KG = 30

export class ErroDaFrenet extends Error {
  constructor(
    message: string,
    /** `true` quando foi rede ou tempo esgotado — vale tentar de novo. */
    readonly temporario: boolean
  ) {
    super(message)
    this.name = "ErroDaFrenet"
  }
}

/** Só dígitos: a Frenet aceita com e sem hífen, mas não aceita espaço. */
export const soDigitos = (cep: string) => cep.replace(/\D/g, "")

/**
 * O preço, que vem como texto.
 *
 * Aceita "24.90" e "24,90" porque as duas formas já foram vistas em APIs
 * brasileiras, inclusive na mesma. Devolve `null` pro que não vira número —
 * e `null` faz o serviço ser descartado, em vez de virar zero e passar a ser
 * "a opção mais barata" pra sempre.
 */
function emReais(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  if (typeof v !== "string") return null
  const limpo = v.trim().replace(/\s/g, "")
  const n = Number(limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo)
  return Number.isFinite(n) ? n : null
}

/** O prazo, também texto. "5" · "5 a 8" → pega o maior, que é o que promete. */
function emDias(v: unknown): number | null {
  const numeros = String(v ?? "").match(/\d+/g)
  if (!numeros?.length) return null
  return Math.max(...numeros.map(Number))
}

export async function cotar(pedido: PedidoDeCotacao): Promise<ServicoCotado[]> {
  const { token, valor, itens, tempoLimite = 6000 } = pedido
  const origem = soDigitos(pedido.cepDeOrigem)
  const destino = soDigitos(pedido.cepDeDestino)

  if (origem.length !== 8) throw new ErroDaFrenet(`CEP de origem inválido: "${origem}"`, false)
  if (destino.length !== 8) throw new ErroDaFrenet(`CEP de destino inválido: "${destino}"`, false)
  if (!itens.length) throw new ErroDaFrenet("cotação sem itens", false)

  const pesoTotal = itens.reduce((s, i) => s + (i.pesoEmGramas / 1000) * i.quantidade, 0)
  if (pesoTotal > PESO_MAXIMO_KG) {
    /*
      Acima de 30 kg nenhuma transportadora comum aceita, e o jeito mais
      provável de chegar aqui não é um pedido enorme: é peso cadastrado em
      quilo num campo que guarda grama, que multiplica tudo por mil.
    */
    throw new ErroDaFrenet(
      `peso total de ${pesoTotal.toFixed(1)} kg passa do limite de ${PESO_MAXIMO_KG} kg — ` +
        "confira se o peso das variantes está em GRAMAS",
      false
    )
  }

  const corpo = {
    SellerCEP: origem,
    RecipientCEP: destino,
    ShipmentInvoiceValue: valor,
    RecipientCountry: "BR",
    ShippingItemArray: itens.map((i) => ({
      Weight: Number((i.pesoEmGramas / 1000).toFixed(3)),
      Length: Math.max(MINIMO.comprimento, i.comprimento),
      Width: Math.max(MINIMO.largura, i.largura),
      Height: Math.max(MINIMO.altura, i.altura),
      Quantity: i.quantidade,
      ...(i.sku ? { SKU: i.sku } : {}),
    })),
  }

  const desistir = new AbortController()
  const relogio = setTimeout(() => desistir.abort(), tempoLimite)

  let resposta: Response
  try {
    resposta = await fetch(ENDERECO, {
      method: "POST",
      headers: { "content-type": "application/json", token },
      body: JSON.stringify(corpo),
      signal: desistir.signal,
    })
  } catch (e) {
    const abortou = e instanceof Error && e.name === "AbortError"
    throw new ErroDaFrenet(
      abortou ? `a Frenet não respondeu em ${tempoLimite}ms` : `falha de rede: ${e}`,
      true
    )
  } finally {
    clearTimeout(relogio)
  }

  if (!resposta.ok) {
    /*
      401 e 403 são o token: errado, vencido, ou a conta sem saldo. Não é
      temporário — tentar de novo só gasta o tempo do cliente no checkout.
    */
    const autenticacao = resposta.status === 401 || resposta.status === 403
    throw new ErroDaFrenet(`a Frenet respondeu ${resposta.status}`, !autenticacao)
  }

  const dados = (await resposta.json()) as {
    ShippingSevicesArray?: unknown
  }

  // O nome torto é o deles. Ver a caixa lá em cima.
  const bruto = Array.isArray(dados?.ShippingSevicesArray) ? dados.ShippingSevicesArray : []

  return bruto.flatMap((servico): ServicoCotado[] => {
    const s = servico as Record<string, unknown>
    if (s.Error === true || s.Error === "true") return []

    const preco = emReais(s.ShippingPrice)
    const prazo = emDias(s.DeliveryTime)
    const codigo = typeof s.ServiceCode === "string" ? s.ServiceCode : ""

    /*
      Preço zero ou ausente é serviço que não cotou — e não frete grátis.
      Quem dá frete de graça aqui é a nossa política, depois, e de propósito.
    */
    if (!codigo || preco === null || preco <= 0 || prazo === null) return []

    return [
      {
        codigo,
        transportadora: typeof s.Carrier === "string" ? s.Carrier : "",
        servico: typeof s.ServiceDescription === "string" ? s.ServiceDescription : "",
        preco,
        prazo,
      },
    ]
  })
}
