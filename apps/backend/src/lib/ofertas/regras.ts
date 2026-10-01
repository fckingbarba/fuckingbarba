import { fimDe, inicioDe, numeroBrasileiro } from "../cupons"
import { DESCONTO_MAXIMO, descontoDe } from "../painel/promocao"

/**
 * AS OFERTAS OCULTAS — a regra (código puro, com testes). Pedido do dono em
 * 01/10: "ofertas ocultas pro site, só através de um link que não aparece no
 * site". As escolhas dele: produtos da loja com desconto, livre até o prazo
 * (sem limite por cliente), e uma página própria da oferta.
 *
 * ┌─ COMO O PREÇO CHEGA SÓ EM QUEM TEM O LINK ─────────────────────────────┐
 * │ O "por" de cada produto mora numa LISTA DE PREÇO do Medusa, do tipo    │
 * │ "sale", com uma regra: `fb_oferta` = o id da oferta. O Medusa só usa   │
 * │ preço de lista com regra quando o contexto do cálculo traz o mesmo     │
 * │ valor — e só o CARRINHO MARCADO traz: quem põe um produto na sacola    │
 * │ pela página da oferta ganha a marca no `metadata` do carrinho (rota    │
 * │ `POST /store/ofertas/carrinho`, só a loja), e o gancho do preço        │
 * │ (`workflows/hooks/contexto-da-oferta.ts`) põe a marca no contexto.     │
 * │ A vitrine, a página do produto e o Google leem sem a marca: preço de   │
 * │ sempre.                                                                │
 * │                                                                        │
 * │ O começo, o fim e a pausa são da própria lista (`starts_at`,           │
 * │ `ends_at`, rascunho): passou do fim, o Medusa para de achar o preço.   │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ POR QUE A LISTA NÃO GUARDA SÓ O "POR" ────────────────────────────────┐
 * │ Com a marca no contexto, o Medusa pega o preço da lista COM REGRA      │
 * │ antes das outras (ordena por número de regras) e compara só com o      │
 * │ preço da variação. O promocional do painel e o desconto por            │
 * │ quantidade ficariam de fora: quem tem o link pagaria MAIS que a        │
 * │ vitrine se o promocional caísse abaixo da oferta, ou se 3 unidades     │
 * │ com 6% saíssem mais baratas. Então a lista guarda o MENOR de cada      │
 * │ caso: o "por" ou o preço de hoje, e cada faixa de quantidade que fica  │
 * │ abaixo do "por" (`precosDaLista`). A rodada do minuto refaz.           │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * NÃO TEM LIMITE POR CLIENTE nem de vendas (escolha dele): o link é a
 * chave. O que tem é o prazo — a data de fim é obrigatória.
 */

/** A marca no `metadata` do carrinho e a chave da regra na lista de preço. */
export const MARCA_DA_OFERTA = "fb_oferta"

/** O começo do título das listas de preço das ofertas — por ele as outras rotinas as deixam em paz. */
export const PREFIXO_DA_LISTA = "Oferta oculta · "

export const ehListaDeOferta = (titulo: string | null | undefined) =>
  typeof titulo === "string" && titulo.startsWith(PREFIXO_DA_LISTA)

export const ID_DA_OFERTA = /^ofe_[0-9A-Z]{10,40}$/

/** Uma página de oferta com mais que isso vira vitrine. */
export const MAX_PRODUTOS = 12
/** Oferta "oculta" de três meses é preço novo, não oferta. */
export const DIAS_NO_MAXIMO = 90

const NOME_MAX = 60
const TITULO_MAX = 80
const CHAMADA_MAX = 160
const PRECO_MAXIMO = 99_999.99
const DATA_E_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/
/** 3 a 40: letras minúsculas, números e hífen; sem hífen nas pontas. */
const ENDERECO = /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/

export type ProdutoDaOferta = {
  /** O id do produto no Medusa. */
  produto: string
  /** O preço de UMA unidade na oferta, em reais. */
  por: number
}

export type OfertaNova = {
  nome: string
  titulo: string
  chamada: string | null
  /** O fim do link: `/oferta/<endereco>`. */
  endereco: string
  /** Em milissegundos. */
  comeca: number
  termina: number
  produtos: ProdutoDaOferta[]
}

