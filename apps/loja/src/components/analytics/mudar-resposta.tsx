"use client"

import { perguntarDeNovo } from "./consentimento"

/**
 * "Mudar minha resposta" — na política de privacidade: a faixa de cookies
 * volta a perguntar. Dizer não, agora, apaga o que a loja anotou deste
 * navegador (`responder`, em `consentimento.tsx`). É o "retirar o
 * consentimento a qualquer momento" da LGPD, sem precisar apagar os cookies
 * do navegador na mão.
 */
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
