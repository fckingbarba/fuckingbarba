"use server"

import type { HttpTypes } from "@medusajs/types"
import { refresh } from "next/cache"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { buscarCep, limparCep } from "@/lib/cep"
import { COOKIE_CARRINHO, lerCarrinho } from "@/lib/carrinho"
import { CAMPOS_CHECKOUT, COOKIE_PEDIDO, OPCOES_COOKIE_PEDIDO } from "@/lib/checkout"
import type { EnderecoVisivel, ErrosDoFormulario, EstadoDaEtapa } from "@/lib/checkout-visivel"
import { conferirDocumento, type Documento } from "@/lib/documento"
import { cliente } from "@/lib/medusa"

/**
 * AS AÇÕES DO CHECKOUT
 *
 * Uma por etapa. Cada uma valida, escreve no Medusa, e devolve erro por campo
 * — nunca exceção: ação que estoura atravessa o boundary do React como "an
 * error occurred", e aí a pessoa que digitou o CEP errado lê isso.
 *
 * ┌─ TODA AÇÃO É UM POST PÚBLICO ──────────────────────────────────────────┐
 * │ Server action não é "código do formulário": é uma rota POST que        │
 * │ qualquer um pode chamar com o corpo que quiser, sem passar por tela    │
 * │ nenhuma. Por isso:                                                     │
 * │                                                                        │
 * │ - o id do carrinho vem SEMPRE do cookie, nunca de campo escondido;     │
 * │ - toda validação que existe no navegador existe de novo aqui;          │
 * │ - nada que a tela mandar decide preço, frete ou desconto.              │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * DEPOIS DE ESCREVER, `refresh()`. Ele re-renderiza a rota no servidor e manda
 * o resultado junto da resposta da ação, então a etapa seguinte já abre com o
 * estado novo, numa ida só. `revalidateTag(tag, "max")` — que o resto do site
 * usa — seria errado aqui: com perfil de revalidação em segundo plano ele
 * marca pra atualizar depois e NÃO re-renderiza nesta resposta, e o frete
 * apareceria com o valor velho.
 */

/* ── o formato da resposta ────────────────────────────────────────────────── */

// `EstadoDaEtapa`, `ErrosDoFormulario` e `ESTADO_INICIAL` moram em
// `checkout-visivel.ts`: arquivo com `"use server"` só pode exportar função
// assíncrona, e o formulário precisa do estado inicial.

const GENERICO = "Não consegui falar com a loja agora. Tenta de novo em instantes."

const EXPIROU = "Sua sacola expirou. Volta pra loja e monta ela de novo."

/**
 * Erro devolve SEMPRE o que foi digitado junto.
 *
 * O React dá reset no `<form action={…}>` depois que a ação roda, então um
 * erro de validação esvaziaria a tela inteira. Os campos leem `valores` antes
 * de ler o carrinho, e o reset devolve o que a pessoa tinha escrito.
 *
 * Só os campos do formulário voltam — o que a pessoa mandou, ela já tem.
 */
function erro(
  anterior: EstadoDaEtapa,
  erros: ErrosDoFormulario,
  mensagem = "",
  fd?: FormData
): EstadoDaEtapa {
  const valores: Record<string, string> = {}
  for (const [chave, valor] of fd?.entries() ?? []) {
    if (typeof valor === "string") valores[chave] = valor
  }
  return { ok: false, erros, mensagem, rodada: anterior.rodada + 1, valores }
}

function certo(anterior: EstadoDaEtapa): EstadoDaEtapa {
  return { ok: true, erros: {}, mensagem: "", rodada: anterior.rodada + 1 }
}

function registrar(e: unknown, contexto: string) {
  console.warn(`[checkout] ${contexto}: ${e instanceof Error ? e.message : String(e)}`)
}

/* ── validações ───────────────────────────────────────────────────────────── */

const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? "").trim()

/**
 * E-mail: só a forma, e de propósito. Dá pra ser muito mais rígido e o ganho é
 * negativo — endereço válido recusado por regex esperta é venda perdida, e
 * endereço inválido que passa a gente descobre no primeiro e-mail que volta.
 * O Medusa também valida, então esta é a primeira de duas peneiras.
 */
const ehEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)

const UFS = new Set([
  "AC",
  "AL",
  "AM",
  "AP",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MG",
  "MS",
  "MT",
  "PA",
  "PB",
  "PE",
  "PI",
  "PR",
  "RJ",
  "RN",
  "RO",
  "RR",
  "RS",
  "SC",
  "SE",
  "SP",
  "TO",
])

