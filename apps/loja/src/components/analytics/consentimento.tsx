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
import { rastrear, tagsNaPagina } from "@/lib/rastrear"

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

/**
 * Os cookies que os parceiros gravam no domínio da loja: o GA4 (`_ga`,
 * `_ga_<código>`), o Google Ads (`_gcl_…`), a Meta, o TikTok e a Clarity.
 */
const DOS_PARCEIROS = /^_(ga|gcl_|fb[pc]$|ttp$|cl(ck|sk)$)/

/** Apaga os dos parceiros — sem domínio e em cada um de cima: o GA4 grava em ".fuckingbarba.com.br". */
function apagarOsCookiesDosParceiros() {
  const partes = location.hostname.split(".")
  for (const par of document.cookie.split("; ")) {
    const nome = par.split("=")[0]
    if (DOS_PARCEIROS.test(nome))
      for (let i = 0; i < partes.length; i++)
        document.cookie = `${nome}=; Max-Age=0; Path=/${i ? `; Domain=.${partes.slice(i - 1).join(".")}` : ""}`
  }
}

/**
 * A resposta da faixa. O "não" também pede à loja pra esquecer este
 * navegador (`/api/eventos`, DELETE): o cookie do visitante sai, e o que o
 * CRM anotou dele é apagado. Se já tem tag na página — o GA4, que liga antes
 * da resposta, ou todas, de quem tinha dito sim e mudou de ideia pela
 * política de privacidade —, o GA4 para na hora (a chave de desligar do
 * próprio Google), os cookies dos parceiros saem e a página recarrega: é o
 * único jeito de tirar um script que já carregou. O "não" não vira evento.
 */
function responder(resposta: Resposta, parceiros: Parceiro[], ga4: string | null) {
  document.cookie = `${COOKIE_CONSENTIMENTO}=${valorDoConsentimento(resposta, parceiros)}; Max-Age=${UM_ANO}; Path=/; SameSite=Lax; Secure`
  ouvintes.forEach((cb) => cb())
  if (resposta === "sim") {
    rastrear("consentimento", { marketing: true })
    return
  }
  fetch("/api/eventos", { method: "DELETE", keepalive: true }).catch(() => undefined)
  if (!tagsNaPagina()) return
  if (ga4) Object.assign(window, { [`ga-disable-${ga4}`]: true })
  apagarOsCookiesDosParceiros()
  window.location.reload()
}

/** "do Google", "da Meta", "do TikTok", "da Microsoft". */
const ARTIGO: Record<Parceiro, string> = { google: "do", meta: "da", tiktok: "do", clarity: "da" }

const emLista = (nomes: string[]) =>
  nomes.length > 1 ? `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}` : (nomes[0] ?? "")

/**
 * Faixa de consentimento (LGPD): discreta, dois botões de peso igual, sem
 * parede. Diz o que já está medindo (o GA4, com o código dele no painel) e A
 * QUEM a pessoa está dizendo sim — a própria loja, que anota o que ela faz
 * pro CRM, e os parceiros ligados no painel —, e a resposta vive num cookie
 * próprio por 12 meses. No checkout, ela vai gravada no pedido
 * (`fb_rastro.consentimento`): a compra só sai pelo servidor pros parceiros
 * que ouviram sim — e pro GA4 de quem não disse não.
 *
 * Mora no pé da tela, EM CIMA da barra que estiver presa lá — a de compra da
 * PDP, a do total no checkout do celular —, que diz a altura em
 * `--pe-da-tela` (`lib/use-pe-da-tela.ts`); sobe e desce junto com ela. No
 * celular é menor: letra de 12 px e os botões numa linha só.
 */
export function Consentimento({
  parceiros,
  estado,
  ga4,
}: {
  parceiros: Parceiro[]
  estado: Estado
  ga4: string | null
}) {
  if (estado !== "sem-resposta") return null
  const nomes = emLista([
    "da própria loja",
    ...parceiros.map((p) => `${ARTIGO[p]} ${NOME_DO_PARCEIRO[p]}`),
  ])
  const anuncio = parceiros.some((p) => p !== "clarity")

  return (
    <div
      role="region"
      aria-label="Aviso de cookies"
      data-faixa-de-cookies
      className="fixed inset-x-2 bottom-[calc(var(--pe-da-tela,0px)_+_0.5rem)] z-50 mx-auto max-w-xl border-2 border-tinta bg-papel p-3 shadow-dura-sm transition-[bottom] duration-[260ms] ease-[cubic-bezier(0.22,0.61,0.36,1)] motion-reduce:transition-none sm:inset-x-4 sm:bottom-[calc(var(--pe-da-tela,0px)_+_1rem)] sm:p-4"
    >
      <p className="text-xs leading-snug text-tinta sm:text-sm">
        {ga4 ? "O Google Analytics conta as visitas. Com o seu sim, também usamos" : "Usamos"}{" "}
        cookies {nomes} pra lembrar o que você viu
        {anuncio
          ? ", medir o que funciona e mostrar anúncios menos aleatórios"
          : " e medir o que funciona"}
        . Você escolhe.{" "}
        {/*
          Sem pré-carregar: a faixa aparece na primeira tela de todo mundo, e o
          prefetch baixaria a política (o HTML dela, o CSS e o JS das páginas
          institucionais) no meio do carregamento da página — na home, isso
          custava um degrau inteiro no LCP do Lighthouse (entrega 0130).
        */}
        <Link
          href="/privacidade"
          prefetch={false}
          className="font-bold underline underline-offset-2"
        >
          Como usamos seus dados
        </Link>
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-3">
        <button
          type="button"
          onClick={() => responder("nao", parceiros, ga4)}
          className="chanfro-sm border-2 border-tinta bg-papel px-2 py-2 text-[0.7rem] font-extrabold uppercase tracking-wide text-tinta sm:px-3 sm:text-sm"
        >
          Só o necessário
        </button>
        <button
          type="button"
          onClick={() => responder("sim", parceiros, ga4)}
          className="chanfro-sm border-2 border-tinta bg-amarelo px-2 py-2 text-[0.7rem] font-extrabold uppercase tracking-wide text-tinta sm:px-3 sm:text-sm"
        >
          Aceitar
        </button>
      </div>
    </div>
  )
}
