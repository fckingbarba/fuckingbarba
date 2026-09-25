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
 * E A CONSULTA DE RASTREIO (`POST /tracking/trackinginfo`): responde os
 * eventos que o teste puser em `painel.rastreios` (código → eventos, no
 * formato da Frenet), e guarda cada pergunta em `painel.consultas`. É o
 * caminho da etiqueta feita à mão no painel, que não manda aviso — o
 * `conferir-envio.mjs` usa. A consulta não conta em `chamadas`, que é das
 * cotações.
 *
 * E A API DE PEDIDOS (`POST /v1/orders`, a do token de parceiro): guarda
 * cada pedido que chega em `painel.pedidos` e devolve um `shipmentId` novo
 * pra cada um — ou a recusa, com `painel.roteiroDosPedidos = "recusa"`, ou
 * 500, com "queda". Sem os dois tokens nos cabeçalhos, 401. O formato é o da
 * documentação deles ("Inserir pedidos na Frenet"): o lote é uma LISTA, cada
 * envio com `Order` e `Volumes` — um OBJETO, não lista — e a resposta em
 * camelCase (`statusBatch`, `items`, `shipmentId`). Fora disso, o 400 da
 * validação do ASP.NET, como a de verdade (`title` + `errors`): foi assim
 * que o #19 voltou em produção (25/09). Cancelar e
 * apagar um envio (`/v1/shipments/:id/cancel` e `DELETE /v1/shipments/:id`)
 * ficam em `painel.retirados`. Nada disso conta em `chamadas`.
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
    /** código de rastreio → eventos, no formato da Frenet */
    rastreios: new Map(),
    /** cada consulta de rastreio que chegou: `{ token, corpo }` */
    consultas: [],
    /**
     * "normal", "recusa" (erro no item do lote), "validacao" (o 400 do
     * ASP.NET, com o campo em `errors`) ou "queda" (500)
     */
    roteiroDosPedidos: "normal",
    /** cada pedido que chegou pela API de pedidos: `{ token, parceiro, envio, corpo }` */
    pedidos: [],
    /** cada envio cancelado ou apagado: `{ como: "cancelar" | "apagar", id }` */
    retirados: [],
    /** cada lote fora do esquema (o 400 da validação): os campos e as mensagens */
    recusados: [],
  }
  /* O id do envio é único na Frenet de verdade, e o banco local guarda os
     das rodadas anteriores: começar sempre do mesmo número faria o aviso
     achar o pedido de outra rodada. Do relógio, e longe dos ids que o
     conferidor inventa (abaixo de 10⁸). */
  let ultimoEnvio = 1_000_000_000 + (Date.now() % 1_000_000_000)

  const servidor = createServer((req, res) => {
    let corpo = ""
    req.on("data", (p) => (corpo += p))
    req.on("end", async () => {
      if (req.url?.startsWith("/tracking/trackinginfo")) {
        let pergunta = null
        try {
          pergunta = JSON.parse(corpo)
        } catch {}
        painel.consultas.push({ token: req.headers.token ?? null, corpo: pergunta })
        const codigo = pergunta?.TrackingNumber
        const eventos = painel.rastreios.get(codigo)
        res.writeHead(200, { "content-type": "application/json" })
        res.end(
          JSON.stringify(
            eventos
              ? {
                  TrackingNumber: codigo,
                  TrackingUrl: `https://rastreio.frenet.com.br/COR/${codigo}`,
                  ServiceDescrition: "PAC",
                  TrackingEvents: eventos,
                }
              : { ErrorMessage: "Objeto não encontrado" }
          )
        )
        return
      }

      if (req.url?.startsWith("/v1/")) {
        const json = (status, dados) => {
          res.writeHead(status, { "content-type": "application/json" })
          res.end(JSON.stringify(dados))
        }
        if (!req.headers.token || !req.headers["x-partner-token"]) {
          json(401, { Message: "Não Autorizado - Token Inválido" })
          return
        }
        const retirada = req.url.match(/^\/v1\/shipments\/(\d+)(\/cancel)?$/)
        if (retirada) {
          const como = retirada[2] ? "cancelar" : "apagar"
          if ((como === "cancelar") !== (req.method === "POST")) {
            json(405, { Message: "método" })
            return
          }
          painel.retirados.push({ como, id: retirada[1] })
          res.writeHead(204).end()
          return
        }
        if (req.url === "/v1/orders" && req.method === "POST") {
          if (painel.roteiroDosPedidos === "queda") {
            json(500, { Message: "Erro interno" })
            return
          }
          let lote = null
          try {
            lote = JSON.parse(corpo)
          } catch {}
          // A validação do ASP.NET deles: o corpo fora do esquema nem chega no código da Frenet.
          const invalidos =
            painel.roteiroDosPedidos === "validacao"
              ? { "$[0].Order.To.Address.ZipCode": ["The ZipCode field is required."] }
              : !Array.isArray(lote)
                ? { $: ["The JSON value could not be converted to List<ShipmentBase>."] }
                : Object.fromEntries(
                    lote.flatMap((envio, i) =>
                      !envio?.Volumes ||
                      typeof envio.Volumes !== "object" ||
                      Array.isArray(envio.Volumes)
                        ? [
                            [
                              `$[${i}].Volumes`,
                              ["The JSON value could not be converted to Volume."],
                            ],
                          ]
                        : !envio?.Order?.Id
                          ? [[`$[${i}].Order.Id`, ["The Id field is required."]]]
                          : []
                    )
                  )
          if (Object.keys(invalidos).length) {
            painel.recusados.push(invalidos)
            json(400, {
              type: "https://tools.ietf.org/html/rfc9110#section-15.5.1",
              title: "One or more validation errors occurred.",
              status: 400,
              errors: invalidos,
            })
            return
          }
          const itens = lote.map((envio) => {
            const orderId = envio.Order.Id
            if (painel.roteiroDosPedidos === "recusa") {
              return { orderId, errors: [{ code: 2012, message: "CEP de destino inválido" }] }
            }
            const shipmentId = ++ultimoEnvio
            painel.pedidos.push({
              token: req.headers.token,
              parceiro: req.headers["x-partner-token"],
              envio: shipmentId,
              corpo: envio,
            })
            return { shipmentId, orderId, shipmentStatus: 1, errors: null }
          })
          json(200, {
            statusBatch: itens.some((i) => i.errors?.length) ? "Erro" : "Processado",
            items: itens,
          })
          return
        }
        json(404, { Message: "não existe" })
        return
      }

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
