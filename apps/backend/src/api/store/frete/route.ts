import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules, QueryContext } from "@medusajs/framework/utils"
import { aplicarPolitica, lerConfiguracoes } from "../../../lib/configuracoes"
import { cotar, ErroDaFrenet, escolherFaixas, soDigitos } from "../../../modules/frenet/client"

/**
 * POST /store/frete — quanto custa mandar ISTO pra ESTE CEP.
 *
 * ┌─ POR QUE UMA ROTA NOSSA, SE O MEDUSA JÁ TEM UMA ───────────────────────┐
 * │ A do Medusa (`/store/shipping-options/:id/calculate`) exige `cart_id`. │
 * │ Serve pro checkout, onde o carrinho existe — e não serve pra           │
 * │ calculadora de CEP da PÁGINA DE PRODUTO, onde ele não existe: quem     │
 * │ está olhando o produto ainda não pôs nada na sacola.                   │
 * │                                                                        │
 * │ A saída "óbvia" seria criar um carrinho por trás a cada CEP digitado.  │
 * │ Isso enche o banco de carrinhos fantasmas, envenena qualquer relatório │
 * │ de abandono e transforma "olhei o frete" em "quase comprou".           │
 * │                                                                        │
 * │ Então esta rota cota SEM carrinho: recebe variantes e quantidades,     │
 * │ soma o valor pelo preço de verdade (o da região, não o que o           │
 * │ navegador mandar) e devolve as duas faixas.                            │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ E DEVOLVE O QUE O CHECKOUT NÃO CONSEGUE DEVOLVER ─────────────────────┐
 * │ TRANSPORTADORA E PRAZO. A rota do Medusa responde um número e mais     │
 * │ nada — o contrato do provedor é `{ calculated_amount }` —, então o     │
 * │ "Correios PAC · 8 dias úteis" que a Frenet manda se perdia no caminho. │
 * │ Aqui não há esse funil, e o cliente vê quem entrega e em quantos dias. │
 * │                                                                        │
 * │ E o PREÇO CHEIO de quem ganhou frete grátis: o Medusa devolve o preço  │
 * │ que vale agora, zero, e esquece o resto. A sacola risca o cheio ao     │
 * │ lado do "Grátis", e esse número só existe aqui.                        │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * O PREÇO DAQUI E O DO CHECKOUT SÃO O MESMO NÚMERO porque saem das mesmas
 * duas funções: `escolherFaixas` escolhe a mais barata e a mais rápida, e
 * `aplicarPolitica` aplica o frete grátis. Reimplementar qualquer uma das
 * duas aqui seria a vitrine prometendo um valor e o carrinho cobrando outro.
 */

type ItemPedido = { variante_id?: unknown; quantidade?: unknown }

type FaixaNaResposta = {
  faixa: "economica" | "expressa"
  nome: string
  preco: number
  /**
   * O que a faixa custaria SEM a política — só quando a política baixou o
   * preço. É o número riscado ao lado de "Grátis" na sacola, e ele não é
   * enfeite: sem ele o frete grátis vira um zero, e economia que não se vê
   * não convence ninguém. `null` quando o preço já é o cheio — riscar um
   * número igual ao do lado não diria nada.
   */
  precoCheio: number | null
  /** `null` na emergência: sem cotação, ninguém sabe quem entrega. */
  transportadora: string | null
  servico: string | null
  /** Texto pronto: "8 dias úteis". Na emergência, o que o admin escreveu. */
  prazo: string | null
}

/** A faixa antes da política — o `precoCheio` só existe depois dela. */
type FaixaCotada = Omit<FaixaNaResposta, "precoCheio">

/**
 * "Econômico" e "Expresso", e não "Correios PAC".
 *
 * O nome da transportadora vai junto na resposta, e a tela escolhe se mostra
 * — mas o RÓTULO é o da faixa, pelo mesmo motivo que existem duas faixas em
 * vez de oito linhas: quem entrega muda a cada CEP, e uma opção que troca de
 * nome conforme o endereço faz a pessoa reler a tela em vez de escolher.
 */
const NOMES = { economica: "Econômico", expressa: "Expresso" } as const