/** O que a regra precisa saber de cada produto da loja: o nome e o preço de hoje (uma unidade). */
export type ProdutoDaLoja = { nome: string; preco: number | null }

export type LeituraDaOferta =
  { ok: true; oferta: OfertaNova } | { ok: false; erros: Record<string, string> }

export type Situacao = "agendada" | "no-ar" | "pausada" | "encerrada"

/**
 * A oferta agora: o fim vence tudo (a pausada que passou do fim, ou que foi
 * encerrada, não liga mais); depois, a pausa; depois, o começo.
 */
export function situacaoDaOferta(
  o: { comeca_em: Date | string; termina_em: Date | string; pausada?: boolean | null },
  agora: number
): Situacao {
  if (new Date(o.termina_em).getTime() <= agora) return "encerrada"
  if (o.pausada) return "pausada"
  if (new Date(o.comeca_em).getTime() > agora) return "agendada"
  return "no-ar"
}

const texto = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "")

/** "Lista VIP de Outubro!" → "lista-vip-de-outubro": o começo sugerido do endereço. */
export function enderecoDoNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/g, "")
}

/** O endereço como o painel mandou, do jeito que vai pro link (ou "" se não sobra nada). */
export const normalizarEndereco = (v: unknown) =>
  typeof v === "string" ? enderecoDoNome(v.slice(0, 60)).slice(0, 40).replace(/-+$/g, "") : ""

/**
 * O endereço que o painel sugere: o nome e quatro letras sorteadas — "oculta"
 * é também não dar pra adivinhar trocando uma palavra no link de outra.
 */
export function sugerirEndereco(nome: string, sorteio: string): string {
  const base = enderecoDoNome(nome) || "oferta"
  return `${base}-${sorteio
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 4)}`
}

/** Um preço em reais ("69,90", "R$ 69,90"), arredondado no centavo, ou `null`. */
function emReais(v: unknown): number | null {
  const n = numeroBrasileiro(v)
  if (n === null || !(n > 0)) return null
  const r = Math.round(n * 100) / 100
  return r > 0 && r <= PRECO_MAXIMO ? r : null
}

