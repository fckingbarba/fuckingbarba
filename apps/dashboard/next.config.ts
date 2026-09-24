import type { NextConfig } from "next"

/**
 * O PAINEL DA LOJA — dashboard.fuckingbarba.com.br.
 *
 * Tudo aqui é de quem entrou, e muda a cada clique: sem `cacheComponents`,
 * sem página estática, sem imagem otimizada por enquanto. O que a loja faz
 * pra carregar rápido pro cliente (PPR, "use cache") aqui não compra nada —
 * a página sempre pergunta ao Medusa quem está entrando.
 *
 * E nunca aparece na busca: `X-Robots-Tag` em toda resposta, além do
 * `robots.txt` e da meta do layout.
 */
const nextConfig: NextConfig = {
  typedRoutes: true,
  poweredByHeader: false,
  experimental: {
    // A foto de fundo sobe por uma ação do servidor, já encolhida no navegador
    // (até 3,5 MB — `lib/imagem-no-navegador.ts`). O padrão é 1 MB; a Vercel
    // não passa de 4,5.
    serverActions: { bodySizeLimit: "4mb" },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          // Endereço do painel não vaza pra site nenhum que um link abra.
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ]
  },
}

export default nextConfig
