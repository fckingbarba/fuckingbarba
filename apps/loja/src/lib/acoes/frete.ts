"use server"

import type { HttpTypes } from "@medusajs/types"
import { buscarCep, limparCep } from "@/lib/cep"
import { CAMPOS_CARRINHO, lerCarrinho, paraVisivel, type CarrinhoVisivel } from "@/lib/carrinho"
import { lerEndereco, montarEndereco } from "@/lib/endereco"
import { semEntregaEmpatada } from "@/lib/frete"
import { cliente } from "@/lib/medusa"

/**
 * CALCULAR O FRETE ANTES DE TER CARRINHO.
 *
 * A calculadora de CEP da página de produto chama isto. Ela fala com
 * `POST /store/frete`, uma rota nossa, e não com a do Medusa: a do Medusa
 * exige `cart_id`, e na PDP não existe carrinho — quem está olhando o produto
 * ainda não pôs nada na sacola.
 *
 * A SACOLA tem carrinho, e por isso as ações dela moram mais embaixo: cotam
 * pela mesma rota (é de lá que vêm o prazo e o preço cheio) e gravam a
 * escolha no carrinho.
 *
 * ┌─ POR QUE AÇÃO DE SERVIDOR, E NÃO `fetch` DO NAVEGADOR ─────────────────┐
 * │ A cotação precisa da chave publicável e do endereço do backend. Os     │
 * │ dois já vazam pro navegador em outras chamadas — a chave é pública por │
 * │ desenho —, mas passar por aqui evita uma segunda cópia da URL do       │
 * │ Medusa dentro do bundle e mantém a tela falando só com a própria loja. │
 * │ De quebra, o erro chega tratado em português em vez de um 503 cru.     │
 * └────────────────────────────────────────────────────────────────────────┘
 */

export type OpcaoCotada = {
  faixa: "economica" | "expressa"
  nome: string
  preco: number
  /**
   * O preço antes da política de frete, quando ela baixou — é o número
   * riscado ao lado de "Grátis". `null` quando o preço já é o cheio.
   */
  precoCheio: number | null
  transportadora: string | null
  servico: string | null
  prazo: string | null
}

export type Cotacao =
  | {
      ok: true
      cep: string
      emergencia: boolean
      /**
       * Quanto falta, em reais, pro frete grátis. `null` sem promoção,
       * `0` quando já alcançou.
       *
       * Vem do servidor porque é ele quem sabe o preço de cada item — a
       * tela sabe o que está selecionado e não quanto custa, e não pode
       * saber: valor que vem do navegador é valor que o navegador escolhe.
       */
      faltaPraGratis: number | null
      opcoes: OpcaoCotada[]
    }
  | { ok: false; mensagem: string }

/** O que a tela diz quando a transportadora não respondeu. */
const NAO_DEU = "Não consegui calcular o frete pra esse CEP agora. Tenta de novo em instantes."

/** As palavras do protótipo, que é onde a sacola foi desenhada. */
const CEP_TORTO = "Digite os 8 números do CEP."

const GENERICO = "Não consegui falar com a loja agora. Tenta de novo em instantes."

export async function cotarFrete(
  cep: string,
  itens: { varianteId: string; quantidade: number }[],
  /**
   * Só a sacola manda: o carrinho em nome de quem a cotação é feita. O
   * backend usa pra juntar esta pergunta com a do Medusa quando a entrega é
   * pendurada logo depois — as duas são iguais, e viram uma viagem à Frenet.
   */
  carrinhoId?: string
): Promise<Cotacao> {
  const limpo = limparCep(cep)
  if (!limpo) return { ok: false, mensagem: "O CEP tem oito dígitos." }
  if (!itens.length) return { ok: false, mensagem: NAO_DEU }

  const sdk = cliente()
  if (!sdk) return { ok: false, mensagem: NAO_DEU }

  try {
    const { frete } = await sdk.client.fetch<{
      frete: {
        cep: string
        emergencia: boolean
        faltaPraGratis: number | null
        opcoes: OpcaoCotada[]
      }
    }>("/store/frete", {
      method: "POST",
      body: {
        cep: limpo,
        itens: itens.map((i) => ({
          variante_id: i.varianteId,
          quantidade: i.quantidade,
        })),
        ...(carrinhoId ? { cart_id: carrinhoId } : {}),
      },
    })

    if (!frete?.opcoes?.length) return { ok: false, mensagem: NAO_DEU }
    return {
      ok: true,
      cep: frete.cep,
      emergencia: frete.emergencia,
      faltaPraGratis: frete.faltaPraGratis ?? null,
      /*
        `?? null` porque a loja e o backend sobem cada um no seu tempo — a
        Vercel publica a loja antes de o Railway terminar o backend, e nesse
        intervalo a rota ainda não manda o preço cheio. Sem ele a tela só
        não risca nada; com `undefined` solto, riscaria "R$ NaN".
      */
      opcoes: frete.opcoes.map((o) => ({ ...o, precoCheio: o.precoCheio ?? null })),
    }
  } catch {
    /*
      Sem `registrar(e)` barulhento: CEP que não existe, transportadora fora
      do ar e cliente digitando devagar caem todos aqui, e nenhum deles é
      defeito da loja. Quem precisa saber que a Frenet caiu é o log do
      backend, que já anota — este lado só precisa dizer a verdade na tela.
    */
    return { ok: false, mensagem: NAO_DEU }
  }
}

