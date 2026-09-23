import type { Metadata } from "next"
import { Secoes } from "@/components/secoes"
import { buscarProdutoPorHandle, listarProdutos } from "@/lib/medusa"
// Só aqui, e não no globals.css: ver "O QUE NÃO MORA AQUI" lá.
import "@/estilos/telas/produto.css"

/**
 * /produtos/<handle> — a URL em português que o SEO pede. O Medusa só guarda
 * o handle; quem monta o caminho é esta rota.
 *
 * A PÁGINA NÃO SABE QUAIS SEÇÕES EXISTEM, e isso é o ponto: ela pede
 * `<Secoes escopo="produto">` e o registro (`lib/secoes/registro.ts`) decide
 * o quê e em que ordem. Ligar, desligar e reordenar seção vira dado — que é
 * o que o painel vai mexer, sem tocar em JSX.
 *
 * Os produtos do catálogo saem prontos do build (`generateStaticParams`,
 * abaixo). Handle fora da lista é montado no servidor na hora do pedido,
 * inteiro, e o que não existe responde 404 de verdade, com noindex — sem
 * `<Suspense>` na página, nada sai antes de o produto ser lido.
 */

type Props = PageProps<"/produtos/[handle]">

/**
 * OS PRODUTOS DO CATÁLOGO SAEM PRONTOS DO BUILD.
 *
 * ┌─ POR QUE ────────────────────────────────────────────────────────────────┐
 * │ Sem esta lista, a PDP inteira vinha por streaming: o servidor mandava    │
 * │ o cabeçalho, o esqueleto da dobra e, logo embaixo dele, o rodapé.        │
 * │ Quando as seções chegavam, o rodapé era empurrado tela abaixo — o        │
 * │ Lighthouse media CLS de 0,45 (bom é abaixo de 0,1), e o maior elemento   │
 * │ da tela enquanto isso era o texto do rodapé. Era o defeito da            │
 * │ categoria, e a saída é a mesma: página estática.                         │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Produto que não está na lista — criado depois do build, ou um kit de
 * quantidade, que a listagem esconde — é montado na hora do pedido (ver a
 * página, abaixo): a resposta demora um pouco mais, mas chega inteira.
 *
 * NUNCA VAZIA: com Cache Components, lista vazia é erro de build. Sem Medusa
 * (build na máquina, sem backend), sai um marcador que vira "não encontrado".
 */
export async function generateStaticParams() {
  const produtos = await listarProdutos()
  if (!produtos.length) return [{ handle: "__sem-catalogo__" }]
  return produtos.map((produto) => ({ handle: produto.handle }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { handle } = await params
  const produto = await buscarProdutoPorHandle(handle)
  if (!produto) return { title: "Produto não encontrado", robots: { index: false } }
  return {
    title: produto.title,
    description:
      produto.description?.slice(0, 155) ||
      `${produto.title}${produto.subtitle ? ` — ${produto.subtitle}` : ""}. Compre na FuckingBarba.`,
    alternates: { canonical: `/produtos/${produto.handle}` },
    openGraph: produto.thumbnail ? { images: [{ url: produto.thumbnail }] } : undefined,
  }
}

/**
 * SEM `<Suspense>` EM VOLTA, de propósito. Com ele, até a página gerada no
 * build saía em duas etapas: o esqueleto primeiro e o conteúdo depois,
 * trocado por um script no fim do HTML — e o React 19 junta essas trocas de
 * 300 em 300 ms. O título e a foto só apareciam na troca, e o LCP ia junto:
 * 2,55s no Lighthouse, contra 2,18s da categoria. Sem ele, o HTML já sai com
 * a página inteira, pintada na primeira passada.
 */
export default async function PaginaProduto({ params }: Props) {
  const { handle } = await params
  return (
    <main id="conteudo" className="flex-1">
      <Secoes escopo="produto" handle={handle} />
    </main>
  )
}
