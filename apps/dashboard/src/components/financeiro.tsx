import type { Route } from "next"
import Form from "next/form"
import Link from "next/link"
import { AbasQueRolam } from "@/components/abas-que-rolam"
import { Icone } from "@/components/icones"
import { CabecaDoBloco } from "@/components/visual"
import {
  ATALHOS_DO_FINANCEIRO,
  enderecoDoDre,
  porcento,
  reais,
  valorDaTabela,
  valorInteiro,
  variacaoEmTexto,
  type ColunaDoMes,
  type IdDaLinha,
  type LinhaDoDre,
  type Pendencia,
  type PeriodoDoFinanceiro,
  type TelaDoFinanceiro,
  type Vista,
} from "@/lib/financeiro"

/**
 * O FINANCEIRO — as abas, a barra dos meses, os números de cima, o "de cada
 * R$ 100", o que falta pra fechar certinho, o DRE (cada linha abre no
 * `<details>`, sem JavaScript) e o mês a mês. O desenho aprovado pelo dono:
 * https://claude.ai/artifact/5SL83dZ9v74zEUxbBrqi5z
 */

const ABAS: [string, string, string][] = [
  ["dre", "DRE", "/financeiro"],
  ["despesas", "Despesas", "/financeiro/despesas"],
  ["custos", "Custos e imposto", "/financeiro/custos"],
]

export function AbasDoFinanceiro({ atual }: { atual: "dre" | "despesas" | "custos" }) {
  return (
    <AbasQueRolam rotulo="Financeiro" acesa={atual}>
      {ABAS.map(([aba, nome, href]) => (
        <Link
          key={aba}
          href={href as Route}
          aria-current={aba === atual ? "page" : undefined}
          data-aba={aba}
        >
          {nome}
        </Link>
      ))}
    </AbasQueRolam>
  )
}

/** "2026-09" → "set/2026", pra lista dos meses. */
const mesNaLista = (mes: string) => {
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
  return `${nomes[Number(mes.slice(5, 7)) - 1]}/${mes.slice(0, 4)}`
}

function mesesDaLista(comeco: string, hoje: string): string[] {
  const meses: string[] = []
  let [a, m] = comeco.split("-").map(Number)
  for (let i = 0; i < 60; i++) {
    const mes = `${a}-${String(m).padStart(2, "0")}`
    if (mes > hoje) break
    meses.push(mes)
    m++
    if (m > 12) {
      m = 1
      a++
    }
  }
  return meses.reverse()
}

/**
 * A BARRA DOS MESES — este mês, o mês passado, o ano, e os meses escolhidos
 * (duas listas, num `<details>`); o "comparar com"; e a vista: um período
 * (as linhas somadas) ou mês a mês (uma coluna por mês). Cada botão é link.
 */
