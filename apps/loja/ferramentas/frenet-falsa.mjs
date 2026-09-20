import { createServer } from "node:http"

/**
 * UMA FRENET DE MENTIRA, pros testes.
 *
 * Fala o formato da API de cotação deles e responde o que o teste mandar:
 * três transportadoras, nenhuma, erro 500, ou demora até estourar o tempo.
 * O Medusa não sabe a diferença — ele só precisa que `FRENET_URL` aponte
 * pra cá quando o servidor subir.
 *
 * ┌─ POR QUE NÃO COTAR DE VERDADE NOS TESTES ──────────────────────────────┐
 * │ Custa limite da conta, devolve preço diferente a cada dia — então      │
 * │ nenhuma asserção sobre valor sobrevive até amanhã — e, o principal,    │
 * │ não dá pra pedir que ela CAIA. O caminho da queda é o mais importante  │
 * │ de testar: é o que decide se a loja continua vendendo ou não.          │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * MORA NUM ARQUIVO SÓ porque dois conferidores precisam dela: o do frete,
 * que testa a cotação, e o do checkout, que precisa de opções de entrega
 * pra chegar no passo do pagamento. Duas cópias divergiriam no dia em que
 * um preço mudasse num arquivo e não no outro — e o teste do checkout
 * passaria a conferir contra um número que o do frete não usa mais.
 */

/**
 * Preços escolhidos pra que as três coisas sejam DIFERENTES: a mais barata
 * não é a mais rápida, e a mais rápida não é a mais cara. Se duas
 * coincidissem, um bug na escolha da faixa passaria despercebido.
 */
export const SERVICOS = [
  {
    ServiceCode: "04510",
    Carrier: "Correios",
    ServiceDescription: "PAC",
    ShippingPrice: "23.70",
    DeliveryTime: "8",
    Error: false,
  },
  {
    ServiceCode: "04014",
    Carrier: "Correios",
    ServiceDescription: "SEDEX",
    ShippingPrice: "41.20",
    DeliveryTime: "3",
    Error: false,
  },
  {
    ServiceCode: "LOG01",
    Carrier: "Loggi",
    ServiceDescription: "Loggi Express",
    ShippingPrice: "31.90",
    DeliveryTime: "2",
    Error: false,
  },
  /* Serviço com erro vem DENTRO da lista, junto dos bons, com preço zero.
     Quem não filtrar oferece frete grátis por acidente — e "a mais barata"
     passa a ser sempre a que falhou. */
  {
    ServiceCode: "XPTO",
    Carrier: "Transportadora X",
    ServiceDescription: "X",
    ShippingPrice: "0",
    DeliveryTime: "1",
    Error: true,
    Msg: "sem cobertura",
  },
]

export const MAIS_BARATA = 23.7
export const MAIS_RAPIDA = 31.9 // Loggi, 2 dias

export const PORTA_PADRAO = Number(process.env.PORTA_FALSA || 4310)

/**
 * Sobe a falsa e devolve o painel de controle dela.
 *
 * `roteiro` troca a resposta em tempo de execução; `ultimoCorpo` guarda o
 * que chegou, que é metade do valor do teste — é como se confere que o peso
 * saiu em quilos e não em gramas.
 */
export async function subirFrenetFalsa({ porta = PORTA_PADRAO } = {}) {
  const painel = {
    roteiro: "normal",
    ultimoCorpo: null,
    ultimoToken: null,
    chamadas: 0,
  }

  const servidor = createServer((req, res) => {
    let corpo = ""
    req.on("data", (p) => (corpo += p))
    req.on("end", async () => {
      painel.chamadas++
      painel.ultimoToken = req.headers.token ?? null
      try {
        painel.ultimoCorpo = JSON.parse(corpo)
      } catch {
        painel.ultimoCorpo = null
      }

      if (painel.roteiro === "queda") {
        res.writeHead(500).end("boom")
        return
      }
      if (painel.roteiro === "vazia") {
        res.writeHead(200, { "content-type": "application/json" })
        res.end(JSON.stringify({ ShippingSevicesArray: [] }))
        return
      }
      if (painel.roteiro === "demora") {
        await new Promise((r) => setTimeout(r, 9000))
      }
      res.writeHead(200, { "content-type": "application/json" })
      // O nome sem o "r" de "Services" é o deles. Escrever certo deixa a
      // loja sem frete nenhum, em silêncio.
      res.end(JSON.stringify({ ShippingSevicesArray: SERVICOS }))
    })
  })

  await new Promise((r) => servidor.listen(porta, "127.0.0.1", r))
  painel.fechar = () => servidor.close()
  painel.porta = porta
  return painel
}
