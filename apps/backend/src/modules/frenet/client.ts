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
  /**
   * Dias úteis, o MAIOR quando a transportadora manda faixa.
   *
   * É por ele que a faixa "mais rápida" é escolhida e ordenada: prometer o
   * melhor caso e entregar o pior é o jeito mais barato de perder cliente.
   */
  prazo: number
  /**
   * O prazo como a transportadora escreveu: "8", "4 a 7".
   *
   * A tela mostra a FAIXA quando ela existe ("chega em 4 a 7 dias úteis"),
   * porque é o que a transportadora de fato promete. Guardar só o número
   * maior deixaria a loja anunciando sete dias num frete que costuma chegar
   * em quatro — e chegar antes é a única surpresa boa que sobra no frete.
   */
  prazoTexto: string
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
  /**
   * O carrinho que pergunta, quando é um carrinho. Entra na chave da viagem:
   * a mesma pergunta do MESMO carrinho divide a resposta — as duas opções do
   * checkout, a rota da sacola e o frete pendurado. De carrinhos diferentes,
   * não: cada um tem a sua cotação, e a queda da Frenet aparece pra quem
   * perguntou depois dela, em vez de ficar escondida atrás da resposta de
   * outra pessoa.
   */
  carrinho?: string | null
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

/**
 * O prazo, também texto. "5" · "5 a 8".
 *
 * Devolve o MAIOR (pra comparar e ordenar) e o TEXTO enxuto (pra tela). Dois
 * valores porque são dois usos: comparar pede número, prometer pede a frase
 * que a transportadora escreveu.
 */
function lerPrazo(v: unknown): { dias: number; texto: string } | null {
  const numeros = String(v ?? "").match(/\d+/g)
  const lista = (numeros ?? []).map(Number).filter((n) => Number.isFinite(n) && n > 0)
  if (!lista.length) return null
  const menor = Math.min(...lista)
  const maior = Math.max(...lista)
  return { dias: maior, texto: menor === maior ? String(maior) : `${menor} a ${maior}` }
}

/**
 * AS DUAS FAIXAS, escolhidas de uma lista de serviços cotados.
 *
 * Mora aqui, e não dentro do provider, porque DOIS lugares precisam dela: o
 * provider (que responde quanto custa cada opção no checkout) e a rota
 * `/store/frete` (que responde a calculadora de CEP da PDP e da sacola).
 *
 * Duas cópias desta escolha é a vitrine mostrando um preço e o checkout
 * cobrando outro — e o cliente descobrindo na última tela. A função é pura
 * de propósito: entra lista, sai escolha, e dá pra conferir sem subir nada.
 *
 * Os desempates importam e não são simétricos: entre dois preços iguais
 * ganha o mais rápido, e entre dois prazos iguais ganha o mais barato. Sem
 * eles a escolha viraria a ordem em que a transportadora respondeu.
 */
export function escolherFaixas(servicos: ServicoCotado[]): {
  economica: ServicoCotado
  expressa: ServicoCotado
} | null {
  if (!servicos.length) return null
  return {
    economica: servicos.reduce((a, b) =>
      b.preco < a.preco || (b.preco === a.preco && b.prazo < a.prazo) ? b : a
    ),
    expressa: servicos.reduce((a, b) =>
      b.prazo < a.prazo || (b.prazo === a.prazo && b.preco < a.preco) ? b : a
    ),
  }
}

/**
 * Uma linha do carrinho como o Medusa entrega — ao provider, no contexto do
 * cálculo, e à rota `/store/frete`, pelo `query.graph` (na PDP, sem carrinho,
 * a rota monta neste formato as linhas que o carrinho teria). Só o que a
 * pergunta usa, e tudo `unknown`: cada caminho tipa de um jeito
 * (`BigNumberValue` no contexto, o tipo gerado no `query.graph`), e quem
 * converte são as duas funções abaixo.
 */