export function BarraDoFinanceiro({ p, vista }: { p: PeriodoDoFinanceiro; vista: Vista }) {
  const meses = mesesDaLista(p.comeco, p.hoje)
  return (
    <>
      <div className="periodo fin-barra" data-periodo={p.atalho ?? "meses"}>
        <nav className="periodo__atalhos" aria-label="Período">
          {ATALHOS_DO_FINANCEIRO.map(([atalho, nome]) => (
            <Link
              key={atalho}
              className="periodo__botao"
              href={
                enderecoDoDre(
                  { atalho, de: p.de, ate: p.ate, comparar: p.comparar },
                  vista
                ) as Route
              }
              aria-current={p.atalho === atalho ? "page" : undefined}
              data-atalho={atalho}
            >
              {nome}
            </Link>
          ))}
          <details className="periodo__caixa" data-escolher>
            <summary
              className="periodo__botao periodo__botao--datas"
              aria-current={p.atalho ? undefined : "page"}
            >
              <Icone nome="calendario" />
              {p.atalho ? "Escolher meses" : p.nome}
            </summary>
            <Form action="/financeiro" className="periodo__janela">
              <label className="periodo__campo">
                <span>De</span>
                <select name="de" defaultValue={p.de}>
                  {meses.map((m) => (
                    <option key={m} value={m}>
                      {mesNaLista(m)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="periodo__campo">
                <span>Até</span>
                <select name="ate" defaultValue={p.ate}>
                  {meses.map((m) => (
                    <option key={m} value={m}>
                      {mesNaLista(m)}
                    </option>
                  ))}
                </select>
              </label>
              {p.comparar ? null : <input type="hidden" name="comparar" value="nenhum" />}
              {vista === "meses" ? <input type="hidden" name="ver" value="meses" /> : null}
              <button className="btn btn--menor" type="submit">
                Ver
              </button>
            </Form>
          </details>
        </nav>
        <div className="fin-barra__lado">
          <details className="periodo__caixa periodo__caixa--comparar" data-comparar>
            <summary className="periodo__comparar">
              <span className="periodo__rot">Comparar com</span>
              <b>{p.comparar ? (p.antes ? p.antes.nome : "nada antes") : "nada"}</b>
              <Icone nome="seta" className="periodo__abre" />
            </summary>
            <div className="periodo__janela periodo__janela--opcoes">
              <Link
                href={enderecoDoDre({ ...p, comparar: true }, vista) as Route}
                aria-current={p.comparar ? "true" : undefined}
                data-comparar-com="anterior"
              >
                Os meses de antes
              </Link>
              <Link
                href={enderecoDoDre({ ...p, comparar: false }, vista) as Route}
                aria-current={p.comparar ? undefined : "true"}
                data-comparar-com="nenhum"
              >
                Não comparar
              </Link>
            </div>
          </details>
          <nav className="fin-vista" aria-label="Ver">
            <Link
              href={enderecoDoDre(p, "periodo") as Route}
              aria-current={vista === "periodo" ? "page" : undefined}
              data-vista="periodo"
            >
              Um período
            </Link>
            <Link
              href={enderecoDoDre(p, "meses") as Route}
              aria-current={vista === "meses" ? "page" : undefined}
              data-vista="meses"
            >
              Mês a mês
            </Link>
          </nav>
        </div>
      </div>
      {p.aviso ? (
        <p className="periodo__aviso" role="status" data-aviso-do-periodo>
          <Icone nome="alerta" />
          {p.aviso}
        </p>
      ) : null}
      <p className="fin-legenda" data-legenda>
        <span data-nome-do-periodo>{maiuscula(p.nome)}</span>
        {p.comparar && p.antes ? `, comparado com ${p.antes.nome}` : ""}. Vendas contam no dia do
        pagamento; despesas, no mês em que foram lançadas.
      </p>
    </>
  )
}

const maiuscula = (t: string) => `${t[0]?.toUpperCase() ?? ""}${t.slice(1)}`

const linhaDe = (t: TelaDoFinanceiro, id: IdDaLinha) => t.linhas.find((l) => l.id === id)!

/** A variação num número de cima: a seta, o % e se é boa (receita subindo, despesa caindo). */
function Variacao({
  l,
  sobeEBom = true,
  antes,
}: {
  l: LinhaDoDre
  sobeEBom?: boolean
  antes: string
}) {
  if (l.variacao === null) return null
  const bom = l.variacao === 0 ? null : l.variacao > 0 === sobeEBom
  return (
    <p className="numero__sub" data-variacao={l.id}>
      <b
        className="fin-var"
        data-bom={bom === true || undefined}
        data-ruim={bom === false || undefined}
      >
        {l.variacao > 0 ? "▲" : l.variacao < 0 ? "▼" : ""} {variacaoEmTexto(l.variacao)}
      </b>{" "}
      vs {antes}
    </p>
  )
}

/** Os quatro números de cima: o lucro (em destaque), a receita, a margem e as despesas fixas. */
export function NumerosDoFinanceiro({ t }: { t: TelaDoFinanceiro }) {
  const lucro = linhaDe(t, "lucro")
  const bruta = linhaDe(t, "bruta")
  const margem = linhaDe(t, "margem")
  const fixas = linhaDe(t, "fixas")
  const antes = t.periodo.antes?.nome ?? ""
  return (
    <div className="numeros fin-numeros" data-numeros-financeiro>
      <div className="numero numero--destaque fin-numeros__lucro" data-numero="lucro">
        <p className="numero__rot">{lucro.valor < 0 ? "Prejuízo" : "Lucro líquido"}</p>
        <p className="numero__valor">{reais(lucro.valor)}</p>
        <p className="numero__sub">
          {lucro.pct === null ? "sem venda no período" : `${porcento(lucro.pct)} da venda`}
        </p>
        <Variacao l={lucro} antes={antes} />
      </div>
      <div className="numero" data-numero="bruta">
        <p className="numero__rot">Receita bruta</p>
        <p className="numero__valor">{reais(bruta.valor)}</p>
        <p className="numero__sub">
          {t.pedidos.atual} {t.pedidos.atual === 1 ? "pedido pago" : "pedidos pagos"}
        </p>
        <Variacao l={bruta} antes={antes} />
      </div>
      <div className="numero" data-numero="margem">
        <p className="numero__rot">Margem de contribuição</p>
        <p className="numero__valor">{reais(margem.valor)}</p>
        <p className="numero__sub">{porcento(margem.pct)} da venda</p>
        <Variacao l={margem} antes={antes} />
      </div>
      <div className="numero" data-numero="fixas">
        <p className="numero__rot">Despesas fixas</p>
        <p className="numero__valor">{reais(Math.abs(fixas.valor))}</p>
        <p className="numero__sub">{porcento(fixas.pct)} da venda</p>
        <Variacao l={fixas} sobeEBom={false} antes={antes} />
      </div>
    </div>
  )
}

/** "De cada R$ 100 vendidos": uma barra por parte, a sobra em verde (ou o que faltou, em vermelho). */
export function DeCada100({ t }: { t: TelaDoFinanceiro }) {
  if (!t.deCada100.length) return null
  const maior = Math.max(...t.deCada100.map((p) => Math.abs(p.valor)), 1)
  return (
    <section className="bloco" data-de-cada-100>
      <CabecaDoBloco
        titulo="De cada R$ 100 vendidos"
        ajuda="Pra onde foi cada parte da receita bruta do período: os descontos e os estornos, o imposto, o custo dos produtos, as taxas e o frete, as despesas — e o que sobrou."
      />
      <ul className="fin-cem">
        {t.deCada100.map((p) => (
          <li
            key={p.nome}
            className="fin-cem__item"
            data-sobra={p.sobra || undefined}
            data-negativo={p.valor < 0 || undefined}
          >
            <span className="fin-cem__nome">{p.nome}</span>
            <span className="fin-cem__trilho" aria-hidden="true">
              <span style={{ width: `${(Math.abs(p.valor) / maior) * 100}%` }} />
            </span>
            <span className="fin-cem__valor num">{reais(p.valor)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

const ONDE: Record<"custos" | "despesas", [string, string]> = {
  custos: ["/financeiro/custos", "Preencher em Custos e imposto"],
  despesas: ["/financeiro/despesas", "Lançar em Despesas"],
}

/** O que falta pra fechar o período certinho — e as etiquetas das linhas, explicadas. */
export function PraFechar({ t }: { t: TelaDoFinanceiro }) {
  return (
    <section className="bloco" data-pra-fechar>
      <CabecaDoBloco titulo={t.pendencias.length ? "Pra fechar certinho" : "Tudo preenchido"} />
      {t.pendencias.length ? (
        <ul className="fin-falta">
          {t.pendencias.map((p: Pendencia) => (
            <li key={p.id} className="fin-falta__item" data-pendencia={p.id}>
              <span className="fin-falta__sinal" aria-hidden="true">
                !
              </span>
              <span>
                {p.texto}{" "}
                {p.onde ? (
                  <Link href={ONDE[p.onde][0] as Route} className="fin-falta__ir">
                    {ONDE[p.onde][1]}
                  </Link>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="fin-nota">Nada faltando: o DRE do período está com todos os dados.</p>
      )}
      <ul className="fin-selos">
        <li>
          <span className="fin-selo fin-selo--auto">Automático</span> sai das vendas, dos cupons e
          dos custos
        </li>
        <li>
          <span className="fin-selo fin-selo--lancado">Lançado</span> vem das Despesas
        </li>
        <li>
          <span className="fin-selo fin-selo--falta">Falta</span> o número está incompleto
        </li>
      </ul>
    </section>
  )
}

function Selos({ l }: { l: LinhaDoDre }) {
  return (
    <>
      {l.fonte === "auto" ? <span className="fin-selo fin-selo--auto">Automático</span> : null}
      {l.fonte === "lancado" ? <span className="fin-selo fin-selo--lancado">Lançado</span> : null}
      {l.falta ? (
        <span className="fin-selo fin-selo--falta" data-falta={l.falta}>
          {l.falta}
        </span>
      ) : null}
    </>
  )
}

/** Os números de uma linha: o valor e o %, e (comparando) o de antes, o % e a variação. */
function Numeros({ l, comparar }: { l: LinhaDoDre; comparar: boolean }) {
  return (
    <>
      <span className="dre__v num" data-valor>
        {valorDaTabela(l.valor)}
      </span>
      <span className="dre__p num">{porcento(l.pct)}</span>
      {comparar ? (
        <>
          <span className="dre__v num" data-antes>
            {l.antes === null ? "—" : valorDaTabela(l.antes)}
          </span>
          <span className="dre__p num">{porcento(l.pctAntes)}</span>
          <span className="dre__p num" data-var>
            {variacaoEmTexto(l.variacao)}
          </span>
        </>
      ) : null}
    </>
  )
}

/**
 * O DRE do período, linha a linha. Cada item abre (`<details>`) e mostra de
 * onde vem o número; os grupos e os totais só mostram.
 */
export function TabelaDoDre({ t }: { t: TelaDoFinanceiro }) {
  const comparar = Boolean(t.periodo.comparar && t.periodo.antes)
  return (
    <section className="bloco bloco--sem-pad" data-dre>
      <CabecaDoBloco
        titulo={`DRE · ${t.periodo.nome}`}
        ajuda="Toque numa linha pra ver de onde vem o número. O % é de cada R$ 100 vendidos (a receita bruta). A receita bruta é o preço dos produtos antes dos cupons, com o frete cobrado; o pedido cancelado depois de pago entra e sai nos estornos. O custo dos produtos é o custo que valia no dia de cada venda."
      />
      <div className="dre" data-comparar={comparar || undefined}>
        <div className="dre__linha dre__linha--cabeca">
          <span>R$</span>
          <span className="dre__v">{t.periodo.nome}</span>
          <span className="dre__p">%</span>
          {comparar ? (
            <>
              <span className="dre__v">{t.periodo.antes!.nome}</span>
              <span className="dre__p">%</span>
              <span className="dre__p">Variação</span>
            </>
          ) : null}
        </div>
        {t.linhas.map((l) =>
          l.tipo === "item" ? (
            <details key={l.id} className="dre__item" data-linha={l.id}>
              <summary className="dre__linha dre__linha--item">
                <span className="dre__nome dre__nome--item">
                  <Icone nome="seta" className="dre__abre" />
                  <span className="dre__texto">
                    {l.nome}
                    <Selos l={l} />
                  </span>
                </span>
                <Numeros l={l} comparar={comparar} />
              </summary>
              <div className="dre__detalhe">
                {l.detalhe.length ? (
                  l.detalhe.map((d) => (
                    <div key={d.nome} className="dre__linha dre__linha--detalhe">
                      <span>{d.nome}</span>
                      <span className="dre__v num">
                        {d.valor === null ? (
                          <span className="fin-selo fin-selo--falta">Falta</span>
                        ) : (
                          valorDaTabela(d.valor)
                        )}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="dre__linha dre__linha--detalhe">
                    <span>Nada no período.</span>
                  </div>
                )}
              </div>
            </details>
          ) : (
            <div key={l.id} className={`dre__linha dre__linha--${l.tipo}`} data-linha={l.id}>
              <span className="dre__nome">{l.nome}</span>
              <Numeros l={l} comparar={comparar} />
            </div>
          )
        )}
      </div>
    </section>
  )
}

/** As linhas do mês a mês: os grupos e os totais (os itens ficam na vista de um período). */
const LINHAS_DO_MES: [IdDaLinha, string, "grupo" | "total" | "final" | "item"][] = [
  ["bruta", "Receita bruta", "grupo"],
  ["deducoes", "(−) Deduções", "item"],
  ["liquida", "= Receita líquida", "total"],
  ["custoDosProdutos", "(−) Custo dos produtos", "item"],
  ["lucroBruto", "= Lucro bruto", "total"],
  ["variaveis", "(−) Despesas variáveis", "item"],
  ["margem", "= Margem de contribuição", "total"],
  ["fixas", "(−) Despesas fixas", "item"],
  ["operacional", "= Resultado operacional", "total"],
  ["financeiro", "Resultado financeiro", "item"],
  ["lucro", "= Lucro líquido", "final"],
]

/** "−1,1" · "0,2" — em mil reais; o que arredonda pra zero sai sem sinal. */
const emMil = (v: number) => {
  const t = (v / 1000).toFixed(1)
  return (t === "-0.0" ? "0.0" : t).replace(".", ",").replace("-", "−")
}

/** O lucro de cada mês, em mil reais: a barra do prejuízo vem em vermelho, com o sinal. */
function LucroPorMes({ meses }: { meses: ColunaDoMes[] }) {
  const maior = Math.max(...meses.map((m) => Math.abs(m.valores.lucro)), 1)
  const temPrejuizo = meses.some((m) => m.valores.lucro < 0)
  return (
    <section className="bloco" data-lucro-por-mes>
      <CabecaDoBloco
        titulo="Lucro líquido por mês"
        ajuda="Em mil reais. O mês com algum número incompleto vem tracejado, com *."
      />
      <div className="fin-meses" data-com-prejuizo={temPrejuizo || undefined}>
        {meses.map((m) => {
          const v = m.valores.lucro
          const incompleto = m.incompletas.includes("lucro")
          return (
            <div
              key={m.mes}
              className="fin-meses__col"
              data-mes={m.mes}
              data-negativo={v < 0 || undefined}
              data-incompleto={incompleto || undefined}
            >
              <span className="fin-meses__rot num">
                {emMil(v)}
                {incompleto ? "*" : ""}
              </span>
              <span
                className="fin-meses__barra"
                style={{ height: `${(Math.abs(v) / maior) * 100}%` }}
              />
              <span className="fin-meses__mes">{m.curto}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** O DRE mês a mês: uma coluna por mês e o total; a célula incompleta vem marcada. */
export function MesAMes({ t }: { t: TelaDoFinanceiro }) {
  const incompletos = t.meses.filter((m) => m.incompletas.length)
  return (
    <>
      <LucroPorMes meses={t.meses} />
      <section className="bloco bloco--sem-pad" data-mes-a-mes>
        <CabecaDoBloco
          titulo={`DRE mês a mês · ${t.periodo.nome}`}
          ajuda="Em reais, sem os centavos (a planilha do contador vai com centavos). O % é do total do período, de cada R$ 100 vendidos. Célula amarela: o número está incompleto — veja o que falta embaixo."
        />
        <div className="tabela-rola">
          <table className="tabela fin-mes-a-mes">
            <thead>
              <tr>
                <th scope="col">R$</th>
                {t.meses.map((m) => (
                  <th key={m.mes} scope="col" className="direita">
                    {m.curto}
                    <small>{m.origem}</small>
                  </th>
                ))}
                <th scope="col" className="direita">
                  Total
                </th>
                <th scope="col" className="direita">
                  %
                </th>
              </tr>
            </thead>
            <tbody>
              {LINHAS_DO_MES.map(([id, nome, tipo]) => {
                const total = linhaDe(t, id)
                return (
                  <tr key={id} data-linha={id} data-tipo={tipo}>
                    <th scope="row">{nome}</th>
                    {t.meses.map((m) => (
                      <td
                        key={m.mes}
                        className="direita num"
                        data-incompleta={m.incompletas.includes(id) || undefined}
                      >
                        {valorInteiro(m.valores[id])}
                      </td>
                    ))}
                    <td className="direita num">{valorInteiro(total.valor)}</td>
                    <td className="direita num">{porcento(total.pct)}</td>
                  </tr>
                )
              })}
              <tr data-linha="margem-liquida">
                <th scope="row">Margem líquida</th>
                {t.meses.map((m) => (
                  <td
                    key={m.mes}
                    className="direita num"
                    data-incompleta={m.incompletas.includes("lucro") || undefined}
                  >
                    {m.margemLiquida === null
                      ? "—"
                      : `${m.margemLiquida.toFixed(1).replace(".", ",").replace("-", "−")}%`}
                  </td>
                ))}
                <td className="direita num">
                  {linhaDe(t, "lucro").pct === null
                    ? "—"
                    : `${linhaDe(t, "lucro").pct!.toFixed(1).replace(".", ",").replace("-", "−")}%`}
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        {incompletos.length ? (
          <p className="fin-nota fin-nota--pe">
            * {incompletos.map((m) => m.curto).join(", ")}: com algum número incompleto — o que
            falta está em “Pra fechar certinho”.
          </p>
        ) : null}
      </section>
    </>
  )
}
