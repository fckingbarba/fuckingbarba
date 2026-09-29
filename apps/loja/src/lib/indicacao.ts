/**
 * O INDIQUE UM BROTHER EM MINHA CONTA (entrega 0215) — o que o Medusa manda
 * (`GET /store/crm/indicacao`, `lib/crm/indicacao.ts` no backend): o link da
 * pessoa (se já tem), quantos brothers compraram com ele, e os cupons que ela
 * ganhou. Sem `server-only`: o bloco da conta (no navegador) usa os tipos.
 */

export type IndiqueDaConta = {
  /** O código do link (`BROTHER-7KQ2MX`): é o cupom do brother. */
  codigo: string
  link: string
  /** A conversa do WhatsApp com a mensagem e o link prontos. */
  whatsapp: string
}

export type IndicacaoDaConta = {
  /** O link, se a pessoa já tem — sem ele, o bloco mostra o "Pegar meu link". */
  indique: IndiqueDaConta | null
  porcentoDoAmigo: number
  porcentoDoPremio: number
  /** Quantos brothers já pagaram a 1ª compra com o link. */
  amigos: number
  /** Os cupons que a pessoa ganhou, do mais novo pro mais velho. */
  cupons: { codigo: string; ate: string; usado: boolean }[]
}

const texto = (v: unknown): v is string => typeof v === "string" && v.length > 0
const numero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)

/** O que veio do Medusa, conferido: o que não tem a forma, vira nada (o bloco some). */
export function indicacaoValida(v: unknown): IndicacaoDaConta | null {
  if (!v || typeof v !== "object") return null
  const i = v as Record<string, unknown>
  if (!numero(i.porcentoDoAmigo) || !numero(i.porcentoDoPremio) || !numero(i.amigos)) return null
  const l = i.indique as Record<string, unknown> | null | undefined
  const indique =
    l &&
    texto(l.codigo) &&
    texto(l.link) &&
    texto(l.whatsapp) &&
    /^https:\/\/wa\.me\//.test(l.whatsapp)
      ? { codigo: l.codigo, link: l.link, whatsapp: l.whatsapp }
      : null
  const cupons = (Array.isArray(i.cupons) ? i.cupons : []).flatMap((c) => {
    const x = (c ?? {}) as Record<string, unknown>
    return texto(x.codigo) && texto(x.ate)
      ? [{ codigo: x.codigo, ate: x.ate, usado: x.usado === true }]
      : []
  })
  return {
    indique,
    porcentoDoAmigo: i.porcentoDoAmigo,
    porcentoDoPremio: i.porcentoDoPremio,
    amigos: i.amigos,
    cupons,
  }
}
