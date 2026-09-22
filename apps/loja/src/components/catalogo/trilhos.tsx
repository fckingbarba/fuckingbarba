import Link from "next/link"
import { contarTudo, type HandleDeCategoria, type Prateleira } from "@/lib/catalogo"

/**
 * OS TRILHOS — as outras categorias, com a contagem de cada uma.
 *
 * Ficam ACIMA da grade, não no rodapé. Numa categoria de um produto só a
 * pessoa decide em dois segundos que não é ali; se a saída estiver embaixo
 * da grade, ela já foi embora antes de rolar até lá.
 *
 * A CONTAGEM NÃO É ENFEITE. É o que faz alguém escolher "Barba 4" em vez de
 * entrar em Cabelo pra descobrir sozinho que tem um item. Ela sai da mesma
 * busca que desenha a grade, então não existe a versão em que o número diz
 * quatro e a lista mostra três.
 *
 * `<nav>` com `aria-label` e `aria-current="page"` no ativo: sem isso, quem
 * usa leitor de tela ouve quatro links iguais e nenhuma pista de onde está.
 */

type Props = {
  prateleiras: Prateleira[]
  /**
   * handle da categoria atual, "produtos" na lista completa, ou `null` onde
   * nenhuma é a atual (a busca).
   */
  atual: HandleDeCategoria | "produtos" | null
}

export function Trilhos({ prateleiras, atual }: Props) {
  return (
    <nav className="trilhos" aria-label="Categorias">
      {prateleiras.map((p) => (
        <Trilho
          key={p.handle}
          href={`/${p.handle}`}
          nome={p.nome}
          quantos={p.produtos.length}
          ativo={p.handle === atual}
        />
      ))}
      <Trilho
        href="/produtos"
        nome="Todos"
        quantos={contarTudo(prateleiras)}
        ativo={atual === "produtos"}
      />
    </nav>
  )
}

function Trilho({
  href,
  nome,
  quantos,
  ativo,
}: {
  href: `/${HandleDeCategoria}` | "/produtos"
  nome: string
  quantos: number
  ativo: boolean
}) {
  return (
    <Link
      className={ativo ? "trilho trilho--ativo" : "trilho"}
      href={href}
      aria-current={ativo ? "page" : undefined}
    >
      {nome} <b>{quantos}</b>
    </Link>
  )
}
