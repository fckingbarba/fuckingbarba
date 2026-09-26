import { ForaDaTela } from "./fora-da-tela"
import { frasesDoFrete, type FrasesDoFrete } from "@/lib/configuracoes"
import type { AnuncioDoSite } from "@/lib/home"
import { configuracoes, home } from "@/lib/medusa"

/**
 * A esteira amarela de avisos, colada no topo de toda página.
 *
 * O movimento é CSS puro: duas listas idênticas dentro de uma pista que anda
 * -50%. Quando a primeira sai de cena a segunda está exatamente onde ela
 * começou, e o loop não tem emenda. A segunda leva `aria-hidden` pra que o
 * leitor de tela leia os avisos uma vez só — ela existe só pro olho.
 *
 * OS AVISOS SÃO DO PAINEL ("Layout da home" → Barra de avisos, entrega
 * 0119): vêm com a home publicada (`home()`), e mudam no "Publicar" dela —
 * em toda página, porque a esteira mora no layout.
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
 * satisfação de verdade, com prazo e regra escritos, ela vem pra cá — e o
 * painel avisa isso em cima dos avisos.
 */
/*
 * O aviso do frete é o ÚNICO que a loja escreve, e o único condicional:
 * quando não há promoção de frete, a esteira roda só com os do painel, e não
 * com um "frete grátis a partir de R$ 0,00". Esteira é a peça que aparece em
 * toda página do site — é o pior lugar possível pra anunciar uma oferta que
 * não existe. O painel liga e desliga ele (`frete`), mas não escreve o valor:
 * esse sai das configurações, e muda junto com elas.
 */
function avisosDe(anuncio: AnuncioDoSite, frases: FrasesDoFrete | null) {
  return anuncio.frete && frases ? [`${frases.completa}*`, ...anuncio.avisos] : anuncio.avisos
}

/*
 * O TAMANHO DA PISTA E A VELOCIDADE. Cada lista tem que cobrir a tela larga
 * (senão o fim da volta mostra um buraco), e a esteira anda uma lista por
 * ciclo: com a lista mais comprida no mesmo ciclo, ela correria. Com os
 * avisos no painel — de um curto a cinco compridos —, as voltas e o ciclo
 * saem do tamanho do texto, em letras: a largura de verdade só o navegador
 * sabe, e esperar por ele faria a esteira nascer parada ou pular no meio.
 *
 * A régua é a esteira de sempre: o frete e a "Compra 100% segura", três
 * vezes, em 38 s (o ciclo do `estilos/anuncio.css`). Com ela, o HTML sai
 * igual ao de antes do painel — sem o `style` —, e a home, que vive no
 * limite do LCP, não ganha nem um byte.
 */
const VAO_EM_LETRAS = 10 // o raio e os dois vãos de 34 px, na letra de 0,82rem
const LETRAS_NA_LISTA = 200 // o mínimo de cada lista: cobre a tela de 1440
const CICLO_DO_CSS = 38
const LETRAS_POR_SEGUNDO = (3 * (35 + 18 + 2 * VAO_EM_LETRAS)) / CICLO_DO_CSS

function pista(avisos: string[]) {
  const porVolta = avisos.reduce((n, a) => n + a.length + VAO_EM_LETRAS, 0)
  const voltas = Math.max(1, Math.ceil(LETRAS_NA_LISTA / porVolta))
  return { voltas, ciclo: Math.round((voltas * porVolta) / LETRAS_POR_SEGUNDO) }
}

function Lista({
  avisos,
  voltas,
  oculta = false,
}: {
  avisos: string[]
  voltas: number
  oculta?: boolean
}) {
  return (
    <ul className="anuncio__lista" aria-hidden={oculta || undefined}>
      {/* A chave é a posição: dois avisos iguais no painel não viram um só. */}
      {Array.from({ length: voltas }).flatMap((_, volta) =>
        avisos.map((aviso, i) => <li key={`${volta}-${i}`}>{aviso}</li>)
      )}
    </ul>
  )
}

export async function Anuncio() {
  const [{ frete }, { conteudo }] = await Promise.all([configuracoes(), home()])
  const avisos = avisosDe(conteudo.anuncio, frasesDoFrete(frete))
  const { voltas, ciclo } = pista(avisos)

  return (
    // O id="inicio" é o alvo do "voltar ao topo" do rodapé: como esta é a
    // primeira coisa da página, o link volta pro topo de verdade, sem JS.
    <ForaDaTela className="anuncio" id="inicio" role="region" aria-label="Avisos da loja">
      <div
        className="anuncio__pista"
        style={ciclo === CICLO_DO_CSS ? undefined : { animationDuration: `${ciclo}s` }}
      >
        <Lista avisos={avisos} voltas={voltas} />
        <Lista avisos={avisos} voltas={voltas} oculta />
      </div>
    </ForaDaTela>
  )
}
