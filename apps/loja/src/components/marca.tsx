import type { SVGProps } from "react"

/**
 * A MARCA — os desenhos vetorizados dos PNGs que o Matheus mandou.
 *
 * NÃO SÃO ÍCONES, e por isso não moram em `icones.tsx`. Ícone da loja é
 * monocromático e herda a cor de quem o contém (`currentColor`); a marca tem
 * DUAS cores fixas — o branco das letras e o amarelo do raio — e mudar
 * qualquer uma delas deixa de ser a marca. Por isso as cores estão escritas
 * aqui dentro, e não vêm do CSS: um `fill` no pai não pode pintar a logo por
 * acidente.
 *
 * GERADOS, NÃO DESENHADOS À MÃO: `ferramentas/logo/vetoriza.py` traça os PNGs
 * e cospe estes caminhos. Se a arte mudar, roda o script de novo e troca os
 * `d` — não tente editar coordenada por coordenada.
 *
 * >>> A ORIGEM SÃO PNGs PEQUENOS (119x95 o maior deles). O traço reproduz o
 *     arquivo com fidelidade — conferido pixel a pixel, nenhum ponto difere
 *     mais que 50% no tamanho original — e escala liso, que é o que o site
 *     precisa. Mas vetorizar não inventa detalhe que o PNG não tinha: pra
 *     impresso grande, banner ou qualquer coisa fora da tela, peça o arquivo
 *     original do designer (AI, EPS, PDF ou SVG).
 *
 * O RAIO DAQUI NÃO É O `Raio` DE `icones.tsx`. São desenhos diferentes: este
 * é o da marca, gordo e torto; aquele é o fino e geométrico do protótipo, que
 * continua valendo em bullet, botão e título de seção. Trocar um pelo outro
 * muda a textura do site inteiro, e essa decisão foi deixada pra depois.
 */

const BRANCO = "#ffffff"
const AMARELO = "#ffd84d"

type Props = SVGProps<SVGSVGElement>

/**
 * A LOGO CURTA — o F com o raio. É a que vai no cabeçalho, ao lado do
 * nome em texto.
 *
 * Ela é mais alta que larga (33x49), então quem a usa manda na ALTURA e
 * deixa a largura seguir. Travar a largura num quadrado, como o CSS fazia
 * com o raio antigo, esmagaria o F.
 */
