"use client"

import { useMemo } from "react"
import type { Integracoes } from "@/lib/configuracoes"
import { COOKIE_CONSENTIMENTO, parceirosDe, type Parceiro } from "@/lib/consentimento"
import { tagsNaPagina } from "@/lib/rastrear"
import { gravarResposta, useConsentimento } from "./consentimento"

/**
 * A RESPOSTA SOBRE OS COOKIES, NA POLÍTICA DE PRIVACIDADE — o lugar de
 * recusar desde a 0230, quando a faixa ficou igual à da Nuvemshop, com um
 * botão só. É o "retirar o consentimento a qualquer momento" da LGPD, sem
 * precisar apagar os cookies do navegador na mão.
 *
 * - RECUSAR: a resposta vira "não" e a loja esquece este navegador
 *   (`/api/eventos`, DELETE: o cookie do visitante sai, e o que o CRM anotou
 *   dele é apagado). Com as tags na página, o GA4 e a Clarity param na hora
 *   (a chave de desligar do Google e o `consentv2` negado da Clarity), os
 *   cookies dos parceiros saem e a página recarrega: é o único jeito de
 *   tirar um script que já carregou. Nada liga de novo, em nenhuma página.
 * - VOLTAR A ACEITAR: a resposta sai, e a página recarrega com as tags e a
 *   faixa, como na primeira visita.
 *
 * Mora só aqui, e não na faixa, que toda página carrega (a home mede cada
 * byte no Lighthouse).
 */

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

function recusar(parceiros: Parceiro[], ga4: string | null) {
  gravarResposta("nao", parceiros)
  fetch("/api/eventos", { method: "DELETE", keepalive: true }).catch(() => undefined)
  if (tagsNaPagina()) {
    if (ga4) Object.assign(window, { [`ga-disable-${ga4}`]: true })
    window.clarity?.("consentv2", { ad_Storage: "denied", analytics_Storage: "denied" })
  }
  apagarOsCookiesDosParceiros()
  window.location.reload()
}

function voltarAAceitar() {
  document.cookie = `${COOKIE_CONSENTIMENTO}=; Max-Age=0; Path=/; SameSite=Lax; Secure`
  window.location.reload()
}

const BOTAO =
  "chanfro-sm border-2 border-tinta bg-papel px-3 py-2 text-sm font-extrabold uppercase tracking-wide text-tinta"

export function MudarResposta({ integracoes }: { integracoes: Integracoes }) {
  const parceiros = useMemo(() => parceirosDe(integracoes), [integracoes])
  const estado = useConsentimento(parceiros)
  if (estado === "servidor") return null

  if (estado === "nao")
    return (
      <div data-resposta-dos-cookies="nao" className="flex flex-col items-start gap-2">
        <p className="text-sm font-bold text-tinta">
          Você recusou os cookies de medição e anúncio neste navegador.
        </p>
        <button type="button" onClick={voltarAAceitar} data-mudar-resposta className={BOTAO}>
          Voltar a aceitar os cookies
        </button>
      </div>
    )

  return (
    <div data-resposta-dos-cookies="aceita">
      <button
        type="button"
        onClick={() => recusar(parceiros, integracoes.ga4)}
        data-mudar-resposta
        className={BOTAO}
      >
        Recusar os cookies de medição e anúncio
      </button>
    </div>
  )
}
