import Link from "next/link"
import { Achados } from "@/components/marketing"
import { lerClientesDoMarketing, type LinhaDoEstado, type Periodo } from "@/lib/marketing"
import { reais } from "@/lib/pedidos"

/**
 * OS CLIENTES DO MARKETING — quem compra, se volta, em quanto tempo, e de
 * onde; e a newsletter. Os desenhos são os do protótipo; os dados, do
 * `GET /dashboard/marketing/clientes` (a pessoa é o e-mail do pedido, e a
 * primeira compra é a primeira da loja nova).
 */

const INTEIRO = new Intl.NumberFormat("pt-BR")

/** Acima disso de frete médio, o estado fica em vermelho (o do achado). */
const FRETE_QUE_PESA = 30

export async function TelaDosClientes({ periodo }: { periodo: Periodo }) {
  const c = await lerClientesDoMarketing(periodo)
  if (!c)
    return (
      <p className="sem-dados">Não consegui falar com a loja agora. Recarregue daqui a pouco.</p>
    )
  const receita = c.estados.reduce((s, e) => s + e.receita, 0)
  const trilho = (e: LinhaDoEstado) => (
    <span className="trilho">
      <i
        style={{ width: `${receita ? Math.max(1, (e.receita / receita) * 100).toFixed(1) : 0}%` }}
      />
    </span>
  )
  const frete = (e: LinhaDoEstado) => (
    <span className={e.frete > FRETE_QUE_PESA ? "ruim" : undefined}>{reais(e.frete)}</span>
  )
  return (
    <>
      <div className="numeros" data-numeros-dos-clientes>
        <div className="numero numero--destaque" data-numero="compraram">
          <p className="numero__rot">Compraram</p>
          <p className="numero__valor">{INTEIRO.format(c.compraram)}</p>
          <p className="numero__sub">{c.compraram === 1 ? "pessoa" : "pessoas diferentes"}</p>
        </div>
        <div className="numero" data-numero="primeira">
          <p className="numero__rot">Primeira compra</p>
          <p className="numero__valor">
            {c.primeira.parte === null ? "—" : `${c.primeira.parte}%`}
          </p>
          <p className="numero__sub">
            {c.primeira.pedidos
              ? `dos pedidos · ticket ${reais(c.primeira.ticket)}`
              : "dos pedidos"}
          </p>
        </div>
        <div className="numero" data-numero="voltaram">
          <p className="numero__rot">Voltaram a comprar</p>
          <p className="numero__valor">
            {c.voltaram.parte === null ? "—" : `${c.voltaram.parte}%`}
          </p>
          <p className="numero__sub">
            {c.voltaram.pedidos
              ? `dos pedidos · ticket ${reais(c.voltaram.ticket)}`
              : "dos pedidos"}
          </p>
        </div>
        <div className="numero" data-numero="segunda">
          <p className="numero__rot">2ª compra</p>
          <p className="numero__valor">{c.segunda ? `${c.segunda.dias} dias` : "—"}</p>
          <p className="numero__sub">
            {c.segunda
              ? `depois da primeira, em média (${INTEIRO.format(c.segunda.pessoas)} ${c.segunda.pessoas === 1 ? "pessoa" : "pessoas"})`
              : "ninguém voltou ainda"}
          </p>
        </div>
      </div>
      <Achados achados={c.achados} />
      <section className="bloco bloco--sem-pad" data-bloco="estados">
        <div className="bloco__cabeca">
          <div>
            <h2 className="bloco__titulo">Por estado</h2>
            <p className="bloco__sub">
              Onde estão os clientes, e quanto o frete pesa em cada lugar.
            </p>
          </div>
        </div>
        {c.estados.length ? (
          <>
            <div className="tabela-rola" data-vira-cartao>
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Estado</th>
                    <th className="direita">Pedidos</th>
                    <th className="direita">Receita</th>
                    <th className="direita">Ticket</th>
                    <th className="direita">Frete médio</th>
                  </tr>
                </thead>
                <tbody>
                  {c.estados.map((e) => (
                    <tr key={e.uf} data-estado={e.uf}>
                      <td>
                        <b>{e.uf}</b>
                        {trilho(e)}
                      </td>
                      <td className="direita num">{INTEIRO.format(e.pedidos)}</td>
                      <td className="direita num">
                        <b>{reais(e.receita)}</b>
                      </td>
                      <td className="direita num">{reais(e.ticket)}</td>
                      <td className="direita num">{frete(e)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="cartoes">
              {c.estados.map((e) => (
                <div className="cartao" key={e.uf} data-estado={e.uf}>
                  <span className="cartao__linha">
                    <p className="cartao__titulo">{e.uf}</p>
                    <span className="cartao__valor">{reais(e.receita)}</span>
                  </span>
                  <p className="cartao__txt">
                    {INTEIRO.format(e.pedidos)} {e.pedidos === 1 ? "pedido" : "pedidos"} · ticket{" "}
                    {reais(e.ticket)}
                  </p>
                  <p className="cartao__txt">frete médio {frete(e)}</p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="sem-dados">Nenhum pedido pago no período.</p>
        )}
      </section>
      <section className="bloco" data-bloco="newsletter">
        <div className="bloco__cabeca">
          <div>
            <h2 className="bloco__titulo">Newsletter</h2>
            <p className="bloco__sub">
              {INTEIRO.format(c.newsletter.total)} {c.newsletter.total === 1 ? "recebe" : "recebem"}{" "}
              ofertas por e-mail · +{INTEIRO.format(c.newsletter.semana)} na semana
            </p>
          </div>
          <Link className="link pequeno" href="/clientes/newsletter">
            Abrir
          </Link>
        </div>
      </section>
      <p className="pequeno suave">
        A pessoa é o e-mail do pedido. A primeira compra é a primeira na loja nova: quem já comprava
        na Nuvemshop conta como novo aqui. A 2ª compra é a média de toda a história da loja nova.
      </p>
    </>
  )
}
