import type { Route } from "next"
import Form from "next/form"
import Link from "next/link"
import { Icone } from "@/components/icones"
import type { LinhaDaPrevisao, TelaDaPrevisao } from "@/lib/crm"

/**
 * A ABA PREVISÃO DO CRM (entrega 0220) — os números da base, a busca por
 * e-mail e as duas listas de quem agir: quem deve comprar nos próximos 7
 * dias e os que mais gastaram entre os de chance alta de sair. Quem tem
 * cadastro na loja nova abre a ficha.
 */

const inteiro = new Intl.NumberFormat("pt-BR")
const reais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const pessoas = (n: number) => `${inteiro.format(n)} ${n === 1 ? "pessoa" : "pessoas"}`

export function NumerosDaPrevisao({ n }: { n: TelaDaPrevisao["numeros"] }) {
  return (
    <div className="numeros numeros--previsao" data-numeros-da-previsao>
      <div className="numero numero--destaque">
        <p className="numero__rot">Compram em 7 dias</p>
        <p className="numero__valor num" data-numero="semana">
          {inteiro.format(n.semana.pessoas)}
        </p>
        <p className="numero__sub">{reais.format(n.semana.valor)} no ticket de cada um</p>
      </div>
      <div className="numero">
        <p className="numero__rot">Em 30 dias</p>
        <p className="numero__valor num" data-numero="mes">
          {inteiro.format(n.mes.pessoas)}
        </p>
        <p className="numero__sub">{reais.format(n.mes.valor)} no ticket de cada um</p>
      </div>
      <div className="numero">
        <p className="numero__rot">Chance alta de sair</p>
        <p className="numero__valor num" data-numero="alta">
          {inteiro.format(n.chance.alta)}
        </p>
        <p className="numero__sub">{reais.format(n.emJogo)} que já gastaram</p>
      </div>
      <div className="numero">
        <p className="numero__rot">Chance de sair</p>
        <p className="numero__valor num previsao-chances" data-numero="chances">
          <span data-chance="baixa">{inteiro.format(n.chance.baixa)}</span>
          <span data-chance="media">{inteiro.format(n.chance.media)}</span>
          <span data-chance="alta">{inteiro.format(n.chance.alta)}</span>
        </p>
        <p className="numero__sub">baixa, média e alta</p>
      </div>
      <div className="numero">
        <p className="numero__rot">LTV médio</p>
        <p className="numero__valor num" data-numero="ltv">
          {reais.format(n.ltvMedio)}
        </p>
        <p className="numero__sub">o que cada cliente já gastou, de {pessoas(n.clientes)}</p>
      </div>
      <div className="numero">
        <p className="numero__rot">Previsto em 12 meses</p>
        <p className="numero__valor num" data-numero="previsto">
          {reais.format(n.previsto)}
        </p>
        <p className="numero__sub">somando todos</p>
      </div>
    </div>
  )
}

export function BuscaDaPrevisao({ busca }: { busca: TelaDaPrevisao["busca"] }) {
  return (
    <section className="bloco" aria-labelledby="previsao-busca" data-busca-da-previsao>
      <h2 className="bloco__titulo" id="previsao-busca">
        A previsão de uma pessoa
      </h2>
      <Form className="busca" action="/crm/previsao" role="search">
        <label htmlFor="previsao-email" className="sr-only">
          E-mail
        </label>
        <Icone nome="busca" />
        <input
          type="search"
          id="previsao-email"
          name="email"
          placeholder="O e-mail da pessoa"
          defaultValue={busca?.email ?? ""}
          autoComplete="off"
        />
        <button type="submit">Ver</button>
      </Form>
      {busca ? (
        busca.linha ? (
          <TabelaDaPrevisao linhas={[busca.linha]} jeito="busca" />
        ) : (
          <p className="pequeno suave" data-sem-previsao>
            Esse e-mail ainda não comprou em nenhuma das duas lojas.
          </p>
        )
      ) : null}
    </section>
  )
}

export function ListaDaPrevisao({
  titulo,
  sub,
  linhas,
  jeito,
}: {
  titulo: string
  sub: string
  linhas: LinhaDaPrevisao[]
  jeito: "semana" | "risco"
}) {
  return (
    <section className="bloco" aria-labelledby={`previsao-${jeito}`} data-lista-da-previsao={jeito}>
      <h2 className="bloco__titulo" id={`previsao-${jeito}`}>
        {titulo}
      </h2>
      <p className="bloco__sub">{sub}</p>
      {linhas.length ? (
        <TabelaDaPrevisao linhas={linhas} jeito={jeito} />
      ) : (
        <div className="vazio">
          <b>Ninguém aqui agora</b>
        </div>
      )}
    </section>
  )
}

function TabelaDaPrevisao({
  linhas,
  jeito,
}: {
  linhas: LinhaDaPrevisao[]
  jeito: "semana" | "risco" | "busca"
}) {
  return (
    <div className="tabela-rola" data-vira-cartao>
      <table className="tabela">
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Próxima compra</th>
            <th>Chance de sair</th>
            <th className="direita">{jeito === "risco" ? "Já gastou" : "Ticket"}</th>
            <th className="direita">Previsto em 12 meses</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.quem} data-pessoa-da-previsao>
              <td>
                {l.clienteId ? (
                  <Link className="tabela__link" href={`/clientes/${l.clienteId}` as Route}>
                    <b>{l.quem}</b>
                  </Link>
                ) : (
                  <b>{l.quem}</b>
                )}
                <span className="tabela__sub">
                  {l.ritmo ? `compra a cada ${l.ritmo} dias` : l.clienteId ? "" : "só na Nuvemshop"}
                </span>
              </td>
              <td className="num">{l.proximaCompra}</td>
              <td>
                <span className="chance" data-chance={l.chance}>
                  {l.nomeDaChance}
                </span>
                <span className="tabela__sub">{l.porque}</span>
              </td>
              <td className="direita num">{reais.format(jeito === "risco" ? l.ate : l.ticket)}</td>
              <td className="direita num">{reais.format(l.previsto)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** COMO A PREVISÃO É FEITA — as regras, em frases. */
export function RegrasDaPrevisao() {
  return (
    <section className="bloco" aria-labelledby="previsao-regras" data-regras-da-previsao>
      <h2 className="bloco__titulo" id="previsao-regras">
        Como a conta é feita
      </h2>
      <ul className="modelo-emails__regras">
        <li>
          Conta quem comprou alguma vez, na loja nova ou na Nuvemshop. Compras a menos de 7 dias uma
          da outra contam como uma.
        </li>
        <li>
          A próxima compra: com 3 compras ou mais, pelo ritmo da pessoa (o intervalo mais comum
          entre elas). Com menos, pelo dia em que o produto da última compra acaba (os dias dos
          Ajustes).
        </li>
        <li>
          A chance de sair: baixa antes desse dia; média até a tolerância dos Ajustes (20 dias)
          depois dele; alta depois disso. Quem visitou a loja ou clicou num e-mail há pouco desce um
          nível. Quem parou de abrir e visitar (o sunset) é alta.
        </li>
        <li>
          O LTV: o que a pessoa já gastou, e o previsto pros próximos 12 meses — o ticket médio
          vezes as compras que cabem no ano, vezes a chance de continuar (90% pra chance baixa, 60%
          pra média, 25% pra alta).
        </li>
        <li>
          É conta, não adivinhação: com pouco histórico na loja nova, a previsão melhora com o
          tempo.
        </li>
      </ul>
    </section>
  )
}
