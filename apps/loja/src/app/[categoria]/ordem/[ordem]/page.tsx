import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { metadadosDaCategoria, TelaDaCategoria } from "@/components/catalogo/tela"
import { lerOrdem, ORDENS_COM_PAGINA } from "@/lib/ordens"
import { site } from "@/lib/site"
import "@/estilos/telas/catalogo.css"

/**
 * `/barba?ordem=barato`, por dentro.
 *
 * Ninguém digita este endereço: o `proxy.ts` troca o `?ordem=` da categoria
 * por esta rota sem mudar a URL que a pessoa vê, e quem chega aqui direto é
 * mandado de volta pro endereço público (uma URL só por página). Existe pra
 * que cada ordem seja uma página ESTÁTICA, gerada no build — três
 * categorias, quatro ordens —, em vez de a categoria inteira virar dinâmica
 * pra ler a URL. O porquê está em `components/catalogo/tela.tsx`.
 *
 * Os metadados são os da categoria, com a canônica em `/barba`: é a mesma
 * lista em outra ordem.
 */

type Props = PageProps<"/[categoria]/ordem/[ordem]">

export function generateStaticParams() {
  return site.categorias.flatMap((c) =>
    ORDENS_COM_PAGINA.map((ordem) => ({ categoria: c.handle, ordem }))
  )
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return metadadosDaCategoria((await params).categoria)
}

export default async function PaginaCategoriaOrdenada({ params }: Props) {
  const { categoria, ordem } = await params
  const lida = lerOrdem(ordem)
  // Relevância não tem página aqui (é a própria `/barba`), e ordem que não
  // existe não chega pelo proxy — só digitada à mão.
  if (!lida) notFound()
  return <TelaDaCategoria categoria={categoria} ordem={lida} />
}
