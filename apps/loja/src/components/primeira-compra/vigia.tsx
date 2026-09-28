"use client"

import dynamic from "next/dynamic"
import { useCallback, useEffect, useRef, useState } from "react"
import { COOKIE_CONSENTIMENTO, lerConsentimento } from "@/lib/consentimento"
import {
  COOKIE_DO_POPUP,
  ESPERA_MS,
  podeMostrarPelaMarca,
  semPopupNesta,
  type ConfigDoPopup,
} from "@/lib/primeira-compra"

/**
 * O VIGIA DO POP-UP DA 1ª COMPRA — pequeno de propósito: está em toda página.
 * Conta os 20 segundos, olha a rolagem e o mouse saindo pra fechar a aba; na
 * hora, confere as regras (`lib/primeira-compra.ts`), pergunta ao servidor
 * (`/api/primeira-compra`) e só então baixa o pop-up (`./popup`), com o CSS
 * dele. Quem não vê o pop-up não baixa nada dele.
 *
 * NO CELULAR, a primeira tela da página em que a pessoa chegou fica livre (o
 * Google tira ponto de quem cobre): lá, só depois que ela rola.
 *
 * O endereço vem do navegador (`location`), na hora do gatilho, e não do
 * `usePathname`: no layout, fora de um `<Suspense>`, ele derruba as páginas
 * dinâmicas do Next 16 (o obrigado do checkout, o pedido da conta).
 */

const Popup = dynamic(() => import("./popup").then((m) => m.PopupDaPrimeiraCompra), {
  ssr: false,
})

const lerCookie = (nome: string) => {
  const achado = document.cookie.split("; ").find((c) => c.startsWith(`${nome}=`))
  return achado ? decodeURIComponent(achado.slice(nome.length + 1)) : null
}

const celular = () => matchMedia("(max-width: 640px)").matches

export function VigiaDaPrimeiraCompra() {
  const [aberto, setAberto] = useState<(ConfigDoPopup & { pagina: string }) | null>(null)
  const chegada = useRef<string | null>(null)
  const estado = useRef<"esperando" | "perguntando" | "feito">("esperando")

  const tentar = useCallback(async () => {
    if (estado.current !== "esperando") return
    const caminho = location.pathname
    if (semPopupNesta(caminho)) return
    if (!podeMostrarPelaMarca(lerCookie(COOKIE_DO_POPUP))) {
      estado.current = "feito"
      return
    }
    // A faixa de cookies ainda na tela, ou a sacola aberta: tenta de novo depois.
    if (!lerConsentimento(lerCookie(COOKIE_CONSENTIMENTO))) return
    if (document.documentElement.classList.contains("carrinho-aberto")) return
    if (celular() && caminho === chegada.current && scrollY < innerHeight / 2) return
    estado.current = "perguntando"
    try {
      const r = await fetch("/api/primeira-compra", { cache: "no-store" })
      const j = (await r.json()) as { mostrar?: boolean; porcento?: number; dias?: number }
      estado.current = "feito"
      if (j.mostrar)
        setAberto({
          porcento: Number(j.porcento) || 10,
          dias: Number(j.dias) || 3,
          pagina: location.pathname,
        })
    } catch {
      estado.current = "esperando"
    }
  }, [])

  useEffect(() => {
    chegada.current = location.pathname
    let disparou = false
    const disparar = () => {
      disparou = true
      void tentar()
    }
    const relogio = setTimeout(disparar, ESPERA_MS)
    const aoRolar = () => {
      const alto = document.documentElement.scrollHeight - innerHeight
      if (alto > 0 && scrollY / alto >= 0.5) disparar()
    }
    const aoSair = (e: MouseEvent) => {
      if (e.clientY <= 0 && matchMedia("(pointer: fine)").matches) disparar()
    }
    // Depois do primeiro gatilho, insiste de tempos em tempos (a faixa, a sacola, a 1ª tela).
    const insistir = setInterval(() => {
      if (disparou && estado.current === "esperando") void tentar()
    }, 4000)
    addEventListener("scroll", aoRolar, { passive: true })
    document.documentElement.addEventListener("mouseleave", aoSair)
    return () => {
      clearTimeout(relogio)
      clearInterval(insistir)
      removeEventListener("scroll", aoRolar)
      document.documentElement.removeEventListener("mouseleave", aoSair)
    }
  }, [tentar])

  if (!aberto) return null
  return <Popup {...aberto} aoFechar={() => setAberto(null)} />
}
