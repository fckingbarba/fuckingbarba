import type { Route } from "next"
import Link from "next/link"
import { Achados } from "@/components/marketing"
import { lerMembro } from "@/lib/eu"
import { lerPagamento, type Periodo } from "@/lib/marketing"
import { reais } from "@/lib/pedidos"

/**
 * O PAGAMENTO E O FRETE DO MARKETING — como as pessoas pagam, o que não
 * passa (o Pix que vence, o cartão recusado e por quem) e o que o frete faz
 * com a venda. Os desenhos são os do protótipo; os dados, do
 * `GET /dashboard/marketing/pagamento` — o estado que o Pagar.me deixa em
 * cada sessão.
 */

const INTEIRO = new Intl.NumberFormat("pt-BR")
const porcento = (v: number) => `${Math.round(v)}%`

type Barra = { nome: string; n: number; cor?: "bom" | "erro" }

/** Barras deitadas: o nome, o número, a parte do total e o trilho. */
function Barras({ itens, total, dados }: { itens: Barra[]; total: number; dados: string }) {
  return (
    <ul className="barras-h" data-barras={dados}>
      {itens.map((b) => (
        <li key={b.nome}>
          <span className="barras-h__nome">{b.nome}</span>
          <span className="barras-h__num">
            {INTEIRO.format(b.n)} <small>· {total ? porcento((b.n / total) * 100) : "—"}</small>
          </span>
          <span className="barras-h__trilho">
            <i
              style={{ width: `${total ? ((b.n / total) * 100).toFixed(1) : 0}%` }}
              data-cor={b.cor}
            />
          </span>
        </li>
      ))}
    </ul>
  )
}

export async function TelaDoPagamento({ periodo }: { periodo: Periodo }) {
  const [p, eu] = await Promise.all([lerPagamento(periodo), lerMembro()])
  // O frete grátis se muda nas Configurações — que só o dono abre.
  const mudaOFrete = eu.estado === "ok" && eu.areas.includes("configuracoes")
  if (!p)
    return (
      <p className="sem-dados">Não consegui falar com a loja agora. Recarregue daqui a pouco.</p>
    )
  const { comoPagaram, pix, cartao, parcelas, frete } = p
  const pagos = comoPagaram.pix + comoPagaram.cartao
  const noCartao = parcelas.reduce((s, x) => s + x.pedidos, 0)
  return (
    <>
      <Achados achados={p.achados} />
      <div className="duas">
        <section className="bloco" data-bloco="como-pagaram">
          <div className="bloco__cabeca">
            <div>
              <h2 className="bloco__titulo">Como pagaram</h2>
              <p className="bloco__sub">Os pedidos pagos no período (os mesmos do Resumo).</p>
            </div>
          </div>
          <Barras
            dados="forma"
            total={pagos}
            itens={[
              { nome: "Pix", n: comoPagaram.pix },
              { nome: "Cartão", n: comoPagaram.cartao },
            ]}
          />
          <h3 className="rotulo pagamento__rotulo">Pix</h3>
          {pix.gerados ? (
            <Barras
              dados="pix"
              total={pix.gerados}
              itens={[
                { nome: "Pagos", n: pix.pagos, cor: "bom" },
                { nome: "Venceram sem pagar", n: pix.venceram, cor: "erro" },
                ...(pix.esperando ? [{ nome: "Ainda esperando", n: pix.esperando }] : []),
              ]}
            />
          ) : (
            <p className="sem-dados">Nenhum Pix gerado no período.</p>
          )}
        </section>
        <section className="bloco" data-bloco="cartao">
          <div className="bloco__cabeca">
            <div>
              <h2 className="bloco__titulo">Cartão</h2>
              <p className="bloco__sub">
                {INTEIRO.format(cartao.total)} {cartao.total === 1 ? "tentativa" : "tentativas"} no
                período.
              </p>
            </div>
          </div>
          {cartao.total ? (
            <Barras
              dados="cartao"
              total={cartao.total}
              itens={[
                { nome: "Aprovados", n: cartao.aprovados, cor: "bom" },
                ...(cartao.emAnalise ? [{ nome: "Em análise", n: cartao.emAnalise }] : []),
                { nome: "Barrados pela análise de fraude", n: cartao.antifraude, cor: "erro" },
                { nome: "Recusados pelo banco (saldo, limite)", n: cartao.banco, cor: "erro" },
                { nome: "Dados do cartão errados", n: cartao.dados, cor: "erro" },
                ...(cartao.outros
                  ? [
                      {
                        nome: "Não processados (fora do ar)",
                        n: cartao.outros,
                        cor: "erro" as const,
                      },
                    ]
                  : []),
              ]}
            />
          ) : (
            <p className="sem-dados">Nenhuma tentativa no cartão no período.</p>
          )}
          <h3 className="rotulo pagamento__rotulo">Parcelas</h3>
          {noCartao ? (
            <Barras
              dados="parcelas"
              total={noCartao}
              itens={parcelas.map((x) => ({ nome: `${x.parcelas}x`, n: x.pedidos }))}
            />
          ) : (
            <p className="sem-dados">Nenhum pedido pago no cartão no período.</p>
          )}
        </section>
      </div>
      <section className="bloco" data-bloco="frete">
        <div className="bloco__cabeca">
          <div>
            <h2 className="bloco__titulo">Frete</h2>
            <p className="bloco__sub">O que o frete faz com a venda.</p>
          </div>
          {mudaOFrete ? (
            <Link className="link pequeno" href={"/configuracoes/frete" as Route}>
              Mudar o frete grátis
            </Link>
          ) : null}
        </div>
        <div className="numeros numeros--dentro">
          <div className="numero" data-numero="gratis">
            <p className="numero__rot">Com frete grátis</p>
            <p className="numero__valor">
              {frete.parteGratis === null ? "—" : `${frete.parteGratis}%`}
            </p>
            <p className="numero__sub">dos pedidos pagos</p>
          </div>
          <div className="numero" data-numero="medio">
            <p className="numero__rot">Frete médio pago</p>
            <p className="numero__valor">
              {frete.medioPago === null ? "—" : reais(frete.medioPago)}
            </p>
            <p className="numero__sub">quando não é grátis</p>
          </div>
          <div className="numero" data-numero="desistem">
            <p className="numero__rot">Desistem no frete</p>
            <p className="numero__valor">{frete.desistem === null ? "—" : `${frete.desistem}%`}</p>
            <p className="numero__sub">de quem vê o valor e não escolhe a entrega</p>
          </div>
          <div className="numero" data-numero="quase">
            <p className="numero__rot">Quase lá</p>
            <p className="numero__valor">
              {frete.quaseLa === null ? "—" : INTEIRO.format(frete.quaseLa)}
            </p>
            <p className="numero__sub">
              {frete.piso === null
                ? "a loja está sem frete grátis"
                : `pedidos a menos de R$ 30 do grátis (${reais(frete.piso)})`}
            </p>
          </div>
        </div>
      </section>
      <p className="pequeno suave">
        O cartão conta cada tentativa: a do pedido e a do carrinho que não fechou (o recusado na
        hora não vira pedido). Quem tenta de novo no mesmo carrinho conta a última tentativa. O Pix
        vencido é o que passou da hora sem ser pago.
      </p>
    </>
  )
}
