import type { Route } from "next"
import Link from "next/link"
import { Icone } from "@/components/icones"
import { CamposDePreco, CelulasDePreco } from "@/components/produto/campos-de-preco"
import {
  FILTROS_DE_PRODUTO,
  NOME_DA_SITUACAO,
  type FiltroDeProduto,
  type LinhaDoProduto,
  type ListaDeProdutos,
} from "@/lib/produtos"

/**
 * AS PEÇAS DA LISTA DE PRODUTOS — o selo, as fitas de filtro e a lista
 * (tabela no computador, cartões no celular), como no protótipo. O preço e
 * o promocional se mudam na própria lista (`campos-de-preco.tsx`).
 */

export function SeloDoProduto({ p }: { p: Pick<LinhaDoProduto, "situacao"> }) {
  return (
    <span className="status" data-s={p.situacao}>
      {NOME_DA_SITUACAO[p.situacao]}
    </span>
  )
}

export function FotoDoProduto({ foto }: { foto: string | null }) {
  return (
    <span className={`foto${foto ? "" : " foto--vazia"}`}>
      {foto ? (
        // eslint-disable-next-line @next/next/no-img-element -- foto do Medusa, de qualquer host
        <img src={foto} alt="" loading="lazy" />
      ) : (
        <Icone nome="produtos" />
      )}
    </span>
  )
}

/** Estoque: 0 em vermelho, menos de 10 em amarelo ("acabando"); sem controle, um traço. */
function Estoque({ n }: { n: number | null }) {
  if (n === null) return <span className="suave">—</span>
  if (n === 0) return <b className="estoque estoque--zero">0</b>
  if (n < 10)
    return (
      <>
        <b className="estoque estoque--pouco">{n}</b>{" "}
        <span className="tabela__sub tabela__sub--linha">acabando</span>
      </>
    )
  return <>{n}</>
}

const endereco = (filtro: FiltroDeProduto) =>
  (filtro === "todos" ? "/produtos" : `/produtos?filtro=${filtro}`) as Route

export function FiltrosDosProdutos({ lista }: { lista: ListaDeProdutos }) {
  return (
    <nav className="filtros" aria-label="Filtrar produtos">
      {FILTROS_DE_PRODUTO.map((f) => (
        <Link
          key={f.id}
          className="filtro"
          href={endereco(f.id)}
          aria-current={lista.filtro === f.id ? "page" : undefined}
        >
          {f.nome} <b>{lista.contagem[f.id] ?? 0}</b>
        </Link>
      ))}
    </nav>
  )
}

export function ListaDosProdutos({
  produtos,
  podeEditar,
}: {
  produtos: LinhaDoProduto[]
  podeEditar: boolean
}) {
  if (!produtos.length)
    return (
      <div className="vazio">
        <b>Nenhum produto aqui</b>Mude o filtro.
      </div>
    )
  return (
    <>
      <div className="tabela-rola" data-vira-cartao>
        <table className="tabela">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Categoria</th>
              <th>Preço</th>
              <th>Promocional</th>
              <th>
                Estoque <span className="selo selo--bling">Bling</span>
              </th>
              <th>No site</th>
            </tr>
          </thead>
          <tbody>
            {produtos.map((p) => (
              <tr key={p.id} data-produto={p.id}>
                <td>
                  <span className="com-foto">
                    <FotoDoProduto foto={p.foto} />
                    <span>
                      <Link className="tabela__link" href={`/produtos/${p.id}` as Route}>
                        <b>{p.nome}</b>
                      </Link>
                      {p.sku ? <span className="tabela__sub">SKU {p.sku}</span> : null}
                    </span>
                  </span>
                </td>
                <td>{p.categoria ?? <span className="suave">sem categoria</span>}</td>
                <CelulasDePreco p={p} podeEditar={podeEditar} />
                <td className="num">
                  <Estoque n={p.estoque} />
                </td>
                <td>
                  <SeloDoProduto p={p} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="cartoes">
        {/* O cartão não é mais um link inteiro: dentro dele mora o campo da
            promoção. O link é a parte de cima (a foto e o nome). */}
        {produtos.map((p) => (
          <div key={p.id} className="cartao cartao--produto" data-produto={p.id}>
            <Link className="com-foto cartao__ir" href={`/produtos/${p.id}` as Route}>
              <FotoDoProduto foto={p.foto} />
              <span className="cartao__miolo">
                <span className="cartao__titulo">{p.nome}</span>
                <span className="cartao__linha">
                  <span className="cartao__txt">
                    {p.estoque !== null ? `Estoque ${p.estoque}` : "Sem controle de estoque"}
                  </span>
                  <SeloDoProduto p={p} />
                </span>
              </span>
            </Link>
            <CamposDePreco p={p} podeEditar={podeEditar} />
          </div>
        ))}
      </div>
    </>
  )
}