/**
 * Telefone brasileiro em 10 ou 11 dígitos, com DDD. O 11º é o 9 do celular.
 * Guardado como +55DDD… porque é o formato que gateway de pagamento e
 * disparador de WhatsApp esperam, e converter na hora de usar é como se
 * esquece de converter em um dos lugares.
 */
function conferirTelefone(v: string): string | null {
  const so = v.replace(/\D+/g, "").replace(/^55(?=\d{10,11}$)/, "")
  if (so.length < 10 || so.length > 11) return null
  if (!/^[1-9]{2}/.test(so)) return null
  return `+55${so}`
}

/* ── o carrinho, sempre do cookie ─────────────────────────────────────────── */

async function carrinhoAtual() {
  const sdk = cliente()
  if (!sdk) return null
  const carrinho = await lerCarrinho(CAMPOS_CHECKOUT)
  return carrinho ? { sdk, carrinho } : null
}

/**
 * Monta o endereço do Medusa a partir do que já está gravado mais o que mudou.
 *
 * SEMPRE O ENDEREÇO INTEIRO, nunca um pedaço: o `POST /store/carts/:id`
 * SUBSTITUI o endereço, não mescla. Mandar só o telefone apagaria a rua.
 *
 * O bairro e o número não têm campo no Medusa — o modelo dele é o endereço
 * americano. Então vão duas vezes: escritos dentro de `address_1`/`address_2`,
 * pra etiqueta e lista de separação saírem legíveis sem ninguém remontar a
 * frase; e em `metadata`, em campos separados, que é o que a NF-e e a cotação
 * por CEP vão querer ler depois.
 */
function montarEndereco(e: EnderecoVisivel, documento?: Documento) {
  const complementoEBairro = [e.complemento, e.bairro].filter(Boolean).join(" — ")

  return {
    first_name: e.nome,
    last_name: e.sobrenome,
    phone: e.telefone,
    address_1: [e.rua, e.numero].filter(Boolean).join(", "),
    address_2: complementoEBairro,
    city: e.cidade,
    province: e.uf,
    postal_code: e.cep,
    country_code: "br",
    metadata: {
      rua: e.rua,
      numero: e.numero,
      complemento: e.complemento,
      bairro: e.bairro,
      ...(documento ? { documento } : {}),
    },
  }
}

/** O endereço gravado, de volta no formato do formulário. */
function lerEndereco(e: HttpTypes.StoreCartAddress | null | undefined): EnderecoVisivel {
  const meta = (e?.metadata ?? {}) as Record<string, unknown>
  const s = (v: unknown) => (typeof v === "string" ? v : "")

  return {
    nome: e?.first_name ?? "",
    sobrenome: e?.last_name ?? "",
    telefone: e?.phone ?? "",
    cep: e?.postal_code ?? "",
    rua: s(meta.rua) || (e?.address_1 ?? "").replace(/,\s*[^,]*$/, ""),
    numero: s(meta.numero),
    complemento: s(meta.complemento),
    bairro: s(meta.bairro),
    cidade: e?.city ?? "",
    uf: (e?.province ?? "").toUpperCase(),
  }
}

/** O documento guardado no endereço de cobrança, se houver. */
function documentoGravado(e: HttpTypes.StoreCartAddress | null | undefined): Documento | undefined {
  const doc = (e?.metadata as Record<string, unknown> | undefined)?.documento
  if (doc && typeof doc === "object" && "valor" in doc && "tipo" in doc) {
    return doc as Documento
  }
  return undefined
}

/* ── 1. contato ───────────────────────────────────────────────────────────── */

/**
 * E-mail, nome, telefone e documento.
 *
 * O DOCUMENTO VAI NO ENDEREÇO DE COBRANÇA, e isto foi medido, não escolhido:
 * o `metadata` do CARRINHO é descartado quando o carrinho vira pedido — o
 * pedido nasce com `metadata: null`. O do endereço sobrevive. Guardar o CPF no
 * carrinho seria perdê-lo exatamente no instante em que ele passa a valer, e
 * descobrir isso no dia de emitir a primeira nota.
 *
 * (`apps/backend/ferramentas/conferir-pedido.mjs` trava as duas metades disso.)
 */
