import type { Metadata } from "next"
import { metadadosDaCategoria, TelaDaCategoria } from "@/components/catalogo/tela"
import { site } from "@/lib/site"
import "@/estilos/telas/catalogo.css"

/**
 * /barba, /cabelo, /kits — categoria no primeiro nível da URL.
 *
 * A lista de handles válidos é a de `site.categorias` e bate com os handles
 * criados pelo seed do Medusa. As três são pré-renderizadas no build.
 *
 * Caminho de primeiro nível que não é categoria nem página estática nunca
 * chega aqui: o proxy.ts reescreve pra /nao-encontrado, que responde 404 de
 * verdade. (Com Cache Components toda rota dinâmica manda o shell com 200
 * antes de saber se o conteúdo existe; o `notFound()` abaixo é só a rede de
 * segurança, e sai com meta noindex.)
 *
 * ┌─ POR QUE A DESCRIÇÃO DA CATEGORIA NÃO APARECE ────────────────────────┐
 * │ O campo existe no Medusa e está vazio, e a tela foi aprovada sem ele: │
 * │ título, trilhos e produto, nada entre a pessoa e a grade.             │
 * │                                                                        │
 * │ O preço disso é SEO: categoria sem texto compete mal em busca contra  │
 * │ quem escreve dois parágrafos. Quando houver texto pra pôr, o lugar é  │
 * │ ABAIXO da grade — é onde a maioria das lojas põe, justamente pra não  │
 * │ empurrar o produto pra baixo da dobra.                                │
 * └────────────────────────────────────────────────────────────────────────┘
 */

type Props = PageProps<"/[categoria]">

export function generateStaticParams() {
  return site.categorias.map((c) => ({ categoria: c.handle }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return metadadosDaCategoria((await params).categoria)
}

/**
 * A categoria na ordem de relevância, ESTÁTICA: esta página não lê o
 * `?ordem=`. As outras ordens moram em `ordem/[ordem]/page.tsx`, e quem
 * manda pra lá é o `proxy.ts` — o porquê está em `components/catalogo/tela.tsx`.
 */
export default async function PaginaCategoria({ params }: Props) {
  const { categoria } = await params
  return <TelaDaCategoria categoria={categoria} ordem="" />
}
