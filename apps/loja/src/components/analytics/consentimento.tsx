"use client"

import { useSyncExternalStore } from "react"
import Link from "next/link"
import {
  COOKIE_CONSENTIMENTO,
  lerConsentimento,
  NOME_DO_PARCEIRO,
  respostaQueVale,
  valorDoConsentimento,
  type Parceiro,
  type Resposta,
} from "@/lib/consentimento"
import { rastrear } from "@/lib/rastrear"

const UM_ANO = 60 * 60 * 24 * 365

export type Estado = Resposta | "sem-resposta" | "servidor"

// Mini store: o cookie é a fonte de verdade; quem grava avisa quem lê.
const ouvintes = new Set<() => void>()
function assinar(cb: () => void) {
  ouvintes.add(cb)
  return () => ouvintes.delete(cb)
}
function lerCookie(): string {
  const par = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE_CONSENTIMENTO}=`))
  return par?.slice(COOKIE_CONSENTIMENTO.length + 1) ?? ""
}

/**
 * A resposta que vale pra estes parceiros (`lib/consentimento.ts`): a de
 * outra versão da faixa, ou a que não viu um parceiro novo, volta a ser
 * "sem-resposta". No servidor é "servidor" — não desenha nada, pra faixa não
 * piscar no HTML de quem já respondeu.
 */
export function useConsentimento(parceiros: Parceiro[]): Estado {
  const cookie = useSyncExternalStore(assinar, lerCookie, () => null)
  if (cookie === null) return "servidor"
  return respostaQueVale(lerConsentimento(cookie), parceiros) ?? "sem-resposta"
}

function responder(resposta: Resposta, parceiros: Parceiro[]) {
  document.cookie = `${COOKIE_CONSENTIMENTO}=${valorDoConsentimento(resposta, parceiros)}; Max-Age=${UM_ANO}; Path=/; SameSite=Lax; Secure`
  ouvintes.forEach((cb) => cb())
  rastrear("consentimento", { marketing: resposta === "sim" })
}

/** "do Google", "da Meta", "do TikTok", "da Microsoft". */
const ARTIGO: Record<Parceiro, string> = { google: "do", meta: "da", tiktok: "do", clarity: "da" }

const emLista = (nomes: string[]) =>
  nomes.length > 1 ? `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}` : (nomes[0] ?? "")

/**
 * Faixa de consentimento (LGPD): discreta, dois botões de peso igual, sem
 * parede. Diz A QUEM a pessoa está dizendo sim — os parceiros ligados no
 * painel —, e a resposta vive num cookie próprio por 12 meses. No checkout,
 * ela vai gravada no pedido (`fb_rastro.consentimento`): a compra só sai pelo
 * servidor pros parceiros que ouviram sim.
 */
export function Consentimento({ parceiros, estado }: { parceiros: Parceiro[]; estado: Estado }) {
  if (estado !== "sem-resposta") return null
  const nomes = emLista(parceiros.map((p) => `${ARTIGO[p]} ${NOME_DO_PARCEIRO[p]}`))
  const anuncio = parceiros.some((p) => p !== "clarity")

  return (
    <div
      role="region"
      aria-label="Aviso de cookies"
      data-faixa-de-cookies
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl border-2 border-tinta bg-papel p-4 shadow-dura-sm sm:inset-x-4 sm:bottom-4"
    >
      <p className="text-sm leading-snug text-tinta">
        Usamos cookies {nomes} pra medir o que funciona na loja
        {anuncio ? " e mostrar anúncios menos aleatórios" : ""}. Você escolhe.{" "}
        <Link href="/privacidade" className="font-bold underline underline-offset-2">
          Como usamos seus dados
        </Link>
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => responder("nao", parceiros)}
          className="chanfro-sm border-2 border-tinta bg-papel px-3 py-2 text-sm font-extrabold uppercase tracking-wide text-tinta"
        >
          Só o necessário
        </button>
        <button
          type="button"
          onClick={() => responder("sim", parceiros)}
          className="chanfro-sm border-2 border-tinta bg-amarelo px-3 py-2 text-sm font-extrabold uppercase tracking-wide text-tinta"
        >
          Aceitar
        </button>
      </div>
    </div>
  )
}
