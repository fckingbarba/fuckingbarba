import type { Route } from "next"
import Link from "next/link"
import { Icone } from "@/components/icones"
import { Status } from "@/components/pedidos"
import { reais, reaisCurto, type Inicio } from "@/lib/pedidos"

/**
 * AS PEÇAS DO INÍCIO — os números, o "precisa de você", o gráfico da semana
 * e a lista do lado (os pedidos de hoje, ou os mais vendidos pro marketing).
 * Os desenhos são os do protótipo; os dados, do `GET /dashboard/inicio`.
 */

const vezes = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

export function Numeros({ n }: { n: Inicio["numeros"] }) {
  const esperando = [
    n.esperando.pix ? vezes(n.esperando.pix, "Pix", "Pix") : "",
    n.esperando.analise
      ? vezes(n.esperando.analise, "cartão em análise", "cartões em análise")
      : "",
  ].filter(Boolean)
  return (
    <div className="numeros numeros--3">
      <div className="numero numero--destaque">
        <p className="numero__rot">Vendas hoje</p>
        <p className="numero__valor">{reais(n.vendasHoje.valor)}</p>
        <p className="numero__sub">{vezes(n.vendasHoje.pedidos, "pedido pago", "pedidos pagos")}</p>
      </div>
      <div className="numero">
        <p className="numero__rot">Esperando pagamento</p>
        <p className="numero__valor">{reais(n.esperando.valor)}</p>
        <p className="numero__sub">{esperando.length ? esperando.join(" · ") : "nada esperando"}</p>
      </div>
      <div className="numero">
        <p className="numero__rot">Últimos 7 dias</p>
        <p className="numero__valor">{reais(n.semana.valor)}</p>
        <p className="numero__sub">
          {vezes(n.semana.pedidos, "pedido", "pedidos")}
          {n.semana.pedidos ? ` · ticket ${reais(n.semana.ticket)}` : ""}
        </p>
      </div>
    </div>
  )
}

export function Fila({ fila }: { fila: Inicio["fila"] }) {
  return (
    <section className="bloco">
      <div className="bloco__cabeca">
        <div>
          <h2 className="bloco__titulo">Precisa de você</h2>
          <p className="bloco__sub">Na ordem do que trava mais.</p>
        </div>
      </div>
      {fila.length ? (
        <div className="fila">
          {fila.map((f) => (
            <Link
              key={f.titulo}
              className="fila__item"
              data-nivel={f.nivel || undefined}
              href={f.href as Route}
            >
              <span className="fila__ico">
                <Icone nome={f.icone} />
              </span>
              <span>
                <p className="fila__titulo">{f.titulo}</p>
                <p className="fila__txt">{f.texto}</p>
              </span>
              <Icone nome="seta" className="fila__seta" />
            </Link>
          ))}
        </div>
      ) : (
        <p className="fila__vazia">Nada travado agora — a loja segue sozinha.</p>
      )}
    </section>
  )
}

export function Grafico({ dias }: { dias: Inicio["grafico"] }) {
  const maior = Math.max(...dias.map((d) => d.valor), 1)
  const descricao = dias
    .map((d) => `${d.rotulo}: ${reais(d.valor)}, ${vezes(d.pedidos, "pedido", "pedidos")}`)
    .join("; ")
  return (
    <section className="bloco">
      <div className="bloco__cabeca">
        <div>
          <h2 className="bloco__titulo">Vendas pagas na semana</h2>
          <p className="bloco__sub">
            Só pedido pago conta — Pix esperando e cartão em análise ficam de fora.
          </p>
        </div>
      </div>
      <div className="barras-v" role="img" aria-label={`Vendas por dia. ${descricao}`}>
        {dias.map((d) => (
          <div
            className="barras-v__col"
            key={d.rotulo}
            title={`${reais(d.valor)} · ${vezes(d.pedidos, "pedido", "pedidos")}`}
          >
            <i
              style={{ height: `${Math.min(100, (d.valor / maior) * 100).toFixed(1)}%` }}
              data-v={d.valor ? reaisCurto(d.valor) : undefined}
              data-agora={d.hoje ? "" : undefined}
            />
            <span className="barras-v__rot">{d.hoje ? "hoje" : d.rotulo}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

export function PedidosDeHoje({ pedidos }: { pedidos: NonNullable<Inicio["pedidosDeHoje"]> }) {
  return (
    <section className="bloco">
      <div className="bloco__cabeca">
        <h2 className="bloco__titulo">Pedidos de hoje</h2>
        <Link className="link pequeno" href="/pedidos">
          Ver todos
        </Link>
      </div>
      {pedidos.length ? (
        <div className="mini">
          {pedidos.map((p) => (
            <Link key={p.id} href={`/pedidos/${p.id}` as Route}>
              <span>
                <p className="mini__titulo">
                  #{p.numero} · {p.cliente.nome}
                </p>
                <p className="mini__txt">
                  {p.quando.replace("hoje, ", "")} · {p.itens}
                </p>
              </span>
              <span style={{ display: "grid", justifyItems: "end", gap: 4 }}>
                <span className="num" style={{ fontWeight: 800 }}>
                  {reais(p.total)}
                </span>
                <Status p={p} />
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="vazio vazio--curto">Nenhum pedido hoje ainda.</p>
      )}
    </section>
  )
}

export function MaisVendidos({ itens }: { itens: Inicio["maisVendidos"] }) {
  return (
    <section className="bloco">
      <div className="bloco__cabeca">
        <div>
          <h2 className="bloco__titulo">Mais vendidos da semana</h2>
          <p className="bloco__sub">Em unidades, só dos pedidos pagos.</p>
        </div>
      </div>
      {itens.length ? (
        <div className="mini">
          {itens.map((i) => (
            <div key={i.nome} className="mini__linha">
              <span className="com-foto">
                <span className={`foto${i.imagem ? "" : " foto--vazia"}`}>
                  {i.imagem ? (
                    // eslint-disable-next-line @next/next/no-img-element -- foto do Medusa, de qualquer host
                    <img src={i.imagem} alt="" loading="lazy" />
                  ) : (
                    <Icone nome="produtos" />
                  )}
                </span>
                <span>
                  <p className="mini__titulo">{i.nome}</p>
                  <p className="mini__txt">{vezes(i.unidades, "unidade", "unidades")}</p>
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="vazio vazio--curto">Nenhuma venda paga nos últimos 7 dias.</p>
      )}
    </section>
  )
}
