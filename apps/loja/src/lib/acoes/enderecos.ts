"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"
import type { CepEncontrado } from "@/lib/acoes/checkout"
import { buscarCep, limparCep } from "@/lib/cep"
import { lerCliente, lerSessao, medusa } from "@/lib/conta"
import {
  LIMITE_DE_ENDERECOS,
  naoSalvou,
  type ClienteVisivel,
  type EstadoDoEndereco,
  type RespostaDaConta,
} from "@/lib/conta-visivel"
import { ehUf, lugarParaMedusa } from "@/lib/endereco"
import { sessaoParece } from "@/lib/sessao"

/**
 * OS ENDEREÇOS DA CONTA — guardar, tornar principal, excluir.
 *
 * Toda ação é um POST público (a caixa em `acoes/checkout.ts`). Aqui o id do
 * endereço VEM DA TELA — é o cartão em que a pessoa clicou —, e isso só é
 * seguro porque quem responde é a API da conta do Medusa, com o token do
 * cookie: `/store/customers/me/addresses/:id` só acha endereço do cliente do
 * token. O id de um endereço de outra pessoa dá 404, e nada muda.
 *
 * O PRINCIPAL é o `is_default_shipping` do Medusa, e o Medusa garante que
 * há um só: marcar um desmarca o outro. O que ele não faz é escolher um
 * novo quando o principal é excluído — isso é aqui.
 */

const GENERICO = "Não consegui falar com a loja agora. Tenta de novo em instantes."
const SUMIU = "Esse endereço não está mais na sua conta."

/** Os ids de endereço do Medusa: `cuaddr_` e um ULID. Nada mais vai pra API. */
const ID_DO_ENDERECO = /^cuaddr_[0-9A-Za-z]{10,40}$/

/** O que chega do formulário, limpo e com teto — o teto é folga, não regra de tela. */
const texto = (fd: FormData, campo: string, teto = 120) =>
  String(fd.get(campo) ?? "")
    .trim()
    .slice(0, teto)

function registrar(contexto: string, status: number, corpo: Record<string, unknown>) {
  console.warn(`[conta] ${contexto}: ${status} ${String(corpo.message ?? "")}`)
}

/**
 * Quem está na conta, com o token — ou a porta. Sem cookie, o "entrar"
 * (volta pra cá depois); com o token recusado pelo Medusa, o `/conta/sair`,
 * que apaga o cookie e dá o recado. `null` é o Medusa fora do ar.
 */
async function quemEsta(): Promise<{ token: string; cliente: ClienteVisivel } | null> {
  const token = await lerSessao()
  if (!token) redirect("/conta/entrar?para=%2Fconta%2Fenderecos")
  const leitura = await lerCliente()
  if (leitura.estado === "expirou" || leitura.estado === "sem-sessao") {
    redirect("/conta/sair?motivo=expirou")
  }
  if (leitura.estado !== "ok") return null
  return { token, cliente: leitura.cliente }
}

/* ── guardar (novo, ou a edição de um) ────────────────────────────────────── */

/**
 * O formulário é o do passo 2 do checkout, e as frases de erro são as dele —
 * menos a do estado, que aqui é "Escolhe o estado." (o protótipo da conta).
 *
 * O PRIMEIRO ENDEREÇO É O PRINCIPAL, sem perguntar; o principal continua
 * principal até outro tomar o lugar (a caixinha "Usar como principal" nem
 * aparece nele). E se, por algum caminho, a conta ficou sem principal, o
 * que for salvo agora vira.
 */
