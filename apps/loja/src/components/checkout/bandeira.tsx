import type { ReactNode } from "react"
import { NOMES_DAS_BANDEIRAS, type Bandeira } from "@/lib/cartao"

/**
 * O LOGO DA BANDEIRA, no fim do campo do número do cartão.
 *
 * Desenhado aqui, em SVG, e não baixado de lugar nenhum: cinco marcas de
 * 40×26 não justificam uma dependência nem uma imagem a mais na página que
 * decide a venda. As cores são as de cada bandeira; o traço é o mínimo pra
 * reconhecer de relance — é um carimbo de "entendi seu cartão", não o
 * logotipo oficial em tamanho de impressão.
 *
 * Canto reto, como o resto da loja (a marca é chanfro, nunca arredondado).
 * As de fundo branco ganham uma borda fina, senão o desenho flutua solto
 * dentro do campo.
 *
 * `role="img"` com o nome: o logo é a única coisa que diz, pra quem usa
 * leitor de tela, que a bandeira foi reconhecida.
 */
export function LogoDaBandeira({ bandeira }: { bandeira: Exclude<Bandeira, ""> }) {
  return (
    <svg
      viewBox="0 0 40 26"
      width="40"
      height="26"
      role="img"
      aria-label={`Cartão ${NOMES_DAS_BANDEIRAS[bandeira]}`}
    >
      {DESENHOS[bandeira]}
    </svg>
  )
}

const LETRA = "Arial, Helvetica, sans-serif"

/** Fundo claro com a borda fina. */
const fundoBranco = <rect x="0.5" y="0.5" width="39" height="25" fill="#fff" stroke="#cfd5dc" />

const DESENHOS: Record<Exclude<Bandeira, "">, ReactNode> = {
  visa: (
    <>
      {fundoBranco}
      <text
        x="20"
        y="13.5"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#1434cb"
        fontFamily={LETRA}
        fontSize="11.5"
        fontStyle="italic"
        fontWeight="900"
        letterSpacing="-0.3"
      >
        VISA
      </text>
    </>
  ),
  mastercard: (
    <>
      {fundoBranco}
      <circle cx="16" cy="13" r="8" fill="#eb001b" />
      <circle cx="24" cy="13" r="8" fill="#f79e1b" />
      {/* A lente onde os dois círculos se cruzam — o laranja da marca. */}
      <path d="M20 6.07A8 8 0 0 1 20 19.93A8 8 0 0 1 20 6.07Z" fill="#ff5f00" />
    </>
  ),
  amex: (
    <>
      <rect width="40" height="26" fill="#016fd0" />
      <text
        x="20"
        y="13.5"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#fff"
        fontFamily={LETRA}
        fontSize="9.5"
        fontWeight="900"
        letterSpacing="0.4"
      >
        AMEX
      </text>
    </>
  ),
  elo: (
    <>
      <rect width="40" height="26" fill="#000" />
      <circle cx="9.5" cy="7.5" r="2.3" fill="#ffcb05" />
      <circle cx="9.5" cy="13" r="2.3" fill="#00a4e0" />
      <circle cx="9.5" cy="18.5" r="2.3" fill="#ef4123" />
      <text
        x="25"
        y="12.5"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#fff"
        fontFamily={LETRA}
        fontSize="13"
        fontWeight="700"
      >
        elo
      </text>
    </>
  ),
  hipercard: (
    <>
      <rect width="40" height="26" fill="#b3131b" />
      <text
        x="20"
        y="13.5"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#fff"
        fontFamily={LETRA}
        fontSize="7"
        fontStyle="italic"
        fontWeight="700"
      >
        Hipercard
      </text>
    </>
  ),
}
