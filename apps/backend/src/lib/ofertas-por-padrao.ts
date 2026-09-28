/** A origem do "sim" que a loja põe sozinha: o padrão (entrega 0184). */
export const ORIGEM_POR_PADRAO = "padrao"

/**
 * AS OFERTAS POR E-MAIL LIGADAS POR PADRÃO (entrega 0184) — o parecer do
 * advogado do dono (28/09): quem compra ou cria conta recebe as ofertas por
 * e-mail, e desliga quando quiser (a caixa da conta, o "Sair da lista" de
 * todo e-mail). Quem chama: o cadastro de cliente novo
 * (`subscribers/ofertas-por-padrao.ts`) e a migração dos de antes.
 *
 * Devolve o `ofertas` novo do cliente — o sim, com a data do cadastro e a
 * origem "padrao" —, ou `null` quando não há o que mudar: ele já tem o sim
 * (o dele, com a data dele), ou saiu da lista (a escolha dele vale mais que
 * o padrão). O WhatsApp não muda: esse só por escolha.
 */
export function ofertasPorPadrao(
  metadata: Record<string, unknown> | null | undefined,
  desde: Date,
  saiu: boolean
): Record<string, unknown> | null {
  const bruto = metadata?.ofertas
  const ofertas = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>
  if (saiu || ofertas.email) return null
  return { ...ofertas, email: desde.toISOString(), origem: ORIGEM_POR_PADRAO }
}
