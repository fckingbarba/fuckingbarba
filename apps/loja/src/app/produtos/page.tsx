import type { Metadata } from "next"
import { TelaDaLojaInteira } from "@/components/catalogo/tela"
import { site } from "@/lib/site"

/**
 * /produtos — a loja inteira, sem filtro de categoria.
 *
 * É a MESMA tela de `/[categoria]` (`components/catalogo/tela.tsx`), com
 * duas diferenças: não filtra, e não tem convite nem "resto da loja" (aqui
 * não existe resto — isto é o resto). Reaproveita os mesmos componentes de
 * propósito: uma segunda grade de produtos, escrita à parte, seria a
 * primeira a ficar para trás na próxima mudança de desenho.
 *
 * Ela existe porque o botão "Ver todos os produtos" da home apontava pro
 * `/em-breve`. Página que promete e entrega `/em-breve` ensina a não clicar
 * nos outros botões.
 *
 * ESTÁTICA, na ordem de relevância: esta página não lê o `?ordem=`. As
 * outras ordens moram em `ordem/[ordem]/page.tsx`, e quem manda pra lá é o
 * `proxy.ts`, sem mudar o endereço.
 */

export const metadata: Metadata = {
  title: "Todos os produtos",
  description: `Tudo que a ${site.nome} tem hoje: barba, cabelo e kits, numa lista só.`,
  // Mesma razão da tela de categoria: `?ordem=` é a mesma lista embaralhada.
  alternates: { canonical: "/produtos" },
}

export default function PaginaProdutos() {
  return <TelaDaLojaInteira ordem="" />
}
