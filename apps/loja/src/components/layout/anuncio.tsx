import { ForaDaTela } from "./fora-da-tela"
import { emReais } from "@/lib/formato"
import { FRETE_GRATIS_ACIMA_DE } from "@/lib/site"

/**
 * A esteira amarela de avisos, colada no topo de toda página.
 *
 * O movimento é CSS puro: duas listas idênticas dentro de uma pista que anda
 * -50%. Quando a primeira sai de cena a segunda está exatamente onde ela
 * começou, e o loop não tem emenda. A segunda leva `aria-hidden` pra que o
 * leitor de tela leia os avisos uma vez só — ela existe só pro olho.
 *
 * Três avisos repetidos três vezes é o que enche a pista nas telas largas sem
 * deixar buraco; em 390px sobra, e sobrar não custa nada.
 */
const AVISOS = [
  `Frete Grátis acima de ${emReais(FRETE_GRATIS_ACIMA_DE)}*`,
  "Barba na cara ou sua grana de volta",
  "Compra 100% segura",
]

const REPETICOES = 3

function Lista({ oculta = false }: { oculta?: boolean }) {
  return (
    <ul className="anuncio__lista" aria-hidden={oculta || undefined}>
      {Array.from({ length: REPETICOES }).flatMap((_, volta) =>
        AVISOS.map((aviso) => <li key={`${volta}-${aviso}`}>{aviso}</li>)
      )}
    </ul>
  )
}

export function Anuncio() {
  return (
    // O id="inicio" é o alvo do "voltar ao topo" do rodapé: como esta é a
    // primeira coisa da página, o link volta pro topo de verdade, sem JS.
    <ForaDaTela className="anuncio" id="inicio" role="region" aria-label="Avisos da loja">
      <div className="anuncio__pista">
        <Lista />
        <Lista oculta />
      </div>
    </ForaDaTela>
  )
}
