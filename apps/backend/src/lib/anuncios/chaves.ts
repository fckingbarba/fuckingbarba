/**
 * AS CHAVES DA COMPRA PELO SERVIDOR — segredo, então no Railway, e nunca no
 * metadata da loja (que a rota pública lê). O código de cada pixel, que é
 * público, mora nas configurações (`integracoes`); a chave diz que a
 * plataforma aceita a compra vinda do servidor.
 *
 * - `META_CAPI_TOKEN`: o token da API de Conversões da Meta (Gerenciador de
 *   Eventos → o pixel → Configurações → Gerar token de acesso).
 * - `GA4_API_SECRET`: o segredo do Measurement Protocol (GA4 → Administrador
 *   → Fluxos de dados → o site → Chaves secretas da API do Measurement
 *   Protocol).
 * - `TIKTOK_EVENTS_TOKEN`: o token da Events API (TikTok Ads Manager →
 *   Eventos → o pixel → Configurações → Gerar token de acesso).
 *
 * `META_GRAPH_URL`, `GA4_MP_URL` e `TIKTOK_EVENTS_URL` só existem pros
 * conferidores apontarem os falsos (`apps/loja/ferramentas/anuncios-falsos.mjs`).
 */
export const chavesDosAnuncios = () => ({
  meta: Boolean(process.env.META_CAPI_TOKEN),
  ga4: Boolean(process.env.GA4_API_SECRET),
  tiktok: Boolean(process.env.TIKTOK_EVENTS_TOKEN),
})
