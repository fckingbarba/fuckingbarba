import { AbstractFulfillmentProviderService, MedusaError } from "@medusajs/framework/utils"
import type {
  CalculatedShippingOptionPrice,
  CalculateShippingOptionPriceDTO,
  CreateFulfillmentResult,
  FulfillmentOption,
} from "@medusajs/framework/types"
import { aplicarPolitica, type OpcaoCotada, type PoliticaDeFrete } from "../../lib/configuracoes"
import {
  cotar,
  ErroDaFrenet,
  escolherFaixas,
  type ItemPraCotar,
  type ServicoCotado,
} from "./client"

/**
 * O PROVEDOR DE FRETE — a Frenet cota, a loja decide.
 *
 * O Medusa não fecha carrinho sem método de envio escolhido. Até aqui as
 * opções eram duas linhas fixas cadastradas à mão (PAC R$ 24,90, Sedex
 * R$ 39,90) valendo do Oiapoque ao Chuí: quem mora perto pagava caro e quem
 * mora longe saía no prejuízo da loja. Agora o preço vem do CEP.
 *
 * ┌─ DUAS FAIXAS, E NÃO UMA LINHA POR TRANSPORTADORA ──────────────────────┐
 * │ A Frenet devolve de três a oito serviços por CEP — PAC, Sedex, Loggi,  │
 * │ JadLog, Azul —, e o conjunto MUDA a cada endereço. Listar tudo faria a │
 * │ tela do checkout trocar de tamanho conforme o cliente digita o CEP, e  │
 * │ obrigaria a cadastrar no Medusa uma opção por serviço, mantida à mão   │
 * │ pra sempre.                                                            │
 * │                                                                         │
 * │ Então a loja mostra DUAS: a mais barata e a mais rápida, cada uma      │
 * │ dizendo quem entrega e em quantos dias. É também o que a política de   │
 * │ frete grátis já assumia — ela fala em "a opção mais barata", e não em  │
 * │ "Correios PAC", justamente porque com cotação ao vivo não existe mais  │
 * │ uma transportadora fixa pra pendurar a regra.                          │
 * │                                                                         │
 * │ Quando as duas caem no mesmo serviço (o mais barato TAMBÉM é o mais    │
 * │ rápido), as duas linhas mostram o mesmo preço. É feio e é raro; o      │
 * │ conserto seria esconder uma delas, e esconder exige que o cálculo      │
 * │ falhe — o que derruba a lista inteira. Ver a caixa do `calculatePrice`.│
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE ESTE ARQUIVO NÃO DECIDE: a política. Quem diz se o frete é grátis, a
 * partir de quanto e em qual faixa é o `aplicarPolitica` do
 * `lib/configuracoes.ts` — o MESMO que a vitrine usa pra escrever "Frete
 * grátis a partir de R$ 139,90" na tarja do produto. Duas implementações da
 * mesma regra é como a loja anuncia um piso e o carrinho cobra por outro.
 */

export type Faixa = "economica" | "expressa"

type ContextoDoFrete = {
  politica: PoliticaDeFrete
  /** O que cobrar quando a cotação falha. `null` = não vender sem cotar. */
  precoDeEmergencia: number | null
  cepDeOrigem: string | null
}

type Opcoes = { token?: string; tempoLimite?: number }

/** Onde o hook do app pendura o que este módulo não consegue ler sozinho. */
export const CHAVE_NO_CONTEXTO = "fb_frete"

const FAIXAS: { id: Faixa; nome: string }[] = [
  { id: "economica", nome: "Entrega econômica" },
  { id: "expressa", nome: "Entrega expressa" },
]

/*
 * A COTAÇÃO É UMA SÓ, MESMO SENDO DUAS OPÇÕES — e isso agora é trabalho do
 * `cotar`, no `client.ts`. Morava aqui e só unia as duas opções do mesmo
 * carrinho. Lá, com a chave sendo a pergunta inteira mais o carrinho, ela
 * une também a rota `/store/frete` quando a rota pergunta PELO carrinho: o
 * bloco de frete da sacola cota pela rota e em seguida pendura a entrega, e
 * as duas perguntas são a mesma.
 */

export default class FrenetFulfillmentService extends AbstractFulfillmentProviderService {
  static identifier = "frenet"

  private readonly token: string
  private readonly tempoLimite: number
  private readonly logger: { info: (m: string) => void; warn: (m: string) => void }

