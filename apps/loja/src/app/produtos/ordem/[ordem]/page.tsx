import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { TelaDaLojaInteira } from "@/components/catalogo/tela"
import { lerOrdem, ORDENS_COM_PAGINA } from "@/lib/ordens"
import { site } from "@/lib/site"
import "@/estilos/telas/catalogo.css"

/**
 * `/produtos?ordem=barato`, por dentro — o mesmo arranjo da categoria (ver
 * `app/[categoria]/ordem/[ordem]/page.tsx`): o `proxy.ts` troca o `?ordem=`
 * por esta rota sem mudar a URL, e cada ordem é uma página estática.
 *
 * `/produtos/ordem/…` não briga com a página de produto (`/produtos/[handle]`):
 * são três segmentos contra dois, e nenhum produto tem o handle "ordem".
 */

type Props = PageProps<"/produtos/ordem/[ordem]">

export function generateStaticParams() {
  return ORDENS_COM_PAGINA.map((ordem) => ({ ordem }))
}

export const metadata: Metadata = {
  title: "Todos os produtos",
  description: `Tudo que a ${site.nome} tem hoje: barba, cabelo e kits, numa lista só.`,
  alternates: { canonical: "/produtos" },
}

export default async function PaginaProdutosOrdenada({ params }: Props) {
  const lida = lerOrdem((await params).ordem)
  if (!lida) notFound()
  return <TelaDaLojaInteira ordem={lida} />
}