export async function salvarContato(anterior: EstadoDaEtapa, fd: FormData): Promise<EstadoDaEtapa> {
  const email = texto(fd, "email").toLowerCase()
  const nome = texto(fd, "nome")
  const sobrenome = texto(fd, "sobrenome")
  const telefoneCru = texto(fd, "telefone")
  const documentoCru = texto(fd, "documento")

  const erros: ErrosDoFormulario = {}
  if (!ehEmail(email)) {
    erros.email = "Escreve um e-mail que você abre — é por ele que as novidades do pedido chegam."
  }
  if (!nome) erros.nome = "Falta o nome."
  if (!sobrenome) erros.sobrenome = "Falta o sobrenome."

  const telefone = conferirTelefone(telefoneCru)
  if (!telefone) erros.telefone = "Telefone com DDD, 10 ou 11 dígitos."

  const doc = conferirDocumento(documentoCru)
  if (!doc.ok) erros.documento = doc.erro

  if (!telefone || !doc.ok || Object.keys(erros).length) return erro(anterior, erros, "", fd)

  const atual = await carrinhoAtual()
  if (!atual) return erro(anterior, {}, EXPIROU, fd)

  // Nome e telefone entram nos DOIS endereços; o documento, só na cobrança.
  const entrega: EnderecoVisivel = {
    ...lerEndereco(atual.carrinho.shipping_address),
    nome,
    sobrenome,
    telefone,
  }

  try {
    await atual.sdk.store.cart.update(
      atual.carrinho.id,
      {
        email,
        shipping_address: montarEndereco(entrega),
        billing_address: montarEndereco(entrega, doc.documento),
      },
      { fields: CAMPOS_CHECKOUT }
    )
  } catch (e) {
    registrar(e, "contato")
    return erro(anterior, {}, GENERICO, fd)
  }

  refresh()
  return certo(anterior)
}

/* ── 2. entrega ───────────────────────────────────────────────────────────── */

export async function salvarEntrega(anterior: EstadoDaEtapa, fd: FormData): Promise<EstadoDaEtapa> {
  const cep = limparCep(texto(fd, "cep"))
  const rua = texto(fd, "rua")
  const numero = texto(fd, "numero")
  const complemento = texto(fd, "complemento")
  const bairro = texto(fd, "bairro")
  const cidade = texto(fd, "cidade")
  const uf = texto(fd, "uf").toUpperCase()

  const erros: ErrosDoFormulario = {}
  if (!cep) erros.cep = "CEP tem 8 dígitos."
  if (!rua) erros.rua = "Falta a rua."
  if (!numero) erros.numero = "Falta o número. Se não tem, escreve S/N."
  if (!bairro) erros.bairro = "Falta o bairro."
  if (!cidade) erros.cidade = "Falta a cidade."
  if (!UFS.has(uf)) erros.uf = "Estado em duas letras (SP, RJ, MG…)."

  if (Object.keys(erros).length) return erro(anterior, erros, "", fd)

  const atual = await carrinhoAtual()
  if (!atual) return erro(anterior, {}, EXPIROU, fd)

  const entrega: EnderecoVisivel = {
    ...lerEndereco(atual.carrinho.shipping_address),
    cep,
    rua,
    numero,
    complemento,
    bairro,
    cidade,
    uf,
  }

  // A cobrança acompanha a entrega, MENOS o documento: ele é do titular e não
  // muda de dono porque o endereço mudou.
  const doc = documentoGravado(atual.carrinho.billing_address)

  try {
    await atual.sdk.store.cart.update(
      atual.carrinho.id,
      {
        shipping_address: montarEndereco(entrega),
        billing_address: montarEndereco(entrega, doc),
      },
      { fields: CAMPOS_CHECKOUT }
    )
  } catch (e) {
    registrar(e, "entrega")
    return erro(anterior, {}, GENERICO, fd)
  }

  refresh()
  return certo(anterior)
}

/* ── 3. frete ─────────────────────────────────────────────────────────────── */

export async function escolherFrete(anterior: EstadoDaEtapa, fd: FormData): Promise<EstadoDaEtapa> {
  const opcao = texto(fd, "opcao")
  if (!opcao) return erro(anterior, { opcao: "Escolhe uma forma de entrega." }, "", fd)

  const atual = await carrinhoAtual()
  if (!atual) return erro(anterior, {}, EXPIROU, fd)

  try {
    await atual.sdk.store.cart.addShippingMethod(
      atual.carrinho.id,
      { option_id: opcao },
      { fields: CAMPOS_CHECKOUT }
    )
  } catch (e) {
    registrar(e, `frete ${opcao}`)
    return erro(anterior, {}, "Essa forma de entrega não está mais disponível. Escolhe outra.", fd)
  }

  refresh()
  return certo(anterior)
}

