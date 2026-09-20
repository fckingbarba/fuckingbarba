import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import { Tags } from "@/components/analytics/tags"
import { SimboloEstrela } from "@/components/estrelas"
import { Anuncio } from "@/components/layout/anuncio"
import { Cabecalho } from "@/components/layout/cabecalho"
import { Rodape } from "@/components/layout/rodape"
import { ProvedorDoFrete } from "@/components/configuracoes/contexto"
import { ProvedorDaSacola } from "@/components/sacola/contexto"
import { Gaveta } from "@/components/sacola/gaveta"
import { configuracoes } from "@/lib/medusa"
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

/**
 * `async` por causa das configurações: a política de frete é lida do Medusa
 * aqui, uma vez, e entregue às telas de cliente pelo provedor. Esperar no
 * layout raiz seria caro se a leitura fosse dinâmica — ela é `"use cache"`,
 * então resolve na pré-renderização e a casca continua saindo estática.
 */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { frete } = await configuracoes()

  return (
    <html lang="pt-BR" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a href="#conteudo" className="sr-only-focusable">
          Pular para o conteúdo
        </a>
        {/* A carcaça é a mesma em toda página: esteira, cabeçalho, rodapé.
            Cada página entrega o próprio <main id="conteudo">. */}
        {/* O desenho da estrela, uma vez por página: as avaliações
            referenciam por <use> em vez de repetir o path dez vezes cada. */}
        <SimboloEstrela />
        {/*
          O provedor da sacola envolve a carcaça inteira porque o contador do
          cabeçalho e a gaveta precisam do MESMO estado, e os dois nascem
          aqui. `children` continua sendo componente de servidor: ele entra
          como prop já renderizada, não vira cliente por estar dentro.
        */}
        <ProvedorDoFrete politica={frete}>
          <ProvedorDaSacola>
            <Anuncio />
            <Cabecalho />
            {children}
            <Rodape />
            <Gaveta />
          </ProvedorDaSacola>
        </ProvedorDoFrete>
        <Tags />
      </body>
    </html>
  )
}
