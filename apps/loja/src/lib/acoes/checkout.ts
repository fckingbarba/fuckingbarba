"use server"

import type { HttpTypes } from "@medusajs/types"
import { refresh } from "next/cache"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { after } from "next/server"
import { codigoDoBump, ehCodigoDeBump } from "@/lib/bump"
import { buscarCep, limparCep } from "@/lib/cep"
import {
  lerCarrinho,
  pedidoDoCarrinho,
  pedidoDoCarrinhoFechado,
  type Carrinho,
} from "@/lib/carrinho"
import {
  abrirPedido,
  ajustarAoEstoque,
  CAMPOS_CHECKOUT,
  COOKIE_PEDIDO,
  donoDoCarrinho,
  ehFaltaDeEstoque,
  garantirDonoDoCarrinho,
  lerCracha,
  registrarOferta,
} from "@/lib/checkout"
import {
  PROVEDOR_PAGARME,
  PROVEDOR_PROVISORIO,
  type EnderecoVisivel,
  type ErrosDoFormulario,
  type EstadoDaEtapa,
} from "@/lib/checkout-visivel"
import { guardarDaCompra, lerCliente, lerSessao } from "@/lib/conta"
import { conferirDocumento, type Documento } from "@/lib/documento"
import { emReais } from "@/lib/formato"
import { cepDeOutraCidade, comCepNovo, ehUf, lerEndereco, montarEndereco } from "@/lib/endereco"
import { cliente } from "@/lib/medusa"
import { depoisDaRecusa, entradaDoCarrinho } from "@/lib/pagamento"
import { lerToken } from "@/lib/sessao"
import { CHECKOUT_ABERTO } from "@/lib/site"
import { conferirTelefone } from "@/lib/telefone"

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

/** Base pras ações que não são de formulário (chips, bump, remover cupom). */
const ESTADO_VAZIO: EstadoDaEtapa = { ok: false, erros: {}, mensagem: "", rodada: 0 }

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

/** Dinheiro se compara em centavos: 145.255 e 145.26 são o mesmo total na tela. */
const emCentavos = (valor: number) => Math.round(valor * 100)

/**
 * E-mail: só a forma, e de propósito. Dá pra ser muito mais rígido e o ganho é
 * negativo — endereço válido recusado por regex esperta é venda perdida, e
 * endereço inválido que passa a gente descobre no primeiro e-mail que volta.
 * O Medusa também valida, então esta é a primeira de duas peneiras.
 */
const ehEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)

/**
 * O maior e-mail que o Pagar.me aceita. Acima disso ele recusa o pedido
 * inteiro — e a loja só descobria no "pagar", com "não consegui iniciar o
 * pagamento" e nenhuma pista do porquê (24/09). Recusado aqui, no passo 1, a
 * pessoa lê o motivo embaixo do campo. (O backend confere de novo, em
 * `modules/pagarme/pedido.ts`.)
 */
const EMAIL_MAXIMO = 64

/* ── o carrinho, sempre do cookie ─────────────────────────────────────────── */

async function carrinhoAtual() {
  const sdk = cliente()
  if (!sdk) return null
  const carrinho = await lerCarrinho(CAMPOS_CHECKOUT)
  return carrinho ? { sdk, carrinho } : null
}

