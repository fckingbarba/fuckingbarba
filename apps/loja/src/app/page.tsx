import { Secoes } from "@/components/secoes"

/**
 * A home.
 *
 * Quais seções entram e em que ordem não está escrito aqui — está no
 * registro (`lib/secoes/registro.ts`), e o que difere do padrão virá do
 * painel. Esta página só diz ONDE elas vão.
 *
 * O `<main>` não tem medida própria de propósito: cada seção é uma faixa de
 * ponta a ponta da tela e segura o próprio limite de largura por dentro
 * (1320px, como no protótipo). Centralizar aqui estreitaria o banner.
 *
 * Uma seção decide sozinha se existe, independente do olhinho do painel: a
 * prova social só aparece quando há caso de antes e depois nas páginas dos
 * produtos. São dois eixos diferentes — "eu não quero esta seção" é o
 * painel; "não há o que mostrar" é o dado — e ela não inventa caso pra
 * ocupar espaço. (As ofertas
 * também decidiam até 24/09; agora ficam sempre ligadas, com o contador
 * zerando à meia-noite — ver `components/home/ofertas.tsx`.)
 *
 * O `<h1>` da página está no bloco escuro de marca, que por isso é `fixo` no
 * registro: sem ele a home começaria em `<h2>`.
 */
export default function Inicio() {
  return (
    <main id="conteudo" className="flex-1">
      <Secoes escopo="home" />
    </main>
  )
}
