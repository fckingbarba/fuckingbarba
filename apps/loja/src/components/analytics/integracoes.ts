import { devolverACampanha } from "@/lib/chegada"
import type { Integracoes } from "@/lib/configuracoes"
import { integracoesLigadas, medicaoLigada } from "@/lib/rastrear"

/**
 * AS TAGS DE CADA PARCEIRO, em dois tempos (`tags.tsx` chama, e baixa este
 * arquivo só quando alguma liga):
 *
 * 1. O GA4 E A CLARITY LIGAM NA PRIMEIRA PÁGINA, antes da resposta da faixa
 *    — como na Nuvemshop, que contava e gravava todo mundo (0166: o dono quer
 *    as visitas contadas do mesmo jeito; 0171: e a jornada de quem não
 *    responde, na Clarity). Ligam com a medição permitida e o anúncio negado
 *    (o modo do consentimento do Google e o `consentv2` da Clarity): contam e
 *    gravam a visita, e não guardam nada pra anúncio. Quem clica em "Só o
 *    necessário" sai: os dois nem ligam, e se já estavam na página, ela
 *    recarrega sem eles (`consentimento.tsx`).
 * 2. O RESTO SÓ DEPOIS DO "ACEITAR": o anúncio do Google (o `consent update`
 *    e o Google Ads) e o da Microsoft (o `consentv2`), a Meta e o TikTok.
 *    Antes dele não existe script deles na página — é o que a política de
 *    privacidade promete.
 *
 * O trecho de cada um é o oficial da plataforma, com o código de dentro
 * conferido de novo aqui (`FORMATO`, o mesmo do backend): o código vai
 * dentro de um <script>, e o que não tem a cara do código não entra.
 *
 * AS TROCAS DE PÁGINA cada um conta sozinho: o GA4 (medição aprimorada), o
 * pixel da Meta e o do TikTok escutam o histórico do navegador, e a Clarity
 * também. Mandar a visita à mão de novo contaria duas vezes.
 */

const FORMATO: Record<keyof Integracoes, RegExp> = {
  ga4: /^G-[A-Z0-9]{4,20}$/,
  googleAds: /^AW-\d{6,15}$/,
  googleAdsCompra: /^[A-Za-z0-9_-]{4,64}$/,
  metaPixel: /^\d{10,20}$/,
  clarity: /^[a-z0-9]{6,20}$/,
  tiktok: /^[A-Z0-9]{15,30}$/,
}

/** O código, se tiver a cara da plataforma. */
export function codigo(i: Integracoes, chave: keyof Integracoes): string | null {
  const v = i[chave]
  return v && FORMATO[chave].test(v) ? v : null
}

function trecho(js: string) {
  const s = document.createElement("script")
  s.text = js
  document.head.appendChild(s)
}

let medindo = false
let gravando = false
let ligadas = false

/**
 * Liga o que a resposta permite, uma vez por página (a troca de página não
 * recarrega o layout): sem resposta, o GA4 e a Clarity; com o sim, tudo. O
 * sim que chega com eles já no ar só acrescenta.
 */
export function ligarIntegracoes(i: Integracoes, sim: boolean) {
  if (typeof window === "undefined" || ligadas) return
  // Antes de qualquer script do sim: cada um lê a campanha no endereço quando liga
  // (`lib/chegada.ts`). O GA4 e a Clarity já leram na chegada, se ligaram lá — e veem
  // a campanha voltar como uma página a mais, só de quem aceita depois de trocar de página.
  if (sim) devolverACampanha()

  const ga4 = codigo(i, "ga4")
  const ads = sim ? codigo(i, "googleAds") : null
  const anuncio = sim ? "granted" : "denied"
  if (!medindo && (ga4 || ads)) {
    medindo = true
    // O `gtag` empurra o `arguments` — um array (a flecha) o gtag.js ignora.
    trecho(`
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
gtag('consent', 'default', {analytics_storage:'granted', ad_storage:'${anuncio}', ad_user_data:'${anuncio}', ad_personalization:'${anuncio}'});
gtag('js', new Date());
${ga4 ? `gtag('config', '${ga4}');` : ""}`)
    const s = document.createElement("script")
    s.async = true
    s.src = `https://www.googletagmanager.com/gtag/js?id=${ga4 ?? ads}`
    document.head.appendChild(s)
  }

  // A gravação da Clarity: a jornada de quem aceita e de quem não responde (0171).
  const clarity = codigo(i, "clarity")
  if (!gravando && clarity) {
    gravando = true
    trecho(`
(function(c,l,a,r,i,t,y){
c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window, document, "clarity", "script", "${clarity}");
window.clarity('consentv2', {ad_Storage: '${anuncio}', analytics_Storage: 'granted'});`)
  }
  if (medindo || gravando) medicaoLigada()
  if (!sim) return
  ligadas = true
  // O GA4 e a Clarity no ar desde antes da resposta: o anúncio de cada um passa a valer.
  window.gtag?.("consent", "update", {
    ad_storage: "granted",
    ad_user_data: "granted",
    ad_personalization: "granted",
  })
  window.clarity?.("consentv2", { ad_Storage: "granted", analytics_Storage: "granted" })
  if (ads) window.gtag?.("config", ads)

  const meta = codigo(i, "metaPixel")
  if (meta)
    trecho(`
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${meta}');
fbq('track', 'PageView');`)

  const tiktok = codigo(i, "tiktok")
  if (tiktok)
    trecho(`
!function (w, d, t) {
  w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(
var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script")
;n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
  ttq.load('${tiktok}');
  ttq.page();
}(window, document, 'ttq');`)

  // As funções de cada um já existem (os trechos guardam a chamada até o script chegar).
  integracoesLigadas()
}
