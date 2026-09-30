import { devolverACampanha } from "@/lib/chegada"
import type { Integracoes } from "@/lib/configuracoes"
import {
  ligarPeloServidor,
  passoPeloServidor,
  pixelBloqueado,
  type Destino,
} from "@/lib/pelo-servidor"
import { integracoesLigadas, registrarPeloServidor } from "@/lib/rastrear"

/**
 * AS TAGS DE CADA PARCEIRO — `tags.tsx` chama, e baixa este arquivo só
 * quando alguma liga.
 *
 * TODAS LIGAM NA PRIMEIRA PÁGINA, antes da resposta da faixa, COMO NA
 * NUVEMSHOP (0230, pedido do dono, com o aval dos advogados: os gestores de
 * tráfego recebiam bem menos eventos): o GA4 e o Google Ads com o
 * consentimento do Google todo liberado — o mesmo `consent default` que a
 * Nuvemshop mandava —, o pixel da Meta com o PageView, o do TikTok e a
 * Clarity. Antes, só o GA4 e a Clarity ligavam sem resposta (0166 e 0171), e
 * o resto esperava o "Aceitar". Só quem recusa na política de privacidade
 * fica de fora: nada disto liga, e se já estava na página, ela recarrega sem
 * (`mudar-resposta.tsx`).
 *
 * O trecho de cada um é o oficial da plataforma, com o código de dentro
 * conferido de novo aqui (`FORMATO`, o mesmo do backend): o código vai
 * dentro de um <script>, e o que não tem a cara do código não entra.
 *
 * A META E O TIKTOK TAMBÉM PELO SERVIDOR (entrega 0231, `lib/pelo-servidor.ts`):
 * os eventos padrão vão pros dois caminhos, com o mesmo id, e a visita à
 * página só pelo servidor quando o pixel não carrega — o script que dá erro
 * (o bloqueador recusou) ou, na Meta, o que carregou sem funcionar (o
 * bloqueador trocou por um vazio: o `fbq.callMethod` de verdade não aparece).
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

let ligadas = false

/** Liga todas, uma vez por página (a troca de página não recarrega o layout). */
export function ligarIntegracoes(i: Integracoes) {
  if (typeof window === "undefined" || ligadas) return
  ligadas = true
  // Antes de qualquer script: cada um lê a campanha no endereço quando liga (`lib/chegada.ts`).
  // Na página da chegada ela já está lá, e nada muda.
  devolverACampanha()

  const ga4 = codigo(i, "ga4")
  const ads = codigo(i, "googleAds")
  if (ga4 || ads) {
    // O `gtag` empurra o `arguments` — um array (a flecha) o gtag.js ignora.
    trecho(`
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
gtag('consent', 'default', {ad_storage:'granted', ad_user_data:'granted', ad_personalization:'granted', analytics_storage:'granted'});
gtag('js', new Date());
${ga4 ? `gtag('config', '${ga4}');` : ""}
${ads ? `gtag('config', '${ads}');` : ""}`)
    const s = document.createElement("script")
    s.async = true
    s.src = `https://www.googletagmanager.com/gtag/js?id=${ga4 ?? ads}`
    document.head.appendChild(s)
  }

  const clarity = codigo(i, "clarity")
  if (clarity)
    trecho(`
(function(c,l,a,r,i,t,y){
c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window, document, "clarity", "script", "${clarity}");
window.clarity('consentv2', {ad_Storage: 'granted', analytics_Storage: 'granted'});`)

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

  // Antes da porta abrir: a fila que espera nela já sai com o envio pelo servidor.
  const peloServidor: Destino[] = []
  if (meta) peloServidor.push("meta")
  if (tiktok) peloServidor.push("tiktok")
  ligarPeloServidor(peloServidor)
  registrarPeloServidor(passoPeloServidor)
  if (meta)
    vigiarOScript(
      "connect.facebook.net",
      "meta",
      () => typeof window.fbq?.callMethod === "function"
    )
  if (tiktok) vigiarOScript("analytics.tiktok.com", "tiktok")

  // As funções de cada um já existem (os trechos guardam a chamada até o script chegar).
  integracoesLigadas()
}

/**
 * O script do pixel que o trecho acabou de pôr na página: erro é o
 * bloqueador; carregado, e sem funcionar 2 segundos depois, também. O erro
 * chega depois (a rede é assíncrona): dá tempo de escutar.
 */
function vigiarOScript(host: string, d: Destino, funcionando?: () => boolean) {
  const s = document.querySelector<HTMLScriptElement>(`script[src*="${host}"]`)
  if (!s) {
    pixelBloqueado(d)
    return
  }
  s.addEventListener("error", () => pixelBloqueado(d), { once: true })
  if (funcionando)
    s.addEventListener("load", () => setTimeout(() => funcionando() || pixelBloqueado(d), 2000), {
      once: true,
    })
}