export function LogoCurta(props: Props) {
  return (
    <svg viewBox="0 0 33 49" xmlns="http://www.w3.org/2000/svg" role="img" {...props}>
      <title>FuckingBarba</title>
      <path
        fill={BRANCO}
        d="M6.2 47.8C5.9 47.7 5.9 47.4 5.9 42.2C5.8 38.3 5.7 36.2 5.6 35.2C5.2 32.0 5.1 30.4 5.4 29.9C5.7 29.3 5.8 28.0 5.6 26.8C5.3 25.2 5.1 22.7 5.1 19.8C5.1 16.7 5.0 16.4 4.2 16.7C4.0 16.8 3.5 17.0 3.0 17.1C2.6 17.1 2.1 17.3 2.0 17.4C1.2 17.9 0.5 17.2 0.5 16.1C0.5 15.5 0.5 15.3 0.2 15.2C-0.1 15.0 -0.1 7.6 0.2 7.6C0.3 7.6 0.7 7.3 1.0 7.0C1.5 6.5 1.7 6.4 2.0 6.4C2.6 6.4 4.8 5.8 5.1 5.5C5.2 5.3 5.6 5.2 6.2 5.1C7.5 4.9 7.6 4.9 8.0 4.4C8.3 4.1 8.5 4.0 9.2 3.9C9.7 3.8 10.5 3.6 11.0 3.4C11.5 3.3 12.4 3.1 12.9 3.0C13.5 2.9 14.2 2.8 14.5 2.6C15.5 2.1 15.8 2.1 17.8 2.0C19.7 1.9 19.9 1.9 20.8 1.5C21.4 1.3 22.1 1.1 22.9 1.0C24.4 0.9 25.0 0.7 25.3 0.3C25.6 0.0 25.7 0.0 26.8 0.0L28.0 0.0L28.0 0.4C28.0 0.7 27.9 0.9 27.6 1.1L27.2 1.5L27.6 1.9C27.8 2.2 28.0 2.5 28.0 2.5C28.0 2.6 28.2 3.0 28.4 3.4C29.2 5.2 29.3 11.5 28.5 11.7C28.1 11.7 23.3 12.0 21.5 12.0C20.0 12.1 19.4 12.4 19.1 13.2C18.8 13.9 18.6 14.0 17.8 13.9C17.0 13.8 14.4 14.1 13.5 14.3C13.1 14.4 12.5 14.6 12.1 14.7C10.7 15.1 10.8 14.5 11.1 21.7C11.3 25.9 11.5 26.1 13.4 25.4C14.9 25.0 16.7 24.9 16.9 25.2C17.1 25.6 16.8 27.6 16.5 28.6C16.4 29.0 16.2 29.8 16.1 30.4C16.0 31.6 15.9 32.0 15.5 32.0C15.4 32.0 15.0 32.2 14.6 32.4C14.2 32.6 13.6 32.8 13.3 32.9C12.5 33.2 12.2 33.5 12.2 34.3C12.1 35.0 12.3 37.4 12.6 38.1C12.7 38.3 12.8 39.3 12.9 40.2C13.2 44.3 13.3 45.5 13.3 46.0C13.4 46.9 13.0 47.1 9.7 47.5C9.1 47.6 8.4 47.7 8.1 47.8C7.3 48.0 6.5 48.1 6.2 47.8Z"
      />
      <path
        fill={AMARELO}
        d="M19.4 44.2C19.2 44.0 19.2 43.2 19.5 42.5C19.6 42.1 19.8 40.9 19.9 39.8C20.1 38.2 20.2 37.5 20.5 37.0C20.6 36.6 20.9 35.8 21.0 35.2C21.1 34.6 21.3 33.9 21.3 33.7C21.5 33.0 21.1 32.9 19.7 32.9C17.8 32.9 17.6 32.6 17.9 30.2C17.9 29.5 18.1 28.3 18.1 27.5C18.2 26.7 18.4 25.8 18.5 25.4C18.7 25.0 18.8 23.9 19.0 22.6C19.1 21.5 19.3 20.0 19.5 19.2C19.6 18.5 19.8 17.3 19.9 16.6C20.1 14.1 20.2 14.1 23.8 13.9C25.2 13.8 26.4 13.7 26.6 13.7C27.8 13.4 30.1 13.3 30.9 13.5C32.3 13.9 32.6 15.5 31.5 16.8C31.2 17.2 30.9 17.8 30.3 19.0C30.1 19.3 29.9 19.8 29.7 20.1C29.6 20.3 29.3 20.9 29.1 21.3C28.9 21.7 28.6 22.2 28.4 22.4C28.3 22.6 28.1 23.0 28.0 23.3C27.9 23.6 27.7 24.1 27.4 24.4C27.2 24.7 27.0 25.1 27.0 25.2C27.0 25.4 26.8 25.7 26.6 26.0C25.9 27.1 26.2 27.8 27.1 27.5C28.8 27.0 30.3 27.0 30.6 27.4C30.8 27.8 30.8 28.5 30.5 28.8C30.3 29.0 30.1 29.3 29.9 29.6C29.8 29.9 29.6 30.3 29.5 30.4C29.4 30.4 29.2 30.7 29.1 31.0C28.9 31.3 28.6 31.8 28.4 32.0C28.2 32.3 28.0 32.6 28.0 32.7C28.0 32.8 27.8 33.1 27.6 33.4C27.3 33.7 27.0 34.2 26.9 34.5C26.7 34.8 26.5 35.2 26.3 35.5C26.0 35.9 25.4 36.8 25.0 37.6C24.8 37.8 24.6 38.2 24.4 38.4C24.3 38.6 24.1 38.9 24.0 39.2C23.9 39.4 23.6 39.8 23.4 40.0C23.2 40.3 23.0 40.6 23.0 40.7C23.0 40.8 22.8 41.1 22.6 41.4C22.3 41.7 22.1 42.2 22.0 42.4C21.9 42.6 21.6 42.9 21.5 43.0C21.3 43.1 21.1 43.4 21.0 43.7C20.8 44.3 19.8 44.7 19.4 44.2Z"
      />
    </svg>
  )
}

