import type { Route } from "next"
import Link from "next/link"
import { Suspense, type ReactNode } from "react"
import { AbasQueRolam } from "@/components/abas-que-rolam"
import { Icone } from "@/components/icones"
import { MudarMeta } from "@/components/mudar-meta"
import {
  lerCanais,
  lerVisitasDoMarketing,
  PERIODOS,
  type Achado,
  type Comparado,
  type MetaDoMes,
  type Periodo,
  type ProdutoVendido,
  type Resumo,
  type SemGoogle,
} from "@/lib/marketing"
import { reais, reaisCurto } from "@/lib/pedidos"

/**
 * O RESUMO DO MARKETING — as peças da tela: os períodos, os cinco números
 * comparados com o período de antes, a meta do mês, a receita no tempo e os
 * produtos que mais venderam. Os desenhos são os do protótipo; os dados, do
 * `GET /dashboard/marketing`. As visitas e a conversão chegam à parte
 * (`NumerosDoGoogle`, num `<Suspense>`): o Google pode demorar.
 */

const INTEIRO = new Intl.NumberFormat("pt-BR")
const vezes = (n: number, um: string, varios: string) =>
  `${INTEIRO.format(n)} ${n === 1 ? um : varios}`
const porcento = (v: number, casas = 0) => `${v.toFixed(casas).replace(".", ",")}%`

/** O período com que cada um se compara: "+12% que os 7 dias antes", "igual aos 7 dias antes". */
const ANTES: Record<Periodo, string> = {
  hoje: "ontem a esta hora",
  "7d": "os 7 dias antes",
  "30d": "os 30 dias antes",
  "90d": "os 90 dias antes",
}

/** As abas da área, na ordem do protótipo. O período vai junto. */
const ABAS = [
  ["resumo", "Resumo", "/marketing"],
  ["funil", "Funil", "/marketing/funil"],
  ["canais", "Canais", "/marketing/canais"],
  ["produtos", "Produtos", "/marketing/produtos"],
  ["ofertas", "Ofertas", "/marketing/ofertas"],
  ["clientes", "Clientes", "/marketing/clientes"],
  ["pagamento", "Pagamento e frete", "/marketing/pagamento"],
] as const
export type Aba = (typeof ABAS)[number][0]

export function AbasDoMarketing({ atual, periodo }: { atual: Aba; periodo: Periodo }) {
  return (
    <AbasQueRolam rotulo="Marketing" acesa={atual}>
      {ABAS.map(([aba, nome, caminho]) => (
        <Link
          key={aba}
          href={`${caminho}?periodo=${periodo}` as Route}
          aria-current={aba === atual ? "page" : undefined}
          data-aba={aba}
        >
          {nome}
        </Link>
      ))}
    </AbasQueRolam>
  )
}

/** Os períodos, sem sair da aba (`caminho`). */
export function Periodos({ atual, caminho = "/marketing" }: { atual: Periodo; caminho?: string }) {
  return (
    <nav className="filtros" aria-label="Período">
      {PERIODOS.map(([p, nome]) => (
        <Link
          key={p}
          className="filtro"
          href={`${caminho}?periodo=${p}` as Route}
          aria-current={p === atual ? "page" : undefined}
          data-periodo={p}
        >
          {nome}
        </Link>
      ))}
    </nav>
  )
}

/**
 * Embaixo do número: quanto mudou contra o período de antes, com a seta e a
 * cor dizendo se foi BOM (o protótipo) — aqui, todo número é bom quando
 * sobe. Sem comparação (`variacao` nula), a frase diz por quê.
 */
function Comparacao({
  variacao,
  antes,
  sem,
}: {
  variacao: number | null
  antes: string
  sem: string
}) {
  if (variacao === null) return <span>{sem}</span>
  if (variacao === 0)
    return (
      <>
        <span className="delta">igual</span>{" "}
        <span>{antes.startsWith("os ") ? `aos ${antes.slice(3)}` : `a ${antes}`}</span>
      </>
    )
  return (
    <>
      <span
        className="delta"
        data-bom={variacao > 0 ? "" : undefined}
        data-ruim={variacao < 0 ? "" : undefined}
      >
        <Icone nome={variacao > 0 ? "cima" : "baixo"} />
        {Math.abs(variacao)}%
      </span>{" "}
      <span>que {antes}</span>
    </>
  )
}