/* ── a sacola: a entrega escolhida vira o frete do carrinho ───────────────── */

/**
 * Uma entrega da sacola: a faixa cotada mais o id da opção no Medusa.
 *
 * O id é o que faz o rádio valer alguma coisa. Sem ele a escolha seria só
 * desenho — o pé da gaveta não mudaria, e o checkout abriria perguntando de
 * novo o que a pessoa acabou de responder.
 */
export type EntregaDaSacola = OpcaoCotada & { id: string }

export type FreteDaSacola =
  | {
      ok: true
      cep: string
      emergencia: boolean
      opcoes: EntregaDaSacola[]
      /** Só vem de quem ESCREVEU no carrinho — ver `cotarDaSacola`. */
      carrinho?: CarrinhoVisivel
    }
  | { ok: false; mensagem: string; carrinho?: CarrinhoVisivel }

export type TrocaDeFrete =
  | { ok: true; carrinho: CarrinhoVisivel }
  | { ok: false; mensagem: string; carrinho?: CarrinhoVisivel }

/** Pra escrever o CEP sem apagar o resto do endereço, é preciso ler o resto. */
const CAMPOS_COM_ENDERECO = `${CAMPOS_CARRINHO},*shipping_address`

function registrar(e: unknown, contexto: string) {
  console.warn(`[sacola] ${contexto}: ${e instanceof Error ? e.message : String(e)}`)
}

type Sdk = NonNullable<ReturnType<typeof cliente>>
type Carrinho = HttpTypes.StoreCart

const itensDo = (c: Carrinho) =>
  (c.items ?? [])
    .map((i) => ({ varianteId: i.variant_id ?? "", quantidade: i.quantity ?? 0 }))
    .filter((i) => i.varianteId && i.quantidade > 0)

/**
 * De faixa pra opção do Medusa: `economica` → `so_01…`.
 *
 * A rota da calculadora responde por FAIXA, porque não sabe de carrinho; o
 * carrinho só aceita frete por id de OPÇÃO. Quem liga os dois é o `data` que
 * o `scripts/frete.ts` grava em cada opção — o mesmo que o provedor da Frenet
 * lê pra saber por qual faixa está respondendo.
 *
 * Listar não custa cotação: a listagem devolve as opções sem preço, e é só o
 * id que interessa aqui.
 */
async function opcoesDoCarrinho(sdk: Sdk, carrinhoId: string): Promise<Map<string, string>> {
  const { shipping_options } = await sdk.store.fulfillment.listCartOptions({
    cart_id: carrinhoId,
  })
  const porFaixa = new Map<string, string>()
  for (const o of shipping_options ?? []) {
    const faixa = (o.data as { faixa?: unknown } | null | undefined)?.faixa ?? o.type?.code
    if (typeof faixa === "string" && !porFaixa.has(faixa)) porFaixa.set(faixa, o.id)
  }
  return porFaixa
}

type Entregas =
  { ok: true; emergencia: boolean; opcoes: EntregaDaSacola[] } | { ok: false; mensagem: string }