  constructor({ logger }: { logger: FrenetFulfillmentService["logger"] }, opcoes: Opcoes = {}) {
    super()
    this.token = opcoes.token ?? ""
    this.tempoLimite = opcoes.tempoLimite ?? 6000
    this.logger = logger

    if (!this.token) {
      /*
        Sem token o módulo continua de pé e cada cotação cai na emergência.
        Derrubar o servidor no arranque seria pior: o admin e o catálogo
        param junto, e quem esqueceu a variável descobre por um 502 em vez
        de por este aviso.
      */
      this.logger.warn(
        "[frenet] FRENET_TOKEN ausente — nenhuma cotação vai acontecer, e todo frete " +
          "vai cair no preço de emergência das configurações da loja."
      )
    }
  }

  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    return FAIXAS.map((f) => ({ id: f.id, name: f.nome, faixa: f.id }))
  }

  async validateFulfillmentData(
    _optionData: Record<string, unknown>,
    data: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    return data
  }

  async validateOption(): Promise<boolean> {
    return true
  }

  async canCalculate(): Promise<boolean> {
    return true
  }

  /**
   * O PREÇO DE UMA FAIXA.
   *
   * ┌─ ESTE MÉTODO SÓ PODE FALHAR QUANDO A LOJA DEVE MESMO PARAR ────────────┐
   * │ O Medusa calcula todas as opções com `promiseAll`: se UMA falhar, a   │
   * │ lista inteira de fretes falha e o cliente não vê opção nenhuma — nem  │
   * │ as que calcularam bem. Ou seja, lançar erro aqui não "esconde uma     │
   * │ opção", fecha o checkout.                                             │
   * │                                                                        │
   * │ Por isso só existe um caminho que lança: cotação falhou E a loja não  │
   * │ configurou preço de emergência. Aí fechar é a decisão certa, e é a    │
   * │ que está escrita no admin — "deixe vazio pra não vender sem cotar".   │
   * └────────────────────────────────────────────────────────────────────────┘
   */
  async calculatePrice(
    optionData: CalculateShippingOptionPriceDTO["optionData"],
    _data: CalculateShippingOptionPriceDTO["data"],
    context: CalculateShippingOptionPriceDTO["context"]
  ): Promise<CalculatedShippingOptionPrice> {
    /*
      CARRINHO VAZIO NÃO TEM O QUE MANDAR, e não se cota.

      O Medusa refaz o frete pendurado a cada mudança no carrinho — inclusive
      quando sai o ÚLTIMO item. Cotação sem item lança ("cotação sem itens"),
      e sem preço de emergência esse lançamento derrubava a remoção inteira:
      a pessoa apertava a lixeira, recebia erro, e o produto continuava lá.
      Com a sacola pendurando a entrega logo no primeiro CEP, isso deixou de
      ser caso raro de quem voltou do checkout.

      O zero aqui nunca é cobrado: carrinho sem item não vira pedido, e o
      próximo item que entrar refaz a conta.
    */
    if (!(context.items ?? []).length) {
      return { calculated_amount: 0, is_calculated_price_tax_inclusive: true }
    }

    const faixa: Faixa = optionData?.faixa === "expressa" ? "expressa" : "economica"
    const nosso = (context as Record<string, unknown>)[CHAVE_NO_CONTEXTO] as
      ContextoDoFrete | undefined

    const politica: PoliticaDeFrete = nosso?.politica ?? { modo: "nenhuma" }
    const emergencia = nosso?.precoDeEmergencia ?? null
    const subtotal = somaDosProdutos(context)

    let servicos: ServicoCotado[] = []
    try {
      servicos = await this.cotacao(context, nosso)
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e)
      if (emergencia === null) {
        this.logger.warn(`[frenet] ${motivo} — e sem preço de emergência: a loja não vai vender`)
        throw new MedusaError(
          MedusaError.Types.UNEXPECTED_STATE,
          "Não consegui calcular o frete para este endereço agora. Tente de novo em instantes."
        )
      }
      this.logger.warn(`[frenet] ${motivo} — caindo no preço de emergência de R$ ${emergencia}`)
      /*
        A emergência vale IGUAL nas duas faixas, e continua passando pela
        política: quem já ganhou frete grátis pelo piso não perde o benefício
        porque a transportadora caiu. O problema é nosso, não dele.
      */
      return this.precoFinal(
        [
          { id: "economica", preco: emergencia },
          { id: "expressa", preco: emergencia },
        ],
        faixa,
        politica,
        subtotal
      )
    }

    if (!servicos.length) {
      if (emergencia === null) {
        throw new MedusaError(
          MedusaError.Types.NOT_FOUND,
          "Nenhuma transportadora atende este CEP no momento."
        )
      }
      return this.precoFinal(
        [
          { id: "economica", preco: emergencia },
          { id: "expressa", preco: emergencia },
        ],
        faixa,
        politica,
        subtotal
      )
    }

    /* A MESMA função que a rota `/store/frete` usa pra responder a
       calculadora de CEP. Se as duas escolhessem sozinhas, a PDP mostraria
       um preço e o checkout cobraria outro. */
    const { economica, expressa } = escolherFaixas(servicos)!

    /* A ordem importa: `aplicarPolitica` desempata pela primeira, e a
       econômica tem que ser a que ganha o frete grátis. */
    return this.precoFinal(
      [
        { id: "economica", preco: economica.preco },
        { id: "expressa", preco: expressa.preco },
      ],
      faixa,
      politica,
      subtotal
    )
  }

  private precoFinal(
    opcoes: OpcaoCotada[],
    faixa: Faixa,
    politica: PoliticaDeFrete,
    subtotal: number
  ): CalculatedShippingOptionPrice {
    const comPolitica = aplicarPolitica(politica, opcoes, subtotal)
    const escolhida = comPolitica.find((o) => o.id === faixa) ?? comPolitica[0]!

    return {
      calculated_amount: escolhida.preco,
      /*
        No Brasil o frete que a transportadora cobra já é o valor final —
        não existe imposto somado por cima no checkout. Marcando `false`, o
        Medusa acrescentaria a alíquota e o cliente pagaria mais do que a
        etiqueta custa.
      */
      is_calculated_price_tax_inclusive: true,
    }
  }

  private async cotacao(
    context: CalculateShippingOptionPriceDTO["context"],
    nosso: ContextoDoFrete | undefined
  ): Promise<ServicoCotado[]> {
    if (!this.token) throw new ErroDaFrenet("sem FRENET_TOKEN", false)

    const origem =
      nosso?.cepDeOrigem ??
      (context.from_location?.address?.postal_code as string | undefined) ??
      null
    const destino = context.shipping_address?.postal_code ?? null

    if (!origem) {
      throw new ErroDaFrenet(
        "o local de estoque está sem CEP — cadastre o endereço de origem no admin",
        false
      )
    }
    if (!destino) throw new ErroDaFrenet("carrinho ainda sem CEP de entrega", false)

    return cotar({
      token: this.token,
      cepDeOrigem: origem,
      cepDeDestino: destino,
      valor: somaDosProdutos(context),
      itens: itensPraCotar(context),
      tempoLimite: this.tempoLimite,
      carrinho: context.id,
    })
  }

  /**
   * Por enquanto quem gera etiqueta é gente, no painel da Frenet.
   *
   * O `createFulfillment` guarda o que a loja sabe do envio e devolve sem
   * chamar API nenhuma. Emitir etiqueta por API é outro endpoint, outro
   * saldo e outra conversa — e um pedido que não pode ser despachado à mão
   * é um pedido que trava quando a integração de etiqueta cair.
   */
  async createFulfillment(data: Record<string, unknown>): Promise<CreateFulfillmentResult> {
    return { data, labels: [] }
  }

  async cancelFulfillment(): Promise<Record<string, unknown>> {
    return {}
  }
}

