import type { Route } from "next"
import Link from "next/link"
import { Icone } from "@/components/icones"
import type { Paginacao } from "@/lib/paginas"

/**
 * O PÉ DE UMA LISTA EM PÁGINAS — "31–60 de 300" e os números: a primeira,
 * a última e as vizinhas da atual, com "…" no meio. No celular ficam só as
 * setas e "2 de 10". Cada número é um link comum (o endereço leva a
 * página), então o voltar do navegador volta pra página de antes.
 *
 * Uma página só: nada aparece.
 */
export function Paginas({
  paginacao,
  endereco,
  rotulo,
}: {
  paginacao: Paginacao
  /** O endereço de uma página, com o filtro e a busca de agora. */
  endereco: (pagina: number) => Route
  /** Do que é a lista: "pedidos", "clientes"… (pro leitor de tela). */
  rotulo: string
}) {
  const { pagina, paginas, porPagina, itens } = paginacao
  if (paginas <= 1) return null
  const de = (pagina - 1) * porPagina + 1
  const ate = Math.min(pagina * porPagina, itens)
  return (
    <nav className="paginas" aria-label={`Páginas de ${rotulo}`} data-paginas>
      <p className="paginas__quantos num">
        <b>
          {de}–{ate}
        </b>{" "}
        de {itens}
      </p>
      <div className="paginas__botoes">
        {pagina > 1 ? (
          <Link className="paginas__seta" href={endereco(pagina - 1)} rel="prev">
            <Icone nome="esquerda" />
            <span className="sr-only">Página anterior</span>
          </Link>
        ) : (
          <span className="paginas__seta" aria-hidden="true">
            <Icone nome="esquerda" />
          </span>
        )}
        {numeros(pagina, paginas).map((n, i) =>
          n === null ? (
            <span key={`r${i}`} className="paginas__resto" aria-hidden="true">
              …
            </span>
          ) : (
            <Link
              key={n}
              className="paginas__num num"
              href={endereco(n)}
              aria-current={n === pagina ? "page" : undefined}
              aria-label={`Página ${n}`}
            >
              {n}
            </Link>
          )
        )}
        <span className="paginas__cel num" aria-hidden="true">
          {pagina} de {paginas}
        </span>
        {pagina < paginas ? (
          <Link className="paginas__seta" href={endereco(pagina + 1)} rel="next">
            <Icone nome="seta" />
            <span className="sr-only">Próxima página</span>
          </Link>
        ) : (
          <span className="paginas__seta" aria-hidden="true">
            <Icone nome="seta" />
          </span>
        )}
      </div>
    </nav>
  )
}

/** 1 … 4 5 6 … 10: a primeira, a última e as vizinhas da atual; `null` é o "…". */
export function numeros(pagina: number, paginas: number): (number | null)[] {
  const quais = new Set([1, paginas, pagina - 1, pagina, pagina + 1])
  // Perto das pontas, mostra uma a mais em vez de um "…" que esconderia um número só.
  if (pagina <= 3) quais.add(2).add(3).add(4)
  if (pagina >= paginas - 2)
    quais
      .add(paginas - 1)
      .add(paginas - 2)
      .add(paginas - 3)
  const lista = [...quais].filter((n) => n >= 1 && n <= paginas).sort((a, b) => a - b)
  const saida: (number | null)[] = []
  for (const n of lista) {
    const antes = saida.at(-1)
    if (typeof antes === "number" && n - antes === 2) saida.push(antes + 1)
    else if (typeof antes === "number" && n - antes > 2) saida.push(null)
    saida.push(n)
  }
  return saida
}