export type LinhaDoCarrinho = {
  unit_price?: unknown
  quantity?: unknown
  variant?: { weight?: unknown; length?: unknown; width?: unknown; height?: unknown } | null
}

/**
 * O VALOR DOS PRODUTOS de um carrinho, em reais: o que vai declarado à Frenet
 * e o que decide o frete grátis.
 *
 * Somado aqui, e não lido do carrinho, porque o contexto que o Medusa entrega
 * ao provider traz os itens, e não o total. A soma precisa bater com o
 * `item_total` que a regra de frete grátis usava antes, senão o piso muda de
 * significado sem ninguém mexer nele: é preço de produto vezes quantidade,
 * sem frete e sem desconto de pedido. O preço da linha já é o da FAIXA de
 * quantidade (`lib/precos-por-quantidade.ts`) — quem escolhe a faixa é o
 * Medusa, pela quantidade da linha.
 *
 * Mora aqui, e não no provider, pelo mesmo motivo do `escolherFaixas`: DOIS
 * lugares perguntam à Frenet por um carrinho — o provider, quando o Medusa
 * calcula o frete, e a rota `/store/frete`, pelo carrinho da sacola (o
 * `cart_id`) ou pelo que o carrinho teria (a PDP). O valor vai no corpo, e o
 * corpo é a chave da viagem (ver `cotar`): duas somas eram duas perguntas.
 * Foi o achado de 23/09 — com 2 frascos de R$ 49,90, a rota declarava
 * R$ 99,80 (o preço cheio) e o Medusa, R$ 94,90 (o da faixa): a sacola
 * cotava duas vezes onde devia cotar uma, e a PDP prometia frete grátis por
 * um valor que o carrinho não cobra.
 *
 * ARREDONDADA NO CENTAVO. A faixa de 3 unidades tem preço quebrado, e
 * 3 × 46,30 em ponto flutuante dá 138,89999999999998. O carrinho cobra
 * R$ 138,90, e é isso que se declara — e que se compara com o piso: sem o
 * arredondamento, um carrinho de exatamente R$ 138,90 ficaria abaixo de um
 * piso de R$ 138,90.
 */
export function somaDosProdutos(linhas: LinhaDoCarrinho[]): number {
  const soma = linhas.reduce((s, linha) => {
    const preco = Number(linha.unit_price ?? 0)
    const quantidade = Number(linha.quantity ?? 0)
    return s + (Number.isFinite(preco) ? preco : 0) * (Number.isFinite(quantidade) ? quantidade : 0)
  }, 0)
  return Math.round(soma * 100) / 100
}

/**
 * Os itens de um carrinho no formato da cotação — pelos mesmos dois caminhos
 * da soma acima, e pelo mesmo motivo: a mesma linha tem que virar o mesmo
 * item nos dois, senão a pergunta muda e a viagem se divide.
 *
 * PESO E MEDIDA SÃO DA VARIANTE, não do produto — é só isso que o Medusa
 * entrega ao provider. Foi a descoberta que atrasou esta integração: o
 * catálogo tinha peso cadastrado, mas no PRODUTO, que é outro campo e nunca
 * chega neste objeto. Quem leva os números pro lugar certo é o
 * `scripts/medidas.ts`.
 *
 * Variante sem medida vira zero, e o `cotar` aplica o mínimo dos Correios em
 * cima do zero — ou seja, cota como se fosse a menor caixa possível. É o
 * chute menos ruim, e o `medidas.ts` existe pra que ele nunca aconteça: ele
 * lista o que está faltando em vez de deixar passar.
 *
 * SEM SKU: o contexto que o Medusa monta pro provider não traz o SKU da
 * variante (a linha que tentava ler dele nunca achou nada). A rota
 * `/store/frete` também não manda, pra fazer à Frenet exatamente a pergunta
 * que o provider faz — mesma pergunta, mesmo preço, e uma viagem só.
 */
