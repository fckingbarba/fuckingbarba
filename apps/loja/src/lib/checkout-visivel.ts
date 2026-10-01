import type { ItemDoCarrinho } from "./carrinho-visivel"

/**
 * O QUE O CHECKOUT MOSTRA
 *
 * Sem import de nada que toque servidor — igual ao `carrinho-visivel.ts`, e
 * pela mesma razão: as etapas são componentes de cliente, e qualquer coisa
 * `server-only` ou com `"use cache"` que entre no grafo delas quebra o build
 * com um erro que não aponta pra cá.
 *
 * O formato é o que a tela precisa desenhar, não o que o Medusa devolve. Todo
 * número aqui saiu de uma conta do Medusa — nada nesta camada soma, desconta
 * ou arredonda.
 */

export type { ItemDoCarrinho }

/**
 * TRÊS PASSOS, e o frete mora dentro do de entrega.
 *
 * O protótipo separava frete num passo só dele e o desenho ficou pior: o
 * frete depende do CEP, que acabou de ser digitado ali em cima, e mandar a
 * pessoa pra outra tela pra escolher entre duas linhas é uma parede a mais
 * no meio de uma decisão que ela já tomou.
 */
export const ETAPAS = ["contato", "entrega", "pagamento"] as const
export type Etapa = (typeof ETAPAS)[number]

export const NOMES_DAS_ETAPAS: Record<Etapa, string> = {
  contato: "Contato",
  entrega: "Entrega",
  pagamento: "Pagamento",
}

export type EnderecoVisivel = {
  nome: string
  sobrenome: string
  telefone: string
  cep: string
  rua: string
  numero: string
  complemento: string
  bairro: string
  cidade: string
  uf: string
}

export const ENDERECO_VAZIO: EnderecoVisivel = {
  nome: "",
  sobrenome: "",
  telefone: "",
  cep: "",
  rua: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "",
}

export type OpcaoDeFrete = {
  id: string
  nome: string
  /**
   * `economica` ou `expressa` — a mesma faixa que a calculadora da sacola
   * usa. Sai do `data.faixa` que o `scripts/frete.ts` grava em cada opção do
   * Medusa, e é `null` se a opção subir sem ela. Quem lê é a regra de
   * `lib/frete.ts`, pra decidir qual entrega aparece quando as duas custam
   * igual; é `string` solto, e não a união fechada, porque o valor vem do
   * banco e ninguém aqui pode jurar o que tem lá dentro.
   */
  faixa: string | null
  /** "A mais barata para o seu CEP" — a linha de apoio, do tipo da opção cadastrado no Medusa. */
  descricao: string
  /**
   * "8 dias úteis" — em quantos dias a transportadora entrega, contados da
   * postagem. Não vem da opção do Medusa (a cotação dele devolve só o preço):
   * vem da rota da calculadora, a mesma da sacola — ver `prazosDasFaixas`.
   * `null` quando ela não respondeu, e aí a tela fica com a `descricao`.
   */
  prazo: string | null
  /** Em reais. Zero é frete grátis, e a tela escreve isso com todas as letras. */
  preco: number
  /**
   * O que esta opção custaria sem o frete grátis. Só existe quando o preço
   * caiu pra zero — é o valor riscado do lado de "Grátis", que é o que faz a
   * economia ser visível em vez de ser só um zero.
   */
  precoCheio: number | null
}

export type ProvedorDePagamento = {
  id: string
  nome: string
  descricao: string
  /**
   * `true` quando o provedor não cobra nada de verdade — o
   * `pp_system_default`. A tela precisa saber pra não escrever "pagamento
   * aprovado" sobre um pagamento que não existiu.
   */
  simbolico: boolean
}

/**
 * O provedor que cobra de verdade: Pix e cartão, pelo Pagar.me. É o id que o
 * `npm run backend:pagamento` liga na região — quando ele aparece na lista,
 * o passo 3 deixa de ser vitrine e passa a cobrar.
 */
export const PROVEDOR_PAGARME = "pp_pagarme_pagarme"

/**
 * O Mercado Pago: só Pix, a reserva do Pagar.me (0140). Não aparece no passo
 * 3 com nome — quem escolhe o parceiro é a loja, pela saúde de cada um
 * (`rotaDoPagamento`).
 */
export const PROVEDOR_MERCADOPAGO = "pp_mercadopago_mercadopago"

/** O provisório do Medusa: fecha o pedido sem cobrar nada. Ver `CHECKOUT_ABERTO`. */
export const PROVEDOR_PROVISORIO = "pp_system_default"

/**
 * OS PARCEIROS QUE COBRAM — o provedor no Medusa, o nome, e a chave onde ele
 * grava o estado na sessão (`data[chave]`: a forma, a situação, o QR do Pix,
 * o final do cartão, a recusa). Todo parceiro grava o mesmo formato, e é por
 * esta lista que a tela de obrigado, a conta e a recusa do passo 3 acham o
 * pagamento sem saber quem cobrou.
 *
 * A MESMA LISTA do backend (`apps/backend/src/lib/pagamento/parceiros.ts`):
 * parceiro novo entra nas duas — o teste de lá confere. O provisório não é
 * parceiro: ele não cobra.
 *
 * A ORDEM É A DE TENTAR: com os dois de pé, o Pix vai pelo Pagar.me, e o
 * Mercado Pago é a reserva (`rotaDoPagamento`).
 */
