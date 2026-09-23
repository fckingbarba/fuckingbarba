import { ForaDaTela } from "./fora-da-tela"
import { frasesDoFrete } from "@/lib/configuracoes"
import { configuracoes } from "@/lib/medusa"

/**
 * A esteira amarela de avisos, colada no topo de toda página.
 *
 * O movimento é CSS puro: duas listas idênticas dentro de uma pista que anda
 * -50%. Quando a primeira sai de cena a segunda está exatamente onde ela
 * começou, e o loop não tem emenda. A segunda leva `aria-hidden` pra que o
 * leitor de tela leia os avisos uma vez só — ela existe só pro olho.
 *
 * Os avisos repetidos três vezes é o que enche a pista nas telas largas sem
 * deixar buraco; em 390px sobra, e sobrar não custa nada.
 */
/*
 * "Barba na cara ou sua grana de volta" saiu daqui: essa garantia NÃO existe
 * — o Matheus confirmou. Promessa de devolução que a loja não cumpre é art.
 * 30 do CDC (oferta vincula quem anunciou), e numa esteira que passa em toda
 * página ela era a frase mais repetida do site.
 *
 * Depois dela entraram os 7 dias de arrependimento do art. 49 — que também
 * saíram, em 23/09, por escolha da loja: a esteira é propaganda, e não é
 * lugar de lembrar ninguém de devolver. O direito continua valendo e dito
 * onde a lei pede que ele esteja claro: a página /trocas, com link no
 * rodapé, e a resposta nas Dúvidas. O dia em que existir uma garantia de
 * satisfação de verdade, com prazo e regra escritos, ela vem pra cá.
 */
/*
 * O aviso do frete é o ÚNICO condicional: quando não há promoção de frete, a
 * esteira roda com um aviso em vez de dois, e não com um "frete grátis a
 * partir de R$ 0,00". Esteira é a peça que aparece em toda página do site —
 * é o pior lugar possível pra anunciar uma oferta que não existe.
 */
const SEMPRE = ["Compra 100% segura"]

function avisosDe(frases: { completa: string } | null) {
  return frases ? [`${frases.completa}*`, ...SEMPRE] : SEMPRE
}

const REPETICOES = 3

function Lista({ avisos, oculta = false }: { avisos: string[]; oculta?: boolean }) {
  return (
    <ul className="anuncio__lista" aria-hidden={oculta || undefined}>
      {Array.from({ length: REPETICOES }).flatMap((_, volta) =>
        avisos.map((aviso) => <li key={`${volta}-${aviso}`}>{aviso}</li>)
      )}
    </ul>
  )
}

export async function Anuncio() {
  const { frete } = await configuracoes()
  const avisos = avisosDe(frasesDoFrete(frete))

  return (
    // O id="inicio" é o alvo do "voltar ao topo" do rodapé: como esta é a
    // primeira coisa da página, o link volta pro topo de verdade, sem JS.
    <ForaDaTela className="anuncio" id="inicio" role="region" aria-label="Avisos da loja">
      <div className="anuncio__pista">
        <Lista avisos={avisos} />
        <Lista avisos={avisos} oculta />
      </div>
    </ForaDaTela>
  )
}