const reais = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`

/**
 * O que chegou do formulário do painel: a oferta, ou o erro de cada campo.
 * `loja`: os produtos que podem entrar (id → nome e preço de hoje). O erro de
 * um produto vai em `por:<id>`; o da lista inteira, em `produtos`.
 *
 * O "POR" tem de ser desconto de verdade sobre o preço de HOJE (com o
 * promocional, se houver): oferta acima da vitrine não é oferta, e o
 * carrinho cobraria o da vitrine de qualquer jeito. E no máximo
 * `DESCONTO_MAXIMO`, pelo mesmo motivo do promocional: "6,99" no lugar de
 * "69,90" é dedo errado.
 */
export function lerOfertaNova(
  v: unknown,
  agora: Date,
  loja: Map<string, ProdutoDaLoja>
): LeituraDaOferta {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>
  const erros: Record<string, string> = {}

  const nome = texto(o.nome)
  if (!nome) erros.nome = "Dê um nome pra oferta (só o painel vê)."
  else if (nome.length > NOME_MAX) erros.nome = `No máximo ${NOME_MAX} letras.`

  const titulo = texto(o.titulo)
  if (!titulo) erros.titulo = "O título que o cliente lê no alto da página."
  else if (titulo.length > TITULO_MAX) erros.titulo = `No máximo ${TITULO_MAX} letras.`

  const chamada = texto(o.chamada) || null
  if (chamada && chamada.length > CHAMADA_MAX) erros.chamada = `No máximo ${CHAMADA_MAX} letras.`

  const endereco = normalizarEndereco(o.endereco)
  if (!ENDERECO.test(endereco)) erros.endereco = "De 3 a 40 letras sem acento, números e hífen."

  const agoraMs = agora.getTime()
  const de = typeof o.de === "string" ? o.de.trim() : ""
  const ate = typeof o.ate === "string" ? o.ate.trim() : ""
  let comeca = agoraMs
  if (de) {
    if (!DATA_E_HORA.test(de) || Number.isNaN(inicioDe(de))) erros.de = "O começo: data e hora."
    // Começo no passado é "já": a lista nasce valendo.
    else comeca = Math.max(inicioDe(de), agoraMs)
  }
  let termina = 0
  if (!DATA_E_HORA.test(ate) || Number.isNaN(fimDe(ate))) erros.ate = "Até quando: data e hora."
  else {
    termina = fimDe(ate)
    if (termina <= agoraMs) erros.ate = "Esse fim já passou."
    else if (!erros.de && termina <= comeca) erros.ate = "O fim tem que ser depois do começo."
    else if (!erros.de && termina - comeca > DIAS_NO_MAXIMO * 86_400_000)
      erros.ate = `No máximo ${DIAS_NO_MAXIMO} dias de oferta.`
  }

  const lidos = Array.isArray(o.produtos) ? o.produtos : []
  const vistos = new Set<string>()
  const produtos: ProdutoDaOferta[] = []
  for (const item of lidos) {
    const p = (item && typeof item === "object" ? item : {}) as Record<string, unknown>
    const id = typeof p.produto === "string" ? p.produto : ""
    if (!id || vistos.has(id)) continue
    vistos.add(id)
    const daLoja = loja.get(id)
    if (!daLoja) {
      erros.produtos = "Algum produto não existe mais na loja: recarregue a página."
      continue
    }
    const por = emReais(p.por)
    const chave = `por:${id}`
    if (por === null) erros[chave] = "O preço na oferta."
    else if (daLoja.preco === null) erros[chave] = "Este produto está sem preço na loja."
    else if (por >= daLoja.preco)
      erros[chave] = `Tem que ser menos que o preço de hoje (${reais(daLoja.preco)}).`
    else if (descontoDe(daLoja.preco, por) > DESCONTO_MAXIMO)
      erros[chave] = `Mais de ${DESCONTO_MAXIMO}% de desconto: confira o valor.`
    else produtos.push({ produto: id, por })
  }
  if (!vistos.size) erros.produtos = "Escolha pelo menos um produto."
  else if (vistos.size > MAX_PRODUTOS) erros.produtos = `No máximo ${MAX_PRODUTOS} produtos.`

  if (Object.keys(erros).length) return { ok: false, erros }
  return { ok: true, oferta: { nome, titulo, chamada, endereco, comeca, termina, produtos } }
}

/* ── os preços da lista ───────────────────────────────────────────────── */

/** Um preço da lista de preço do Medusa: uma faixa de quantidade (ou nenhuma) e o valor. */
export type PrecoDaLista = { min: number | null; max: number | null; valor: number }

const centavos = (v: number) => Math.round(v * 100) / 100

/**
 * O que a lista da oferta guarda pra UMA variação — ver o quadro lá em cima.
 * `publico`: o preço de uma unidade na vitrine hoje (com o promocional);
 * `faixas`: as do desconto por quantidade desta variação.
 *
 * Fica o preço sem faixa (o menor entre o "por" e o de hoje) e cada faixa
 * que sai mais barata que ele — a faixa mais cara que o "por" não entra: com
 * a marca, o Medusa já cobra o "por" em qualquer quantidade.
 */
export function precosDaLista(
  por: number,
  publico: number | null,
  faixas: PrecoDaLista[]
): PrecoDaLista[] {
  const base = centavos(publico !== null && publico > 0 ? Math.min(por, publico) : por)
  return [
    { min: null, max: null, valor: base },
    ...faixas
      .filter((f) => f.min !== null && f.valor > 0 && centavos(f.valor) < base)
      .map((f) => ({ min: f.min, max: f.max, valor: centavos(f.valor) }))
      .sort((a, b) => (a.min ?? 0) - (b.min ?? 0)),
  ]
}

/** A chave de um preço da lista: a variação e a faixa. */
export const chaveDoPreco = (conjunto: string, p: Pick<PrecoDaLista, "min" | "max">) =>
  `${conjunto}|${p.min ?? ""}|${p.max ?? ""}`