function Kpi({
  rot,
  valor,
  sub,
  ajuda,
  dados,
}: {
  rot: string
  valor: string
  sub: ReactNode
  ajuda: string
  dados: string
}) {
  return (
    <div className="kpi" title={ajuda || undefined} data-kpi={dados}>
      <p className="kpi__rot">{rot}</p>
      <p className="kpi__valor">{valor}</p>
      <p className="kpi__sub">{sub}</p>
    </div>
  )
}

/** Sem nada no período de antes, não há como dizer se subiu: a frase diz. */
const semAntes = (c: Comparado, oQue: string) =>
  c.valor ? `${oQue} no período antes pra comparar` : `${oQue} no período`

export function Numeros({ resumo }: { resumo: Resumo }) {
  const { receita, pedidos, ticket } = resumo.numeros
  const antes = ANTES[resumo.periodo]
  const comparado = (c: Comparado) => (
    <Comparacao variacao={c.variacao} antes={antes} sem={semAntes(c, "nada")} />
  )
  return (
    <div className="kpis">
      <Kpi
        rot="Receita"
        valor={reais(receita.valor)}
        sub={comparado(receita)}
        ajuda="O que foi pago, com o frete."
        dados="receita"
      />
      <Kpi
        rot="Pedidos pagos"
        valor={INTEIRO.format(pedidos.valor)}
        sub={comparado(pedidos)}
        ajuda="Só pedido pago conta."
        dados="pedidos"
      />
      <Suspense
        fallback={
          <>
            <Kpi rot="Visitas" valor="…" sub="perguntando ao Google…" ajuda="" dados="visitas" />
            <Kpi rot="Conversão" valor="…" sub="precisa das visitas" ajuda="" dados="conversao" />
          </>
        }
      >
        <NumerosDoGoogle periodo={resumo.periodo} />
      </Suspense>
      <Kpi
        rot="Ticket médio"
        valor={reais(ticket.valor)}
        sub={comparado(ticket)}
        ajuda="Quanto cada pedido pago deixa, com o frete."
        dados="ticket"
      />
    </div>
  )
}

/** Sem o Google: o porquê, numa linha (os do Início). */
export const SEM_VISITAS: Record<SemGoogle, string> = {
  desligado: "o Google Analytics ainda não está ligado",
  invalida: "a chave do Google Analytics não se lê",
  recusado: "o Google recusou a leitura",
  fora: "o Google não respondeu agora",
}

async function NumerosDoGoogle({ periodo }: { periodo: Periodo }) {
  const r = await lerVisitasDoMarketing(periodo)
  if (r.estado !== "ok")
    return (
      <>
        <Kpi rot="Visitas" valor="—" sub={SEM_VISITAS[r.estado]} ajuda="" dados="visitas" />
        <Kpi rot="Conversão" valor="—" sub="precisa das visitas" ajuda="" dados="conversao" />
      </>
    )
  const { visitas, conversao } = r
  // Hoje, o Google ainda está somando: a comparação é só até a hora que ele já somou.
  const hojeSemNada = periodo === "hoje" && r.ate === null
  const antes = periodo === "hoje" ? `ontem até as ${r.ate}h` : ANTES[periodo]
  return (
    <>
      <Kpi
        rot="Visitas"
        valor={INTEIRO.format(visitas.valor)}
        sub={
          hojeSemNada ? (
            "o Google ainda não somou as de hoje"
          ) : (
            <Comparacao
              variacao={visitas.variacao}
              antes={antes}
              sem={visitas.valor ? "nenhuma visita no período antes" : "nenhuma visita no período"}
            />
          )
        }
        ajuda="Do Google Analytics, só as da loja. Quem recusa os cookies fica de fora."
        dados="visitas"
      />
      <Kpi
        rot="Conversão"
        valor={conversao.valor === null ? "—" : porcento(conversao.valor, 2)}
        sub={
          <Comparacao
            variacao={conversao.variacao}
            antes={antes}
            sem={
              conversao.valor === null
                ? "sem visitas no período"
                : conversao.antes === null
                  ? "sem visitas no período antes"
                  : "nenhum pedido pago no período antes"
            }
          />
        }
        ajuda="De cada 100 visitas, quantas viraram pedido pago."
        dados="conversao"
      />
    </>
  )
}

export function Glossario() {
  return (
    <p className="glossario">
      <b>Conversão:</b> de cada 100 visitas, quantas viraram pedido pago. <b>Ticket médio:</b>{" "}
      quanto cada pedido pago deixa, com o frete.
    </p>
  )
}

