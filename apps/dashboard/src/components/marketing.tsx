import type { Route } from "next"
import Link from "next/link"
import { Suspense, type ReactNode } from "react"
import { AbasQueRolam } from "@/components/abas-que-rolam"
import { Icone } from "@/components/icones"
import { MudarMeta } from "@/components/mudar-meta"
import { BarraDoPeriodo, LegendaDoPeriodo } from "@/components/periodo"
import { CabecaDoBloco, Faixa } from "@/components/visual"
import {
  lerAchadosDoMarketing,
  lerCanais,
  lerVisitasDoMarketing,
  type AbaComAchados,
  type Achado,
  type Comparado,
  type MetaDoMes,
  type ProdutoVendido,
  type Resumo,
  type SemGoogle,
} from "@/lib/marketing"
import { reais, reaisCurto } from "@/lib/pedidos"
import { ATALHOS, enderecoDoPeriodo, type PeriodoNaTela } from "@/lib/periodo"

/**
 * O RESUMO DO MARKETING — as peças da tela: as abas, os cinco números
 * comparados com o período de antes, a meta do mês, a receita no tempo e os
 * produtos que mais venderam. Os desenhos são os do protótipo; os dados, do
 * `GET /dashboard/marketing`. As visitas e a conversão chegam à parte
 * (`NumerosDoGoogle`, num `<Suspense>`): o Google pode demorar.
 *
 * O período é o da barra de cima, a do Início (`components/periodo.tsx`,
 * 0191): cada peça recebe o `p` (o `PeriodoNaTela` que o backend devolveu)
 * pras frases, e a `consulta` pra ler.
 */

const INTEIRO = new Intl.NumberFormat("pt-BR")
const vezes = (n: number, um: string, varios: string) =>
  `${INTEIRO.format(n)} ${n === 1 ? um : varios}`
const porcento = (v: number, casas = 0) => `${v.toFixed(casas).replace(".", ",")}%`

/**
 * Com o que cada número se compara, depois do "que": "ontem a esta hora",
 * "os 7 dias antes", "o mês passado até o mesmo dia", "julho", "o dia
 * 26/09", "os dias 07/09 a 13/09". Vazio sem comparar.
 */
export function oDeAntes(p: PeriodoNaTela): string {
  if (!p.comparar || !p.nomeDoAntes) return ""
  if (p.nomeDoAntes === "ontem") return p.ateAgora ? "ontem a esta hora" : "ontem"
  if (p.atalho === "7d" || p.atalho === "30d" || p.atalho === "90d")
    return `os ${p.atalho.slice(0, -1)} dias antes`
  if (p.atalho === "mes") return "o mês passado até o mesmo dia"
  if (p.atalho === "mes-passado") return p.nomeDoAntes
  return p.passo === "hora" ? `o dia ${p.nomeDoAntes}` : `os dias ${p.nomeDoAntes}`
}

/** "igual aos 7 dias antes", "igual ao dia 26/09", "igual a julho". */
const igualA = (antes: string) =>
  antes.startsWith("os ")
    ? `aos ${antes.slice(3)}`
    : antes.startsWith("o ")
      ? `ao ${antes.slice(2)}`
      : `a ${antes}`

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

/** O endereço de uma aba no mesmo período (e no mesmo comparar). */
const daAba = (caminho: string, p: PeriodoNaTela) => enderecoDoPeriodo(caminho, p, p.comparar)

export function AbasDoMarketing({ atual, p }: { atual: Aba; p: PeriodoNaTela }) {
  return (
    <AbasQueRolam rotulo="Marketing" acesa={atual}>
      {ABAS.map(([aba, nome, caminho]) => (
        <Link
          key={aba}
          href={daAba(caminho, p) as Route}
          aria-current={aba === atual ? "page" : undefined}
          data-aba={aba}
        >
          {nome}
        </Link>
      ))}
    </AbasQueRolam>
  )
}

/**
 * A barra do período (a do Início, com os 90 dias) e a linha embaixo dela —
 * sem sair da aba (`caminho`). O gráfico do Marketing não desenha o de
 * antes: a linha diz com o que os números se comparam.
 */
