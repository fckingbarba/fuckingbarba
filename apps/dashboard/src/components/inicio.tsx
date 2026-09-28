import type { Route } from "next"
import Link from "next/link"
import type { ReactNode } from "react"
import { Icone } from "@/components/icones"
import { Status } from "@/components/pedidos"
import { Ajuda, Faisca, Forma, Fotos } from "@/components/visual"
import { reais, reaisCurto, type Inicio } from "@/lib/pedidos"

/**
 * AS PEÇAS DO INÍCIO — os números, o "precisa de você", o gráfico da semana
 * e a lista do lado (os pedidos de hoje, ou os mais vendidos pro marketing).
 * Os desenhos são os do protótipo; os dados, do `GET /dashboard/inicio`.
 */

const vezes = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/**
 * Os quatro números de cima, cada um com o seu ícone e o resto em desenho:
 * as barrinhas da semana nas vendas de hoje, o Pix e o cartão no que espera
 * pagamento. As visitas chegam à parte (`visitas`): o Google pode demorar.
 */
export function Numeros({
  n,
  dias,
  visitas,
}: {
  n: Inicio["numeros"]
  dias: Inicio["grafico"]
  visitas: ReactNode
}) {
  return (
    <div className="numeros">
      <div className="numero numero--destaque">
        <span className="numero__ico">
          <Icone nome="grafico" />
        </span>
        <p className="numero__rot">Vendas hoje</p>
        <p className="numero__valor">{reais(n.vendasHoje.valor)}</p>
        <div className="numero__pe">
          <span className="pilula">
            {vezes(n.vendasHoje.pedidos, "pedido pago", "pedidos pagos")}
          </span>
          <Faisca valores={dias} />
        </div>
      </div>
      {visitas}
      <div className="numero">
        <span className="numero__ico">
          <Icone nome="relogio" />
        </span>
        <p className="numero__rot">Esperando pagamento</p>
        <p className="numero__valor">{reais(n.esperando.valor)}</p>
        <div className="numero__pe">
          {n.esperando.pix || n.esperando.analise ? (
            <>
              <span className="pilula" title={vezes(n.esperando.pix, "Pix", "Pix")}>
                <Icone nome="pix" />
                {n.esperando.pix}
                <span className="sr-only"> Pix</span>
              </span>
              <span
                className="pilula"
                title={vezes(n.esperando.analise, "cartão em análise", "cartões em análise")}
              >
                <Icone nome="cartao" />
                {n.esperando.analise}
                <span className="sr-only"> em análise</span>
              </span>
            </>
          ) : (
            <span className="pilula pilula--suave">nada esperando</span>
          )}
        </div>
      </div>
      <div className="numero">
        <span className="numero__ico">
          <Icone nome="pedidos" />
        </span>
        <p className="numero__rot">Últimos 7 dias</p>
        <p className="numero__valor">{reais(n.semana.valor)}</p>
        <div className="numero__pe">
          <span className="pilula">{vezes(n.semana.pedidos, "pedido", "pedidos")}</span>
          {n.semana.pedidos ? (
            <span className="pilula">ticket {reais(n.semana.ticket)}</span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/** Quantos números de pedido a fila mostra num item; o resto vira "+N". */
const FICHAS = 6

/**
 * O "precisa de você" — o que é igual já vem junto do backend (0148): o
 * título, o número de pedidos, as etiquetas curtas e os pedidos um por um.
 * A explicação mora no "?". O item inteiro leva ao lugar dele (o link do
 * título cobre o cartão), e cada número abre o seu pedido.
 */
export function Fila({ fila, faixa = false }: { fila: Inicio["fila"]; faixa?: boolean }) {
  return (
    <section className={faixa ? "bloco bloco--faixa" : "bloco"} data-fila>
      <div className="bloco__cabeca">
        <span className="bloco__titulos">
          <h2 className="bloco__titulo">Precisa de você</h2>
          {fila.length ? <span className="contagem num">{fila.length}</span> : null}
        </span>
        {/* No Início com período (0186), a fila fica em cima, numa faixa: ela é do agora. */}
        {faixa ? <span className="pilula pilula--suave">agora</span> : null}
      </div>
      {fila.length ? (
        <div className={faixa ? "fila fila--faixa" : "fila"}>
          {fila.map((f, i) => (
            <div
              key={f.chave ?? `${f.titulo}-${i}`}
              className="fila__item"
              data-nivel={f.nivel || undefined}
              data-chave={f.chave}
            >
              <span className="fila__ico">
                <Icone nome={f.icone} />
              </span>
              <span className="fila__miolo">
                <span className="fila__cabeca">
                  <Link className="fila__link" href={f.href as Route}>
                    <span className="fila__titulo">{f.titulo}</span>
                  </Link>
                  {f.quantos ? <span className="contagem num">{f.quantos}</span> : null}
                  {(f.etiquetas ?? []).map((e) => (
                    <span key={e} className="fila__etiqueta">
                      {e}
                    </span>
                  ))}
                </span>
                {f.pedidos?.length ? (
                  <span className="fichas">
                    {f.pedidos.slice(0, FICHAS).map((p) => (
                      <Link key={p.href} className="ficha num" href={p.href as Route}>
                        #{p.numero}
                      </Link>
                    ))}
                    {f.pedidos.length > FICHAS ? (
                      <Link className="ficha ficha--mais num" href={f.href as Route}>
                        +{f.pedidos.length - FICHAS}
                      </Link>
                    ) : null}
                  </span>
                ) : null}
                {/* Backend de antes da 0148: sem as peças novas, a frase fica à vista. */}
                {f.chave ? null : <span className="fila__txt">{f.texto}</span>}
              </span>
              <span className="fila__lado">
                {f.chave && f.texto ? <Ajuda rotulo="Por quê?">{f.texto}</Ajuda> : null}
                <Icone nome="seta" className="fila__seta" />
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="fila__vazia">
          <Icone nome="check" />
          Nada travado agora.
        </p>
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
        <h2 className="bloco__titulo">Vendas pagas na semana</h2>
        <span className="bloco__lado">
          <span className="pilula num">{reais(dias.reduce((s, d) => s + d.valor, 0))}</span>
          <Ajuda>Só pedido pago conta — Pix esperando e cartão em análise ficam de fora.</Ajuda>
        </span>
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
        <span className="bloco__titulos">
          <h2 className="bloco__titulo">Pedidos de hoje</h2>
          {pedidos.length ? <span className="contagem num">{pedidos.length}</span> : null}
        </span>
        <Link className="link pequeno" href="/pedidos">
          Ver todos
        </Link>
      </div>
      {pedidos.length ? (
        <div className="mini mini--fotos">
          {pedidos.map((p) => (
            <Link key={p.id} href={`/pedidos/${p.id}` as Route}>
              <Fotos fotos={p.fotos} produtos={p.produtos} rotulo={p.itens} />
              <span className="mini__meio">
                <p className="mini__titulo">
                  #{p.numero} · {p.cliente.nome}
                </p>
                <p className="mini__txt">
                  <Forma forma={p.forma} />
                  {p.quando.replace("hoje, ", "")}
                </p>
              </span>
              <span className="mini__lado">
                <span className="num">{reais(p.total)}</span>
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

/** Os mais vendidos em barras: o primeiro em amarelo, e cada barra do tamanho das unidades. */
export function MaisVendidos({ itens }: { itens: Inicio["maisVendidos"] }) {
  const maior = Math.max(...itens.map((i) => i.unidades), 1)
  return (
    <section className="bloco">
      <div className="bloco__cabeca">
        <h2 className="bloco__titulo">Mais vendidos da semana</h2>
        <span className="bloco__lado">
          <span className="pilula">unidades</span>
          <Ajuda>Em unidades, só dos pedidos pagos dos últimos 7 dias.</Ajuda>
        </span>
      </div>
      {itens.length ? (
        <ol className="ranking">
          {itens.map((i, n) => (
            <li key={i.nome}>
              <b className="num">{n + 1}</b>
              <span className={`foto${i.imagem ? "" : " foto--vazia"}`}>
                {i.imagem ? (
                  // eslint-disable-next-line @next/next/no-img-element -- foto do Medusa, de qualquer host
                  <img src={i.imagem} alt="" loading="lazy" />
                ) : (
                  <Icone nome="produtos" />
                )}
              </span>
              <span className="ranking__miolo">
                <span className="ranking__nome">
                  <span className="mini__titulo">{i.nome}</span>
                  <span className="num">{i.unidades}</span>
                </span>
                <span className="ranking__trilho" aria-hidden="true">
                  <i style={{ width: `${((i.unidades / maior) * 100).toFixed(1)}%` }} />
                </span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="vazio vazio--curto">Nenhuma venda paga nos últimos 7 dias.</p>
      )}
    </section>
  )
}