/** O que a meta quer dizer, numa frase: batida, no caminho, ou quanto falta por dia. */
function fraseDaMeta(m: MetaDoMes & { valor: number }): string {
  if (m.porDia === null) return `Meta batida: o mês já passou de ${reais(m.valor)}.`
  if (m.projecao >= m.valor)
    return `No ritmo de agora (${reais(m.ritmo)} por dia), o mês fecha em ${reais(m.projecao)} — bate a meta.`
  return `Pra bater, precisa de ${reais(m.porDia)} por dia; o ritmo está em ${reais(m.ritmo)}.`
}

export function Meta({ meta, muda }: { meta: MetaDoMes; muda: boolean }) {
  const falta =
    meta.restam === 1 ? "último dia do mês" : `faltam ${meta.restam} dias, contando hoje`
  const mudar = muda ? <MudarMeta valor={meta.valor} mes={meta.nome} /> : null
  if (meta.valor === null)
    return (
      <section className="bloco" data-meta="sem">
        <div className="bloco__cabeca">
          <div>
            <h2 className="bloco__titulo">Meta de {meta.nome}</h2>
            <p className="bloco__sub">{reais(meta.feito)} vendidos no mês até agora</p>
          </div>
          {mudar}
        </div>
        <p className="meta__txt">
          {muda
            ? "Sem meta pra este mês. Defina uma pra ver se o ritmo de agora chega lá."
            : "Sem meta pra este mês ainda — quem define é o dono."}
        </p>
      </section>
    )
  const m = { ...meta, valor: meta.valor }
  const feito = (m.feito / m.valor) * 100
  return (
    <section className="bloco" data-meta="com">
      <div className="bloco__cabeca">
        <div>
          <h2 className="bloco__titulo">Meta de {m.nome}</h2>
          <p className="bloco__sub">
            {reais(m.feito)} de {reais(m.valor)} · {falta}
          </p>
        </div>
        {mudar}
      </div>
      <div className="meta">
        <div
          className="meta__trilho"
          role="img"
          aria-label={`${porcento(Math.floor(feito))} da meta. No ritmo de agora, o mês fecha em ${reais(m.projecao)}.`}
        >
          <i style={{ width: `${Math.min(100, feito).toFixed(1)}%` }} />
          <span
            className="meta__ritmo"
            style={{ left: `${Math.min(100, (m.projecao / m.valor) * 100).toFixed(1)}%` }}
            title="Onde o mês fecha no ritmo de agora"
          />
        </div>
        <p className="meta__txt">
          <b>{porcento(Math.floor(feito))} da meta.</b> {fraseDaMeta(m)}
        </p>
      </div>
    </section>
  )
}