export function PeriodoDoMarketing({ p, caminho }: { p: PeriodoNaTela; caminho: string }) {
  return (
    <>
      <BarraDoPeriodo p={p} caminho={caminho} atalhos={ATALHOS} />
      <LegendaDoPeriodo p={p} graficos={false} />
    </>
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
        <span className="delta">igual</span> <span>{igualA(antes)}</span>
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

export function Numeros({
  resumo,
  consulta,
  p,
}: {
  resumo: Resumo
  consulta: string
  p: PeriodoNaTela
}) {
  const { receita, pedidos, ticket } = resumo.numeros
  const antes = oDeAntes(p)
  // Sem comparar, embaixo do número não vai nada (como no Início).
  const comparado = (c: Comparado) =>
    p.comparar ? <Comparacao variacao={c.variacao} antes={antes} sem={semAntes(c, "nada")} /> : null
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
        <NumerosDoGoogle consulta={consulta} p={p} />
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

async function NumerosDoGoogle({ consulta, p }: { consulta: string; p: PeriodoNaTela }) {
  const r = await lerVisitasDoMarketing(consulta)
  if (r.estado !== "ok")
    return (
      <>
        <Kpi rot="Visitas" valor="—" sub={SEM_VISITAS[r.estado]} ajuda="" dados="visitas" />
        <Kpi rot="Conversão" valor="—" sub="precisa das visitas" ajuda="" dados="conversao" />
      </>
    )
  const { visitas, pedidos, conversao } = r
  // Hoje, o Google ainda está somando: a comparação é só até a hora que ele já somou.
  const soHoje = p.ateAgora && p.passo === "hora"
  const hojeSemNada = soHoje && r.ate === null
  const antes = soHoje && r.ate !== null ? `${p.nomeDoAntes} até as ${r.ate}h` : oDeAntes(p)
  return (
    <>
      <Kpi
        rot="Visitas"
        valor={INTEIRO.format(visitas.valor)}
        sub={
          hojeSemNada ? (
            "o Google ainda não somou as de hoje"
          ) : p.comparar ? (
            <Comparacao
              variacao={visitas.variacao}
              antes={antes}
              sem={visitas.valor ? "nenhuma visita no período antes" : "nenhuma visita no período"}
            />
          ) : null
        }
        ajuda="Do Google Analytics, só as da loja. Quem recusa os cookies fica de fora."
        dados="visitas"
      />
      <Kpi
        rot="Conversão"
        valor={conversao.valor === null ? "—" : porcento(conversao.valor, 2)}
        sub={
          !p.comparar ? (
            conversao.valor === null ? (
              "sem visitas no período"
            ) : null
          ) : (
            <Comparacao
              variacao={conversao.variacao}
              antes={antes}
              sem={
                conversao.valor === null
                  ? "sem visitas no período"
                  : conversao.antes === null
                    ? "sem visitas no período antes"
                    : "nenhum pedido visto pelo Google no período antes"
              }
            />
          )
        }
        ajuda={
          `De cada 100 visitas, quantas viraram pedido pago: ` +
          `${vezes(pedidos.valor, "pedido", "pedidos")} em ${vezes(visitas.valor, "visita", "visitas")}. ` +
          "As duas contas são do Google, de todo mundo menos quem recusou os cookies — como nos Canais."
        }
        dados="conversao"
      />
    </>
  )
}

/** O glossário e a fonte dos números: no "?" do título do Marketing (0158; antes, dois parágrafos). */
export function Glossario() {
  return (
    <span className="glossario">
      <b>Conversão:</b> de cada 100 visitas, quantas viraram pedido pago — sem quem recusou os
      cookies, nas visitas e nos pedidos (o Google não vê quem recusa). <b>Ticket médio:</b> quanto
      cada pedido pago deixa, com o frete.
    </span>
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
      <CabecaDoBloco titulo={serie.titulo} ajuda="Só pedido pago conta, com o frete." />
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
      <CabecaDoBloco
        titulo="Produtos que mais venderam"
        ajuda="Em reais, no período — sem o frete."
      />
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
    <span className="fonte-dados">
      <b>De onde vêm os números:</b> visitas — Google Analytics, só as do endereço da loja (quem
      recusa os cookies fica de fora, então as visitas de verdade são um pouco mais; e o Google soma
      com algumas horas de atraso); pedidos e receita — a loja, só pedido pago.
    </span>
  )
}

/** "Um dia só é pouco pra concluir" — nas abas de análise, com um dia só no período (o protótipo). */
export function UmDiaEPouco() {
  return (
    <Faixa
      nivel="info"
      icone="relogio"
      titulo="Um dia só é pouco pra concluir"
      ajuda="Com os números de um dia, qualquer diferença pode ser acaso. Pra decidir, use 7 ou 30 dias."
      data-um-dia=""
    />
  )
}

const ICONE_DO_ACHADO: Record<Achado["tipo"], "alerta" | "check" | "grafico" | "relogio"> = {
  problema: "alerta",
  oportunidade: "grafico",
  bom: "check",
  info: "relogio",
}

/** O atalho de cada frase do Resumo pra aba de onde ela veio. */
const ATALHO: Record<AbaComAchados, string> = {
  funil: "Ver o funil",
  canais: "Ver os canais",
  produtos: "Ver os produtos",
  ofertas: "Ver as ofertas",
  clientes: "Ver os clientes",
  pagamento: "Ver pagamento e frete",
}

/**
 * O que os números querem dizer, em frase — cada aba começa por aqui (o
 * protótipo). No Resumo, cada frase vem com a aba de onde saiu (`aba`) e
 * ganha o atalho pra ela, no mesmo período.
 */
export function Achados({
  achados,
  p,
}: {
  achados: (Achado & { aba?: AbaComAchados | null })[]
  p?: PeriodoNaTela
}) {
  if (!achados.length) return null
  return (
    <div className={`achados${achados.length === 1 ? " achados--um" : ""}`} data-achados>
      {achados.map((a) => (
        <article
          className="achado"
          data-tipo={a.tipo}
          data-aba={a.aba ?? undefined}
          key={`${a.aba}:${a.titulo}`}
        >
          <span className="achado__ico">
            <Icone nome={ICONE_DO_ACHADO[a.tipo]} />
          </span>
          <div>
            <h3 className="achado__titulo">{a.titulo}</h3>
            <p className="achado__txt">{a.texto}</p>
            {a.aba && p ? (
              <Link
                className="link pequeno achado__atalho"
                href={daAba(ABAS.find(([aba]) => aba === a.aba)![2], p) as Route}
              >
                {ATALHO[a.aba]} →
              </Link>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  )
}

/** "Olhando os últimos 30 dias", "Olhando agosto", "Olhando de 14/09 a 20/09". */
function olhando(p: PeriodoNaTela): string {
  if (p.atalho === "hoje" || p.atalho === "ontem") return `Olhando ${p.atalho}`
  if (p.atalho === "7d" || p.atalho === "30d" || p.atalho === "90d")
    return `Olhando os ${p.nome.toLowerCase()}`
  if (p.atalho) return `Olhando ${p.nome.toLowerCase()}`
  return p.passo === "hora" ? `Olhando o dia ${p.nome}` : `Olhando de ${p.nome}`
}

function CabecaDoQueDizem({ p }: { p: PeriodoNaTela }) {
  return (
    <CabecaDoBloco
      titulo="O que os dados dizem"
      ajuda={`${olhando(p)}. Primeiro o que pede conserto, depois as oportunidades e o que vai bem.`}
    />
  )
}

/** Enquanto as contas de todas as abas correm. */
export function OQueOsDadosDizemCarregando({ p }: { p: PeriodoNaTela }) {
  return (
    <section className="bloco" data-bloco="o-que-dizem" data-carregando>
      <CabecaDoQueDizem p={p} />
      <p className="sem-dados">Juntando as frases de todas as abas…</p>
    </section>
  )
}

/**
 * O QUE OS DADOS DIZEM — as frases de todas as abas juntas, do que pede
 * conserto pro que vai bem, cada uma com o atalho pra aba dela (a regra e a
 * ordem são do backend: `lib/painel/marketing-achados.ts`). Chega à parte,
 * num `<Suspense>`: são as contas de todas as abas.
 */
export async function OQueOsDadosDizem({ consulta, p }: { consulta: string; p: PeriodoNaTela }) {
  const r = await lerAchadosDoMarketing(consulta)
  return (
    <section className="bloco" data-bloco="o-que-dizem">
      <CabecaDoQueDizem p={p} />
      {r ? (
        <>
          <Achados achados={r.achados} p={p} />
          {r.semGoogle ? (
            <p className="pequeno suave o-que-dizem__nota" data-sem-google={r.semGoogle}>
              Sem as frases do funil, dos canais e dos produtos: {SEM_VISITAS[r.semGoogle]}.
            </p>
          ) : null}
          {r.mais ? (
            <p className="pequeno suave o-que-dizem__nota" data-mais={r.mais}>
              Mais {r.mais} {r.mais === 1 ? "frase" : "frases"} nas abas.
            </p>
          ) : null}
        </>
      ) : (
        <p className="sem-dados">Não consegui juntar as frases agora. Recarregue daqui a pouco.</p>
      )}
    </section>
  )
}

/** Os três canais que mais venderam no período — no Resumo, do lado dos produtos. */
export async function CanaisQueMaisVenderam({
  consulta,
  p,
}: {
  consulta: string
  p: PeriodoNaTela
}) {
  const c = await lerCanais(consulta)
  const canais = c?.estado === "ok" ? c.canais.filter((l) => l.receita > 0).slice(0, 3) : []
  return (
    <section className="bloco" data-canais-do-resumo>
      <CabecaDoBloco
        titulo="Canais que mais venderam"
        ajuda="Das vendas que o Google Analytics viu."
      />
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
      <Link className="link pequeno" href={daAba("/marketing/canais", p) as Route}>
        Ver os canais →
      </Link>
    </section>
  )
}