/**
 * O SUBTOTAL DOS PRODUTOS, somado aqui e não lido do carrinho.
 *
 * O contexto que o Medusa entrega ao provider traz os itens, e não o total —
 * então a soma é nossa. Ela precisa bater com o `item_total` que a regra de
 * frete grátis usava antes, senão o piso muda de significado sem ninguém
 * mexer nele: é preço de produto vezes quantidade, sem frete e sem desconto
 * de pedido.
 */
function somaDosProdutos(context: CalculateShippingOptionPriceDTO["context"]): number {
  return (context.items ?? []).reduce((s, item) => {
    const preco = Number(item.unit_price ?? 0)
    const quantidade = Number(item.quantity ?? 0)
    return s + (Number.isFinite(preco) ? preco : 0) * (Number.isFinite(quantidade) ? quantidade : 0)
  }, 0)
}

/**
 * Os itens do carrinho no formato da cotação.
 *
 * PESO E MEDIDA SÃO DA VARIANTE, não do produto — é só isso que o Medusa
 * entrega aqui. Foi a descoberta que atrasou esta integração: o catálogo
 * tinha peso cadastrado, mas no PRODUTO, que é outro campo e nunca chega
 * neste objeto. Quem leva os números pro lugar certo é o
 * `scripts/medidas.ts`.
 *
 * Variante sem medida vira zero, e o cliente aplica o mínimo dos Correios em
 * cima do zero — ou seja, cota como se fosse a menor caixa possível. É o
 * chute menos ruim, e o `medidas.ts` existe pra que ele nunca aconteça: ele
 * lista o que está faltando em vez de deixar passar.
 *
 * SEM SKU: o contexto que o Medusa monta pra este método não traz o SKU da
 * variante (a linha que tentava ler dele nunca achou nada). A rota
 * `/store/frete` também não manda, pra fazer à Frenet exatamente a pergunta
 * que este método faz — mesma pergunta, mesmo preço, e uma viagem só.
 */
function itensPraCotar(context: CalculateShippingOptionPriceDTO["context"]): ItemPraCotar[] {
  return (context.items ?? []).map((item) => {
    const v = item.variant as
      { weight?: number; length?: number; width?: number; height?: number } | undefined
    return {
      pesoEmGramas: Number(v?.weight ?? 0) || 0,
      comprimento: Number(v?.length ?? 0) || 0,
      largura: Number(v?.width ?? 0) || 0,
      altura: Number(v?.height ?? 0) || 0,
      quantidade: Number(item.quantity ?? 1) || 1,
    }
  })
}
