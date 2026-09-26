/**
 * Formatação em pt-BR. Um lugar só, porque preço formatado de três jeitos
 * diferentes na mesma página é erro que ninguém vê até o cliente ver.
 *
 * Unidade: **reais**, com centavos na parte decimal (54.9 são R$ 54,90). É a
 * unidade que o Medusa v2 usa e devolve, e converter pra centavos aqui só
 * criaria dois sistemas de medida na mesma aplicação — que é como nasce o
 * bug de multiplicar por cem duas vezes. Conta de dinheiro (soma de carrinho,
 * desconto, frete) quem faz é o Medusa; aqui a gente só escreve na tela.
 */

const REAIS = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

/**
 * 54.9 → "R$ 54,90".
 *
 * O espaço depois do "R$" é fixo (U+00A0) — quem põe é o Intl, e é o que
 * impede o valor de quebrar em duas linhas no meio.
 */
export function emReais(valor: number): string {
  return REAIS.format(valor)
}

/**
 * O mesmo valor partido em duas, pro banner, que escreve os centavos menores
 * e sobrescritos: 99.9 → `{ inteiro: "R$ 99", centavos: ",90" }`.
 */
export function emReaisPartido(valor: number): { inteiro: string; centavos: string } {
  const texto = emReais(valor)
  const virgula = texto.lastIndexOf(",")
  if (virgula < 0) return { inteiro: texto, centavos: "" }
  return { inteiro: texto.slice(0, virgula), centavos: texto.slice(virgula) }
}

/* ── datas ────────────────────────────────────────────────────────────────── */

/**
 * DATAS NO FUSO DA LOJA, e não no do servidor. A Vercel roda em UTC: um
 * pedido feito às 22h de São Paulo já é "amanhã" lá, e a conta diria que a
 * compra de ontem à noite foi feita hoje.
 */
const FUSO = "America/Sao_Paulo"
const DIA = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit" })
const DIA_E_ANO = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
})
const HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  hour: "2-digit",
  minute: "2-digit",
})
/** "2026-09-17": só pra comparar dias, no fuso certo. */
const CHAVE_DO_DIA = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

const valida = (iso: string | null | undefined): Date | null => {
  const d = iso ? new Date(iso) : null
  return d && Number.isFinite(d.getTime()) ? d : null
}

/** "17/09". */
export function dia(iso: string | null | undefined): string {
  const d = valida(iso)
  return d ? DIA.format(d) : ""
}

/** "17/09, 14:02" — a linha do tempo do pedido. */
export function diaEHora(iso: string | null | undefined): string {
  const d = valida(iso)
  return d ? `${DIA.format(d)}, ${HORA.format(d)}` : ""
}

/**
 * "hoje, 10:15", "ontem, 19:48" ou "17/09/2026, 14:02" — quando um pedido
 * foi feito. Com o ano: a lista de pedidos atravessa anos.
 */
export function quando(iso: string | null | undefined, agora: Date = new Date()): string {
  const d = valida(iso)
  if (!d) return ""
  const esse = CHAVE_DO_DIA.format(d)
  if (esse === CHAVE_DO_DIA.format(agora)) return `hoje, ${HORA.format(d)}`
  if (esse === CHAVE_DO_DIA.format(new Date(agora.getTime() - 86_400_000))) {
    return `ontem, ${HORA.format(d)}`
  }
  return `${DIA_E_ANO.format(d)}, ${HORA.format(d)}`
}

/**
 * A descrição que o Google mostra embaixo do nome (a `meta description`),
 * tirada de um texto longo — a descrição do produto que vem do Bling: numa
 * linha só (as quebras de parágrafo viravam o texto colado) e cortada no fim
 * de uma palavra, com "…", perto dos 155 caracteres que a busca mostra.
 * Antes era o texto cru cortado no 155º caractere, no meio da palavra.
 */
export function descricaoDoGoogle(texto: string | null | undefined, limite = 155): string | null {
  const t = (texto ?? "").replace(/\s+/g, " ").trim()
  if (!t) return null
  if (t.length <= limite) return t
  const corte = t.slice(0, limite - 1)
  const espaco = corte.lastIndexOf(" ")
  const inteiro = espaco > limite * 0.6 ? corte.slice(0, espaco) : corte
  return `${inteiro.replace(/[\s,;:.—–-]+$/, "")}…`
}
