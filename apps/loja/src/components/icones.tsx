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

export function Fechar(props: Props) {
  return (
    <Icone {...props}>
      <path d="M7.7 4.9 4.9 7.7 9.2 12l-4.3 4.3 2.8 2.8L12 14.8l4.3 4.3 2.8-2.8L14.8 12l4.3-4.3-2.8-2.8L12 9.2z" />
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