/*
 * A LOGO INTEIRA, em duas linhas (119x95), SAIU DAQUI: mora em
 * `public/marca/logo-completa.svg`, cópia de `ferramentas/logo/saida/logo.svg`.
 * São 18 KB de caminho, e no rodapé ela ia em toda página — dentro do HTML e
 * de novo no pacote do React. Como arquivo vai uma vez e fica em cache. Se a
 * arte mudar, copie o SVG novo por cima dos dois.
 */

/**
 * O RAIO SOZINHO, do jeito que ele é na marca — gordo, torto, com o corte
 * irregular. É o do favicon.
 *
 * Repetindo, porque a confusão é fácil: NÃO é o `Raio` de `icones.tsx`.
 * Aquele é fino e geométrico, e é o que a loja usa em todo o resto.
 */
export function RaioDaMarca(props: Props) {
  return (
    <svg viewBox="0 0 15 32" xmlns="http://www.w3.org/2000/svg" role="img" {...props}>
      <title>FuckingBarba</title>
      <path
        fill={AMARELO}
        d="M2.2 30.9C1.7 30.6 2.0 26.9 2.6 25.3C2.7 24.9 2.9 24.2 2.9 23.8C3.1 22.7 3.2 22.0 3.6 21.3C3.9 20.7 4.0 19.7 3.8 19.4C3.7 19.3 3.3 19.2 1.8 19.2L-0.0 19.3L0.0 17.3C0.0 15.6 0.0 15.4 0.2 15.3C0.6 15.1 0.8 13.9 1.1 11.5C1.2 10.2 1.3 9.0 1.5 8.5C1.7 7.7 1.8 7.0 2.1 3.6C2.3 1.9 2.9 0.7 3.7 0.8C3.9 0.8 4.3 0.6 4.7 0.4L5.4 0.0L9.8 0.0C14.2 0.0 14.2 0.0 14.2 0.3C14.2 0.4 14.4 0.6 14.6 0.7C15.2 1.0 15.2 2.0 14.6 2.2C14.4 2.3 14.2 2.5 14.0 3.1C13.9 3.5 13.6 4.0 13.4 4.2C13.3 4.3 13.1 4.7 13.0 5.0C12.9 5.3 12.7 5.8 12.4 6.2C12.2 6.5 12.0 6.9 12.0 6.9C12.0 7.0 11.8 7.4 11.6 7.7C11.3 8.0 11.1 8.5 11.0 8.8C10.9 9.1 10.7 9.5 10.5 9.8C10.3 10.0 10.1 10.5 10.0 10.8C9.9 11.1 9.7 11.5 9.5 11.8C8.1 13.5 8.5 14.1 11.0 14.0C12.5 13.9 12.7 13.9 12.9 14.1C13.3 14.5 13.1 15.6 12.5 16.0C12.3 16.1 12.1 16.5 12.0 16.7C11.9 17.0 11.7 17.4 11.4 17.7C11.2 18.0 11.0 18.4 11.0 18.4C11.0 18.5 10.8 18.8 10.6 19.1C10.4 19.4 10.0 19.9 9.8 20.3C9.7 20.6 9.4 20.9 9.3 21.0C9.2 21.1 9.1 21.4 9.0 21.6C8.9 21.9 8.7 22.3 8.5 22.5C8.3 22.8 8.1 23.2 8.0 23.4C7.9 23.6 7.6 23.9 7.5 24.0C7.3 24.1 7.1 24.5 7.0 24.7C6.9 25.0 6.7 25.4 6.5 25.6C6.3 25.9 6.1 26.3 6.0 26.5C5.9 26.7 5.7 27.0 5.5 27.3C4.9 28.1 4.3 29.0 4.0 29.5C3.7 30.0 2.7 31.1 2.5 31.1C2.5 31.1 2.3 31.0 2.2 30.9Z"
      />
    </svg>
  )
}
