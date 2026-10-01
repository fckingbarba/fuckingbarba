import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules, QueryContext } from "@medusajs/framework/utils"
import {
  cotar,
  ErroDaFrenet,
  escolherFaixas,
  itensPraCotar,
  somaDosProdutos,
  type LinhaDoCarrinho,
} from "../modules/frenet/client"
import { aplicarPolitica, lerConfiguracoes } from "./configuracoes"

/**
 * QUANTO CUSTA MANDAR ISTO PRA ESTE CEP — a conta da calculadora da página
 * do produto e da sacola (`POST /store/frete`, que só confere a pergunta e o
 * limite) e do atendente do WhatsApp (`lib/whatsapp/ferramentas.ts`). Uma
 * conta só: o número que a página mostra, o que o WhatsApp diz e o que o
 * checkout cobra saem das mesmas funções. O porquê de cada passo está nos
 * comentários abaixo, e no cabeçalho da rota.
 *
 * Devolve a resposta da rota (`ok: true`, com o `frete`) ou o erro dela, com
 * o status HTTP; o que der errado fora disso lança.
 */

export type FaixaNaResposta = {
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

export type ResultadoDoFrete =
  | {
      ok: true
      frete: {
        cep: string
        emergencia: boolean
        faltaPraGratis: number | null
        opcoes: FaixaNaResposta[]
      }
    }
  | { ok: false; status: number; corpo: Record<string, unknown> }

export async function cotarFrete(
  container: MedusaContainer,
  p: {
    /** Só os 8 dígitos. */
    cep: string
    /** As variantes e as quantidades — a mesma variante pode vir em mais de uma linha. */
    pedidos: { id: string; quantidade: number }[]
    regiaoId?: unknown
    /** O carrinho, quando a pergunta é da sacola (`cart_…`, já conferido). */
    carrinho: string | null
  }
): Promise<ResultadoDoFrete> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { cep, pedidos, regiaoId, carrinho } = p

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
  const regiao = regioes.find((r) => r.id === regiaoId) ?? regioes[0]
  if (!regiao) return { ok: false, status: 503, corpo: { erro: "sem_regiao" } }

  /*
    SEM CARRINHO, A ROTA MONTA AS LINHAS QUE O CARRINHO TERIA com estes
    itens, e a pergunta sai delas pelas mesmas funções do provider.

    Duas regras do carrinho entram na conta. A MESMA VARIANTE VIRA UMA LINHA
    SÓ: o Medusa soma a quantidade na linha que já existe. E O PREÇO É O DA
    QUANTIDADE DA LINHA: com `quantity` no contexto de preço, o Medusa
    escolhe a faixa (`lib/precos-por-quantidade.ts`) como faz no carrinho —
    2 frascos de R$ 49,90 saem R$ 47,45 cada. Com o preço de uma unidade, a
    PDP declarava o valor cheio e decidia o frete grátis por ele: com piso
    de R$ 139,90, 3 frascos (R$ 138,90 no carrinho) apareciam "Grátis" e o
    checkout cobrava o frete.

    Uma consulta por quantidade, porque o contexto vale pra consulta
    inteira. Na PDP são uma ou duas: as unidades do produto, e 1 pra cada
    marcado no "leve junto".
  */
  const quantidades = new Map<string, number>()
  for (const p of pedidos) quantidades.set(p.id, (quantidades.get(p.id) ?? 0) + p.quantidade)
  const porQuantidade = new Map<number, string[]>()
  for (const [id, q] of quantidades) porQuantidade.set(q, [...(porQuantidade.get(q) ?? []), id])

  const consultas = await Promise.all(
    [...porQuantidade].map(([quantity, ids]) =>
      query.graph({
        entity: "variant",
        fields: ["id", "weight", "length", "width", "height", "calculated_price.calculated_amount"],
        filters: { id: ids },
        context: {
          calculated_price: QueryContext({
            region_id: regiao.id,
            currency_code: regiao.currency_code,
            quantity,
          }),
        },
      })
    )
  )

  /*
    O tipo do `query.graph` não conhece `calculated_price`: ele é montado
    pelo módulo de preços na hora, a partir do contexto de região, e não
    faz parte da entidade. O `as` é o custo de pedir um campo calculado —
    e o `?? 0` logo abaixo (mais o `Number` do `somaDosProdutos`) é quem
    trata o dia em que ele não vier.
  */
  type ComPreco = (typeof consultas)[number]["data"][number] & {
    calculated_price?: { calculated_amount?: number | null } | null
  }
  const porId = new Map(consultas.flatMap((c) => c.data as ComPreco[]).map((v) => [v.id, v]))
  const linhasDoCorpo = [...quantidades].flatMap(([id, quantity]) => {
    const v = porId.get(id)
    return v
      ? [{ unit_price: v.calculated_price?.calculated_amount ?? 0, quantity, variant: v }]
      : []
  })

  if (!linhasDoCorpo.length)
    return { ok: false, status: 404, corpo: { erro: "variante_desconhecida" } }

  /*
    COM CARRINHO, AS LINHAS SÃO AS DELE. O corpo continua conferido aí em
    cima — é o contrato da rota —, mas quem responde é o carrinho: as
    linhas do corpo imitam o carrinho, e as do carrinho SÃO o que o Medusa
    manda ao provider quando cota o frete pendurado.

    E é isso que a sacola precisa: a pergunta daqui igual, byte a byte, à
    do frete pendurado, pra que as duas dividam a viagem à Frenet. Montada
    do corpo, ela já foi outra — o achado de 23/09: o preço de uma unidade
    contra o da faixa, duas viagens onde devia ser uma, a lista da gaveta
    cotada sobre um valor e o pé sobre outro.

    Id que não acha carrinho, ou carrinho vazio, fica com as linhas do
    corpo — e sai da chave da viagem, porque a pergunta não é mais a dele.
  */
  const { data: carrinhos } = carrinho
    ? await query.graph({
        entity: "cart",
        fields: [
          "items.unit_price",
          "items.quantity",
          "items.variant.weight",
          "items.variant.length",
          "items.variant.width",
          "items.variant.height",
        ],
        filters: { id: carrinho },
      })
    : { data: [] }
  const linhasDoCarrinho = (carrinhos[0]?.items ?? []).flatMap((l) => (l ? [l] : []))
  const doCarrinho = linhasDoCarrinho.length > 0
  const linhas: LinhaDoCarrinho[] = doCarrinho ? linhasDoCarrinho : linhasDoCorpo
  const itens = itensPraCotar(linhas)
  const subtotal = somaDosProdutos(linhas)

  const loja = container.resolve(Modules.STORE)
  const [dados] = await loja.listStores({}, { select: ["id", "metadata"], take: 1 })
  const { frete: politica, cotacao } = lerConfiguracoes(dados?.metadata)

  const { data: locais } = await query.graph({
    entity: "stock_location",
    fields: ["id", "address.postal_code"],
  })
  const origem = locais.find((l) => l.address?.postal_code)?.address?.postal_code

  let faixas: FaixaCotada[] = []
  /** Qual entrega está por trás de cada faixa — ver "O MESMO SERVIÇO" no `aplicarPolitica`. */
  const servicoDaFaixa = new Map<string, string>()
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
        O carrinho entra na chave quando a pergunta é DELE (valor e itens
        lidos dele, lá em cima): a entrega que a sacola pendura em seguida,
        e o recálculo quando a quantidade muda, fazem o Medusa cotar a mesma
        pergunta, e as duas dividem a viagem. Sem carrinho — a PDP, ou um
        id que não achou nada —, cada pergunta é uma viagem.
      */
      carrinho: doCarrinho ? carrinho : null,
    })

    const escolhidas = escolherFaixas(servicos)
    if (!escolhidas) throw new ErroDaFrenet("nenhuma transportadora atende este CEP", false)

    faixas = (["economica", "expressa"] as const).map((faixa) => {
      const s = escolhidas[faixa]
      servicoDaFaixa.set(faixa, s.codigo)
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
    if (cotacao.precoDeEmergencia === null)
      return {
        ok: false,
        status: 503,
        corpo: {
          erro: "sem_cotacao",
          mensagem: "Não consegui calcular o frete pra esse CEP agora. Tenta de novo em instantes.",
        },
      }
    emergencia = true
    servicoDaFaixa.set("economica", "emergencia").set("expressa", "emergencia")
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
    faixas.map((f) => ({ id: f.faixa, preco: f.preco, servico: servicoDaFaixa.get(f.faixa) })),
    subtotal
  )
  const precoPorFaixa = new Map(comPolitica.map((o) => [o.id, o.preco]))

  return {
    ok: true,
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
  }
}

function enxugar(opcoes: FaixaNaResposta[]): FaixaNaResposta[] {
  const [a, b] = opcoes
  if (!a || !b) return opcoes
  const iguais = a.preco === b.preco && a.transportadora === b.transportadora && a.prazo === b.prazo
  return iguais ? [{ ...a, nome: "Entrega" }] : opcoes
}
