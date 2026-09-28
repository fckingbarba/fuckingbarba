import type { Route } from "next"
import Form from "next/form"
import Link from "next/link"
import { Icone } from "@/components/icones"
import {
  ATALHOS_DO_INICIO,
  enderecoDoPeriodo,
  type Atalhos,
  type PeriodoNaTela,
} from "@/lib/periodo"

/**
 * A BARRA DO PERÍODO — a do Início (entrega 0186) e a do Marketing (0191):
 * os botões (hoje, ontem, 7 e 30 dias — e 90, no Marketing —, este mês, o
 * mês passado), as datas que a pessoa escolhe e o "comparar com". Sem
 * JavaScript: cada botão é um link com o período no endereço da tela
 * (`caminho`), e as datas e o comparar abrem num `<details>` (as datas
 * mandam o `Form` do `next/form`, que troca só a tela). O calendário é o do
 * próprio navegador (`<input type="date">`), que no celular é o do aparelho.
 */

const FUSO = "America/Sao_Paulo"
const HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  hour: "2-digit",
  minute: "2-digit",
})

/** "2026-09-28", hoje na hora da loja: o fim mais longe que as datas aceitam. */
const hojeNaLoja = () => new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date())

const maiuscula = (t: string) => `${t[0]?.toUpperCase() ?? ""}${t.slice(1)}`

export function BarraDoPeriodo({
  p,
  caminho = "/",
  atalhos = ATALHOS_DO_INICIO,
}: {
  p: PeriodoNaTela
  caminho?: string
  atalhos?: Atalhos
}) {
  const hoje = hojeNaLoja()
  // Um botão que esta barra não tem (os 90 dias no Início, digitado no endereço): como as datas.
  const escolhido = !atalhos.some(([a]) => a === p.atalho)
  return (
    <div className="periodo" data-periodo={p.atalho ?? "datas"}>
      <nav className="periodo__atalhos" aria-label="Período">
        {atalhos.map(([atalho, nome]) => (
          <Link
            key={atalho}
            className="periodo__botao"
            href={enderecoDoPeriodo(caminho, { atalho, de: p.de, ate: p.ate }, p.comparar) as Route}
            aria-current={p.atalho === atalho ? "page" : undefined}
            data-atalho={atalho}
          >
            {nome}
          </Link>
        ))}
        <details className="periodo__caixa" data-escolher>
          <summary
            className="periodo__botao periodo__botao--datas"
            aria-current={escolhido ? "page" : undefined}
          >
            <Icone nome="calendario" />
            {escolhido ? p.nome : "Escolher datas"}
          </summary>
          <Form action={caminho as Route} className="periodo__janela">
            <label className="periodo__campo">
              <span>De</span>
              <input
                type="date"
                name="de"
                defaultValue={p.de}
                min="2020-01-01"
                max={hoje}
                required
              />
            </label>
            <label className="periodo__campo">
              <span>Até</span>
              <input
                type="date"
                name="ate"
                defaultValue={p.ate}
                min="2020-01-01"
                max={hoje}
                required
              />
            </label>
            {p.comparar ? null : <input type="hidden" name="comparar" value="nenhum" />}
            <button className="btn btn--menor" type="submit">
              Ver
            </button>
            <p className="periodo__dica">Até 6 meses de cada vez.</p>
          </Form>
        </details>
      </nav>
      <details className="periodo__caixa periodo__caixa--comparar" data-comparar>
        <summary className="periodo__comparar">
          <span className="periodo__rot">Comparar com</span>
          <b>{p.comparar ? p.nomeDoAntes : "nada"}</b>
          <Icone nome="seta" className="periodo__abre" />
        </summary>
        <div className="periodo__janela periodo__janela--opcoes">
          <Link
            href={enderecoDoPeriodo(caminho, p, true) as Route}
            aria-current={p.comparar ? "true" : undefined}
            data-comparar-com="anterior"
          >
            O período de antes
          </Link>
          <Link
            href={enderecoDoPeriodo(caminho, p, false) as Route}
            aria-current={p.comparar ? undefined : "true"}
            data-comparar-com="nenhum"
          >
            Não comparar
          </Link>
        </div>
      </details>
    </div>
  )
}

/**
 * Embaixo da barra: os dias do período, o que é barra e o que é tracejado
 * nos gráficos (o Início; no Marketing, que não desenha o de antes, só com
 * o que compara — `graficos={false}`), e a hora da leitura. E, se o período
 * pedido não valeu, o porquê (a tela mostra o padrão dela).
 */
export function LegendaDoPeriodo({ p, graficos = true }: { p: PeriodoNaTela; graficos?: boolean }) {
  return (
    <>
      {p.aviso ? (
        <p className="periodo__aviso" role="status" data-aviso-do-periodo>
          <Icone nome="alerta" />
          {p.aviso}
        </p>
      ) : null}
      <div className="periodo__legenda" data-legenda>
        <p>
          <b data-datas>{maiuscula(p.datas)}</b>
          {p.comparar && !graficos ? (
            <span className="periodo__leg" data-comparando>
              comparado com {p.nomeDoAntes}
              {p.ateAgora ? ", até esta hora" : ""}
            </span>
          ) : null}
          {p.comparar && graficos ? (
            <>
              <span className="periodo__leg">
                <i className="leg-barra" aria-hidden="true" />
                {p.atalho === "hoje" ? "hoje" : "o período"}
              </span>
              <span className="periodo__leg">
                <i className="leg-tracejado" aria-hidden="true" />
                {p.nomeDoAntes}
                {p.ateAgora ? ", até esta hora nos números" : ""}
              </span>
            </>
          ) : null}
        </p>
        <p className="periodo__hora">Atualizado às {HORA.format(new Date())}</p>
      </div>
    </>
  )
}
