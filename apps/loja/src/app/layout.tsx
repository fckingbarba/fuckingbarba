import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import { Tags } from "@/components/analytics/tags"
import { SimboloEstrela } from "@/components/estrelas"
import { Anuncio } from "@/components/layout/anuncio"
import { Cabecalho } from "@/components/layout/cabecalho"
import { Rodape } from "@/components/layout/rodape"
import { SemZoomNoCampo } from "@/components/layout/sem-zoom-no-campo"
import { ProvedorDoFrete } from "@/components/configuracoes/contexto"
import { ProvedorDaSacola } from "@/components/sacola/contexto"
import { Gaveta } from "@/components/sacola/gaveta"
import { Telemetria } from "@/components/telemetria/telemetria"
import { configuracoes, modeloDeRecomendacao, vitrineDaSacola } from "@/lib/medusa"
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
  /*
    Preto, a cor do cabeçalho: é com ela que o Chrome do Android e o Safari
    até o 18 pintam a barra do navegador. O Safari 26 ignora o `theme-color`
    e usa o fundo do body — ver "O FUNDO DA PÁGINA NÃO É O FUNDO DO BODY" no
    `globals.css`. Era o menta, e a loja abria com uma faixa menta em cima.
  */
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
}

/**
 * `async` por causa das configurações: a política de frete é lida do Medusa
 * aqui, uma vez, e entregue às telas de cliente pelo provedor. Esperar no
 * layout raiz seria caro se a leitura fosse dinâmica — ela é `"use cache"`,
 * então resolve na pré-renderização e a casca continua saindo estática.
 *
 * ┌─ `data-scroll-behavior="smooth"` NÃO É DECORAÇÃO ──────────────────────┐
 * │ Sem ele, trocar de página abre a página nova NO MEIO.                  │
 * │                                                                        │
 * │ O `globals.css` põe `scroll-behavior: smooth` no <html>, pros links    │
 * │ de âncora (#vitrine, #duvidas, "voltar ao topo") deslizarem em vez de  │
 * │ teleportarem. Só que trocar de rota também rola: o Next manda          │
 * │ `scrollTop = 0`. Com o `smooth` valendo, esse comando vira ANIMAÇÃO —  │
 * │ e o Next confere o resultado na linha seguinte, quando a animação mal  │
 * │ começou. Ele conclui que não funcionou, chama um `scrollIntoView()`    │
 * │ por cima, e as duas rolagens brigam: a página para no meio do          │
 * │ caminho. Era o que acontecia ao clicar num produto com a home rolada,  │
 * │ e ao voltar pra home pelo logo.                                        │
 * │                                                                        │
 * │ O Next sabe desarmar o `smooth` durante a troca de rota, mas só faz    │
 * │ isso quando ESTE atributo está aqui — ele não lê o CSS pra adivinhar.  │
 * │ Ver `disable-smooth-scroll.js` no pacote: sem o atributo ele roda a    │
 * │ rolagem sem desarmar nada, e só avisa no console em desenvolvimento.   │
 * │                                                                        │
 * │ As duas pontas andam juntas: quem apagar este atributo traz o bug de   │
 * │ volta; quem apagar o `scroll-behavior` do CSS torna o atributo inútil. │
 * └────────────────────────────────────────────────────────────────────────┘
 */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { frete, integracoes } = await configuracoes()
  // O "leva junto" da sacola: os produtos, cacheados como a vitrine (ver
  // `vitrineDaSacola`), e o modelo que escolhe entre eles (`lib/recomendacao.ts`).
  const vitrine = await vitrineDaSacola()
  const modelo = await modeloDeRecomendacao()

  return (
    <html
      lang="pt-BR"
      data-scroll-behavior="smooth"
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <a href="#conteudo" className="sr-only-focusable">
          Pular para o conteúdo
        </a>
        {/* A carcaça é a mesma em toda página: esteira, cabeçalho, rodapé.
            Cada página entrega o próprio <main id="conteudo">. */}
        {/* O desenho da estrela, uma vez por página: as avaliações
            referenciam por <use> em vez de repetir o path dez vezes cada. */}
        <SimboloEstrela />
        <SemZoomNoCampo />
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
            <Gaveta vitrine={vitrine} modelo={modelo} />
          </ProvedorDaSacola>
        </ProvedorDoFrete>
        {/* O GA4 da variável da Vercel segue valendo até alguém pôr o código no painel. */}
        <Tags
          integracoes={{
            ...integracoes,
            ga4: integracoes.ga4 ?? process.env.NEXT_PUBLIC_GA4_ID ?? null,
          }}
        />
        {/* A velocidade da visita, a página que não existe e o erro, pro painel. */}
        <Telemetria />
      </body>
    </html>
  )
}
