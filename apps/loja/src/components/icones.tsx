import type { SVGProps } from "react"

/**
 * Os ícones do protótipo, um a um, como no original.
 *
 * São desenhos próprios, com o mesmo corte chanfrado da marca — não é
 * biblioteca de ícone genérico e não é emoji (emoji muda de cara em cada
 * sistema e quebra a consistência visual). Ficam inline no HTML: nenhuma
 * requisição extra e o `currentColor` deixa o CSS de cada seção mandar na cor.
 *
 * Nenhum leva rótulo: quem nomeia é o `aria-label` do botão ou do link que os
 * contém. Por isso todos saem com `aria-hidden`.
 */

type Props = SVGProps<SVGSVGElement>

function Icone({ children, ...props }: Props) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" {...props}>
      {children}
    </svg>
  )
}

/** O raio da marca — mesmo desenho do favicon. Aparece em tudo. */
export function Raio(props: Props) {
  return (
    <Icone {...props}>
      <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
    </Icone>
  )
}

export function Hamburguer(props: Props) {
  return (
    <Icone {...props}>
      <path d="M3 5h19l-2.6 2.6H3zM3 10.7h19l-2.6 2.6H3zM3 16.4h19l-2.6 2.6H3z" />
    </Icone>
  )
}

export function Lupa(props: Props) {
  return (
    <Icone {...props}>
      <path
        fillRule="evenodd"
        d="M8 2.6h6L18.4 7v6l-1.5 1.5 4.6 4.6-2.4 2.4-4.6-4.6L13 17.4H8L3.6 13V7zm1.3 3.2L6.8 8.2v3.6l2.5 2.4h3.4l2.5-2.4V8.2l-2.5-2.4z"
      />
    </Icone>
  )
}

export function Conta(props: Props) {
  return (
    <Icone {...props}>
      <path d="M9.6 3.2h4.8l2 2v4.8l-2 2H9.6l-2-2V5.2z" />
      <path d="M4.2 21.6v-2.6l2.8-2.8h10l2.8 2.8v2.6z" />
    </Icone>
  )
}

export function Sacola(props: Props) {
  return (
    <Icone {...props}>
      <path d="M5.4 7.6h11.9l1.3 1.3-.9 11.5-1.3 1.3H7.6l-1.3-1.3-.9-11.5z" />
      <path d="M8.2 7.6V4.8l1.6-1.6h4.4l1.6 1.6v2.8h-1.7V5.1H9.9v2.5z" />
    </Icone>
  )
}

/** Carrinho de supermercado — o do botão "Comprar" no card de produto. */
export function Carrinho(props: Props) {
  return (
    <Icone {...props}>
      <path d="M1.4 2.6h3.9l3.5 13.9h11.3v2.2H7.1L3.6 4.8H1.4z" />
      <path d="M6.1 6.4h13.6l2.5 2.5-2 5.6H9.5L8.1 13z" />
      <path d="M9 19.3h2.3v2.3l-.9.9H8.1v-2.3z" />
      <path d="M17.6 19.3h2.3v2.3l-.9.9h-2.3v-2.3z" />
    </Icone>
  )
}

export function SetaEsquerda(props: Props) {
  return (
    <Icone {...props}>
      <path d="M15.4 3.6h1.6l1.6 1.6-6.8 6.8 6.8 6.8-1.6 1.6h-1.6L6.6 12z" />
    </Icone>
  )
}

export function SetaDireita(props: Props) {
  return (
    <Icone {...props}>
      <path d="M8.6 3.6H7L5.4 5.2 12.2 12l-6.8 6.8L7 20.4h1.6L17.4 12z" />
    </Icone>
  )
}

/**
 * A `SetaDireita` girada pra baixo — o "abre/fecha" do resumo do checkout,
 * que no protótipo era um chevron. Aponta pra baixo fechado; o CSS gira
 * 180° quando abre.
 */
export function SetaBaixo(props: Props) {
  return (
    <Icone {...props}>
      <path d="M20.4 8.6V7l-1.6-1.6L12 12.2 5.2 5.4 3.6 7v1.6l8.4 8.8z" />
    </Icone>
  )
}

