"use client"

import { useSyncExternalStore } from "react"
import {
  COOKIE_CONSENTIMENTO,
  lerConsentimento,
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

/** O "Entendi": a resposta fica por um ano, e o CRM da loja passa a anotar (`tags.tsx`). */
function entendi(parceiros: Parceiro[]) {
  gravarResposta("sim", parceiros)
  rastrear("consentimento", { marketing: true })
}

/** Grava a resposta e avisa quem lê (a faixa, as tags, a política). */
export function gravarResposta(resposta: Resposta, parceiros: Parceiro[]) {
  document.cookie = `${COOKIE_CONSENTIMENTO}=${valorDoConsentimento(resposta, parceiros)}; Max-Age=${UM_ANO}; Path=/; SameSite=Lax; Secure`
  ouvintes.forEach((cb) => cb())
}

/**
 * Faixa de cookies: IGUAL À DA NUVEMSHOP — o texto de lá, com o destaque de
 * lá (0172), e um botão só, "Entendi" (0230, pedido do dono). Ela avisa; as
 * tags dos parceiros já ligaram na primeira página (`tags.tsx`). Quem não
 * quer os cookies de medição e anúncio recusa na política de privacidade, no
 * rodapé de toda página (`mudar-resposta.tsx`). O "Entendi" vive num cookie
 * próprio por 12 meses, com os parceiros ligados no painel (entrou um novo,
 * a faixa aparece de novo), e é o que libera o CRM da loja.
 *
 * Mora no pé da tela, EM CIMA da barra que estiver presa lá — a de compra da
 * PDP, a do total no checkout do celular —, que diz a altura em
 * `--pe-da-tela` (`lib/use-pe-da-tela.ts`); sobe e desce junto com ela. No
 * celular é menor: letra de 12 px.
 */
export function Consentimento({ parceiros, estado }: { parceiros: Parceiro[]; estado: Estado }) {
  if (estado !== "sem-resposta") return null

  return (
    <div
      role="region"
      aria-label="Aviso de cookies"
      data-faixa-de-cookies
      className="fixed inset-x-2 bottom-[calc(var(--pe-da-tela,0px)_+_0.5rem)] z-50 mx-auto flex max-w-xl items-center gap-3 border-2 border-tinta bg-papel p-3 shadow-dura-sm transition-[bottom] duration-[260ms] ease-[cubic-bezier(0.22,0.61,0.36,1)] motion-reduce:transition-none sm:inset-x-4 sm:bottom-[calc(var(--pe-da-tela,0px)_+_1rem)] sm:gap-4 sm:p-4"
    >
      <p className="flex-1 text-xs leading-snug text-tinta sm:text-sm">
        Ao navegar por este site <b>você aceita o uso de cookies</b> para agilizar a sua experiência
        de compra.
      </p>
      <button
        type="button"
        onClick={() => entendi(parceiros)}
        className="chanfro-sm shrink-0 border-2 border-tinta bg-amarelo px-4 py-2 text-[0.7rem] font-extrabold uppercase tracking-wide text-tinta sm:px-5 sm:text-sm"
      >
        Entendi
      </button>
    </div>
  )
}
