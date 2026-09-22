import "server-only"
import type { HttpTypes } from "@medusajs/types"
import { cookies, headers } from "next/headers"
import { cache } from "react"
import type { EnderecoVisivel } from "./checkout-visivel"
import { LIMITE_DE_ENDERECOS, type ClienteVisivel } from "./conta-visivel"
import { documentoGuardado, type Documento } from "./documento"
import { lerEnderecoDaConta, lugarParaMedusa, mesmoLugar } from "./endereco"
import { COOKIE_ENTRANDO, COOKIE_SESSAO, destinoSeguro, lerToken, type Destino } from "./sessao"

/**
 * A MINHA CONTA DO LADO DO SERVIDOR — cookies e as conversas com o Medusa.
 *
 * ┌─ O TOKEN NUNCA VAI PRO NAVEGADOR ──────────────────────────────────────┐
 * │ Ele mora num cookie `httpOnly`: o JavaScript da página não lê, e um    │
 * │ script de terceiro que um dia entre na loja também não. Quem fala com  │
 * │ o Medusa em nome da pessoa é o servidor da loja, com o token no        │
 * │ cabeçalho — igual ao carrinho, que também só guarda o id no cookie.    │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * FETCH DIRETO, E NÃO O SDK, nestas chamadas: o SDK transforma toda resposta
 * de erro numa exceção com só a mensagem, e aqui o corpo do erro importa — o
 * "espera" do código vem com quantos segundos faltam.
 */

const TRINTA_DIAS = 60 * 60 * 24 * 30

/** O mesmo prazo do token (`jwtExpiresIn` no `medusa-config.ts`). */
export const OPCOES_SESSAO = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: TRINTA_DIAS,
} as const

/**
 * Entre a tela do e-mail e a do código: 15 minutos (o código vale 10), e só
 * nas rotas da conta. Leva o e-mail, pra onde voltar e a hora do envio — é
 * da hora que sai a contagem do "reenviar".
 */
export const OPCOES_ENTRANDO = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/conta",
  maxAge: 15 * 60,
} as const

export type Entrando = { email: string; para: Destino; enviadoEm: number }

export async function lerEntrando(): Promise<Entrando | null> {
  const bruto = (await cookies()).get(COOKIE_ENTRANDO)?.value
  if (!bruto) return null
  try {
    const dado = JSON.parse(bruto) as Partial<Entrando>
    if (typeof dado.email !== "string" || !dado.email) return null
    return {
      email: dado.email,
      para: destinoSeguro(dado.para),
      enviadoEm: typeof dado.enviadoEm === "number" ? dado.enviadoEm : 0,
    }
  } catch {
    return null
  }
}

/**
 * Quantos segundos faltam pro "reenviar" liberar, contados da hora do envio
 * de verdade (que mora no cookie) — recarregar a tela não zera a espera.
 */
export function segundosParaReenviar(
  entrando: Entrando,
  espera: number,
  agora = Date.now()
): number {
  const passados = Math.floor((agora - entrando.enviadoEm) / 1000)
  return Math.min(espera, Math.max(0, espera - passados))
}

export async function lerSessao(): Promise<string | null> {
  return (await cookies()).get(COOKIE_SESSAO)?.value ?? null
}

/* ── a conversa com o Medusa ──────────────────────────────────────────────── */

type Resposta = { status: number; corpo: Record<string, unknown> }

const TEMPO_LIMITE_MS = 10_000

/**
 * Uma chamada ao Medusa que NUNCA lança: rede fora, tempo esgotado ou
 * resposta que não é JSON viram `status: 0`. Quem chama decide a frase.
 */
export async function medusa(
  caminho: string,
  {
    metodo = "POST",
    corpo,
    token,
    extras = {},
  }: {
    metodo?: "GET" | "POST" | "DELETE"
    corpo?: unknown
    token?: string
    extras?: Record<string, string>
  } = {}
): Promise<Resposta> {
  const base = process.env.MEDUSA_BACKEND_URL
  const chave = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY
  if (!base || !chave) return { status: 0, corpo: {} }

  const cabecalhos: Record<string, string> = {
    accept: "application/json",
    "x-publishable-api-key": chave,
    ...extras,
  }
  if (corpo !== undefined) cabecalhos["content-type"] = "application/json"
  if (token) cabecalhos.authorization = `Bearer ${token}`

  try {
    const r = await fetch(new URL(caminho, base), {
      method: metodo,
      headers: cabecalhos,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      cache: "no-store",
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    })
    const json = (await r.json().catch(() => ({}))) as Record<string, unknown>
    return { status: r.status, corpo: json && typeof json === "object" ? json : {} }
  } catch (e) {
    console.warn(`[conta] ${caminho}: ${e instanceof Error ? e.message : String(e)}`)
    return { status: 0, corpo: {} }
  }
}

