"use client"

import { useSyncExternalStore } from "react"
import Link from "next/link"
import { rastrear } from "@/lib/rastrear"

export const COOKIE_CONSENTIMENTO = "fb_consentimento"
const UM_ANO = 60 * 60 * 24 * 365

type Resposta = "sim" | "nao"
type Estado = Resposta | "sem-resposta" | "servidor"

// Mini store: o cookie é a fonte de verdade; quem grava avisa quem lê.
const ouvintes = new Set<() => void>()
function assinar(cb: () => void) {
  ouvintes.add(cb)
  return () => ouvintes.delete(cb)
}
function lerEstado(): Estado {
  const par = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE_CONSENTIMENTO}=`))
  const valor = par?.split("=")[1]
  return valor === "sim" || valor === "nao" ? valor : "sem-resposta"
}
function gravar(resposta: Resposta) {
  document.cookie = `${COOKIE_CONSENTIMENTO}=${resposta}; Max-Age=${UM_ANO}; Path=/; SameSite=Lax; Secure`
  ouvintes.forEach((cb) => cb())
}

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

/**
 * Faixa de consentimento (LGPD): discreta, dois botões de peso igual, sem
 * parede. A resposta vive num cookie próprio por 12 meses e vai gravada no
 * pedido no checkout (`consentimento_marketing`), pra auditoria.
 *
 * No servidor o estado é "servidor" (não renderiza nada) — evita a faixa
 * piscar no HTML pra quem já respondeu.
 */
export function Consentimento() {
  const estado = useSyncExternalStore(assinar, lerEstado, () => "servidor" as Estado)

  function responder(resposta: Resposta) {
    gravar(resposta)
    const sinal = resposta === "sim" ? "granted" : "denied"
    window.gtag?.("consent", "update", {
      ad_storage: sinal,
      analytics_storage: sinal,
      ad_user_data: sinal,
      ad_personalization: sinal,
    })
    rastrear("consentimento", { marketing: resposta === "sim" })
  }

  if (estado !== "sem-resposta") return null

  return (
    <div
      role="region"
      aria-label="Aviso de cookies"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl border-2 border-tinta bg-papel p-4 shadow-dura-sm sm:inset-x-4 sm:bottom-4"
    >
      <p className="text-sm leading-snug text-tinta">
        Usamos cookies pra medir o que funciona na loja e pra mostrar anúncios menos aleatórios.
        Você escolhe.{" "}
        <Link href="/privacidade" className="font-bold underline underline-offset-2">
          Como usamos seus dados
        </Link>
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => responder("nao")}
          className="chanfro-sm border-2 border-tinta bg-papel px-3 py-2 text-sm font-extrabold uppercase tracking-wide text-tinta"
        >
          Só o necessário
        </button>
        <button
          type="button"
          onClick={() => responder("sim")}
          className="chanfro-sm border-2 border-tinta bg-amarelo px-3 py-2 text-sm font-extrabold uppercase tracking-wide text-tinta"
        >
          Aceitar
        </button>
      </div>
    </div>
  )
}
