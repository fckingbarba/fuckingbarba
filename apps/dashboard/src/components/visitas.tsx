import { Icone } from "@/components/icones"
import {
  lerVisitas,
  temOBloco,
  type Barra,
  type Comparacao,
  type RespostaDasVisitas,
  type Visitas,
} from "@/lib/visitas"

/**
 * AS VISITAS DO INÍCIO — o número de cima (todo papel) e o bloco com o dia
 * hora a hora, de onde vieram e os produtos mais vistos (o dono e o
 * marketing). Do Google Analytics, pelo `GET /dashboard/visitas`; os
 * desenhos são os do protótipo.
 *
 * Os dois componentes de dados são assíncronos e leem a mesma resposta: o
 * Início põe cada um num `<Suspense>`, com o `NumeroDeVisitas` em
 * "carregando" no lugar enquanto o Google responde.
 *
 * O GOOGLE SOMA COM HORAS DE ATRASO: o "hoje" é o que ele já somou, e a
 * comparação com ontem é só nessas horas — a tela diz até que hora
 * ("−5% que ontem até as 9h"). A conta de quantas viraram pedido pago é a
 * de ontem, que já fechou.
 */

const INTEIRO = new Intl.NumberFormat("pt-BR")
const PORCENTO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 })

/** Sem visitas pra mostrar: o porquê, numa linha. */
const SEM_NUMERO: Record<Exclude<RespostaDasVisitas["estado"], "ok">, string> = {
  carregando: "perguntando ao Google…",
  desligado: "o Google Analytics ainda não está ligado",
  invalida: "a chave do Google Analytics não se lê",
  recusado: "o Google recusou a leitura",
  fora: "o Google não respondeu agora",
}

/** "−5% que ontem até as 9h" — nas horas que o Google já somou hoje —, ou o que der pra dizer. */
function comparacao(hoje: number, c: Comparacao | null): string {
  if (!c) return hoje ? "o Google ainda está somando as de hoje" : "nenhuma somada ainda hoje"
  if (!c.ontem) return c.hoje ? `ontem até as ${c.ate}h: nenhuma` : `nenhuma até as ${c.ate}h`
  const diferenca = Math.round((c.hoje / c.ontem - 1) * 100)
  return `${diferenca >= 0 ? "+" : "−"}${Math.abs(diferenca)}% que ontem até as ${c.ate}h`
}

export function NumeroDeVisitas({ r }: { r: RespostaDasVisitas }) {
  if (r.estado !== "ok")
    return (
      <div className="numero" data-visitas={r.estado}>
        <p className="numero__rot">Visitas hoje</p>
        <p className="numero__valor">{r.estado === "carregando" ? "…" : "—"}</p>
        <p className="numero__sub">{SEM_NUMERO[r.estado]}</p>
      </div>
    )
  const { hoje, comparacao: c } = r.visitas
  const miolo = (
    <>
      <span className="numero__rot">Visitas hoje</span>
      <span className="numero__valor">{INTEIRO.format(hoje)}</span>
      <span className="numero__sub">{comparacao(hoje, c)}</span>
    </>
  )
  // Quem tem o bloco chega nele pelo número; a operação só lê.
  return temOBloco(r.visitas) ? (
    <a
      className="numero numero--botao"
      href="#visitas"
      data-visitas="ok"
      aria-label={`Visitas hoje: ${INTEIRO.format(hoje)}. Ver de onde vieram`}
    >
      {miolo}
      <Icone nome="seta" />
    </a>
  ) : (
    <div className="numero" data-visitas="ok">
      {miolo}
    </div>
  )
}

export async function NumeroDasVisitas() {
  return <NumeroDeVisitas r={await lerVisitas()} />
}

/**
 * O bloco das visitas — só pra quem recebeu o bloco (o dono e o marketing),
 * e só com número. `pedidosPagosOntem` vem do gráfico da semana do Início:
 * a conta de quantas visitas viraram pedido é a de ontem, que já fechou.
 */