/** A cotação da rota, com o id do Medusa pendurado em cada faixa. */
async function entregasPara(sdk: Sdk, carrinho: Carrinho, cep: string): Promise<Entregas> {
  const [cotacao, porFaixa] = await Promise.all([
    cotarFrete(cep, itensDo(carrinho), carrinho.id),
    opcoesDoCarrinho(sdk, carrinho.id).catch((e) => {
      registrar(e, "opções do carrinho")
      return new Map<string, string>()
    }),
  ])
  if (!cotacao.ok) return cotacao

  /*
    Faixa sem opção no Medusa SOME, em vez de aparecer sem id. Aparecer
    seria oferecer uma entrega que o carrinho recusa no clique — a corrente
    do frete quebrada em algum elo (ver o AGENTS.md), e quem descobre é o
    cliente.
  */
  const comId = cotacao.opcoes.flatMap((o) => {
    const id = porFaixa.get(o.faixa)
    return id ? [{ ...o, id }] : []
  })

  /*
    E a econômica some quando custa o mesmo que a expressa — a mesma regra
    que o checkout aplica (`lib/frete.ts`), pelo mesmo código. As duas telas
    têm que oferecer a mesma coisa: a entrega marcada na gaveta é a que o
    checkout abre marcada, e uma linha que existe lá e não existe aqui vira
    uma escolha que some sozinha no meio da compra.
  */
  const opcoes = semEntregaEmpatada(comId)
  if (!opcoes.length) return { ok: false, mensagem: NAO_DEU }
  return { ok: true, emergencia: cotacao.emergencia, opcoes }
}

/**
 * O "Calcular" da sacola: grava o CEP no carrinho, cota as duas entregas e
 * pendura uma delas.
 *
 * ┌─ POR QUE GRAVAR, E NÃO SÓ MOSTRAR ─────────────────────────────────────┐
 * │ No protótipo, escolher a entrega muda o total da gaveta e leva CEP e  │
 * │ frete pro checkout. A conta desse total é do Medusa, não da tela: a   │
 * │ gaveta não soma frete com produto, então pra mostrar o total com       │
 * │ frete o frete tem que estar NO CARRINHO. E estando lá, o checkout já  │
 * │ abre com o CEP, a rua e a entrega marcada — em vez de perguntar tudo  │
 * │ de novo duas telas depois.                                            │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ UMA ENTREGA ENTRA MARCADA, E ELA É GRAVADA ───────────────────────────┐
 * │ O protótipo marca a primeira opção assim que a cotação chega. Marcar  │
 * │ na tela sem gravar no carrinho é o bug que o checkout já teve: o rádio │
 * │ dizia uma coisa e o carrinho, outra. Aqui a marcada é a gravada.      │
 * │                                                                        │
 * │ Qual: a que o carrinho já tinha, se o CEP não mudou e ela continua na │
 * │ lista — quem escolheu a expressa e só conferiu o CEP não quer voltar  │
 * │ pra econômica. Senão, a primeira, que é a mais barata.                │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * O ENDEREÇO LEVA O QUE O VIACEP SOUBER (rua, bairro, cidade, estado), do
 * mesmo jeito que o `consultarCep` do checkout. Sem isso o checkout abriria
 * com o CEP preenchido e o resto vazio, e o atalho de preencher pelo CEP não
 * dispararia — ele só roda quando o CEP é digitado.
 */
