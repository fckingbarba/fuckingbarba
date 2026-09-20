import { AltaPerformance } from "@/components/home/alta-performance"
import { Amam } from "@/components/home/amam"
import { Banner } from "@/components/home/banner"
import { Colecao } from "@/components/home/colecao"
import { Fechamento } from "@/components/home/fechamento"
import { Hero } from "@/components/home/hero"
import { Ofertas } from "@/components/home/ofertas"
import { Provas } from "@/components/home/provas"
import { Sobre } from "@/components/home/sobre"
import { Trustbar } from "@/components/home/trustbar"
import { Vitrine } from "@/components/home/vitrine"

/**
 * A home, na mesma ordem do protótipo.
 *
 * O `<main>` não tem medida própria de propósito: cada seção é uma faixa de
 * ponta a ponta da tela e segura o próprio limite de largura por dentro
 * (1320px, como no protótipo). Centralizar aqui estreitaria o banner.
 *
 * Duas seções decidem sozinhas se existem: as ofertas só aparecem quando há
 * promoção com prazo no catálogo, e a prova social só quando há depoimento
 * de cliente cadastrado. Nenhuma das duas inventa conteúdo pra ocupar
 * espaço — página mais curta é melhor que página mentindo.
 *
 * O `<h1>` da página está no `Hero`, e é o único da home.
 */
export default function Inicio() {
  return (
    <main id="conteudo" className="flex-1">
      <Banner />
      <Trustbar />
      <Ofertas />
      <Colecao />
      <Hero />
      <AltaPerformance />
      <Provas />
      <Amam />
      <Vitrine />
      <Sobre />
      <Fechamento />
    </main>
  )
}