export function Fechar(props: Props) {
  return (
    <Icone {...props}>
      <path d="M7.7 4.9 4.9 7.7 9.2 12l-4.3 4.3 2.8 2.8L12 14.8l4.3 4.3 2.8-2.8L14.8 12l4.3-4.3-2.8-2.8L12 9.2z" />
    </Icone>
  )
}

/** Frasco — abre o card "O Produto". */
export function Frasco(props: Props) {
  return (
    <Icone {...props}>
      <path d="M8.6 2.2h6.8v2.6h-1.2v5.4l5.2 8.8-1.4 2.4H6l-1.4-2.4 5.2-8.8V4.8H8.6z" />
    </Icone>
  )
}

/** Cronômetro — abre o card "Modo de Uso". */
export function Cronometro(props: Props) {
  return (
    <Icone {...props}>
      <path
        fillRule="evenodd"
        d="M9.6 1.4h4.8v2.4H9.6zM8.4 4.4h7.2l5 5v7.2l-5 5H8.4l-5-5V9.4zm2.4 3.2h2.4v5.2l3.6 2.2-1.2 2-4.8-2.9z"
      />
    </Icone>
  )
}

/** Linha subindo — abre o card "O Resultado". */
export function Curva(props: Props) {
  return (
    <Icone {...props}>
      <path d="M1.6 15.4 9 8h1.4l3.3 3.3 4.8-4.8 2.2 2.2-6 6h-1.4L9.7 11.4l-5.9 5.9z" />
      <path d="M15 3.6h6.4V10h-2.8V6.4H15z" />
    </Icone>
  )
}

export function SetaTopo(props: Props) {
  return (
    <Icone {...props}>
      <path d="M12 1.8 21.2 11v1.6l-1.6 1.6-5-5v12.2H9.4V9.2l-5 5-1.6-1.6V11z" />
    </Icone>
  )
}

export function Caminhao(props: Props) {
  return (
    <Icone {...props}>
      <path d="M1.4 4.6h11.4l1.6 1.6v9.6h-2.2l-1.4-1.4H6.9l-1.4 1.4H1.4z" />
      <path d="M15.2 8.4h4.1l3.3 4v3.4h-1.3l-1.4-1.4h-3.3l-1.4 1.4v-7.4z" />
      <path d="M6.9 16h2.3v2.3l-.9.9H6v-2.3z" />
      <path d="M17.1 16h2.3v2.3l-.9.9h-2.3v-2.3z" />
    </Icone>
  )
}

export function Cartao(props: Props) {
  return (
    <Icone {...props}>
      <path
        fillRule="evenodd"
        d="M2 4.8h18.6L22 6.2v11.6l-1.4 1.4H3.4L2 17.8V6.2zm0 3.8v2.2h20V8.6zm2.8 5.2v2.2h5.2v-2.2z"
      />
    </Icone>
  )
}

/**
 * O SÍMBOLO DO PIX, o oficial do Banco Central — o losango de quatro pontas
 * arredondadas. O de antes era desenho nosso, chanfrado, e a loja notou
 * (23/09): no pagamento, marca que não é a do Pix parece golpe. O traçado
 * é o do Simple Icons (CC0, domínio público).
 *
 * Na cor da página (`currentColor`), como todo ícone daqui. Quem quiser o
 * verde-água do Pix (#32BCAD, o do manual de marca) pinta por fora — é o
 * que a linha de forma de pagamento faz (`.opcao__icone--pix`).
 */
