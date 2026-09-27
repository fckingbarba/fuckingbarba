import type { Route } from "next"
import Link from "next/link"
import { Achados } from "@/components/marketing"
import { lerMembro } from "@/lib/eu"
import {
  lerPagamento,
  type PagamentoEFrete,
  type ParceiroNoRanking,
  type Periodo,
} from "@/lib/marketing"
import { reais } from "@/lib/pedidos"

/**
 * O PAGAMENTO E O FRETE DO MARKETING — como as pessoas pagam, o que não
 * passa (o Pix que vence, o cartão recusado e por quem) e o que o frete faz
 * com a venda — e os parceiros de pagamento lado a lado (0154). Os desenhos
 * são os do protótipo; os dados, do `GET /dashboard/marketing/pagamento` — o
 * estado que cada parceiro deixa na sessão, e as tentativas que a porta do
 * `complete` anota.
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

const DECIMAL = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 })

/** "12 min", "1 h 05" — e "menos de 1 min", em vez de "0 min". */
function emMinutos(m: number): string {
  if (m < 1) return "menos de 1 min"
  if (m < 60) return `${INTEIRO.format(m)} min`
  const h = Math.floor(m / 60)
  const resto = m % 60
  return resto ? `${h} h ${String(resto).padStart(2, "0")}` : `${h} h`
}

/** O mesmo do backend (`MINIMO_PRA_COMPARAR`, em `lib/painel/marketing-parceiros.ts`). */
const MINIMO_PRA_COMPARAR = 10

/**
 * OS PARCEIROS, LADO A LADO — o Pix de cada um (os gerados e os pagos são
 * os pedidos; o que não gerou e o tempo pra gerar, as tentativas), quantas
 * vezes não respondeu e quanto tempo ficou fora do ar. "Quem gera mais" só
 * sai com volume nos dois. No celular, vira cartão. O cartão não entra: só o
 * Pagar.me passa cartão, e o bloco Cartão já é dele.
 */
function Parceiros({ r }: { r: PagamentoEFrete["parceiros"] }) {
  const usados = r.parceiros.filter((p) => p.usado)
  const parado = r.parceiros.find((p) => !p.usado)
  const tentativas = (p: ParceiroNoRanking) => p.pix.gerados + p.pix.naoGeraram
  const geraram = (p: ParceiroNoRanking) =>
    tentativas(p) ? porcento((p.pix.gerados / tentativas(p)) * 100) : "—"
  const pagaram = (p: ParceiroNoRanking) =>
    p.pix.gerados ? porcento((p.pix.pagos / p.pix.gerados) * 100) : "—"
  const praGerar = (p: ParceiroNoRanking) =>
    p.pix.praGerar === null ? "—" : `${DECIMAL.format(p.pix.praGerar)} s`
  const atePagar = (p: ParceiroNoRanking) =>
    p.pix.atePagar === null ? "—" : emMinutos(p.pix.atePagar)
  const fora = (p: ParceiroNoRanking) =>
    p.fora.vezes
      ? `${p.fora.vezes === 1 ? "1 vez" : `${p.fora.vezes} vezes`} · ${emMinutos(p.fora.minutos)}`
      : "nenhuma"
  // O primeiro da lista é quem cobra com todo mundo de pé; os outros, a reserva do Pix.
  const papel = (p: ParceiroNoRanking) =>
    p.id === r.parceiros[0]?.id ? "o principal" : "a reserva do Pix"
  const m = r.melhorNoPix
  return (
    <section className="bloco" data-bloco="parceiros">
      <div className="bloco__cabeca">
        <div>
          <h2 className="bloco__titulo">Os parceiros</h2>
          <p className="bloco__sub">
            Quem gerou o Pix, o que não gerou e quanto tempo cada um ficou fora do ar.
          </p>
        </div>
      </div>
      {usados.length ? (
        <>
          <div className="tabela-rola" data-vira-cartao>
            <table className="tabela">
              <thead>
                <tr>
                  <th>Parceiro</th>
                  <th className="direita">Pix gerados</th>
                  <th className="direita">Pagos</th>
                  <th className="direita">Pra gerar</th>
                  <th className="direita">Até pagar</th>
                  <th className="direita">Sem resposta</th>
                  <th className="direita">Fora do ar</th>
                </tr>
              </thead>
              <tbody>
                {usados.map((p) => (
                  <tr key={p.id} data-parceiro={p.id}>
                    <td>
                      <b>{p.nome}</b>
                      <span className="tabela__sub">{papel(p)}</span>
                    </td>
                    <td className="direita num" data-num="gerados">
                      {INTEIRO.format(p.pix.gerados)}
                      <span className="tabela__sub">
                        de {INTEIRO.format(tentativas(p))} · {geraram(p)}
                      </span>
                    </td>
                    <td className="direita num" data-num="pagos">
                      {INTEIRO.format(p.pix.pagos)}
                      <span className="tabela__sub">{pagaram(p)} dos gerados</span>
                    </td>
                    <td className="direita num" data-num="pra-gerar">
                      {praGerar(p)}
                      <span className="tabela__sub">do clique ao QR</span>
                    </td>
                    <td className="direita num" data-num="ate-pagar">
                      {atePagar(p)}
                      <span className="tabela__sub">do QR ao pago</span>
                    </td>
                    <td className="direita num" data-num="sem-resposta">
                      {INTEIRO.format(p.semResposta)}
                    </td>
                    <td className="direita num" data-num="fora">
                      {fora(p)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="cartoes">
            {usados.map((p) => (
              <div className="cartao" key={p.id} data-parceiro={p.id}>
                <span className="cartao__linha">
                  <p className="cartao__titulo">{p.nome}</p>
                  <span className="cartao__valor">{INTEIRO.format(p.pix.gerados)} Pix</span>
                </span>
                <p className="cartao__txt">
                  de {INTEIRO.format(tentativas(p))} tentativas · {geraram(p)} ·{" "}
                  {INTEIRO.format(p.pix.pagos)} pagos
                </p>
                <p className="cartao__txt">
                  {praGerar(p)} pra gerar · {atePagar(p)} até pagar
                </p>
                <p className="cartao__txt">
                  Sem resposta: {INTEIRO.format(p.semResposta)} · fora do ar: {fora(p)}
                </p>
              </div>
            ))}
          </div>
          <p className="pequeno" data-veredito>
            {m
              ? `No Pix, o ${m.nome} gerou ${m.parte}% das tentativas; o ${m.outro}, ${m.parteDoOutro}%.`
              : `Ainda sem volume pra dizer quem gera mais Pix: a comparação sai com ${MINIMO_PRA_COMPARAR} tentativas de Pix em cada parceiro no período — e a reserva só cobra quando o principal falha.`}
          </p>
          {parado ? (
            <p className="pequeno suave">O {parado.nome} não cobrou nada no período.</p>
          ) : null}
        </>
      ) : (
        <p className="sem-dados">Nenhum Pix no período.</p>
      )}
    </section>
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
                // O pedido cancelado com o cartão em análise: nada cobrado, e não é recusa.
                ...(cartao.cancelados
                  ? [{ nome: "Cancelados antes de cobrar", n: cartao.cancelados }]
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
      <Parceiros r={p.parceiros} />
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
        vencido é o que passou da hora sem ser pago. Nos parceiros, os Pix gerados e pagos são os
        pedidos; o que não gerou, o tempo pra gerar e o fora do ar vêm das tentativas anotadas desde
        27/09. O cartão é só do Pagar.me: está no bloco Cartão.
      </p>
    </>
  )
}