/**
 * O IP de quem está na loja, pra o Medusa contar os pedidos de código por
 * pessoa, e não pela Vercel inteira. Vai assinado com o segredo que os dois
 * lados já dividem — ver `backend/src/lib/quem-pede.ts`.
 *
 * `x-real-ip` primeiro: é o que a Vercel escreve com o IP de quem conectou.
 * O primeiro item do `x-forwarded-for` fica de reserva — é o que o próprio
 * navegador poderia inventar, se algum proxy no caminho só acrescentasse.
 */
export async function cabecalhosDeQuemPede(): Promise<Record<string, string>> {
  const h = await headers()
  const ip = h.get("x-real-ip") || (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || ""
  const segredo = process.env.REVALIDAR_SEGREDO
  return ip && segredo ? { "x-cliente-ip": ip.slice(0, 64), "x-loja-segredo": segredo } : {}
}

/** O pedido de código, com a assinatura de quem pede. */
export async function pedirCodigoAoMedusa(email: string): Promise<Resposta> {
  return medusa("/store/conta/codigo", { corpo: { email }, extras: await cabecalhosDeQuemPede() })
}

/* ── quem está logado ─────────────────────────────────────────────────────── */

export type { ClienteVisivel } from "./conta-visivel"

export type LeituraDoCliente =
  | { estado: "ok"; cliente: ClienteVisivel }
  | { estado: "sem-sessao" }
  /** O Medusa recusou o token: venceu, foi forjado, ou o cliente sumiu. */
  | { estado: "expirou" }
  /** O Medusa não respondeu. Não é motivo pra tirar ninguém da conta. */
  | { estado: "fora-do-ar" }

/**
 * Tudo que a conta mostra sai desta pergunta: o menu (nome e quantos
 * endereços), a visão geral, os endereços, os dados — e o checkout, que abre
 * preenchido com eles.
 */
const CAMPOS_DO_CLIENTE = "id,email,first_name,last_name,phone,metadata,*addresses"

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "")
/** Uma data ISO que o Medusa devolveu, ou null — o `metadata` é escrito por quem tem o token. */
const data = (v: unknown) => (typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null)

/**
 * O cliente do Medusa no formato das telas.
 *
 * O `metadata` É ESCRITO PELO PRÓPRIO CLIENTE — a API da loja deixa quem tem
 * o token gravar o que quiser ali. Então nada dele entra sem conferência: o
 * documento só vale com o dígito certo, e a data do consentimento só se for
 * data. Nada aqui decide preço, dono ou acesso; é só o que a tela mostra e
 * o checkout sugere.
 */
function paraCliente(c: HttpTypes.StoreCustomer): ClienteVisivel {
  const meta = (c.metadata ?? {}) as Record<string, unknown>
  const ofertas = (meta.ofertas ?? {}) as Record<string, unknown>
  const enderecos = (c.addresses ?? [])
    .map((a) => ({ a, e: lerEnderecoDaConta(a) }))
    .sort(
      (x, y) =>
        Number(y.e.principal) - Number(x.e.principal) ||
        String(x.a.created_at ?? "").localeCompare(String(y.a.created_at ?? ""))
    )
    .map(({ e }) => e)

  return {
    id: c.id,
    email: c.email ?? "",
    nome: texto(c.first_name),
    sobrenome: texto(c.last_name),
    telefone: texto(c.phone),
    documento: documentoGuardado(meta.documento),
    ofertas: { email: data(ofertas.email), whatsapp: data(ofertas.whatsapp) },
    enderecos,
  }
}

/** Com o token na mão (a ação de finalizar, depois da resposta), sem cookie. */
async function perguntarPeloCliente(token: string): Promise<LeituraDoCliente> {
  const r = await medusa(`/store/customers/me?fields=${encodeURIComponent(CAMPOS_DO_CLIENTE)}`, {
    metodo: "GET",
    token,
  })
  if (r.status === 401 || r.status === 404) return { estado: "expirou" }
  const c = r.corpo.customer as HttpTypes.StoreCustomer | undefined
  if (r.status !== 200 || !c?.id) return { estado: "fora-do-ar" }
  return { estado: "ok", cliente: paraCliente(c) }
}

/** `cache`: o menu e a página perguntam no mesmo pedido de página — uma ida só. */
export const lerCliente = cache(async (): Promise<LeituraDoCliente> => {
  const token = await lerSessao()
  if (!token) return { estado: "sem-sessao" }
  return perguntarPeloCliente(token)
})

/* ── a compra feita com a conta aberta ────────────────────────────────────── */

/** O que a compra deixa pra conta: o endereço e os dados do passo 1. */
export type DaCompra = { entrega: EnderecoVisivel; documento: Documento | null }

