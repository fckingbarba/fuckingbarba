"use client"

import { Frasco, Raio } from "@/components/icones"
import { quandoComprou } from "@/lib/ficha"
import { useFicha } from "./usar-ficha"

/**
 * A FICHA NA FOTO DO PRODUTO (entrega 0190) — pra quem está com a conta
 * aberta: "Você comprou há 25 dias" no produto que a pessoa já comprou, ou
 * por que ele combina com o que ela tem ("Combina com o Fator que você já
 * tem") no que completa a rotina. Um selo no pé da foto, por cima dela: chega
 * depois da página e não empurra nada. Pra quem não está na conta, nada.
 */
export function FichaNaFoto({ handle }: { handle: string }) {
  const ficha = useFicha()
  if (!ficha) return null
  const comprou = ficha.compras.find((c) => c.handle === handle)
  const porque = comprou ? null : ficha.combina.find((c) => c.handle === handle)?.porque
  if (!comprou && !porque) return null
  return (
    <p
      className={`galeria__selo galeria__ficha${comprou ? "" : " galeria__ficha--combina"}`}
      data-ficha-na-foto={comprou ? "comprou" : "combina"}
    >
      {comprou ? <Frasco aria-hidden="true" /> : <Raio aria-hidden="true" />}
      {comprou ? quandoComprou(comprou.dias) : porque}
    </p>
  )
}