export function itensPraCotar(linhas: LinhaDoCarrinho[]): ItemPraCotar[] {
  return linhas.map((linha) => {
    const v = linha.variant
    return {
      pesoEmGramas: Number(v?.weight ?? 0) || 0,
      comprimento: Number(v?.length ?? 0) || 0,
      largura: Number(v?.width ?? 0) || 0,
      altura: Number(v?.height ?? 0) || 0,
      quantidade: Number(linha.quantity ?? 1) || 1,
    }
  })
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

  /*
    Sem carrinho — a calculadora da PDP —, cada pergunta é uma viagem, como
    sempre foi: ali não há segunda pergunta igual chegando junto.

    Com carrinho, a chave é a PERGUNTA inteira (token, endereço e o corpo que
    sai daqui) mais o carrinho que pergunta. Tudo que muda a resposta está
    nela: não existe o "esqueci de pôr o CEP na chave" quando a chave é o
    próprio pedido. O carrinho é o cinto de segurança que já existia:
    perguntas de carrinhos diferentes não se misturam.

    O outro lado: qualquer diferença no corpo é outra viagem. Por isso o
    provider e a rota, quando perguntam pelo carrinho, montam valor e itens
    com as mesmas funções (`somaDosProdutos` e `itensPraCotar`, acima).
  */
  if (!pedido.carrinho) return perguntar(token, corpo, tempoLimite)
  const chave = `${token}|${ENDERECO}|${pedido.carrinho}|${JSON.stringify(corpo)}`
  return deUmaViagemSo(chave, () => perguntar(token, corpo, tempoLimite))
}

/**
 * A MESMA PERGUNTA, UMA VIAGEM SÓ.
 *
 * Três lugares perguntam a mesma coisa à Frenet no mesmo instante, pelo
 * mesmo carrinho:
 *
 *   - o Medusa, que calcula as duas opções do carrinho EM PARALELO — sem
 *     isto, cada abertura do checkout cotava duas vezes com o mesmo corpo;
 *   - o bloco de frete da SACOLA, que cota pela rota `/store/frete` (é ela
 *     que sabe o prazo e o preço cheio) e logo em seguida pendura a entrega
 *     no carrinho — e o Medusa cota de novo pra saber o preço dela;
 *   - a mesma sacola quando a quantidade muda: o Medusa refaz o frete
 *     pendurado, e a lista da tela se refaz pela rota.
 *
 * Duas vezes o tempo de espera do cliente, e duas vezes o consumo da conta.
 * O cache guarda a PROMESSA, não o resultado, pra que a segunda pergunta
 * entre na mesma viagem em vez de começar outra.
 *
 * Vida curta de propósito: é pra unir perguntas do mesmo instante, não pra
 * servir frete velho.
 */
const VIAGENS = new Map<string, { quando: number; promessa: Promise<ServicoCotado[]> }>()
const VALIDADE = 10_000

function deUmaViagemSo(chave: string, fazer: () => Promise<ServicoCotado[]>) {
  const agora = Date.now()
  for (const [k, v] of VIAGENS) if (agora - v.quando > VALIDADE) VIAGENS.delete(k)

  const guardada = VIAGENS.get(chave)
  if (guardada) return guardada.promessa

  const promessa = fazer()
  VIAGENS.set(chave, { quando: agora, promessa })
  /* Falha não fica no cache: o próximo pedido tenta de novo em vez de herdar
     um erro de dez segundos atrás. */
  promessa.catch(() => VIAGENS.delete(chave))
  return promessa
}

/** A ida de verdade à Frenet, com o corpo já no formato deles. */
async function perguntar(
  token: string,
  corpo: Record<string, unknown>,
  tempoLimite: number
): Promise<ServicoCotado[]> {
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
    const prazo = lerPrazo(s.DeliveryTime)
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
        prazo: prazo.dias,
        prazoTexto: prazo.texto,
      },
    ]
  })
}
