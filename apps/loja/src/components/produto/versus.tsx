import Image from "next/image"
import { Raio } from "@/components/icones"
import { conteudoDaPdp } from "@/conteudo/produto"
import { buscarProdutoPorHandle } from "@/lib/medusa"

/**
 * VERSUS — o nosso e o genérico, lado a lado.
 *
 * A COMPARAÇÃO É CONTRA UM FRASCO SEM MARCA, e isso é decisão, não falta de
 * coragem. Comparação nominal com concorrente no Brasil é campo minado: o
 * art. 4º do Código do CONAR exige que ela seja objetiva e comprovável ponto
 * a ponto, e o art. 195 da Lei 9.279 trata denegrir marca alheia como
 * concorrência desleal — os dois valem pra loja, não só pra anúncio de TV.
 * Contra "o genérico" a peça vira posicionamento, que é o que ela deveria
 * ser desde o começo: não é sobre eles serem ruins, é sobre nós termos feito
 * escolhas.
 *
 * O desenho vem da mesma ideia: a nossa coluna é preta sobre amarelo, a
 * deles é apagada. O olho sabe de qual lado ficar antes de ler.
 */
export async function Versus({ handle }: { handle: string }) {
  const c = conteudoDaPdp(handle).versus
  if (!c) return null

  const produto = await buscarProdutoPorHandle(handle)
  const foto = produto?.thumbnail ?? produto?.images?.[0]?.url ?? null

  return (
    <section className="versus" aria-labelledby="versus-titulo">
      <div className="versus__wrap">
        <h2 className="versus__titulo" id="versus-titulo">
          <Raio />
          {c.titulo}
        </h2>

        <div className="versus__colunas">
          <div className="versus__coluna versus__coluna--nosso">
            <p className="versus__cabeca">
              {foto ? <Image src={foto} alt="" width={120} height={120} loading="lazy" /> : null}
              <span>
                {produto?.title ?? "O nosso"}
                <small>FuckingBarba</small>
              </span>
            </p>
            <ul>
              {c.nosso.map((item) => (
                <li key={item}>
                  <Raio /> <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="versus__coluna versus__coluna--deles">
            <p className="versus__cabeca">
              <FrascoSemMarca />
              <span>
                {c.nomeDeles}
                <small>{c.descricaoDeles}</small>
              </span>
            </p>
            <ul>
              {c.deles.map((item) => (
                <li key={item}>
                  <Tracinho /> <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

/**
 * O frasco anônimo. Desenhado aqui, e não uma foto: foto de frasco de
 * verdade, por mais neutra que pareça, é sempre o frasco de ALGUÉM — e aí a
 * comparação deixa de ser com "o genérico" e passa a ser com uma marca que
 * pode processar.
 */
function FrascoSemMarca() {
  return (
    <svg viewBox="0 0 120 120" width={120} height={120} aria-hidden="true">
      <rect width="120" height="120" fill="#e6e9ed" />
      <rect x="50" y="18" width="20" height="12" fill="#aab3bf" />
      <path d="M42 32h36l4 8v58l-4 4H42l-4-4V40z" fill="#c3cad3" />
      <rect x="46" y="56" width="28" height="26" fill="#e6e9ed" />
      <text
        x="60"
        y="77"
        textAnchor="middle"
        fontFamily="Arial,Helvetica,sans-serif"
        fontSize="24"
        fontWeight="bold"
        fill="#aab3bf"
      >
        ?
      </text>
    </svg>
  )
}

/** Um traço, no lugar do raio: a coluna deles não ganha o ícone da marca. */
function Tracinho() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M4 10.6h16v2.8H4z" />
    </svg>
  )
}