export async function salvarEndereco(
  anterior: EstadoDoEndereco,
  fd: FormData
): Promise<EstadoDoEndereco> {
  const id = texto(fd, "id")
  const lugar = {
    cep: limparCep(texto(fd, "cep")),
    rua: texto(fd, "rua"),
    numero: texto(fd, "numero", 20),
    complemento: texto(fd, "complemento", 80),
    bairro: texto(fd, "bairro", 80),
    cidade: texto(fd, "cidade", 80),
    uf: texto(fd, "uf", 2).toUpperCase(),
  }
  const apelido = texto(fd, "apelido", 40)
  const pediuPrincipal = fd.get("principal") === "on"

  const erros: Record<string, string> = {}
  if (!lugar.cep) erros.cep = "CEP tem 8 dígitos."
  if (!lugar.rua) erros.rua = "Falta a rua."
  if (!lugar.numero) erros.numero = "Falta o número. Se não tem, escreve S/N."
  if (!lugar.bairro) erros.bairro = "Falta o bairro."
  if (!lugar.cidade) erros.cidade = "Falta a cidade."
  if (!ehUf(lugar.uf)) erros.uf = "Escolhe o estado."
  if (Object.keys(erros).length) return naoSalvou(anterior, erros, "", fd)
  if (id && !ID_DO_ENDERECO.test(id)) return naoSalvou(anterior, {}, SUMIU, fd)

  const conta = await quemEsta()
  if (!conta) return naoSalvou(anterior, {}, GENERICO, fd)
  const { enderecos } = conta.cliente

  const atual = id ? enderecos.find((e) => e.id === id) : undefined
  if (id && !atual) {
    refresh()
    return naoSalvou(anterior, {}, SUMIU, fd)
  }
  if (!id && enderecos.length >= LIMITE_DE_ENDERECOS) {
    return naoSalvou(
      anterior,
      {},
      `Sua conta já tem ${LIMITE_DE_ENDERECOS} endereços. Exclui um pra guardar outro.`,
      fd
    )
  }

  const outroPrincipal = enderecos.some((e) => e.principal && e.id !== id)
  const principal = Boolean(atual?.principal) || pediuPrincipal || !outroPrincipal

  const r = await medusa(
    id ? `/store/customers/me/addresses/${id}` : "/store/customers/me/addresses",
    {
      corpo: {
        ...lugarParaMedusa(lugar),
        address_name: apelido || null,
        // Só o "sim": mandar `false` num endereço que não é o principal não
        // muda nada, e é um jeito a menos de desmarcar o principal sem querer.
        ...(principal ? { is_default_shipping: true } : {}),
      },
      token: conta.token,
    }
  )
  if (r.status === 401) redirect("/conta/sair?motivo=expirou")
  if (r.status === 404) {
    refresh()
    return naoSalvou(anterior, {}, SUMIU, fd)
  }
  if (r.status !== 200) {
    registrar("salvar endereço", r.status, r.corpo)
    return naoSalvou(anterior, {}, GENERICO, fd)
  }

  // O id do novo, pro foco voltar pro cartão dele: é o que não estava lá.
  let salvo = id
  if (!salvo) {
    const antes = new Set(enderecos.map((e) => e.id))
    const lista = (r.corpo.customer as { addresses?: { id?: string }[] } | undefined)?.addresses
    salvo = lista?.find((a) => a.id && !antes.has(a.id))?.id ?? ""
  }

  refresh()
  return { ok: true, erros: {}, mensagem: "", rodada: anterior.rodada + 1, id: salvo }
}

/* ── os botões do cartão ──────────────────────────────────────────────────── */

export async function tornarPrincipal(id: string): Promise<RespostaDaConta> {
  if (!ID_DO_ENDERECO.test(id)) return { ok: false, mensagem: SUMIU }
  const token = await lerSessao()
  if (!token) redirect("/conta/entrar?para=%2Fconta%2Fenderecos")

  const r = await medusa(`/store/customers/me/addresses/${id}`, {
    corpo: { is_default_shipping: true },
    token,
  })
  if (r.status === 401) redirect("/conta/sair?motivo=expirou")
  refresh()
  if (r.status === 404) return { ok: false, mensagem: SUMIU }
  if (r.status !== 200) {
    registrar("tornar principal", r.status, r.corpo)
    return { ok: false, mensagem: GENERICO }
  }
  return { ok: true, mensagem: "" }
}

/**
 * Exclui — e, se era o principal, o mais antigo dos que sobram toma o lugar
 * (é o primeiro da lista depois dele). Conta com endereço e sem principal
 * abriria o checkout vazio, e a tela diria que o principal vem preenchido.
 */
export async function excluirEndereco(id: string): Promise<RespostaDaConta> {
  if (!ID_DO_ENDERECO.test(id)) return { ok: false, mensagem: SUMIU }
  const conta = await quemEsta()
  if (!conta) return { ok: false, mensagem: GENERICO }

  const { enderecos } = conta.cliente
  const alvo = enderecos.find((e) => e.id === id)
  if (!alvo) {
    refresh()
    return { ok: false, mensagem: SUMIU }
  }

  const r = await medusa(`/store/customers/me/addresses/${id}`, {
    metodo: "DELETE",
    token: conta.token,
  })
  if (r.status === 401) redirect("/conta/sair?motivo=expirou")
  if (r.status !== 200 && r.status !== 404) {
    registrar("excluir endereço", r.status, r.corpo)
    return { ok: false, mensagem: GENERICO }
  }

  const proximo = alvo.principal ? enderecos.find((e) => e.id !== id) : undefined
  if (proximo) {
    const p = await medusa(`/store/customers/me/addresses/${proximo.id}`, {
      corpo: { is_default_shipping: true },
      token: conta.token,
    })
    if (p.status !== 200) registrar("principal depois de excluir", p.status, p.corpo)
  }

  refresh()
  return { ok: true, mensagem: "" }
}

/* ── o CEP ────────────────────────────────────────────────────────────────── */

/**
 * O atalho do CEP, sem o carrinho: o do checkout (`consultarCep`) também
 * grava o CEP no carrinho, pra cotar o frete — aqui ninguém está comprando.
 * Só com cara de sessão no cookie (a conferência otimista do proxy): é uma
 * porta pro ViaCEP, e não precisa ficar escancarada. Quem só quer o CEP de
 * graça já tem o do checkout — isto não abre nada que já não estivesse
 * aberto.
 */
export async function consultarCepDaConta(cep: string): Promise<CepEncontrado> {
  const vazio: CepEncontrado = { encontrado: false, rua: "", bairro: "", cidade: "", uf: "" }
  if (!sessaoParece(await lerSessao())) return vazio
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
