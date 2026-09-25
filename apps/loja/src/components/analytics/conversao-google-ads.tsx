"use client"

import { useEffect } from "react"
import { converterCompraNoGoogleAds } from "@/lib/rastrear"

/**
 * A CONVERSÃO DE COMPRA DO GOOGLE ADS, na tela de obrigado — quando o
 * pagamento entrou (o cartão aprovado; o Pix pago com a tela aberta, que se
 * refaz sozinha). Só vale com o "Aceitar": sem ele o `gtag` nem existe, e a
 * chamada não faz nada (`converterCompraNoGoogleAds`).
 */
export function ConversaoDoGoogleAds({
  envio,
  pedido,
}: {
  envio: string
  pedido: { id: string; total: number }
}) {
  const { id, total } = pedido
  useEffect(() => {
    // As tags ligam no efeito do layout, que roda depois deste: a chamada espera por elas.
    converterCompraNoGoogleAds(envio, { id, total })
  }, [envio, id, total])
  return null
}
