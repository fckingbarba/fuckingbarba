import type { Route } from "next"
import Form from "next/form"
import Link from "next/link"
import { Icone } from "@/components/icones"
import {
  FILTROS,
  NOME_DA_SITUACAO,
  NOME_DO_PROBLEMA,
  reais,
  type Filtro,
  type LinhaDaLista,
  type ListaDePedidos,
} from "@/lib/pedidos"

/**
 * AS PEÇAS DA LISTA DE PEDIDOS — o selo de situação, a busca, as fitas de
 * filtro e a lista (tabela no computador, cartões no celular), como no
 * protótipo. Tudo vem pronto do backend; aqui é só desenho.
 */

/** O selo: o problema manda (vermelho), depois o "pra despachar", depois a situação. */
export function Status({ p }: { p: Pick<LinhaDaLista, "situacao" | "problema" | "despachar"> }) {
  if (p.problema)
    return (
      <span className="status" data-s="problema">
        <Icone nome="alerta" />
        {NOME_DO_PROBLEMA[p.problema]}
      </span>
    )
  if (p.despachar)
    return (
      <span className="status" data-s="pix">
        <Icone nome="caminhao" />
        Pra despachar
      </span>
    )
  const cor =
    p.situacao === "vencido" ? "cancelado" : p.situacao === "combinar" ? "rascunho" : p.situacao
  return (
    <span className="status" data-s={cor}>
      {NOME_DA_SITUACAO[p.situacao]}
    </span>
  )
}

const forma = (f: LinhaDaLista["forma"]) => (f === "pix" ? "Pix" : f === "cartao" ? "Cartão" : "—")

/** O endereço da lista: o filtro, a busca e a página (a primeira não vai). */
export const enderecoDaLista = (filtro: Filtro, busca: string, pagina = 1) => {
  const q = new URLSearchParams()
  if (filtro !== "todos") q.set("filtro", filtro)
  if (busca) q.set("busca", busca)
  if (pagina > 1) q.set("pagina", String(pagina))
  const s = q.toString()
  return (s ? `/pedidos?${s}` : "/pedidos") as Route
}

export function BuscaEFiltros({ lista }: { lista: ListaDePedidos }) {
  return (
    <>
      {/* O `Form` do Next: buscar troca só a lista, sem recarregar o painel inteiro. */}
      <Form className="busca" action="/pedidos" role="search">
        <label htmlFor="busca-pedidos" className="sr-only">
          Buscar pedido
        </label>
        <Icone nome="busca" />
        <input
          type="search"
          id="busca-pedidos"
          name="busca"
          placeholder="Número, nome, e-mail ou cidade"
          defaultValue={lista.busca}
          autoComplete="off"
        />
        {lista.filtro !== "todos" ? (
          <input type="hidden" name="filtro" value={lista.filtro} />
        ) : null}
        <button type="submit">Buscar</button>
      </Form>
      <nav className="filtros" aria-label="Filtrar pedidos">
        {FILTROS.map((f) => (
          <Link
            key={f.id}
            className="filtro"
            href={enderecoDaLista(f.id, lista.busca)}
            aria-current={lista.filtro === f.id ? "page" : undefined}
          >
            {f.nome} <b>{lista.contagem[f.id] ?? 0}</b>
          </Link>
        ))}
      </nav>
    </>
  )
}

export function ListaDosPedidos({ pedidos }: { pedidos: LinhaDaLista[] }) {
  if (!pedidos.length)
    return (
      <div className="vazio">
        <b>Nenhum pedido aqui</b>Mude o filtro ou a busca.
      </div>
    )
  return (
    <>
      <div className="tabela-rola" data-vira-cartao>
        <table className="tabela">
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Cliente</th>
              <th>Itens</th>
              <th>Pagamento</th>
              <th>Situação</th>
              <th className="direita">Total</th>
            </tr>
          </thead>
          <tbody>
            {pedidos.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link className="tabela__link" href={`/pedidos/${p.id}` as Route}>
                    <span className="tabela__num">#{p.numero}</span>
                  </Link>
                  <span className="tabela__sub">{p.quando}</span>
                </td>
                <td>
                  {p.cliente.nome}
                  <span className="tabela__sub">
                    {p.cliente.cidade}
                    {p.cliente.uf ? `/${p.cliente.uf}` : ""}
                  </span>
                </td>
                <td>
                  {p.itens}
                  <span className="tabela__sub">
                    {p.unidades} {p.unidades === 1 ? "unidade" : "unidades"}
                  </span>
                </td>
                <td>{forma(p.forma)}</td>
                <td>
                  <Status p={p} />
                </td>
                <td className="direita num">
                  <b>{reais(p.total)}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="cartoes">
        {pedidos.map((p) => (
          <Link key={p.id} className="cartao" href={`/pedidos/${p.id}` as Route}>
            <span className="cartao__linha">
              <span className="cartao__titulo">
                #{p.numero} · {p.cliente.nome.split(" ")[0]}
              </span>
              <span className="cartao__valor">{reais(p.total)}</span>
            </span>
            <span className="cartao__txt">{p.itens}</span>
            <span className="cartao__linha">
              <span className="cartao__txt">
                {p.quando} · {forma(p.forma)}
              </span>
              <Status p={p} />
            </span>
          </Link>
        ))}
      </div>
    </>
  )
}
