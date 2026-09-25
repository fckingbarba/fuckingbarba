import type { Route } from "next"
import Link from "next/link"
import { Icone } from "@/components/icones"
import { type LinhaDoCliente, vezes } from "@/lib/clientes"
import { reais } from "@/lib/pedidos"

/**
 * AS PEÇAS DE CLIENTES — as abas (Clientes e Newsletter), a busca e a lista
 * (tabela no computador, cartões no celular), como no protótipo. Tudo vem
 * pronto do backend; aqui é só desenho. O que o papel não vê nem chega: sem
 * cidade pro marketing, a coluna some.
 */

export function AbasDeClientes({
  atual,
  comNewsletter,
}: {
  atual: "lista" | "newsletter"
  /** A aba da newsletter é do marketing e do dono: a operação vê só os clientes. */
  comNewsletter: boolean
}) {
  if (!comNewsletter) return null
  return (
    <nav className="abas" aria-label="Clientes">
      <Link href="/clientes" aria-current={atual === "lista" ? "page" : undefined}>
        Clientes
      </Link>
      <Link
        href={"/clientes/newsletter" as Route}
        aria-current={atual === "newsletter" ? "page" : undefined}
      >
        Newsletter
      </Link>
    </nav>
  )
}

export function BuscaDeClientes({ busca }: { busca: string }) {
  return (
    <form className="busca" action="/clientes" role="search">
      <label htmlFor="busca-clientes" className="sr-only">
        Buscar cliente
      </label>
      <Icone nome="busca" />
      <input
        type="search"
        id="busca-clientes"
        name="busca"
        placeholder="Nome ou e-mail"
        defaultValue={busca}
        autoComplete="off"
      />
      <button type="submit">Buscar</button>
    </form>
  )
}

const ficha = (id: string) => `/clientes/${id}` as Route

export function ListaDosClientes({
  clientes,
  comCidade,
}: {
  clientes: LinhaDoCliente[]
  /** Sem cidade (o marketing), a coluna nem aparece. */
  comCidade: boolean
}) {
  if (!clientes.length)
    return (
      <div className="vazio">
        <b>Nenhum cliente aqui</b>Mude a busca.
      </div>
    )
  return (
    <>
      <div className="tabela-rola" data-vira-cartao>
        <table className="tabela">
          <thead>
            <tr>
              <th>Cliente</th>
              {comCidade ? <th>Cidade</th> : null}
              <th>Pedidos</th>
              <th className="direita">Gastou</th>
              <th>Ofertas</th>
            </tr>
          </thead>
          <tbody>
            {clientes.map((c) => (
              <tr key={c.id} data-cliente={c.id}>
                <td>
                  <Link className="tabela__link" href={ficha(c.id)}>
                    <b>{c.nome}</b>
                  </Link>
                  <span className="tabela__sub">{c.email}</span>
                </td>
                {comCidade ? <td>{c.cidade ?? <span className="suave">—</span>}</td> : null}
                <td className="num">
                  {c.pedidos}
                  <span className="tabela__sub">{c.ultimo}</span>
                </td>
                <td className="direita num">{c.gastou ? <b>{reais(c.gastou)}</b> : "—"}</td>
                <td>{c.ofertas ?? <span className="suave">não aceita</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="cartoes">
        {clientes.map((c) => (
          <Link className="cartao" key={c.id} href={ficha(c.id)} data-cliente={c.id}>
            <span className="cartao__linha">
              <p className="cartao__titulo">{c.nome}</p>
              <span className="cartao__valor">{c.gastou ? reais(c.gastou) : "—"}</span>
            </span>
            <p className="cartao__txt">{c.email}</p>
            <p className="cartao__txt">
              {vezes(c.pedidos, "pedido", "pedidos")}
              {c.cidade ? ` · ${c.cidade}` : ""}
              {c.ofertas ? ` · ofertas por ${c.ofertas.split(" · ")[0]}` : ""}
            </p>
          </Link>
        ))}
      </div>
    </>
  )
}