export function Pix(props: Props) {
  return (
    <Icone {...props}>
      <path d="M5.283 18.36a3.505 3.505 0 0 0 2.493-1.032l3.6-3.6a.684.684 0 0 1 .946 0l3.613 3.613a3.504 3.504 0 0 0 2.493 1.032h.71l-4.56 4.56a3.647 3.647 0 0 1-5.156 0L4.85 18.36ZM18.428 5.627a3.505 3.505 0 0 0-2.493 1.032l-3.613 3.614a.67.67 0 0 1-.946 0l-3.6-3.6A3.505 3.505 0 0 0 5.283 5.64h-.434l4.573-4.572a3.646 3.646 0 0 1 5.156 0l4.559 4.559ZM1.068 9.422 3.79 6.699h1.492a2.483 2.483 0 0 1 1.744.722l3.6 3.6a1.73 1.73 0 0 0 2.443 0l3.614-3.613a2.482 2.482 0 0 1 1.744-.723h1.767l2.737 2.737a3.646 3.646 0 0 1 0 5.156l-2.736 2.736h-1.768a2.482 2.482 0 0 1-1.744-.722l-3.613-3.613a1.77 1.77 0 0 0-2.444 0l-3.6 3.6a2.483 2.483 0 0 1-1.744.722H3.791l-2.723-2.723a3.646 3.646 0 0 1 0-5.156" />
    </Icone>
  )
}

export function Escudo(props: Props) {
  return (
    <Icone {...props}>
      <path
        fillRule="evenodd"
        d="M4.6 3.9 12 1.6l7.4 2.3 1.4 1.4v4.8l-2 4.9L12 22.4l-6.8-7.4-2-4.9V5.3zm6.2 2.9h2.4v6.6h-2.4zm0 8.2h2.4v2.4h-2.4z"
      />
    </Icone>
  )
}

export function EscudoCerto(props: Props) {
  return (
    <Icone {...props}>
      <path
        fillRule="evenodd"
        d="M4.6 3.9 12 1.6l7.4 2.3 1.4 1.4v4.8l-2 4.9L12 22.4l-6.8-7.4-2-4.9V5.3zM7.3 11.5l1.5-1.5h1.5l1.7 1.7 3.8-3.8h1.5l1.5 1.5-6.8 6.8z"
      />
    </Icone>
  )
}

/** Cadeado fechado — o selo de conexão segura, no rodapé. */
export function Cadeado(props: Props) {
  return (
    <Icone {...props}>
      <path
        fillRule="evenodd"
        d="M12 1.6c-3.2 0-5.8 2.6-5.8 5.8v2.4H4.4l-1.2 1.2v10l1.2 1.2h15.2l1.2-1.2v-10l-1.2-1.2h-1.8V7.4c0-3.2-2.6-5.8-5.8-5.8zm0 2.6a3.2 3.2 0 0 1 3.2 3.2v2.4H8.8V7.4A3.2 3.2 0 0 1 12 4.2zm-1.3 9.6h2.6v4.4h-2.6z"
      />
    </Icone>
  )
}

/** Lixeira — o "menos" da sacola quando a quantidade é 1. */
export function Lixeira(props: Props) {
  return (
    <Icone {...props}>
      <path d="M9.4 2.6h5.2l1 1.4h4.4v2.4H4V4h4.4zM5.6 8h12.8l-.9 12.2-1.3 1.2H7.8l-1.3-1.2z" />
    </Icone>
  )
}

/** Mais — o passo de subir quantidade, na sacola. */
export function Mais(props: Props) {
  return (
    <Icone {...props}>
      <path d="M10.6 3h2.8v7.6H21v2.8h-7.6V21h-2.8v-7.6H3v-2.8h7.6z" />
    </Icone>
  )
}

/** Relógio — prazo e tempo: o tempo de uso na PDP, o prazo no checkout e no obrigado. */
export function Relogio(props: Props) {
  return (
    <Icone {...props}>
      <path
        fillRule="evenodd"
        d="M12 1.6a10.4 10.4 0 1 0 0 20.8 10.4 10.4 0 0 0 0-20.8zm0 2.6a7.8 7.8 0 1 1 0 15.6 7.8 7.8 0 0 1 0-15.6zm-1 2.2v6.1l4.6 2.8 1-1.7-3.6-2.2V6.4z"
      />
    </Icone>
  )
}

/** Triângulo de atenção — só na linha de estoque baixo, com número real. */
export function Triangulo(props: Props) {
  return (
    <Icone {...props}>
      <path fillRule="evenodd" d="M12 2.6 22.4 20.6H1.6zM11 9h2v6h-2zm0 7.4h2v2h-2z" />
    </Icone>
  )
}

