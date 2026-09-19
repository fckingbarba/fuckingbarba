/**
 * As cinco estrelas de uma avaliação.
 *
 * São duas fileiras sobrepostas: cinco cinzas embaixo e cinco amarelas em
 * cima, com a de cima cortada na largura da nota. É o que permite meia
 * estrela sem ter meio desenho — 4,5 vira 90% de largura.
 *
 * O desenho da estrela mora uma vez só na página, no `<symbol>` do layout;
 * aqui cada estrela é um `<use>`. Com dez estrelas por avaliação e várias
 * avaliações na tela, repetir o path daria alguns KB de HTML à toa.
 *
 * O bloco visual é `aria-hidden`: quem usa leitor de tela recebe a frase de
 * `rotulo`, que diz a nota em palavras. Cinco ícones seguidos não dizem nada.
 */
export const ID_ESTRELA = "ico-estrela"

export function Estrelas({ nota, rotulo }: { nota: number; rotulo: string }) {
  const porcento = Math.max(0, Math.min(100, (nota / 5) * 100))
  const cinco = [0, 1, 2, 3, 4]

  return (
    <>
      <span
        className="estrelas"
        style={{ "--nota": `${porcento.toFixed(1)}%` } as React.CSSProperties}
        aria-hidden="true"
      >
        {cinco.map((i) => (
          <svg viewBox="0 0 24 24" key={i}>
            <use href={`#${ID_ESTRELA}`} />
          </svg>
        ))}
        <span className="estrelas__cheias">
          {cinco.map((i) => (
            <svg viewBox="0 0 24 24" key={i}>
              <use href={`#${ID_ESTRELA}`} />
            </svg>
          ))}
        </span>
      </span>
      <span className="sr-only">{rotulo}</span>
    </>
  )
}

/**
 * O desenho da estrela, escondido, pra `<use>` referenciar. Vai uma vez no
 * layout — `<use>` não alcança um símbolo que não esteja no documento.
 */
export function SimboloEstrela() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <symbol id={ID_ESTRELA} viewBox="0 0 24 24">
        <path d="M11.27 4.36 12.73 4.36 14.53 8.92 19.42 9.22 19.87 10.61 16.09 13.73 17.32 18.47 16.13 19.33 12 16.70 7.87 19.33 6.68 18.47 7.91 13.73 4.13 10.61 4.58 9.22 9.47 8.92z" />
      </symbol>
    </svg>
  )
}
