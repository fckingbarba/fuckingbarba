/**
 * A IMAGEM QUE A LOJA MOSTRA SAI DO ARMAZENAMENTO DELA — o fundo das seções
 * (da página do produto e da home), as artes do banner, as fotos dos casos
 * e os vídeos.
 *
 * Mora sozinha, sem falar com o Medusa, porque dois leitores usam: o da PDP
 * (`lib/pdp.ts`) e o da home (`lib/home.ts`).
 *
 * A foto de fundo passa pelo otimizador de imagem do Next, que só abre os
 * hosts de `next.config.ts`: o Supabase Storage e, na máquina de quem
 * desenvolve, o Medusa local. Endereço de fora (o admin antigo aceitava
 * qualquer um) quebraria a página em desenvolvimento e sairia como imagem
 * quebrada em produção — fica de fora, e a seção sai com a cor dela.
 */
export function ehDoArmazenamento(url: string): boolean {
  const ref = process.env.NEXT_PUBLIC_SUPABASE_REF
  if (ref && url.startsWith(`https://${ref}.supabase.co/storage/v1/object/public/`)) return true
  const medusa = (process.env.MEDUSA_BACKEND_URL ?? "").replace(/\/+$/, "")
  if (!/\/\/(localhost|127\.0\.0\.1)/.test(medusa)) return false
  // Na máquina de quem desenvolve: o disco do Medusa local, na 9000 ou na porta dele
  // (sessões em paralelo sobem em portas próprias — `next.config.ts` libera as duas).
  return url.startsWith("http://localhost:9000/static/") || url.startsWith(`${medusa}/static/`)
}