export type FormaDoParceiro = "pix" | "cartao"

export type ParceiroDePagamento = {
  id: string
  nome: string
  chave: string
  formas: readonly FormaDoParceiro[]
}

export const PARCEIROS: readonly ParceiroDePagamento[] = [
  { id: PROVEDOR_PAGARME, nome: "Pagar.me", chave: "pagarme", formas: ["pix", "cartao"] },
  { id: PROVEDOR_MERCADOPAGO, nome: "Mercado Pago", chave: "mercadopago", formas: ["pix"] },
]

export function parceiroDe(id: unknown): ParceiroDePagamento | null {
  return PARCEIROS.find((p) => p.id === id) ?? null
}

/**
 * POR ONDE COBRAR AGORA — cada forma com os parceiros na ordem de tentar.
 * Forma com a lista vazia não sai agora; `fora` diz quais a loja tem, mas
 * estão fora (o parceiro delas fora do caminho).
 */
export type RotaDoPagamento = {
  pix: string[]
  cartao: string[]
  fora: FormaDoParceiro[]
}

/**
 * A ROTA, com os parceiros ligados na região e os que o disjuntor tirou do
 * caminho agora (`GET /store/pagamento`, no backend; a regra de quando um
 * sai está em `apps/backend/src/lib/pagamento/disjuntor.ts`):
 *
 *   - o parceiro fora do caminho sai da lista da forma — o Pix vai pelo
 *     outro, na ordem de `PARCEIROS`;
 *   - forma sem ninguém de pé (o cartão, com o Pagar.me fora) sai da tela
 *     enquanto a outra puder cobrar;
 *   - COM TODOS FORA, NINGUÉM SAI: a loja segue tentando, como antes do
 *     disjuntor existir. Tirar o último parceiro seria transformar um
 *     parceiro instável em loja sem pagamento nenhum — e se ele tiver
 *     voltado, a próxima compra passa.
 */
export function rotaDoPagamento(
  daRegiao: readonly string[],
  foraDoCaminho: readonly string[]
): RotaDoPagamento {
  const ligados = (forma: FormaDoParceiro) =>
    PARCEIROS.filter((p) => daRegiao.includes(p.id) && p.formas.includes(forma)).map((p) => p.id)
  const todos = { pix: ligados("pix"), cartao: ligados("cartao") }
  const dePe = {
    pix: todos.pix.filter((id) => !foraDoCaminho.includes(id)),
    cartao: todos.cartao.filter((id) => !foraDoCaminho.includes(id)),
  }
  if (!dePe.pix.length && !dePe.cartao.length) return { ...todos, fora: [] }
  return {
    ...dePe,
    fora: (["pix", "cartao"] as const).filter((f) => todos[f].length && !dePe[f].length),
  }
}

/**
 * O pagamento de um pedido já fechado, como a tela de obrigado desenha.
 *
 * `estado` é a pergunta que a pessoa faz ao olhar a tela ("e o meu
 * pagamento?"), já respondida: o Pix esperando, o cartão em análise, pago,
 * ou cancelado. `combinar` é o provedor provisório, que não cobra.
 */
export type PagamentoVisivel = {
  estado: "aguardando" | "analise" | "pago" | "cancelado" | "combinar"
  forma: "pix" | "cartao" | null
  pix: { copiaECola: string; imagem: string; expiraEm: string } | null
  cartao: { bandeira: string; final: string; parcelas: number } | null
}

/** Um produto que o checkout oferece: o bump, ou um chip de completar o frete. */
export type Oferta = {
  varianteId: string
  handle: string
  nome: string
  categoria: string
  imagem: string | null
  /** Preço cheio, em reais. */
  preco: number
  /** Com o desconto do bump já aplicado. Igual a `preco` quando não há desconto. */
  precoComDesconto: number
}

/** A oferta do checkout: o produto, e a frase que diz por que ele (`BUMP`, no `conteudo`). */
export type OfertaDoBump = Oferta & { texto: string }

export type CupomAplicado = { codigo: string }

/**
 * O cupom guardado que ainda não entrou (`lib/cupom-pendente.ts`): o do link,
 * ou o de frete grátis esperando a entrega.
 */
export type CupomGuardado = { codigo: string; frete: boolean; soMaisBarato: boolean }

/** A frase do cupom guardado, depois do código — a mesma no checkout e na sacola. */
export function fraseDoGuardado(g: Pick<CupomGuardado, "frete" | "soMaisBarato">): string {
  return g.soMaisBarato
    ? "guardado: frete grátis na entrega econômica — entra quando ela for escolhida."
    : g.frete
      ? "guardado: frete grátis — entra quando você escolher a entrega."
      : "guardado: entra sozinho quando o pedido estiver nas regras dele."
}

