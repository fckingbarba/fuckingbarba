import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import { Tags } from "@/components/analytics/tags"
import { Anuncio } from "@/components/layout/anuncio"
import { Cabecalho } from "@/components/layout/cabecalho"
import { Rodape } from "@/components/layout/rodape"
import { emProducao, site } from "@/lib/site"
import "./globals.css"

// Inter servida do próprio domínio (next/font baixa no build): zero request
// pra fontes do Google em produção, sem layout shift.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "600", "700", "800"],
})

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.nome} — cosméticos pra barba e cabelo`,
    template: `%s · ${site.nome}`,
  },
  description: site.descricao,
  applicationName: site.nome,
  // Preview e staging nunca indexam; produção libera (robots.ts repete a regra).
  robots: emProducao ? { index: true, follow: true } : { index: false, follow: false },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: site.nome,
    title: `${site.nome} — cosméticos pra barba e cabelo`,
    description: site.descricao,
  },
  twitter: { card: "summary_large_image" },
}

export const viewport: Viewport = {
  themeColor: "#4fe4b6",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a href="#conteudo" className="sr-only-focusable">
          Pular para o conteúdo
        </a>
        {/* A carcaça é a mesma em toda página: esteira, cabeçalho, rodapé.
            Cada página entrega o próprio <main id="conteudo">. */}
        <Anuncio />
        <Cabecalho />
        {children}
        <Rodape />
        <Tags />
      </body>
    </html>
  )
}
