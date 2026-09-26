"use client"

import { COOKIE_CONSENTIMENTO } from "@/lib/consentimento"

/**
 * "Mudar minha resposta" — na política de privacidade: a resposta sai e a
 * página recarrega, com a faixa de cookies perguntando de novo. Dizer não,
 * agora, apaga o que a loja anotou deste navegador (`responder`, em
 * `consentimento.tsx`). É o "retirar o consentimento a qualquer momento" da
 * LGPD, sem precisar apagar os cookies do navegador na mão.
 *
 * Recarrega em vez de avisar a faixa: assim nada disto vai no código da
 * faixa, que toda página carrega (a home mede cada byte no Lighthouse).
 */
function perguntarDeNovo() {
  document.cookie = `${COOKIE_CONSENTIMENTO}=; Max-Age=0; Path=/; SameSite=Lax; Secure`
  window.location.reload()
}

export function MudarResposta() {
  return (
    <button
      type="button"
      onClick={perguntarDeNovo}
      data-mudar-resposta
      className="chanfro-sm border-2 border-tinta bg-papel px-3 py-2 text-sm font-extrabold uppercase tracking-wide text-tinta"
    >
      Mudar minha resposta sobre os cookies
    </button>
  )
}