export type CheckoutVisivel = {
  id: string
  regiaoId: string
  itens: ItemDoCarrinho[]
  unidades: number
  subtotal: number
  desconto: number
  /** `null` enquanto nenhum método foi escolhido — diferente de zero, que é grátis. */
  frete: number | null
  total: number
  email: string
  documento: string
  entrega: EnderecoVisivel
  /** id da opção de frete já pendurada no carrinho. */
  freteEscolhido: string | null
  cupons: CupomAplicado[]
  /** O cupom guardado que ainda não entrou — `null` quando não há, ou quando já entrou. */
  cupomGuardado: CupomGuardado | null
  /**
   * O produto da oferta do checkout que está MARCADA — o código dela está no
   * carrinho —, ou `null`. É o que mantém a caixinha no mesmo produto depois
   * de marcada: é por ela que se desmarca.
   */
  bumpAplicado: string | null
  /**
   * A oferta oculta que marcou este carrinho (o id dela), ou nada. Com ela,
   * o checkout confere se a oferta ainda vale antes de mostrar o preço
   * (`conferirOferta`, em `lib/oferta-do-carrinho.ts`).
   */
  ofertaOculta?: string | null
}

/**
 * Em que etapa o checkout está, olhando só pro que o carrinho já tem.
 *
 * A etapa sai do ESTADO, não de um contador na tela. Quem recarrega a página
 * no meio, volta do e-mail no dia seguinte ou abre o link em outra aba cai
 * exatamente onde parou, porque é a mesma pergunta feita ao mesmo carrinho —
 * e não um passo guardado em algum lugar que pode divergir dele.
 */
export function etapaDoCarrinho(c: CheckoutVisivel): Etapa {
  if (!c.email || !c.documento) return "contato"
  if (!c.entrega.cep || !c.entrega.rua || !c.entrega.numero || !c.freteEscolhido) return "entrega"
  return "pagamento"
}

export function indiceDaEtapa(etapa: Etapa): number {
  return ETAPAS.indexOf(etapa)
}

/**
 * Quanto falta pro frete grátis, ou zero se já chegou.
 *
 * Conta sobre o SUBTOTAL menos o desconto — que é o `item_total` do Medusa, o
 * mesmo número que a regra de preço do frete usa. Somar as linhas aqui daria
 * quase sempre o mesmo resultado e erraria exatamente onde tem cupom.
 */
export function faltaPraGratis(c: CheckoutVisivel, piso: number): number {
  return Math.max(0, piso - (c.subtotal - c.desconto))
}

/* ── o que as ações devolvem ──────────────────────────────────────────────── */

export type ErrosDoFormulario = Record<string, string>

export type EstadoDaEtapa = {
  ok: boolean
  /** Por campo, pra mensagem ficar embaixo do campo certo. */
  erros: ErrosDoFormulario
  /** Erro que não é de nenhum campo: rede fora, Medusa recusando. */
  mensagem: string
  /**
   * Sobe a cada resposta. Existe porque o Next preserva o estado de
   * `useActionState` ao navegar pra fora e voltar: sem um contador, uma etapa
   * não distingue "a resposta que acabou de chegar" de "o erro que ficou na
   * tela desde ontem".
   */
  rodada: number
  /**
   * O que a pessoa tinha digitado, devolvido tal e qual.
   *
   * O React DÁ RESET no formulário depois que a ação roda — é comportamento
   * de `<form action={…}>`, não bug. Sem isto, quem erra um dígito do CPF vê
   * os outros cinco campos esvaziarem junto, e é aí que se desiste da compra.
   */
  valores?: Record<string, string>
}

/**
 * Mora aqui, e não junto das ações, por uma regra do Next: arquivo com
 * `"use server"` só pode exportar função assíncrona. Constante exportada de lá
 * quebra o build.
 */
export const ESTADO_INICIAL: EstadoDaEtapa = { ok: false, erros: {}, mensagem: "", rodada: 0 }

/**
 * O estado de quando a ação NEM VOLTOU — sem internet, a loja fora do ar (ver
 * `lib/rede.ts`). Devolve o que a pessoa tinha digitado, como o `erro` das
 * ações, e pelo mesmo motivo: o reset do formulário. O token do cartão não
 * volta — é de uso único, e pagar de novo pede outro.
 */
export function estadoSemResposta(
  anterior: EstadoDaEtapa,
  fd: FormData,
  mensagem: string
): EstadoDaEtapa {
  const valores: Record<string, string> = {}
  for (const [chave, valor] of fd.entries()) {
    if (typeof valor === "string" && chave !== "token_cartao") valores[chave] = valor
  }
  return { ok: false, erros: {}, mensagem, rodada: anterior.rodada + 1, valores }
}

/**
 * O estado de quando A PRÓPRIA TELA achou o erro, pelas regras de
 * `lib/passos-do-checkout.ts` — a ação nem foi chamada. A mesma forma do
 * `erro` das ações: o erro embaixo do campo, e o que a pessoa digitou volta
 * (o reset do formulário).
 */
export function estadoComErros(
  anterior: EstadoDaEtapa,
  erros: ErrosDoFormulario,
  fd: FormData
): EstadoDaEtapa {
  return { ...estadoSemResposta(anterior, fd, ""), erros }
}