/* ── 4. pagamento, e o pedido ─────────────────────────────────────────────── */

/**
 * Onde o pedido nasce.
 *
 * A ORDEM IMPORTA: sessão de pagamento primeiro, `complete` depois. O Medusa
 * recusa fechar carrinho sem coleção de pagamento iniciada — e recusa com a
 * MESMA mensagem quando falta e-mail, endereço ou frete, porque confere o
 * pagamento primeiro e desiste ali. Ou seja, a mensagem dele não serve pra
 * dizer à pessoa o que falta; quem sabe em que etapa o checkout está é o
 * checkout, olhando pro próprio carrinho.
 *
 * DUAS VEZES NÃO FAZ DOIS PEDIDOS: o Medusa devolve o mesmo pedido pro
 * carrinho já fechado. O botão pode ser clicado duas vezes sem medo — o que é
 * bom, porque numa conexão ruim ele vai ser.
 */
export async function finalizar(anterior: EstadoDaEtapa, fd: FormData): Promise<EstadoDaEtapa> {
  const provedor = texto(fd, "provedor")
  if (!provedor) return erro(anterior, { provedor: "Escolhe como pagar." }, "", fd)

  const atual = await carrinhoAtual()
  if (!atual) return erro(anterior, {}, EXPIROU, fd)

  const { sdk, carrinho } = atual

  // Falta alguma coisa? Diz o que falta, em vez de deixar o Medusa recusar com
  // a mensagem errada.
  if (!carrinho.email) return erro(anterior, {}, "Falta o seu contato lá em cima.", fd)
  if (!carrinho.shipping_address?.postal_code)
    return erro(anterior, {}, "Falta o endereço de entrega.", fd)
  if (!carrinho.shipping_methods?.length) return erro(anterior, {}, "Falta escolher a entrega.", fd)

  let pedidoId: string
  try {
    await sdk.store.payment.initiatePaymentSession(carrinho, { provider_id: provedor })
    const resposta = await sdk.store.cart.complete(carrinho.id)

    if (resposta.type !== "order") {
      const motivo = "error" in resposta ? String(resposta.error?.message ?? "") : ""
      registrar(new Error(motivo || "complete não devolveu pedido"), "finalizar")
      return erro(
        anterior,
        {},
        "Não consegui fechar o pedido. Nada foi cobrado — tenta de novo em instantes.",
        fd
      )
    }
    pedidoId = resposta.order.id
  } catch (e) {
    registrar(e, "finalizar")
    return erro(anterior, {}, "Não consegui fechar o pedido. Nada foi cobrado — tenta de novo.", fd)
  }

  const jar = await cookies()
  // A sacola acabou. Sem isto, quem comprou volta pro site e encontra a
  // própria compra parada na gaveta.
  jar.delete(COOKIE_CARRINHO)
  // O crachá de quem comprou — a tela de obrigado só mostra endereço e
  // documento pra quem tem ele.
  jar.set(COOKIE_PEDIDO, pedidoId, OPCOES_COOKIE_PEDIDO)

  // `redirect` LANÇA — nada depois desta linha roda, e ela fica fora de
  // qualquer try/catch, senão o catch engole a navegação.
  redirect(`/checkout/obrigado/${pedidoId}`)
}

/* ── o atalho do CEP ──────────────────────────────────────────────────────── */

export type CepEncontrado = {
  encontrado: boolean
  rua: string
  bairro: string
  cidade: string
  uf: string
}

/**
 * Preenche rua, bairro, cidade e estado a partir do CEP.
 *
 * `encontrado: false` NÃO é erro e não trava nada: quer dizer só que o atalho
 * não funcionou — CEP novo, zona rural, ViaCEP fora do ar — e que a pessoa
 * digita à mão, como faria se o atalho não existisse.
 */
export async function consultarCep(cep: string): Promise<CepEncontrado> {
  const vazio = { encontrado: false, rua: "", bairro: "", cidade: "", uf: "" }
  const limpo = limparCep(cep)
  if (!limpo) return vazio

  const achado = await buscarCep(limpo)
  if (!achado) return vazio

  return {
    encontrado: true,
    rua: achado.logradouro,
    bairro: achado.bairro,
    cidade: achado.cidade,
    uf: achado.uf,
  }
}
