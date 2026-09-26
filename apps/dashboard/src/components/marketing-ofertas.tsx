import type { Route } from "next"
import Link from "next/link"
import { Achados } from "@/components/marketing"
import { lerOfertas, type OfertaDoProduto, type Periodo } from "@/lib/marketing"
import { reais } from "@/lib/pedidos"

/**
 * AS OFERTAS DO MARKETING — o que a caixa de compra de cada produto (quantas
 * unidades ou leve junto), a oferta do checkout e os cupons somam. Tudo da
 * loja, pelo `GET /dashboard/marketing/ofertas`; os desenhos são os do
 * protótipo. Tocar num produto abre a página dele no painel — é lá que se
 * troca a caixa.
 */

const INTEIRO = new Intl.NumberFormat("pt-BR")
const vezes = (n: number, um: string, varios: string) =>
  `${INTEIRO.format(n)} ${n === 1 ? um : varios}`

function Resultado({ o }: { o: OfertaDoProduto }) {
  const r = o.resultado
  if (!r.pedidos) return <span className="suave">nenhum pedido no período</span>
  if (r.modo === "unidades")
    return (
      <>
        <b>{r.parte}%</b> levaram 2 ou mais
        <span className="tabela__sub">de {vezes(r.pedidos, "pedido", "pedidos")}</span>
      </>
    )
  return (
    <>
      levaram junto em <b>{r.parte}%</b> · +{reais(r.somou)}
      <span className="tabela__sub">de {vezes(r.pedidos, "pedido", "pedidos")}</span>
    </>
  )
}

function Caixa({ o }: { o: OfertaDoProduto }) {
  return o.resultado.modo === "unidades" ? (
    <span className="status" data-s="ativo">
      Quantas unidades
    </span>
  ) : (
    <>
      <span className="status" data-s="publicado">
        Leve junto
      </span>
      {o.junto.length ? <span className="tabela__sub">com {o.junto.join(" e ")}</span> : null}
    </>
  )
}

export async function TelaDasOfertas({ periodo }: { periodo: Periodo }) {
  const o = await lerOfertas(periodo)
  if (!o)
    return (
      <p className="sem-dados">Não consegui falar com a loja agora. Recarregue daqui a pouco.</p>
    )
  const { unidades, junto, checkout } = o.numeros
  const pagina = (p: OfertaDoProduto) => `/produtos/${p.id}` as Route
  return (
    <>
      <Achados achados={o.achados} />
      <section className="bloco bloco--sem-pad" data-bloco="caixas">
        <div className="bloco__cabeca">
          <div>
            <h2 className="bloco__titulo">Abaixo do preço, na página do produto</h2>
            <p className="bloco__sub">
              Cada produto mostra os cartões de quantidade (o order bump) ou o leve junto (o
              cross-sell). Toque pra trocar.
            </p>
          </div>
        </div>
        {o.porProduto.length ? (
          <>
            <div className="tabela-rola" data-vira-cartao>
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Abaixo do preço</th>
                    <th>Resultado no período</th>
                  </tr>
                </thead>
                <tbody>
                  {o.porProduto.map((p) => (
                    <tr key={p.id} data-oferta={p.id} data-modo={p.resultado.modo}>
                      <td>
                        <Link className="tabela__link" href={pagina(p)}>
                          <b>{p.nome}</b>
                        </Link>
                      </td>
                      <td>
                        <Caixa o={p} />
                      </td>
                      <td>
                        <Resultado o={p} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="cartoes">
              {o.porProduto.map((p) => (
                <Link className="cartao" key={p.id} href={pagina(p)} data-oferta={p.id}>
                  <span className="cartao__linha">
                    <p className="cartao__titulo">{p.nome}</p>
                    <Caixa o={p} />
                  </span>
                  <p className="cartao__txt ofertas__resultado">
                    <Resultado o={p} />
                  </p>
                </Link>
              ))}
            </div>
          </>
        ) : (
          <p className="sem-dados">Nenhum produto no site.</p>
        )}
      </section>

      <div className="numeros" data-numeros-das-ofertas>
        <div className="numero" data-numero="unidades">
          <p className="numero__rot">Quantas unidades</p>
          <p className="numero__valor">{unidades.parte === null ? "—" : `${unidades.parte}%`}</p>
          <p className="numero__sub">dos pedidos levaram 2 ou mais do mesmo produto</p>
        </div>
        <div className="numero" data-numero="junto">
          <p className="numero__rot">Leve junto</p>
          <p className="numero__valor">{INTEIRO.format(junto.vezes)}</p>
          <p className="numero__sub">
            {junto.vezes === 1 ? "vez levado" : "vezes levado"} · +{reais(junto.somou)}
          </p>
        </div>
        <div className="numero" data-numero="checkout">
          <p className="numero__rot">Oferta do checkout</p>
          <p className="numero__valor">{INTEIRO.format(checkout.pedidos)}</p>
          <p className="numero__sub">
            {checkout.deCada
              ? `pedidos aceitaram a caixinha antes de pagar · 1 em cada ${checkout.deCada} · +${reais(checkout.somou)}`
              : "pedidos aceitaram a caixinha antes de pagar"}
          </p>
        </div>
        <div className="numero" data-numero="carrinho">
          <p className="numero__rot">Carrinho abandonado</p>
          <p className="numero__valor">—</p>
          <p className="numero__sub">os e-mails automáticos ainda não existem</p>
        </div>
      </div>
      <p className="pequeno suave ofertas__nota">
        A oferta do checkout é a caixinha logo antes de pagar: quem escolhe o produto é o motor de
        recomendação, sacola a sacola, e ela não se configura na página do produto. O leve junto
        conta o pedido que levou o produto e um dos de junto — pelo caminho que for.
      </p>

      <section className="bloco bloco--sem-pad" data-bloco="cupons">
        <div className="bloco__cabeca">
          <div>
            <h2 className="bloco__titulo">Cupons</h2>
            <p className="bloco__sub">Os usados em pedidos pagos no período.</p>
          </div>
          <Link className="link pequeno" href="/cupons">
            Abrir cupons
          </Link>
        </div>
        {o.cupons.length ? (
          <>
            <div className="tabela-rola" data-vira-cartao>
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Cupom</th>
                    <th className="direita">Usos</th>
                    <th className="direita">Desconto dado</th>
                    <th className="direita">Vendeu</th>
                  </tr>
                </thead>
                <tbody>
                  {o.cupons.map((c) => (
                    <tr key={c.codigo} data-cupom={c.codigo}>
                      <td>
                        <b className="num">{c.codigo}</b>
                      </td>
                      <td className="direita num">{INTEIRO.format(c.usos)}</td>
                      <td className="direita num">{reais(c.desconto)}</td>
                      <td className="direita num">
                        <b>{reais(c.vendeu)}</b>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="cartoes">
              {o.cupons.map((c) => (
                <div className="cartao" key={c.codigo} data-cupom={c.codigo}>
                  <span className="cartao__linha">
                    <p className="cartao__titulo num">{c.codigo}</p>
                    <span className="cartao__valor">{reais(c.vendeu)}</span>
                  </span>
                  <p className="cartao__txt">
                    {vezes(c.usos, "uso", "usos")} · {reais(c.desconto)} de desconto
                  </p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="sem-dados">Nenhum cupom usado em pedido pago no período.</p>
        )}
      </section>
    </>
  )
}