export function Grafico({ serie }: { serie: Resumo["serie"] }) {
  const maior = Math.max(...serie.barras.map((b) => b.valor), 1)
  // Com muitas barras, o valor em cima de cada uma amontoa: fica só o da de agora.
  const poucas = serie.barras.length <= 7
  const comValor = serie.barras.filter((b) => b.valor)
  const descricao = comValor.length
    ? comValor.map((b) => `${b.nome}: ${reais(b.valor)}`).join("; ")
    : "nenhuma venda paga no período"
  return (
    <section className="bloco">
      <div className="bloco__cabeca">
        <div>
          <h2 className="bloco__titulo">{serie.titulo}</h2>
          <p className="bloco__sub">Só pedido pago conta, com o frete.</p>
        </div>
      </div>
      <div
        className={`barras-v barras-v--pontas${poucas ? "" : " barras-v--fino"}`}
        role="img"
        aria-label={`${serie.titulo}. ${descricao}`}
        data-barras={serie.barras.length}
      >
        {serie.barras.map((b) => (
          <div
            className="barras-v__col"
            key={b.nome}
            title={`${b.nome}: ${reais(b.valor)} · ${vezes(b.pedidos, "pedido", "pedidos")}`}
          >
            <i
              style={{ height: `${((b.valor / maior) * 100).toFixed(1)}%` }}
              data-v={b.valor && (poucas || b.agora) ? reaisCurto(b.valor) : undefined}
              data-agora={b.agora ? "" : undefined}
            />
            <span className="barras-v__rot">{b.rotulo}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

export function MaisVendidos({ produtos }: { produtos: ProdutoVendido[] }) {
  return (
    <section className="bloco" data-mais-vendidos>
      <div className="bloco__cabeca">
        <div>
          <h2 className="bloco__titulo">Produtos que mais venderam</h2>
          <p className="bloco__sub">Em reais, no período — sem o frete.</p>
        </div>
      </div>
      {produtos.length ? (
        <ol className="topo3">
          {produtos.map((p, i) => (
            <li key={p.nome}>
              <span className="topo3__n">{i + 1}</span>
              <span className="topo3__nome">
                <span className={`foto${p.imagem ? "" : " foto--vazia"}`}>
                  {p.imagem ? (
                    // eslint-disable-next-line @next/next/no-img-element -- foto do Medusa, de qualquer host
                    <img src={p.imagem} alt="" loading="lazy" />
                  ) : (
                    <Icone nome="produtos" />
                  )}
                </span>
                <span className="topo3__texto">
                  <b>{p.nome}</b>
                  <span className="topo3__sub">{vezes(p.unidades, "unidade", "unidades")}</span>
                </span>
              </span>
              <b className="num">{reais(p.receita)}</b>
            </li>
          ))}
        </ol>
      ) : (
        <p className="fila__vazia">Nenhuma venda paga no período.</p>
      )}
    </section>
  )
}

export function FonteDosDados() {
  return (
    <p className="fonte-dados">
      <b>De onde vêm os números:</b> visitas — Google Analytics, só as do endereço da loja (quem
      recusa os cookies fica de fora, então as visitas de verdade são um pouco mais; e o Google soma
      com algumas horas de atraso); pedidos e receita — a loja, só pedido pago.
    </p>
  )
}

/** "Um dia só é pouco pra concluir" — nas abas de análise, com o período de hoje (o protótipo). */
export function UmDiaEPouco() {
  return (
    <div className="faixa" data-nivel="info" data-um-dia>
      <Icone nome="relogio" />
      <div>
        <p className="faixa__titulo">Um dia só é pouco pra concluir</p>
        <p>
          Com os números de hoje, qualquer diferença pode ser acaso. Pra decidir, use 7 ou 30 dias.
        </p>
      </div>
    </div>
  )
}

const ICONE_DO_ACHADO: Record<Achado["tipo"], "alerta" | "check" | "grafico" | "relogio"> = {
  problema: "alerta",
  oportunidade: "grafico",
  bom: "check",
  info: "relogio",
}

/** O que os números querem dizer, em frase — cada aba começa por aqui (o protótipo). */
export function Achados({ achados }: { achados: Achado[] }) {
  if (!achados.length) return null
  return (
    <div className={`achados${achados.length === 1 ? " achados--um" : ""}`} data-achados>
      {achados.map((a) => (
        <article className="achado" data-tipo={a.tipo} key={a.titulo}>
          <span className="achado__ico">
            <Icone nome={ICONE_DO_ACHADO[a.tipo]} />
          </span>
          <div>
            <h3 className="achado__titulo">{a.titulo}</h3>
            <p className="achado__txt">{a.texto}</p>
          </div>
        </article>
      ))}
    </div>
  )
}

/** Os três canais que mais venderam no período — no Resumo, do lado dos produtos. */
export async function CanaisQueMaisVenderam({ periodo }: { periodo: Periodo }) {
  const c = await lerCanais(periodo)
  const canais = c?.estado === "ok" ? c.canais.filter((l) => l.receita > 0).slice(0, 3) : []
  return (
    <section className="bloco" data-canais-do-resumo>
      <div className="bloco__cabeca">
        <div>
          <h2 className="bloco__titulo">Canais que mais venderam</h2>
          <p className="bloco__sub">Das vendas que o Google Analytics viu.</p>
        </div>
      </div>
      {canais.length ? (
        <ol className="topo3">
          {canais.map((l, i) => (
            <li key={l.nome}>
              <span className="topo3__n">{i + 1}</span>
              <span className="topo3__nome">
                <span className="topo3__texto">
                  <b>{l.nome}</b>
                  <span className="topo3__sub">{vezes(l.pedidos, "pedido", "pedidos")}</span>
                </span>
              </span>
              <b className="num">{reais(l.receita)}</b>
            </li>
          ))}
        </ol>
      ) : (
        <p className="fila__vazia">
          {!c || c.estado === "ok" ? "Nenhuma venda com origem no período." : SEM_VISITAS[c.estado]}
        </p>
      )}
      <Link className="link pequeno" href={`/marketing/canais?periodo=${periodo}` as Route}>
        Ver os canais →
      </Link>
    </section>
  )
}
