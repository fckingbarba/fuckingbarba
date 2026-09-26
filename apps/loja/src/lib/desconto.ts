/**
 * O DESCONTO QUE A TELA MOSTRA, NA LINHA "DESCONTO": o dos produtos (cupom,
 * oferta do checkout). O `discount_total` do Medusa soma também o do frete
 * — o cupom de frete grátis —, e o frete já vem descontado no
 * `shipping_total`: somado aqui também, o desconto do frete apareceria duas
 * vezes, e o resumo não fecharia com o total (0128).
 */
export function descontoDosProdutos(o: {
  discount_total?: unknown
  shipping_discount_total?: unknown
}): number {
  const d = Number(o.discount_total ?? 0) - Number(o.shipping_discount_total ?? 0)
  return Number.isFinite(d) && d > 0 ? Math.round(d * 100) / 100 : 0
}
