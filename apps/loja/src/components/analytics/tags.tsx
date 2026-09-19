import Script from "next/script"
import { GoogleAnalytics } from "@next/third-parties/google"
import { Consentimento, COOKIE_CONSENTIMENTO } from "./consentimento"

/**
 * Tags de terceiros — só GA4 na fase 1, e só se NEXT_PUBLIC_GA4_ID existir.
 *
 * Ordem importa:
 *  1. `consent default` roda ANTES de qualquer tag (beforeInteractive), com
 *     os quatro sinais do Consent Mode v2 negados. Se o visitante já aceitou
 *     antes (cookie), vira granted no mesmo script, ainda antes do gtag.
 *  2. O GA4 carrega depois da hidratação via @next/third-parties. Negado, ele
 *     manda pings sem cookie (modelagem); aceito, mede normal.
 *  3. O Pixel da Meta entra na fase 3, no mesmo lugar, e só com aceite.
 */
export function Tags() {
  const ga4 = process.env.NEXT_PUBLIC_GA4_ID
  if (!ga4) return null

  const scriptConsentimento = `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
(function(){
  var aceitou = document.cookie.split('; ').some(function(c){ return c === '${COOKIE_CONSENTIMENTO}=sim'; });
  var estado = aceitou ? 'granted' : 'denied';
  gtag('consent', 'default', {
    ad_storage: estado,
    analytics_storage: estado,
    ad_user_data: estado,
    ad_personalization: estado,
    wait_for_update: 500
  });
})();`.trim()

  return (
    <>
      {/* No App Router, beforeInteractive é permitido a partir do layout raiz; a regra é do Pages Router. */}
      {/* eslint-disable-next-line @next/next/no-before-interactive-script-outside-document */}
      <Script id="consentimento-padrao" strategy="beforeInteractive">
        {scriptConsentimento}
      </Script>
      <GoogleAnalytics gaId={ga4} />
      <Consentimento />
    </>
  )
}