export async function BlocoDasVisitas({ pedidosPagosOntem }: { pedidosPagosOntem: number | null }) {
  const r = await lerVisitas()
  if (r.estado !== "ok" || !temOBloco(r.visitas)) return null
  const v = r.visitas
  const conversao =
    v.ontem && pedidosPagosOntem !== null
      ? ` · ${PORCENTO.format((pedidosPagosOntem / v.ontem) * 100)}% viraram pedido pago`
      : ""
  return (
    <section className="bloco" id="visitas" tabIndex={-1}>
      <div className="bloco__cabeca">
        <div>
          <h2 className="bloco__titulo">Visitas de hoje</h2>
          <p className="bloco__sub">{INTEIRO.format(v.hoje)} somadas pelo Google até agora</p>
          {v.ontem ? (
            <p className="bloco__sub" data-ontem>
              Ontem: {INTEIRO.format(v.ontem)} {v.ontem === 1 ? "visita" : "visitas"}
              {conversao}
            </p>
          ) : null}
        </div>
        <span className="agora" title="Nos últimos 30 minutos">
          <i />
          {INTEIRO.format(v.agora)} no site agora
        </span>
      </div>
      <PorHora v={v} />
      <h3 className="rotulo rotulo--depois">De onde vieram</h3>
      <Barras itens={v.origens} total={v.hoje} vazio="Ninguém ainda hoje." />
      <h3 className="rotulo rotulo--depois">Produtos mais vistos</h3>
      <Barras itens={v.maisVistos} vazio="Nenhuma página de produto vista ainda hoje." />
      <p className="pequeno suave visitas__nota">
        Do Google Analytics, que soma as visitas com algumas horas de atraso — o “no site agora” é
        na hora. Quem recusa os cookies fica de fora: o número real é um pouco maior.
      </p>
    </section>
  )
}

/**
 * O rótulo embaixo da barra: "agora" na hora de agora, e 0h, 6h, 12h e 18h —
 * menos os que ficam a 3 horas ou menos dela: no celular a coluna tem 12
 * pixels, e "agora" e "12h" encavalariam.
 */
const rotulo = (h: number, agora: number) =>
  h === agora ? "agora" : h % 6 === 0 && Math.abs(h - agora) > 3 ? `${h}h` : ""

/** O dia inteiro no eixo (0h a 23h): o vazio depois de "agora" mostra que o dia não acabou. */
function PorHora({ v }: { v: Visitas }) {
  const agora = v.porHora.length - 1
  const maior = Math.max(...v.porHora, 1)
  const pico = v.porHora.indexOf(Math.max(...v.porHora))
  // Depois da última hora com visita, até agora: o Google ainda está somando (o atraso dele).
  const ultima = v.porHora.findLastIndex((valor) => valor > 0)
  return (
    <div
      className="barras-v barras-v--fino"
      role="img"
      aria-label={`Visitas por hora, da meia-noite até agora: ${INTEIRO.format(v.hoje)} no total`}
      style={{ ["--altura" as string]: "110px" }}
    >
      {Array.from({ length: 24 }, (_, h) => {
        const valor = v.porHora[h] ?? 0
        const passou = h <= agora
        return (
          <div
            className="barras-v__col"
            key={h}
            title={
              !passou
                ? undefined
                : h > ultima
                  ? `${h}h: o Google ainda está somando`
                  : `${h}h: ${INTEIRO.format(valor)} ${valor === 1 ? "visita" : "visitas"}${h === agora ? " (até agora)" : ""}`
            }
          >
            <i
              style={{ height: `${Math.min(100, (valor / maior) * 100).toFixed(1)}%` }}
              data-v={h === pico && valor ? INTEIRO.format(valor) : undefined}
              data-agora={h === agora ? "" : undefined}
            />
            <span className="barras-v__rot">{rotulo(h, agora)}</span>
          </div>
        )
      })}
    </div>
  )
}

/** Barras deitadas: o nome, o número (e a parte do total, nas origens) e o trilho. */
function Barras({ itens, total, vazio }: { itens: Barra[]; total?: number; vazio: string }) {
  if (!itens.length) return <p className="pequeno suave">{vazio}</p>
  const maior = Math.max(...itens.map((i) => i.visitas), 1)
  return (
    <ul className="barras-h">
      {itens.map((i) => (
        <li key={i.nome}>
          <span className="barras-h__nome">{i.nome}</span>
          <span className="barras-h__num">
            {INTEIRO.format(i.visitas)}
            {total ? <small> · {Math.round((i.visitas / total) * 100)}%</small> : null}
          </span>
          <span className="barras-h__trilho">
            <i style={{ width: `${((i.visitas / maior) * 100).toFixed(1)}%` }} />
          </span>
        </li>
      ))}
    </ul>
  )
}
