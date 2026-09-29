/** A origem do "sim" que a loja põe sozinha: o padrão (entrega 0184). */
export const ORIGEM_POR_PADRAO = "padrao"

/**
 * AS OFERTAS POR E-MAIL LIGADAS POR PADRÃO (entregas 0184 e 0205) — o
 * parecer do advogado do dono (28/09): quem compra ou cria conta recebe as
 * ofertas por e-mail, e desliga quando quiser (a caixa da conta, o "Sair da
 * lista" de todo e-mail). Desde a 0205, também quem só deixou o e-mail no
 * checkout (escolha do dono, 29/09). Quem chama: o cadastro de cliente novo
 * e o carrinho (`subscribers/ofertas-por-padrao.ts`) e as migrações dos de
 * antes.
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