export function WhatsApp(props: Props) {
  return (
    <Icone {...props}>
      <path d="M2 3h5.2l2.4 5.6-2.8 1.9c1.2 2.6 3.3 4.7 5.9 5.9l1.9-2.8 5.6 2.4v5.2l-1.8 1.8h-1.2C8.9 22 2 15.1 2 6.2V4.8z" />
    </Icone>
  )
}

export function Envelope(props: Props) {
  return (
    <Icone {...props}>
      <path d="M1.8 4.6h20.4v1.8L12 14.1 1.8 6.4z" />
      <path d="M1.8 8.7 12 16.4l10.2-7.7v8.9l-1.5 1.5H3.3l-1.5-1.5z" />
    </Icone>
  )
}

export function Instagram(props: Props) {
  return (
    <Icone {...props}>
      <path d="M12 2.2c3.2 0 3.6 0 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.26.07 1.64.07 4.83s0 3.57-.07 4.83c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.26.06-1.64.07-4.85.07s-3.58 0-4.84-.07c-1.17-.05-1.8-.25-2.23-.41a3.8 3.8 0 0 1-1.38-.9c-.42-.42-.68-.82-.9-1.38-.16-.42-.36-1.06-.41-2.23C2.2 15.6 2.2 15.2 2.2 12s0-3.57.07-4.83c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.44 2.2 8.83 2.2 12 2.2zm0 1.98c-3.12 0-3.49.01-4.72.07-.9.04-1.39.19-1.71.32-.43.17-.74.37-1.06.69-.32.32-.52.63-.69 1.06-.13.32-.28.81-.32 1.71-.06 1.23-.07 1.6-.07 4.72s.01 3.49.07 4.72c.4.9.19 1.39.32 1.71.17.43.37.74.69 1.06.32.32.63.52 1.06.69.32.13.81.28 1.71.32 1.23.06 1.6.07 4.72.07s3.49-.01 4.72-.07c.9-.04 1.39-.19 1.71-.32.43-.17.74-.37 1.06-.69.32-.32.52-.63.69-1.06.13-.32.28-.81.32-1.71.06-1.23.07-1.6.07-4.72s-.01-3.49-.07-4.72c-.04-.9-.19-1.39-.32-1.71a2.9 2.9 0 0 0-.69-1.06 2.9 2.9 0 0 0-1.06-.69c-.32-.13-.81-.28-1.71-.32-1.23-.06-1.6-.07-4.72-.07zm0 3.37a5.45 5.45 0 1 1 0 10.9 5.45 5.45 0 0 1 0-10.9zm0 1.98a3.47 3.47 0 1 0 0 6.94 3.47 3.47 0 0 0 0-6.94zm5.67-3.52a1.27 1.27 0 1 1 0 2.55 1.27 1.27 0 0 1 0-2.55z" />
    </Icone>
  )
}

export function Facebook(props: Props) {
  return (
    <Icone {...props}>
      <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.9h2.54V9.85c0-2.52 1.49-3.91 3.77-3.91 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.45 2.9h-2.33V22C18.34 21.24 22 17.08 22 12.06z" />
    </Icone>
  )
}

export function YouTube(props: Props) {
  return (
    <Icone {...props}>
      <path d="M21.6 7.2a2.5 2.5 0 0 0-1.76-1.77C18.25 5 12 5 12 5s-6.25 0-7.84.43A2.5 2.5 0 0 0 2.4 7.2C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.76 1.77C5.75 19 12 19 12 19s6.25 0 7.84-.43a2.5 2.5 0 0 0 1.76-1.77C22 15.2 22 12 22 12s0-3.2-.4-4.8zM10 15.2V8.8l5.2 3.2-5.2 3.2z" />
    </Icone>
  )
}

export function TikTok(props: Props) {
  return (
    <Icone {...props}>
      <path d="M16.5 2h-3.1v13.2a2.5 2.5 0 1 1-2-2.45V9.6a5.6 5.6 0 1 0 5.1 5.57V9.03a6.5 6.5 0 0 0 3.8 1.22V7.14a3.65 3.65 0 0 1-3.8-3.6V2z" />
    </Icone>
  )
}
