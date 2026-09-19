import type { NextConfig } from "next"

const supabaseRef = process.env.NEXT_PUBLIC_SUPABASE_REF // ex.: abcdefghijklmnop

/**
 * O Medusa está na própria máquina (desenvolvimento), e não no Railway?
 *
 * Importa por causa do otimizador de imagem: o Next 16 se recusa a buscar
 * imagem de host que resolve pra IP privado — é proteção contra SSRF, e é o
 * comportamento certo em produção. Só que em desenvolvimento as fotos de
 * produto saem do próprio Medusa, em localhost:9000, e sem liberar isso a
 * vitrine local aparece com todos os quadros vazios, sem nenhuma pista na
 * tela: o motivo só aparece no log do servidor.
 *
 * A liberação fica presa a esta condição, e não a NODE_ENV, porque `next
 * build` e `next start` rodam como produção mesmo na sua máquina. Na Vercel
 * o MEDUSA_BACKEND_URL é o do Railway, então isto nunca liga lá.
 */
const medusaLocal = /\/\/(localhost|127\.0\.0\.1)/.test(process.env.MEDUSA_BACKEND_URL ?? "")

const nextConfig: NextConfig = {
  // Next 16: cache por componente/função ("use cache"), PPR por padrão.
  cacheComponents: true,
  typedRoutes: true,
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    // 1 ano: a URL da imagem muda quando o arquivo muda (Supabase Storage).
    minimumCacheTTL: 60 * 60 * 24 * 365,
    remotePatterns: [
      // Imagens de produto: Supabase Storage (bucket público "produtos").
      ...(supabaseRef
        ? [
            {
              protocol: "https" as const,
              hostname: `${supabaseRef}.supabase.co`,
              pathname: "/storage/v1/object/public/**",
            },
          ]
        : []),
      // Desenvolvimento: Medusa local servindo do disco.
      { protocol: "http" as const, hostname: "localhost", port: "9000", pathname: "/static/**" },
    ],
    // Ver o comentário de `medusaLocal` lá em cima. Nunca liga na Vercel.
    dangerouslyAllowLocalIP: medusaLocal,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ]
  },
}

export default nextConfig
