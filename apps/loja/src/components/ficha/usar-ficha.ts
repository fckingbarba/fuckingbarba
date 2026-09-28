import { useEffect, useState } from "react"
import { COOKIE_CONTA_ABERTA, ehSorteioDaConta, type FichaDoSite } from "@/lib/ficha"

/**
 * A FICHA NO NAVEGADOR (entrega 0190, `lib/ficha.ts`) — pequeno de propósito:
 * está na home e em toda página de produto. Sem o `fb_conta` (quem não está
 * com a conta aberta: quase todo mundo), não faz nada nem baixa nada. Com
 * ele, baixa quem pergunta (`./ler-ficha`): uma pergunta por aba, guardada
 * meia hora.
 */

export const lerCookie = (nome: string) => {
  const achado = document.cookie.split("; ").find((c) => c.startsWith(`${nome}=`))
  return achado ? decodeURIComponent(achado.slice(nome.length + 1)) : null
}

/** A ficha de quem está com a conta aberta; `null` pra todo o resto (e enquanto ela não chega). */
export function useFicha(): FichaDoSite | null {
  const [ficha, setFicha] = useState<FichaDoSite | null>(null)
  useEffect(() => {
    const conta = lerCookie(COOKIE_CONTA_ABERTA)
    if (!ehSorteioDaConta(conta)) return
    let vivo = true
    import("./ler-ficha")
      .then((m) => m.lerFicha(conta))
      .then((f) => {
        if (vivo) setFicha(f)
      })
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [])
  return ficha
}
