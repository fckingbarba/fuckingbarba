import type { NextConfig } from "next"

const supabaseRef = process.env.NEXT_PUBLIC_SUPABASE_REF // ex.: abcdefghijklmnop

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
