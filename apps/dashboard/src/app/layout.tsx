import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import type { ReactNode } from "react"
import "./globals.css"

// Inter do próprio domínio (next/font baixa no build), como na loja. O itálico
// 800 é o dos títulos (`.cabeca h1`, a marca na lateral).
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
})

export const metadata: Metadata = {
  title: { default: "Painel FuckingBarba", template: "%s · Painel FuckingBarba" },
  description: "O painel da loja FuckingBarba, pra equipe.",
  // Nunca na busca — o `X-Robots-Tag` do next.config.ts e o robots.txt repetem.
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  // Preto: a barra do celular e a lateral do painel.
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body>{children}</body>
    </html>
  )
}
