import type { Route } from "next"
import Form from "next/form"
import Link from "next/link"
import { Icone } from "@/components/icones"
import { Sigla } from "@/components/visual"
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
    // O `Form` do Next: buscar troca só a lista, sem recarregar o painel inteiro.
    <Form className="busca" action="/clientes" role="search">
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
    </Form>
  )
}

const ficha = (id: string) => `/clientes/${id}` as Route

/** E-mail e WhatsApp: aceso quem aceitou ofertas por aquele canal. */
function Canais({ c }: { c: LinhaDoCliente }) {
  const canais = c.canais ?? {
    email: Boolean(c.ofertas?.startsWith("e-mail")),
    whatsapp: Boolean(c.ofertas?.includes("WhatsApp")),
  }
  return (
    <span className="canais">
      <span
        className="canal"
        data-canal="email"
        data-sim={canais.email ? "" : undefined}
        title={canais.email ? "Aceita ofertas por e-mail" : "Não aceita ofertas por e-mail"}
      >
        <Icone nome="email" />
      </span>
      <span
        className="canal"
        data-canal="whatsapp"
        data-sim={canais.whatsapp ? "" : undefined}
        title={canais.whatsapp ? "Aceita ofertas por WhatsApp" : "Não aceita ofertas por WhatsApp"}
      >
        <Icone nome="whatsapp" />
      </span>
      {/* A frase de antes, pro leitor de tela (e o "desde quando"). */}
      <span className="sr-only">{c.ofertas ?? "não aceita"}</span>
    </span>
  )
}

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
  // A barrinha do "gastou" é do tamanho do maior gasto da página.
  const maior = Math.max(...clientes.map((c) => c.gastou), 1)
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
                  <span className="pessoa">
                    <Sigla nome={c.nome} />
                    <span>
                      <Link className="tabela__link" href={ficha(c.id)}>
                        <b>{c.nome}</b>
                      </Link>
                      <span className="tabela__sub">{c.email}</span>
                    </span>
                  </span>
                </td>
                {comCidade ? <td>{c.cidade ?? <span className="suave">—</span>}</td> : null}
                <td className="num">
                  <span className="bolinha" data-zero={c.pedidos ? undefined : ""}>
                    {c.pedidos}
                  </span>
                  <span className="tabela__sub">{c.ultimo}</span>
                </td>
                <td className="direita num">
                  {c.gastou ? (
                    <span className="gasto">
                      <b>{reais(c.gastou)}</b>
                      <span className="gasto__trilho" aria-hidden="true">
                        <i style={{ width: `${((c.gastou / maior) * 100).toFixed(1)}%` }} />
                      </span>
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <Canais c={c} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="cartoes">
        {clientes.map((c) => (
          <Link className="cartao" key={c.id} href={ficha(c.id)} data-cliente={c.id}>
            <span className="cartao__linha">
              <span className="pessoa">
                <Sigla nome={c.nome} />
                <span>
                  <p className="cartao__titulo">{c.nome}</p>
                  <p className="cartao__txt">{c.email}</p>
                </span>
              </span>
              <span className="cartao__valor">{c.gastou ? reais(c.gastou) : "—"}</span>
            </span>
            <span className="cartao__linha">
              <span className="cartao__txt">
                {vezes(c.pedidos, "pedido", "pedidos")}
                {c.cidade ? ` · ${c.cidade}` : ""}
              </span>
              <Canais c={c} />
            </span>
          </Link>
        ))}
      </div>
    </>
  )
}