/**
 * DEPOIS DE UMA COMPRA COM A CONTA ABERTA, o endereço dela fica salvo — é a
 * promessa da visão geral ("o primeiro que você usar no checkout fica
 * guardado aqui"). E nome, celular e documento completam "Meus dados" onde
 * eles estiverem VAZIOS: o que a pessoa escreveu lá manda, e uma compra pra
 * outra pessoa não reescreve a conta.
 *
 * ┌─ POR QUE AQUI, COM O TOKEN, E NÃO NUM SUBSCRIBER DO BACKEND ───────────┐
 * │ O backend saberia de todo pedido — mas não saberia se ele foi feito    │
 * │ com a conta aberta. O Medusa liga ao cliente com conta qualquer        │
 * │ carrinho com o e-mail dele, e com isso quem digitasse o e-mail de      │
 * │ outra pessoa no checkout ESCREVERIA na conta dela: um endereço         │
 * │ estranho na lista (e principal, se ela não tivesse nenhum), abrindo    │
 * │ preenchido no checkout dela. Com o token do cookie, só escreve na      │
 * │ conta quem está dentro dela.                                           │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * Nunca lança, e roda DEPOIS da resposta (`after`, na ação de finalizar): a
 * confirmação do pedido não espera por isto, e uma falha aqui não é falha da
 * compra — no pior caso, o endereço não fica salvo.
 */
export async function guardarDaCompra(token: string, compra: DaCompra): Promise<void> {
  const leitura = await perguntarPeloCliente(token)
  if (leitura.estado !== "ok") return
  const conta = leitura.cliente
  const { entrega } = compra

  const vazios: Record<string, unknown> = {}
  if (!conta.nome && entrega.nome) vazios.first_name = entrega.nome
  if (!conta.sobrenome && entrega.sobrenome) vazios.last_name = entrega.sobrenome
  if (!conta.telefone && entrega.telefone) vazios.phone = entrega.telefone
  // O `metadata` do cliente MESCLA no primeiro nível: mandar só o documento
  // não apaga as preferências de oferta.
  if (!conta.documento && compra.documento) vazios.metadata = { documento: compra.documento }
  if (Object.keys(vazios).length) {
    const r = await medusa("/store/customers/me", { corpo: vazios, token })
    if (r.status !== 200) console.warn(`[conta] dados da compra: ${r.status}`)
  }

  const lugar = {
    cep: entrega.cep.replace(/\D+/g, ""),
    rua: entrega.rua,
    numero: entrega.numero,
    complemento: entrega.complemento,
    bairro: entrega.bairro,
    cidade: entrega.cidade,
    uf: entrega.uf,
  }
  if (lugar.cep.length !== 8 || !lugar.rua || !lugar.numero) return
  if (conta.enderecos.some((e) => mesmoLugar(e, lugar))) return
  if (conta.enderecos.length >= LIMITE_DE_ENDERECOS) return

  const r = await medusa("/store/customers/me/addresses", {
    corpo: {
      ...lugarParaMedusa(lugar),
      // Sem nenhum principal, este vira: é o que o checkout vai abrir.
      ...(conta.enderecos.some((e) => e.principal) ? {} : { is_default_shipping: true }),
    },
    token,
  })
  if (r.status !== 200) console.warn(`[conta] endereço da compra: ${r.status}`)
}

/* ── sair, e a sacola de quem saiu ────────────────────────────────────────── */

/**
 * A sacola deste navegador é da conta que está saindo?
 *
 * Com a conta aberta, o checkout passa o carrinho pro nome dela
 * (`preencherDaConta`, em `checkout.ts`) — e o Medusa não desfaz isso:
 * carrinho de cliente com conta continua dele mesmo que o e-mail mude. Quem
 * usasse o mesmo navegador depois fecharia a compra NA CONTA de quem saiu,
 * vendo o endereço e o CPF dela preenchidos. Então sair leva a sacola junto
 * — a pessoa que saiu perde o que estava nela, e é o preço de não entregar
 * a conta pra próxima.
 *
 * Quem decide de quem é o carrinho é o Medusa; o token só diz quem está
 * saindo (a assinatura não importa aqui: ele não abre nada, só compara).
 */
export async function carrinhoEhDaConta(carrinhoId: string, token: string): Promise<boolean> {
  const eu = lerToken(token)?.actor_id
  if (!carrinhoId || typeof eu !== "string" || !eu) return false
  const r = await medusa(`/store/carts/${encodeURIComponent(carrinhoId)}?fields=id,customer.id`, {
    metodo: "GET",
  })
  const dono = (r.corpo.cart as { customer?: { id?: string } | null } | undefined)?.customer?.id
  return r.status === 200 && dono === eu
}