/** "8 dias úteis" · "4 a 7 dias úteis" — um dia no singular. */
const emDiasUteis = (texto: string) => `${texto} ${texto === "1" ? "dia útil" : "dias úteis"}`

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const corpo = (req.body ?? {}) as {
    cep?: unknown
    itens?: unknown
    region_id?: unknown
    cart_id?: unknown
  }

  const cep = soDigitos(String(corpo.cep ?? ""))
  if (cep.length !== 8) {
    res.status(400).json({ erro: "cep_invalido", mensagem: "O CEP tem oito dígitos." })
    return
  }

  const pedidos: { id: string; quantidade: number }[] = (
    Array.isArray(corpo.itens) ? (corpo.itens as ItemPedido[]) : []
  ).flatMap((i) => {
    const id = typeof i?.variante_id === "string" ? i.variante_id : ""
    const q = Math.trunc(Number(i?.quantidade ?? 1))
    return id && Number.isFinite(q) && q > 0 ? [{ id, quantidade: Math.min(q, 99) }] : []
  })

  if (!pedidos.length) {
    res.status(400).json({ erro: "sem_itens", mensagem: "Nada pra calcular." })
    return
  }

  try {
    /*
      A REGIÃO decide o preço, e o preço decide se o frete é grátis. Vem do
      corpo quando a loja sabe qual é, e senão é a primeira cadastrada — que
      hoje é a única. Aceitar o VALOR do carrinho pelo corpo seria deixar o
      navegador dizer quanto ele gastou, e ganhar frete grátis é só uma linha
      de console.
    */
    const { data: regioes } = await query.graph({
      entity: "region",
      fields: ["id", "currency_code"],
    })
    const regiao = regioes.find((r) => r.id === corpo.region_id) ?? regioes[0]
    if (!regiao) {
      res.status(503).json({ erro: "sem_regiao" })
      return
    }

    const { data: variantes } = await query.graph({
      entity: "variant",
      fields: ["id", "weight", "length", "width", "height", "calculated_price.calculated_amount"],
      filters: { id: pedidos.map((p) => p.id) },
      context: {
        calculated_price: QueryContext({
          region_id: regiao.id,
          currency_code: regiao.currency_code,
        }),
      },
    })

    /*
      O tipo do `query.graph` não conhece `calculated_price`: ele é montado
      pelo módulo de preços na hora, a partir do contexto de região, e não
      faz parte da entidade. O `as` é o custo de pedir um campo calculado —
      e o `Number(... ?? 0)` logo abaixo é quem trata o dia em que ele não
      vier.
    */
    type ComPreco = (typeof variantes)[number] & {
      calculated_price?: { calculated_amount?: number | null } | null
    }
    const porId = new Map((variantes as ComPreco[]).map((v) => [v.id, v]))
    const itens = pedidos.flatMap((p) => {
      const v = porId.get(p.id)
      if (!v) return []
      return [
        {
          pesoEmGramas: Number(v.weight ?? 0) || 0,
          comprimento: Number(v.length ?? 0) || 0,
          largura: Number(v.width ?? 0) || 0,
          altura: Number(v.height ?? 0) || 0,
          quantidade: p.quantidade,
          /*
            SEM SKU, de propósito. O frete que o carrinho cobra é cotado
            pelo provedor, com o contexto que o Medusa monta — e esse
            contexto não traz o SKU da variante. Mandar o SKU só daqui
            seria a vitrine fazendo uma pergunta diferente da que o
            checkout faz; e perguntas iguais, além de darem o mesmo preço,
            dividem a mesma viagem à Frenet (ver `cotar`).
          */
        },
      ]
    })

    if (!itens.length) {
      res.status(404).json({ erro: "variante_desconhecida" })
      return
    }

    const subtotal = pedidos.reduce((s, p) => {
      const preco = Number(porId.get(p.id)?.calculated_price?.calculated_amount ?? 0)
      return s + (Number.isFinite(preco) ? preco : 0) * p.quantidade
    }, 0)

    const loja = req.scope.resolve(Modules.STORE)
    const [dados] = await loja.listStores({}, { select: ["id", "metadata"], take: 1 })
    const { frete: politica, cotacao } = lerConfiguracoes(dados?.metadata)

    const { data: locais } = await query.graph({
      entity: "stock_location",
      fields: ["id", "address.postal_code"],
    })
    const origem = locais.find((l) => l.address?.postal_code)?.address?.postal_code

    let faixas: FaixaCotada[] = []
    let emergencia = false

    /*
      O QUE IMPEDE A COTAÇÃO cai dentro do `try`, junto com a queda da
      transportadora, e não num `res.status(503)` antes dele.

      Local de estoque sem CEP e `FRENET_TOKEN` ausente são estados da LOJA,
      não erros de HTTP — e o cliente que está olhando o produto não tem nada
      a ver com nenhum dos dois. Os três caminhos terminam no mesmo lugar: o
      preço de emergência, que é o que o checkout vai cobrar de qualquer jeito
      enquanto a loja estiver assim.

      Os dois `throw` são o que o TypeScript precisa pra saber que, depois
      deles, `origem` e `token` existem. A versão com um `impedimento: string`
      lá em cima obrigava a escrever `origem!` e `token!` logo abaixo — duas
      promessas à mão no lugar de uma checagem que o compilador entende.
    */
    const token = process.env.FRENET_TOKEN

    try {
      if (!origem) throw new ErroDaFrenet("o local de estoque está sem CEP", false)
      if (!token) throw new ErroDaFrenet("sem FRENET_TOKEN", false)

      const servicos = await cotar({
        token,
        cepDeOrigem: origem,
        cepDeDestino: cep,
        valor: subtotal,
        itens,
        tempoLimite: Number(process.env.FRENET_TEMPO_LIMITE_MS || 6000),
        /*
          A sacola manda o id do carrinho: a entrega que ela pendura em
          seguida faz o Medusa cotar a mesma pergunta, e com o carrinho na
          chave as duas dividem a viagem. A PDP não tem carrinho e não manda.
          O id só entra na chave do cache — preço, itens e CEP continuam
          vindo do corpo e do banco, como sempre.
        */
        carrinho:
          typeof corpo.cart_id === "string" && /^cart_[A-Za-z0-9]+$/.test(corpo.cart_id)
            ? corpo.cart_id
            : null,
      })

      const escolhidas = escolherFaixas(servicos)
      if (!escolhidas) throw new ErroDaFrenet("nenhuma transportadora atende este CEP", false)

      faixas = (["economica", "expressa"] as const).map((faixa) => {
        const s = escolhidas[faixa]
        return {
          faixa,
          nome: NOMES[faixa],
          preco: s.preco,
          transportadora: s.transportadora || null,
          servico: s.servico || null,
          prazo: emDiasUteis(s.prazoTexto),
        }
      })
    } catch (e) {
      /*
        A calculadora NÃO derruba a página quando a cotação falha — ela cai
        no mesmo preço de emergência que o checkout vai cobrar. Mostrar um
        valor aqui e outro lá seria pior que não mostrar nada.

        Sem preço de emergência configurado, a resposta é honesta: a loja
        não sabe dizer, e a tela mostra isso em vez de um número inventado.
      */
      logger.warn(`[frete] cotação falhou: ${e instanceof Error ? e.message : e}`)
      if (cotacao.precoDeEmergencia === null) {
        res.status(503).json({
          erro: "sem_cotacao",
          mensagem: "Não consegui calcular o frete pra esse CEP agora. Tenta de novo em instantes.",
        })
        return
      }
      emergencia = true
      faixas = (["economica", "expressa"] as const).map((faixa) => ({
        faixa,
        nome: NOMES[faixa],
        preco: cotacao.precoDeEmergencia!,
        transportadora: null,
        servico: null,
        prazo: cotacao.prazoDeEmergencia,
      }))
    }

    /*
      A política entra DEPOIS de montada a lista, na mesma ordem do checkout
      (econômica primeiro), porque é a posição que decide quem leva o frete
      grátis quando o alvo é "a mais barata".
    */
    const comPolitica = aplicarPolitica(
      politica,
      faixas.map((f) => ({ id: f.faixa, preco: f.preco })),
      subtotal
    )
    const precoPorFaixa = new Map(comPolitica.map((o) => [o.id, o.preco]))

    res.json({
      frete: {
        cep,
        emergencia,
        /*
          QUANTO FALTA PRO FRETE GRÁTIS, em reais, calculado aqui porque é
          aqui que o subtotal existe — a tela sabe o que está selecionado,
          mas não o preço de cada coisa, e não pode saber: preço que vem do
          navegador é preço que o navegador escolhe.

          `null` quando não há promoção nenhuma; `0` quando já alcançou. A
          FRASE é montada na loja, pelo `fraseDoQueFalta`, que já sabe
          escrever tanto "pro frete grátis" quanto "pro frete de R$ 9,90".
        */
        faltaPraGratis: politica.modo === "nenhuma" ? null : Math.max(0, politica.piso - subtotal),
        /*
          As duas viram UMA quando caem no mesmo serviço — mesmo preço, mesma
          transportadora, mesmo prazo. Mostrar duas linhas idênticas faz a
          pessoa procurar a diferença que não existe. No checkout isso não
          dá pra fazer (as opções são cadastradas no Medusa); aqui dá.
        */
        opcoes: enxugar(
          faixas.map((f) => {
            const preco = precoPorFaixa.get(f.faixa) ?? f.preco
            return { ...f, preco, precoCheio: preco < f.preco ? f.preco : null }
          })
        ),
      },
    })
  } catch (e) {
    logger.error(`[frete] ${e instanceof Error ? e.message : e}`)
    res.status(500).json({ erro: "falhou" })
  }
}

function enxugar(opcoes: FaixaNaResposta[]): FaixaNaResposta[] {
  const [a, b] = opcoes
  if (!a || !b) return opcoes
  const iguais = a.preco === b.preco && a.transportadora === b.transportadora && a.prazo === b.prazo
  return iguais ? [{ ...a, nome: "Entrega" }] : opcoes
}