/*
 * `montarEndereco` e `lerEndereco` moram em `lib/endereco.ts`: a sacola grava
 * o CEP no carrinho também, e as duas precisam traduzir o endereço do mesmo
 * jeito. O porquê de cada campo está lá.
 */

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
  } else if (email.length > EMAIL_MAXIMO) {
    erros.email = `Esse e-mail passa de ${EMAIL_MAXIMO} caracteres, o limite do pagamento. Usa outro, por favor.`
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
  if (!ehUf(uf)) erros.uf = "Estado em duas letras (SP, RJ, MG…)."

  if (Object.keys(erros).length) return erro(anterior, erros, "", fd)

  /*
    O CEP É DESTA CIDADE? Trocar o CEP e confirmar antes de a busca voltar
    gravava o CEP novo com a rua e a cidade do antigo — "Avenida Paulista,
    São Paulo" com um CEP do Rio (achado em 24/09). A tela agora trava o envio
    durante a busca; isto é a segunda peneira, pra quem chega por outro
    caminho. Só recusa com certeza: sem resposta do ViaCEP, passa.
  */
  const doCep = await buscarCep(cep)
  if (doCep && cepDeOutraCidade(doCep, cidade, uf)) {
    return erro(
      anterior,
      { cep: `Esse CEP é de ${doCep.cidade}/${doCep.uf}. Confere o CEP e a cidade.` },
      "",
      fd
    )
  }

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

  /**
   * O FRETE VAI JUNTO, se veio no formulário.
   *
   * A primeira opção da lista aparece marcada na TELA sem estar no
   * carrinho — ninguém clicou, então nada foi gravado. Sem isto, quem não
   * tocasse nos rádios salvava o endereço e continuava no passo 2, porque o
   * checkout olha pro carrinho pra saber onde está e lá não havia frete
   * nenhum. O bug some porque o rádio mora dentro deste mesmo formulário.
   */
  const opcao = texto(fd, "opcao")
  if (opcao) {
    try {
      await atual.sdk.store.cart.addShippingMethod(atual.carrinho.id, { option_id: opcao })
    } catch (e) {
      registrar(e, `frete junto do endereço ${opcao}`)
      return erro(
        anterior,
        {},
        "Essa forma de entrega não está mais disponível. Escolhe outra.",
        fd
      )
    }
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
 * O IP de quem está comprando, pra análise de fraude do Pagar.me. Na Vercel é
 * o primeiro do `x-forwarded-for`. Sem ele o pedido segue — é um sinal a
 * mais pra antifraude, não uma exigência.
 */
async function ipDeQuemCompra(): Promise<string | null> {
  const h = await headers()
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || ""
  return ip || null
}

/**
 * Onde o pedido nasce — e, com o Pagar.me, onde ele é cobrado.
 *
 * A ORDEM IMPORTA: sessão de pagamento primeiro, `complete` depois. O Medusa
 * recusa fechar carrinho sem coleção de pagamento iniciada — e recusa com a
 * MESMA mensagem quando falta e-mail, endereço ou frete, porque confere o
 * pagamento primeiro e desiste ali. Ou seja, a mensagem dele não serve pra
 * dizer à pessoa o que falta; quem sabe em que etapa o checkout está é o
 * checkout, olhando pro próprio carrinho.
 *
 * ┌─ O QUE CHEGA DA TELA, E O QUE NÃO CHEGA ───────────────────────────────┐
 * │ Da tela vem a ESCOLHA: Pix ou cartão, quantas parcelas, e — no cartão  │
 * │ — o token que o navegador trocou com o Pagar.me. O número do cartão    │
 * │ nunca: os campos dele não têm `name`, e o token é o que sobrou. Quem   │
 * │ compra, o quê e pra onde sai do CARRINHO, lido aqui do Medusa.         │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * CADA TENTATIVA ABRE UMA SESSÃO NOVA. O token do cartão é de uso único, e a
 * sessão anterior — a do cartão recusado, a do Pix que a pessoa desistiu de
 * pagar — é apagada pelo Medusa ao abrir a nova (e o provedor cancela o Pix
 * dela no Pagar.me). O botão fica travado enquanto a ação roda: duas
 * finalizações ao mesmo tempo disputariam a mesma sessão.
 */
export async function finalizar(anterior: EstadoDaEtapa, fd: FormData): Promise<EstadoDaEtapa> {
  const provedor = texto(fd, "provedor")
  const forma = texto(fd, "forma")
  const token = texto(fd, "token_cartao")
  const parcelas = Number.parseInt(texto(fd, "parcelas") || "1", 10)
  // O token já foi gasto (ou vai ser agora): não volta pra tela no `valores`.
  fd.delete("token_cartao")

  if (!provedor) return erro(anterior, { provedor: "Escolhe como pagar." }, "", fd)
  // A tela já não oferece o provisório com o checkout aberto; a ação é um
  // POST público, então confere de novo — pedido que não cobra, não entra.
  if (CHECKOUT_ABERTO && provedor === PROVEDOR_PROVISORIO) {
    return erro(
      anterior,
      {},
      "O pagamento pelo site está fora do ar agora. Chama a gente no WhatsApp que a gente fecha o pedido por lá.",
      fd
    )
  }

  const cobra = provedor === PROVEDOR_PAGARME
  if (cobra && forma !== "pix" && forma !== "cartao") {
    return erro(anterior, { forma: "Escolhe Pix ou cartão." }, "", fd)
  }
  if (cobra && forma === "cartao" && !/^token_[A-Za-z0-9]+$/.test(token)) {
    return erro(
      anterior,
      {},
      "Não consegui validar o cartão. Confere os dados e tenta de novo — nada foi cobrado.",
      fd
    )
  }

  const atual = await carrinhoAtual()
  if (!atual) {
    // O segundo clique depois de uma resposta perdida: o pedido fechou, e a
    // pessoa leu "não consegui confirmar". Leva pra ele, sem cobrar de novo.
    const jaFechado = await pedidoDoCarrinhoFechado()
    if (jaFechado) return abrirPedido(jaFechado)
    /*
      A OUTRA ABA JÁ PAGOU. As abas dividem os cookies: quando uma fecha o
      pedido, a sacola sai do cookie e o crachá do pedido entra (`abrirPedido`)
      — pras duas. A que ficou aberta ainda mostrava o carrinho, e o clique
      dela lia "Sua sacola expirou" com o pedido feito (24/09). O crachá diz
      de que carrinho o pedido saiu: se é o desta tela, ela vai pro mesmo
      pedido. Não abre nada novo — o crachá já estava neste navegador.
    */
    const cracha = lerCracha((await cookies()).get(COOKIE_PEDIDO)?.value)
    if (cracha?.carrinho && cracha.carrinho === texto(fd, "carrinho_visto")) {
      redirect(`/checkout/obrigado/${cracha.pedido}`)
    }
    return erro(anterior, {}, EXPIROU, fd)
  }

  const { sdk } = atual
  let { carrinho } = atual

  // Falta alguma coisa? Diz o que falta, em vez de deixar o Medusa recusar com
  // a mensagem errada.
  if (!carrinho.email) return erro(anterior, {}, "Falta o seu contato lá em cima.", fd)
  if (!carrinho.shipping_address?.postal_code)
    return erro(anterior, {}, "Falta o endereço de entrega.", fd)
  if (!carrinho.shipping_methods?.length) return erro(anterior, {}, "Falta escolher a entrega.", fd)

  /*
    O PEDIDO NASCE NA CONTA ABERTA. O checkout já passou o carrinho pro nome
    dela ao abrir (`preencherDaConta`); isto cobre quem entrou na conta em
    outra aba com o checkout aberto e clicou em pagar sem mais nada no meio.
    O token só diz QUEM está logado — quem confere é o Medusa, na troca.

    Trocar de dono recalcula o carrinho. Se o total mudasse (preço de grupo
    de cliente, que a loja não usa hoje), a pessoa pagaria um valor que não
    viu: aí ela volta pro resumo, com o total novo, antes de cobrar.
  */
  const sessao = await lerSessao()
  const eu = lerToken(sessao)?.actor_id
  if (sessao && typeof eu === "string" && donoDoCarrinho(carrinho) !== eu) {
    const leitura = await lerCliente()
    if (
      leitura.estado === "ok" &&
      (await garantirDonoDoCarrinho(carrinho, sessao, leitura.cliente))
    ) {
      const relido = await lerCarrinho(CAMPOS_CHECKOUT)
      if (relido && Number(relido.total) !== Number(carrinho.total)) {
        refresh()
        return erro(
          anterior,
          {},
          "O total do pedido mudou. Confere o resumo e clica em pagar de novo.",
          fd
        )
      }
      if (relido) carrinho = relido
    }
  }

  /*
    O TOTAL QUE A PESSOA VIU É O QUE SE COBRA. O botão diz "Pagar R$ X" com o
    total da última vez que a tela desenhou, e o carrinho pode ter mudado
    depois: um item posto pela sacola em outra aba, a seta de voltar do
    navegador devolvendo um checkout guardado, um cupom tirado no mesmo
    instante do clique. Sem esta conferência o cartão era autorizado pelo total
    novo sem ninguém ver — R$ 128,50 com o botão dizendo R$ 73,60 (24/09).
    Diferente, nada é cobrado: a tela redesenha com o total de agora e a
    pessoa clica de novo. Sem o campo (aba aberta antes do deploy), não confere.
  */
  const visto = texto(fd, "total_visto")
  if (visto && emCentavos(Number(visto)) !== emCentavos(Number(carrinho.total))) {
    refresh()
    return erro(
      anterior,
      {},
      `O total do pedido mudou pra ${emReais(Number(carrinho.total))}. ` +
        "Confere o resumo e clica em pagar de novo — nada foi cobrado.",
      fd
    )
  }

  let dados: Record<string, unknown> | undefined
  if (cobra) {
    const montada = entradaDoCarrinho(carrinho, {
      forma: forma as "pix" | "cartao",
      parcelas: Number.isInteger(parcelas) && parcelas > 0 ? parcelas : 1,
      token: forma === "cartao" ? token : null,
      ip: await ipDeQuemCompra(),
    })
    if (!montada.ok) return erro(anterior, {}, montada.mensagem, fd)
    dados = { entrada: montada.entrada }
  }

  try {
    await sdk.store.payment.initiatePaymentSession(carrinho, {
      provider_id: provedor,
      ...(dados ? { data: dados } : {}),
    })
  } catch (e) {
    registrar(e, "abrir a sessão de pagamento")
    // A outra aba fechou o pedido no mesmo instante ("Cart … is already
    // completed"): é ele, e não "nada foi cobrado, tenta de novo".
    const jaFechado = await pedidoDoCarrinhoFechado()
    if (jaFechado) return abrirPedido(jaFechado)
    return erro(
      anterior,
      {},
      "Não consegui iniciar o pagamento. Nada foi cobrado — tenta de novo em instantes.",
      fd
    )
  }

  let pedidoId: string | null = null
  let recusa = ""
  try {
    const resposta = await sdk.store.cart.complete(carrinho.id)
    if (resposta.type === "order") pedidoId = resposta.order.id
    else {
      recusa = String(resposta.error?.message ?? "sem pedido")
      registrar(new Error(recusa), "finalizar")
    }
  } catch (e) {
    // Cartão recusado chega AQUI, como 400 — não como `type: "cart"`. O
    // Medusa só devolve 200 pro erro genérico de autorização; a recusa de
    // um provedor que respondeu "error" sobe como exceção.
    recusa = e instanceof Error ? e.message : String(e)
    registrar(e, "finalizar")
  }

  if (!pedidoId) {
    /*
      Sem pedido na resposta, por um de três motivos bem diferentes:

      • o carrinho FECHOU, e a resposta é que se perdeu (a conexão entre a
        Vercel e o Railway caiu no meio). Perguntar qual pedido saiu dele é
        seguro — `pedidoDoCarrinho` só lê, não cobra de novo;
      • o estoque acabou (`aoFaltarEstoque`, logo abaixo) — o Medusa recusa
        na reserva, antes de autorizar o pagamento;
      • o pagamento foi recusado — e aí a frase certa está gravada na sessão.
    */
    const depois = await depoisDaRecusa(sdk, carrinho.id)
    if (!depois.fechado && ehFaltaDeEstoque(recusa)) {
      return aoFaltarEstoque(anterior, fd, carrinho)
    }
    if (depois.fechado) {
      pedidoId = await pedidoDoCarrinho(carrinho.id)
      if (!pedidoId) {
        return erro(
          anterior,
          {},
          "Seu pedido foi registrado, mas não consegui abrir a confirmação. Não faz de novo: " +
            "chama a gente no WhatsApp com o seu e-mail, que a gente confirma na hora.",
          fd
        )
      }
    } else {
      /*
        Sem recusa gravada e sem pedido, com cobrança no meio, NÃO dá pra
        dizer "nada foi cobrado": a resposta pode ter se perdido com o
        Medusa ainda falando com o Pagar.me. A frase manda esperar e clicar
        de novo — e o clique seguinte é seguro nos dois casos: se o pedido
        fechou, `pedidoDoCarrinhoFechado` leva pra ele; se não fechou, é uma
        tentativa nova, e uma cobrança perdida da primeira é estornada pela
        conciliação (ver "ÓRFÃOS" em `conciliar-pagamentos.ts`).
      */
      return erro(
        anterior,
        {},
        depois.recusa ??
          (cobra
            ? "Não consegui confirmar o pagamento. Espera um minuto e clica em pagar de novo: " +
              "se ele tiver passado, você vai direto pro pedido, sem pagar duas vezes."
            : "Não consegui fechar o pedido. Nada foi cobrado — tenta de novo em instantes."),
        fd
      )
    }
  }

  /*
    O ENDEREÇO E OS DADOS DESTA COMPRA FICAM NA CONTA — com o token de quem
    está nela, e DEPOIS da resposta: a tela de obrigado não espera por isso,
    e uma falha ali não é falha da compra. Ver `guardarDaCompra`.
  */
  if (sessao) {
    const compra = {
      entrega: lerEndereco(carrinho.shipping_address),
      documento: documentoGravado(carrinho.billing_address) ?? null,
    }
    after(() => guardarDaCompra(sessao, compra))
  }

  /*
    E A OFERTA DO CHECKOUT APRENDE COM ESTE PEDIDO: o que ela mostrou, e se a
    pessoa marcou. Também depois da resposta — ver `registrarOferta`.
  */
  const pedido = pedidoId
  const fechado = carrinho
  after(() => registrarOferta(pedido, fechado))

  return abrirPedido(pedidoId)
}

/** "a, b e c" */
function emLista(partes: string[]): string {
  return partes.length < 2
    ? (partes[0] ?? "")
    : `${partes.slice(0, -1).join(", ")} e ${partes.at(-1)}`
}

/**
 * O "pagar" recusado por falta de estoque: o pedido desce até o que tem e a
 * pessoa lê o que mudou (`ajustarAoEstoque`, em `lib/checkout.ts`). Nada foi
 * cobrado — o Medusa recusa na reserva do estoque, antes de autorizar.
 */
async function aoFaltarEstoque(
  anterior: EstadoDaEtapa,
  fd: FormData,
  carrinho: Carrinho
): Promise<EstadoDaEtapa> {
  const ajuste = await ajustarAoEstoque(carrinho)
  refresh()
  if (ajuste.tipo === "ajustado") {
    const agora = await lerCarrinho(CAMPOS_CHECKOUT)
    const total = agora ? ` O total agora é ${emReais(Number(agora.total))}:` : ""
    return erro(
      anterior,
      {},
      `Acabou o estoque enquanto você finalizava — ${emLista(ajuste.frases)}.${total} ` +
        "confere o resumo e clica em pagar de novo. Nada foi cobrado.",
      fd
    )
  }
  if (ajuste.tipo === "esgotou-tudo") {
    const esgotou = ajuste.nomes.length === 1 ? "esgotou" : "esgotaram"
    return erro(
      anterior,
      {},
      `${emLista(ajuste.nomes)} ${esgotou} enquanto você finalizava. Nada foi cobrado — ` +
        "se quiser, escolhe outro produto na loja.",
      fd
    )
  }
  if (ajuste.tipo === "coube") {
    return erro(
      anterior,
      {},
      "O estoque mudou no meio do caminho, e já deu certo de novo. Clica em pagar de novo — " +
        "nada foi cobrado.",
      fd
    )
  }
  return erro(
    anterior,
    {},
    "Um produto do seu pedido esgotou enquanto você finalizava. Nada foi cobrado — volta pra " +
      "sacola e confere as quantidades.",
    fd
  )
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
 * O mesmo do `CepEncontrado`, mais a única coisa que a tela do checkout
 * precisa saber além do endereço: SE O CEP CHEGOU NO CARRINHO.
 *
 * ┌─ POR QUE ISTO PRECISA SUBIR PRA TELA ──────────────────────────────────┐
 * │ Quem cota a entrega é a página, no servidor, lendo o endereço do       │
 * │ CARRINHO. Se a gravação falhar — rede caiu no meio, Medusa fora do ar  │
 * │ — o carrinho continua sem CEP, a cotação volta vazia, e a tela dizia   │
 * │ "Não temos entrega pra esse CEP ainda". Isso é mentira: o CEP está     │
 * │ certo, a loja entrega lá, e a pessoa ia embora achando que o endereço  │
 * │ dela é que era o problema — ou pior, chamava no WhatsApp pra perguntar │
 * │ de uma entrega que sempre existiu.                                     │
 * │                                                                        │
 * │ `gravado: false` também quando não há carrinho nenhum, pelo mesmo      │
 * │ motivo: o CEP não chegou em lugar nenhum, então a lista vazia não fala │
 * │ sobre este CEP.                                                        │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * Tipo próprio, e não um campo a mais no `CepEncontrado`, porque a conta usa
 * o mesmo tipo (`consultarCepDaConta`) e lá não existe carrinho pra gravar.
 */
export type CepDoCheckout = CepEncontrado & { gravado: boolean }

/**
 * Preenche rua, bairro, cidade e estado a partir do CEP.
 *
 * `encontrado: false` NÃO é erro e não trava nada: quer dizer só que o atalho
 * não funcionou — CEP novo, zona rural, ViaCEP fora do ar — e que a pessoa
 * digita à mão, como faria se o atalho não existisse.
 */
export async function consultarCep(cep: string): Promise<CepDoCheckout> {
  const vazio = { encontrado: false, gravado: false, rua: "", bairro: "", cidade: "", uf: "" }
  const limpo = limparCep(cep)
  if (!limpo) return vazio

  const achado = await buscarCep(limpo)

  /*
    ┌─ O CEP VAI PRO CARRINHO ANTES DE O ENDEREÇO ESTAR COMPLETO ──────────┐
    │ Com frete fixo, as opções existiam antes do endereço e esta função   │
    │ só preenchia campos. Com cotação ao vivo elas não existem: a         │
    │ transportadora precisa saber pra onde, e o Medusa lê o "pra onde" do │
    │ endereço do CARRINHO — não do formulário que ainda está aberto.      │
    │                                                                       │
    │ Então o CEP é gravado aqui, sozinho, e o resto do endereço continua  │
    │ sendo gravado no `salvarEntrega`. Gravar um endereço pela metade     │
    │ parece sujeira, mas é o que ele é de verdade neste instante: a       │
    │ pessoa digitou o CEP e ainda não digitou o número.                   │
    │                                                                       │
    │ Cotação que a transportadora recusa não vira erro de tela: devolve   │
    │ lista vazia, e a tela sabe dizer "não temos entrega pra esse CEP     │
    │ ainda". GRAVAÇÃO que falha é outra coisa, e volta como              │
    │ `gravado: false` — ver o tipo acima.                                 │
    └───────────────────────────────────────────────────────────────────────┘
  */
  let gravado = false
  const atual = await carrinhoAtual()
  if (atual) {
    try {
      // CEP novo apaga o número e o complemento da rua antiga — ver `comCepNovo`.
      const entrega = comCepNovo(lerEndereco(atual.carrinho.shipping_address), limpo, achado)
      await atual.sdk.store.cart.update(
        atual.carrinho.id,
        { shipping_address: montarEndereco(entrega) },
        { fields: CAMPOS_CHECKOUT }
      )
      /*
        E O `refresh()` é o que faz as opções aparecerem.

        Quem cota é a página, no servidor, olhando o endereço do carrinho.
        Gravar o CEP sem avisar ninguém deixaria a tela com a lista vazia
        que ela tinha antes — e a pessoa esperando por uma entrega que já
        tinha sido cotada. É o mesmo `refresh()` do chip de oferta: qualquer
        mudança no carrinho refaz a cotação, porque o preço do frete depende
        do que tem dentro dele.
      */
      refresh()
      gravado = true
    } catch (e) {
      registrar(e, "cep no carrinho")
    }
  }

  if (!achado) return { ...vazio, gravado }

  return {
    encontrado: true,
    gravado,
    rua: achado.logradouro,
    bairro: achado.bairro,
    cidade: achado.cidade,
    uf: achado.uf,
  }
}

/* ── cupom ────────────────────────────────────────────────────────────────── */

/**
 * Manda o código pro Medusa e conta o que ele respondeu.
 *
 * QUEM VALIDA É O MEDUSA. Não existe lista de cupom neste código, e não pode
 * existir: cupom escrito no navegador é desconto que qualquer um lê no
 * código-fonte e aplica sozinho. A tela só pergunta e mostra a resposta.
 *
 * O Medusa responde 400 pra código que não existe, e também aceita 200 sem
 * aplicar nada quando o código existe mas não vale pra este carrinho. Os dois
 * casos dão no mesmo pra quem está comprando — então a checagem que vale é
 * RELER o carrinho e ver se o código entrou na lista.
 *
 * MAIÚSCULA E MINÚSCULA NÃO IMPORTAM PRA QUEM DIGITA, e importam pro Medusa:
 * ele procura o código exatamente como foi cadastrado. A loja punha tudo em
 * maiúsculas, e um cupom cadastrado como "bemvindo10" nunca valia (24/09).
 * Agora vai como foi digitado, depois em maiúsculas, depois em minúsculas —
 * a primeira que entrar vale, e a conferência não liga pra caixa.
 */
export async function aplicarCupom(anterior: EstadoDaEtapa, fd: FormData): Promise<EstadoDaEtapa> {
  const digitado = texto(fd, "cupom")
  if (!digitado) return erro(anterior, { cupom: "Escreve o código." }, "", fd)

  const atual = await carrinhoAtual()
  if (!atual) return erro(anterior, {}, EXPIROU, fd)

  const mesmoCodigo = (c: string | null | undefined) =>
    (c ?? "").toLowerCase() === digitado.toLowerCase()
  let entrou = false
  for (const codigo of new Set([digitado, digitado.toUpperCase(), digitado.toLowerCase()])) {
    try {
      await atual.sdk.store.cart.addPromotions(atual.carrinho.id, { promo_codes: [codigo] })
    } catch {
      // 400 é a resposta pra código inexistente. Não é exceção nossa.
    }
    const depois = await lerCarrinho(CAMPOS_CHECKOUT)
    entrou = (depois?.promotions ?? []).some((p) => mesmoCodigo(p?.code))
    if (entrou) break
  }

  if (!entrou) {
    return erro(anterior, { cupom: "Esse cupom não vale pra este pedido." }, "", fd)
  }

  refresh()
  return certo(anterior)
}

export async function removerCupom(codigo: string): Promise<void> {
  const atual = await carrinhoAtual()
  if (!atual || !codigo) return

  try {
    await atual.sdk.store.cart.removePromotions(atual.carrinho.id, { promo_codes: [codigo] })
  } catch (e) {
    registrar(e, `remover cupom ${codigo}`)
  }
  refresh()
}

/* ── as ofertas: chips do frete grátis e order bump ───────────────────────── */

/**
 * Põe um produto no carrinho de dentro do checkout.
 *
 * É o que o chip de "completa o frete grátis" faz. Uma linha nova, preço
 * cheio, e o Medusa recalcula o frete sozinho — inclusive zerando o da opção
 * mais barata, que é o motivo de a pessoa ter clicado.
 */
export async function adicionarOferta(varianteId: string): Promise<EstadoDaEtapa> {
  const atual = await carrinhoAtual()
  if (!atual) return { ...ESTADO_VAZIO, mensagem: EXPIROU }

  try {
    await atual.sdk.store.cart.createLineItem(atual.carrinho.id, {
      variant_id: varianteId,
      quantity: 1,
    })
  } catch (e) {
    registrar(e, `adicionar oferta ${varianteId}`)
    return { ...ESTADO_VAZIO, mensagem: "Não consegui adicionar agora. Tenta de novo." }
  }

  refresh()
  return { ...ESTADO_VAZIO, ok: true }
}

/** Tira do carrinho a linha de uma variante — é o "desfazer" do chip. */
export async function removerOferta(varianteId: string): Promise<EstadoDaEtapa> {
  const atual = await carrinhoAtual()
  if (!atual) return { ...ESTADO_VAZIO, mensagem: EXPIROU }

  const linha = atual.carrinho.items?.find((i) => i.variant_id === varianteId)
  if (linha) {
    try {
      await atual.sdk.store.cart.deleteLineItem(atual.carrinho.id, linha.id)
    } catch (e) {
      registrar(e, `remover oferta ${varianteId}`)
    }
  }

  refresh()
  return { ...ESTADO_VAZIO, ok: true }
}

/**
 * Liga e desliga a oferta do checkout (o order bump).
 *
 * DUAS COISAS JUNTAS, e nessa ordem: a linha entra no carrinho e o código da
 * promoção DAQUELE PRODUTO é aplicado (`codigoDoBump`, em `lib/bump.ts` —
 * cada produto tem a sua). Se só a linha entrasse, a pessoa pagaria o preço
 * cheio num produto que a tela ofereceu com desconto — que é exatamente a
 * divergência que a promoção existe pra evitar.
 *
 * ┌─ OU AS DUAS, OU NENHUMA ───────────────────────────────────────────────┐
 * │ A linha entra primeiro, e o desconto pode falhar depois dela: a        │
 * │ promoção daquele produto ainda não existe nesse Medusa (o job `bumps`  │
 * │ cria de hora em hora), foi desativada, ou a loja está sem o segredo    │
 * │ que assina o código. Antes, a falha voltava sem `refresh()`: a         │
 * │ caixinha desmarcava, o resumo ficava velho — e o produto continuava no │
 * │ carrinho, a preço cheio, pra ser cobrado no Pix sem ninguém ter visto. │
 * │ Agora a linha que ESTA ação pôs sai de volta, e o desconto é CONFERIDO │
 * │ na resposta (código aplicado sem ajuste na linha também é falha).      │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * UMA OFERTA POR VEZ. Qual produto a tela oferece é o motor que decide, e a
 * ação não refaz a conta — refazer poderia dar outra resposta se o catálogo
 * mudasse no meio, e a pessoa leria "não deu" na oferta que acabou de ver.
 * Mas ela é um POST público: alguém chamando direto, produto a produto,
 * juntaria um desconto em cada. Por isso marcar tira antes qualquer outro
 * código de oferta do carrinho — no pior caso, 10% numa unidade de UM
 * produto, que é o que a caixinha oferece a qualquer um.
 *
 * Desmarcar desfaz as duas. O código sai primeiro: com a linha já fora, o
 * Medusa não teria mais em que aplicar o desconto, e o cupom ficaria
 * pendurado no carrinho sem efeito e visível no resumo.
 *
 * `refresh()` em TODA saída, inclusive nas de erro: a tela tem que mostrar o
 * carrinho como ele ficou, e não como ela achava que ia ficar.
 */
export async function alternarBump(varianteId: string, marcar: boolean): Promise<EstadoDaEtapa> {
  const atual = await carrinhoAtual()
  if (!atual) return { ...ESTADO_VAZIO, mensagem: EXPIROU }

  const { sdk, carrinho } = atual
  const linha = carrinho.items?.find((i) => i.variant_id === varianteId)
  const pendurados = (carrinho.promotions ?? []).flatMap((p) =>
    p?.code && ehCodigoDeBump(p.code) ? [p.code] : []
  )

  if (!marcar) {
    try {
      if (pendurados.length) {
        await sdk.store.cart.removePromotions(carrinho.id, { promo_codes: pendurados })
      }
      if (linha) await sdk.store.cart.deleteLineItem(carrinho.id, linha.id)
    } catch (e) {
      registrar(e, "bump desmarcar")
      refresh()
      return { ...ESTADO_VAZIO, mensagem: "Não consegui tirar a oferta agora. Tenta de novo." }
    }
    refresh()
    return { ...ESTADO_VAZIO, ok: true }
  }

  const SEM_OFERTA = "Não deu pra incluir a oferta agora — seu pedido segue sem ela."

  // A linha — só se ainda não está lá. E o id da que ESTA ação criou, que é
  // a única que ela tem o direito de tirar se o desconto não pegar.
  let criada: string | null = null
  let produto = linha ? { handle: linha.product_handle, id: linha.product_id } : null
  if (!linha) {
    try {
      const { cart } = await sdk.store.cart.createLineItem(
        carrinho.id,
        { variant_id: varianteId, quantity: 1 },
        { fields: "id,*items" }
      )
      const nova = cart.items?.find((i) => i.variant_id === varianteId)
      criada = nova?.id ?? null
      produto = nova ? { handle: nova.product_handle, id: nova.product_id } : null
    } catch (e) {
      registrar(e, "bump marcar: a linha não entrou")
      refresh()
      return { ...ESTADO_VAZIO, mensagem: SEM_OFERTA }
    }
  }

  // O código da promoção DESTE produto. O código em si não vai pro log: ele
  // é o desconto, e log é lido por mais gente que o carrinho.
  const codigo = produto?.handle && produto.id ? codigoDoBump(produto.handle, produto.id) : null
  const deQuem = `a oferta de "${produto?.handle ?? varianteId}"`

  // O desconto — e a prova de que ele pegou NA LINHA da oferta.
  let descontou = false
  if (!codigo) {
    registrar(
      new Error("sem REVALIDAR_SEGREDO, não dá pra montar o código"),
      `bump marcar: ${deQuem}`
    )
  } else {
    try {
      const outros = pendurados.filter((c) => c !== codigo)
      if (outros.length) await sdk.store.cart.removePromotions(carrinho.id, { promo_codes: outros })
      const { cart } = await sdk.store.cart.addPromotions(
        carrinho.id,
        { promo_codes: [codigo] },
        { fields: "id,*items,*items.adjustments" }
      )
      descontou = Boolean(
        cart.items
          ?.find((i) => i.variant_id === varianteId)
          ?.adjustments?.some((a) => a.code === codigo && Number(a.amount) > 0)
      )
      if (!descontou) {
        registrar(
          new Error("o código entrou, mas não descontou nada na linha"),
          `bump marcar: ${deQuem}`
        )
      }
    } catch (e) {
      registrar(
        e,
        `bump marcar: a promoção de ${deQuem} não pegou — ela existe nesse Medusa? ` +
          "(o job `bumps` cria de hora em hora; na hora: `npm run backend:promocoes`)"
      )
    }
  }

  if (!descontou) {
    // Desfaz na ordem inversa. Cada passo por conta própria: falhar em tirar
    // o código não pode impedir de tirar a linha, que é o que custa dinheiro.
    if (codigo) {
      try {
        await sdk.store.cart.removePromotions(carrinho.id, { promo_codes: [codigo] })
      } catch {
        // Código que nem entrou não tem o que sair.
      }
    }
    if (criada) {
      try {
        await sdk.store.cart.deleteLineItem(carrinho.id, criada)
      } catch (e) {
        registrar(e, "bump: desfazer a linha")
      }
    }
    refresh()
    return { ...ESTADO_VAZIO, mensagem: SEM_OFERTA }
  }

  refresh()
  return { ...ESTADO_VAZIO, ok: true }
}
