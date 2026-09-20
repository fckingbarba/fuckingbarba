import { Fragment, type ReactNode } from "react"

/**
 * REALCE DENTRO DE UM TEXTO
 *
 * O conteúdo editorial (`src/conteudo/`) é texto puro, e às vezes um pedaço
 * dele precisa de peso: "age *na pele*", "barba nova em *90 dias*".
 *
 * A alternativa óbvia seria guardar `<strong>` no texto e jogar com
 * `dangerouslySetInnerHTML`. Não faço isso por um motivo que só aparece
 * depois: no dia em que esse texto vier do painel, um campo que aceita HTML
 * vira porta de XSS — e ninguém lembra de sanitizar um campo que "sempre foi
 * da equipe". Com asterisco, o pior que alguém consegue escrever é um
 * asterisco perdido.
 *
 * Asterisco sozinho, sem par, fica como está. É o comportamento certo: texto
 * é coisa de gente, e gente esquece de fechar.
 */
export function Realce({
  texto,
  como: Como = "strong",
}: {
  texto: string
  como?: "strong" | "em"
}) {
  const partes = texto.split("*")

  // Número par de asteriscos deixa um resto ímpar de pedaços; se veio par,
  // algum ficou sem fechar — devolve o texto cru em vez de adivinhar.
  if (partes.length % 2 === 0) return <>{texto}</>

  return (
    <>
      {partes.map((parte, i) =>
        i % 2 === 1 ? <Como key={i}>{parte}</Como> : <Fragment key={i}>{parte}</Fragment>
      )}
    </>
  )
}

/** O mesmo, quando o destino é um atributo (alt, title) e não a tela. */
export function semRealce(texto: string): string {
  return texto.replace(/\*/g, "")
}

export type ComRealce = { texto: string; children?: ReactNode }