export async function calcularNaSacola(cepDigitado: string): Promise<FreteDaSacola> {
  const cep = limparCep(cepDigitado)
  if (!cep) return { ok: false, mensagem: CEP_TORTO }

  const sdk = cliente()
  const atual = sdk ? await lerCarrinho(CAMPOS_COM_ENDERECO) : null
  if (!sdk || !atual) return { ok: false, mensagem: GENERICO }
  if (!itensDo(atual).length) return { ok: false, mensagem: NAO_DEU, carrinho: paraVisivel(atual) }

  const cepDeAntes = limparCep(atual.shipping_address?.postal_code ?? "")

  /*
    O ENDEREÇO VAI ANTES DE LISTAR AS OPÇÕES, e a cotação corre ao lado.

    O Medusa só lista opção de entrega pra carrinho com endereço — é o país
    dele que casa com a zona "Brasil". A cotação não precisa de carrinho
    nenhum (só de CEP e itens), então não espera: sai junto com a gravação.
  */
  let comCep: Carrinho
  try {
    const achado = await buscarCep(cep)
    const entrega = {
      ...lerEndereco(atual.shipping_address),
      cep,
      ...(achado
        ? { cidade: achado.cidade, uf: achado.uf, rua: achado.logradouro, bairro: achado.bairro }
        : {}),
    }
    const { cart } = await sdk.store.cart.update(
      atual.id,
      { shipping_address: montarEndereco(entrega) },
      { fields: CAMPOS_COM_ENDERECO }
    )
    comCep = cart
  } catch (e) {
    registrar(e, "cep no carrinho")
    return { ok: false, mensagem: NAO_DEU, carrinho: paraVisivel(atual) }
  }

  const entregas = await entregasPara(sdk, comCep, cep)
  if (!entregas.ok) return { ...entregas, carrinho: paraVisivel(await lerCarrinho()) }

  /*
    O que continua pendurado DEPOIS de gravar o endereço — e não o de antes:
    o Medusa refaz o frete do carrinho quando o endereço muda, e tira o que
    deixou de valer. Com CEP novo, volta pra mais barata: a expressa de um
    CEP pode custar o triplo no outro, e manter a escolha seria decidir pela
    pessoa um preço que ela ainda não viu.
  */
  const pendurado = comCep.shipping_methods?.[0]?.shipping_option_id ?? null
  const mantida =
    cep === cepDeAntes && pendurado ? entregas.opcoes.find((o) => o.id === pendurado) : undefined
  const escolhida = mantida ?? entregas.opcoes[0]!

  /*
    A mantida não precisa de uma segunda ida: gravar o endereço já fez o
    Medusa recalcular o frete que estava pendurado, e o carrinho que voltou
    da gravação já traz o preço novo.
  */
  if (mantida) {
    return {
      ok: true,
      cep,
      emergencia: entregas.emergencia,
      opcoes: entregas.opcoes,
      carrinho: paraVisivel(comCep),
    }
  }

  try {
    const { cart } = await sdk.store.cart.addShippingMethod(
      atual.id,
      { option_id: escolhida.id },
      { fields: CAMPOS_CARRINHO }
    )
    return {
      ok: true,
      cep,
      emergencia: entregas.emergencia,
      opcoes: entregas.opcoes,
      carrinho: paraVisivel(cart),
    }
  } catch (e) {
    registrar(e, `frete ${escolhida.id}`)
    return { ok: false, mensagem: NAO_DEU, carrinho: paraVisivel(await lerCarrinho()) }
  }
}

/**
 * A pessoa trocou de entrega. Pendura a outra e devolve o carrinho refeito.
 *
 * O id vem da tela, e tudo bem: o Medusa só aceita opção que vale pra ESTE
 * carrinho, e o preço quem calcula é ele. O pior que um id forjado consegue
 * é um erro — nunca um frete mais barato.
 */
export async function escolherNaSacola(opcaoId: string): Promise<TrocaDeFrete> {
  const sdk = cliente()
  const atual = sdk ? await lerCarrinho() : null
  if (!sdk || !atual) return { ok: false, mensagem: GENERICO }

  try {
    const { cart } = await sdk.store.cart.addShippingMethod(
      atual.id,
      { option_id: opcaoId },
      { fields: CAMPOS_CARRINHO }
    )
    return { ok: true, carrinho: paraVisivel(cart) }
  } catch (e) {
    registrar(e, `trocar frete pra ${opcaoId}`)
    return {
      ok: false,
      mensagem: "Essa entrega não está mais disponível. Calcula de novo.",
      carrinho: paraVisivel(await lerCarrinho()),
    }
  }
}

/**
 * As entregas do CEP que o carrinho JÁ TEM, sem escrever nada.
 *
 * Roda quando a gaveta abre com um CEP gravado (a pessoa calculou antes, ou
 * voltou do checkout) e quando a sacola muda — trocar de 1 pra 3 frascos
 * muda o peso, e o preço que estava na tela passou a ser de outro pedido. O
 * frete PENDURADO o Medusa já recalculou sozinho quando a quantidade mudou;
 * o que fica velho é a lista, e é ela que isto refaz.
 *
 * NÃO DEVOLVE O CARRINHO, de propósito: ela não escreveu nele. Um carrinho
 * lido aqui pode chegar DEPOIS da resposta de um "+" que saiu antes dela, e
 * devolvê-lo apagaria na tela a quantidade nova com um retrato velho.
 */
export async function cotarDaSacola(): Promise<FreteDaSacola> {
  const sdk = cliente()
  const atual = sdk ? await lerCarrinho() : null
  if (!sdk || !atual) return { ok: false, mensagem: GENERICO }

  const cep = limparCep(atual.shipping_address?.postal_code ?? "")
  if (!cep || !itensDo(atual).length) return { ok: false, mensagem: NAO_DEU }

  const entregas = await entregasPara(sdk, atual, cep)
  if (!entregas.ok) return entregas
  return { ok: true, cep, emergencia: entregas.emergencia, opcoes: entregas.opcoes }
}
