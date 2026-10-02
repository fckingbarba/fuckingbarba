import type { Route } from "next"
import Link from "next/link"
import type { ReactNode } from "react"
import { Icone, type NomeDoIcone } from "@/components/icones"
import { Status } from "@/components/pedidos"
import { Ajuda, CabecaDoBloco, Forma, Fotos } from "@/components/visual"
import { reais } from "@/lib/pedidos"
import type {
  Comparado,
  InicioNoPeriodo,
  PassoDoCheckout,
  PeriodoNaTela,
  SaidasDoPagamento,
  Taxa,
  VisitasNoPeriodo,
} from "@/lib/periodo"
import { lerVisitasNoPeriodo, type RespostaDasVisitasNoPeriodo } from "@/lib/visitas"

/**
 * O INÍCIO NO PERÍODO (entrega 0186) — as peças que mudam com a barra de
 * cima, no desenho aprovado pelo dono
 * (<https://claude.ai/artifact/T18JBKKpWgHgyt3Zr4Cav6>): os quatro números
 * com o gráfico de cada um (barras do período, tracejado do de antes), o que
 * as visitas fizeram, o checkout passo a passo, as três taxas, os mais
 * vendidos, de onde vieram as visitas e os pedidos do período.
 *
 * Os dados são do `GET /dashboard/inicio?…` (as vendas, o checkout, os
 * pedidos) e do `GET /dashboard/visitas?…` (o Google, que chega depois: cada
 * peça dele mora num `<Suspense>`, e o resto não espera). O que o papel não
 * abre nem vem na resposta.
 */

const INTEIRO = new Intl.NumberFormat("pt-BR")
const vezes = (n: number, um: string, varios: string) =>
  `${INTEIRO.format(n)} ${n === 1 ? um : varios}`
const porcento = (v: number) => `${v.toFixed(2).replace(".", ",")}%`
const porcentoCurto = (v: number) => `${Math.round(v)}%`

/** Sem visitas pra mostrar: o porquê, numa linha (os mesmos estados das visitas do dia). */
const SEM_GOOGLE: Record<Exclude<RespostaDasVisitasNoPeriodo["estado"], "ok">, string> = {
  carregando: "perguntando ao Google…",
  desligado: "o Google Analytics ainda não está ligado",
  invalida: "a chave do Google Analytics não se lê",
  recusado: "o Google recusou a leitura",
  fora: "o Google não respondeu agora",
}

/* ── as peças pequenas ────────────────────────────────────────────────────── */

/** A seta da variação: verde subindo, vermelha descendo (o texto é o mesmo pro leitor de tela). */
export function Variacao({ v }: { v: number | null }) {
  if (v === null) return null
  const sobe = v >= 0
  return (
    <span className="variacao" data-rumo={sobe ? "sobe" : "desce"}>
      <Icone nome={sobe ? "cima" : "baixo"} />
      {`${sobe ? "+" : "−"}${Math.abs(v)}%`}
    </span>
  )
}

/**
 * As barras de um número, e o tracejado do de antes na mesma régua. SVG que
 * estica com a caixa (a linha fica fina em qualquer largura); o balde de
 * agora em amarelo. A descrição inteira vai no `aria-label`.
 */
function Barrinhas({
  valores,
  antes,
  agora,
  descricao,
}: {
  valores: number[]
  antes: (number | null)[] | null
  agora: number
  descricao: string
}) {
  const n = Math.max(valores.length, 1)
  const altura = 48
  const maior = Math.max(1, ...valores, ...(antes ?? []).map((a) => a ?? 0))
  const y = (v: number) => (altura - (v / maior) * (altura - 2)).toFixed(1)
  const pontos = (antes ?? [])
    .map((a, i) => (a === null ? null : `${i * 10 + 5},${y(a)}`))
    .filter(Boolean)
    .join(" ")
  return (
    <svg
      className="barrinhas"
      viewBox={`0 0 ${n * 10} ${altura}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={descricao}
    >
      {valores.map((v, i) =>
        v > 0 ? (
          <rect
            key={i}
            x={i * 10 + 1.5}
            y={y(v)}
            width={7}
            height={(altura - Number(y(v))).toFixed(1)}
            data-agora={i === agora ? "" : undefined}
          />
        ) : null
      )}
      {pontos ? <polyline points={pontos} vectorEffect="non-scaling-stroke" /> : null}
    </svg>
  )
}

/**
 * Embaixo do gráfico: o primeiro balde e o último ("0h … 23h", "22/09 …
 * hoje"); o de semana é "07/09 a 13/09" — fica o começo da primeira e o fim
 * da última.
 */
function Eixo({ barras }: { barras: { nome: string; rotulo: string }[] }) {
  if (barras.length < 2) return null
  const ultima = barras[barras.length - 1]
  const fim = ultima.rotulo === "hoje" ? "hoje" : ultima.nome.slice(-5)
  return (
    <span className="barrinhas__eixo" aria-hidden="true">
      <span>{barras[0].nome.slice(0, 5)}</span>
      <span>{fim}</span>
    </span>
  )
}

/** Como dizer o de antes ao lado de um número: "ontem", "em 26/09", "em julho" ou "antes". */
export function noAntes(p: PeriodoNaTela): string {
  if (!p.nomeDoAntes) return ""
  if (p.nomeDoAntes === "ontem") return p.ateAgora ? "ontem até esta hora" : "ontem"
  if (p.passo === "hora" || p.atalho === "mes-passado") return `em ${p.nomeDoAntes}`
  return "antes"
}

/** Um dos quatro números de cima: o valor, a variação, o de antes e o gráfico. */
function Cartao({
  dado,
  rotulo,
  icone,
  valor,
  comparado,
  antes,
  destaque = false,
  nota,
  children,
}: {
  dado: string
  rotulo: string
  icone: NomeDoIcone
  valor: string
  comparado: Comparado | null
  /** O de antes, escrito ("6", "R$ 741,90"); `null` sem comparar. */
  antes: string | null
  destaque?: boolean
  /** Uma frase curta a mais (o corte do Google). */
  nota?: string
  children?: ReactNode
}) {
  return (
    <div className={destaque ? "numero numero--destaque" : "numero"} data-numero={dado}>
      <span className="numero__ico">
        <Icone nome={icone} />
      </span>
      <p className="numero__rot">{rotulo}</p>
      <p className="numero__valor">{valor}</p>
      <div className="numero__pe">
        {comparado ? <Variacao v={comparado.variacao} /> : null}
        {antes !== null ? <span className="numero__antes">{antes}</span> : null}
        {nota ? <span className="numero__antes">{nota}</span> : null}
      </div>
      {children}
    </div>
  )
}

/** Duas barras deitadas, o período e o de antes (o ticket e as taxas: razão não se soma no tempo). */
function DuasBarras({
  agora,
  antes,
  rotuloAgora,
  rotuloAntes,
}: {
  agora: { valor: number; texto: string }
  antes: { valor: number; texto: string } | null
  rotuloAgora: string
  rotuloAntes: string
}) {
  const maior = Math.max(agora.valor, antes?.valor ?? 0, 0.0001)
  const largura = (v: number) => `${((v / maior) * 100).toFixed(1)}%`
  return (
    <span className="duas-barras">
      <span className="duas-barras__linha">
        <span>{rotuloAgora}</span>
        <span className="trilho">
          <i style={{ width: largura(agora.valor) }} />
        </span>
        <b className="num">{agora.texto}</b>
      </span>
      {antes ? (
        <span className="duas-barras__linha" data-antes>
          <span>{rotuloAntes}</span>
          <span className="trilho">
            <i style={{ width: largura(antes.valor) }} />
          </span>
          <b className="num">{antes.texto}</b>
        </span>
      ) : null}
    </span>
  )
}

/** Os rótulos curtos das duas barras: "27/09" e "26/09" num dia só; "período" e "antes" em mais. */
function rotulosDoPeriodo(p: PeriodoNaTela): [string, string] {
  if (p.passo !== "hora") return ["período", "antes"]
  const curto = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : "")
  return p.atalho === "hoje" ? ["hoje", "ontem"] : [curto(p.de), curto(p.antesDe)]
}

/* ── os quatro números ────────────────────────────────────────────────────── */

export function NumerosDoPeriodo({ n, visitas }: { n: InicioNoPeriodo; visitas: ReactNode }) {
  const p = n.periodo
  const agora = n.barras.findIndex((b) => b.agora)
  const deAntes = (f: (b: InicioNoPeriodo["barras"][number]) => number) =>
    p.comparar ? n.barras.map((b) => (b.antes ? f(b) : null)) : null
  const [rotuloAgora, rotuloAntes] = rotulosDoPeriodo(p)
  const descricao = (nome: string, f: (b: InicioNoPeriodo["barras"][number]) => string) =>
    `${nome} por ${p.passo === "hora" ? "hora" : p.passo === "dia" ? "dia" : "semana"}: ` +
    n.barras.map((b) => `${b.nome}, ${f(b)}`).join("; ")
  return (
    <div className="numeros numeros--periodo">
      {visitas}
      <Cartao
        dado="vendas"
        rotulo="Vendas"
        icone="pedidos"
        valor={INTEIRO.format(n.vendas.valor)}
        comparado={n.vendas}
        antes={n.vendas.antes === null ? null : `${INTEIRO.format(n.vendas.antes)} ${noAntes(p)}`}
      >
        <Barrinhas
          valores={n.barras.map((b) => b.pedidos)}
          antes={deAntes((b) => b.antes!.pedidos)}
          agora={agora}
          descricao={descricao("Vendas", (b) => vezes(b.pedidos, "venda", "vendas"))}
        />
        <Eixo barras={n.barras} />
      </Cartao>
      <Cartao
        dado="receita"
        rotulo="Receita"
        icone="grafico"
        destaque
        valor={reais(n.receita.valor)}
        comparado={n.receita}
        antes={n.receita.antes === null ? null : `${reais(n.receita.antes)} ${noAntes(p)}`}
      >
        <Barrinhas
          valores={n.barras.map((b) => b.receita)}
          antes={deAntes((b) => b.antes!.receita)}
          agora={agora}
          descricao={descricao("Receita", (b) => reais(b.receita))}
        />
        <Eixo barras={n.barras} />
      </Cartao>
      <Cartao
        dado="ticket"
        rotulo="Ticket médio"
        icone="etiqueta"
        valor={reais(n.ticket.valor)}
        comparado={n.ticket}
        antes={n.ticket.antes === null ? null : `${reais(n.ticket.antes)} ${noAntes(p)}`}
      >
        <DuasBarras
          agora={{ valor: n.ticket.valor, texto: reais(n.ticket.valor) }}
          antes={
            n.ticket.antes === null ? null : { valor: n.ticket.antes, texto: reais(n.ticket.antes) }
          }
          rotuloAgora={rotuloAgora}
          rotuloAntes={rotuloAntes}
        />
      </Cartao>
    </div>
  )
}

/** O número das visitas — do Google, num `<Suspense>` à parte (ele pode demorar). */
export function CartaoDasVisitas({ r, n }: { r: RespostaDasVisitasNoPeriodo; n: InicioNoPeriodo }) {
  const p = n.periodo
  if (r.estado !== "ok")
    return (
      <Cartao
        dado="visitas"
        rotulo="Visitas"
        icone="olho"
        valor={r.estado === "carregando" ? "…" : "—"}
        comparado={null}
        antes={null}
        nota={SEM_GOOGLE[r.estado]}
      />
    )
  const v = r.periodo
  const agora = n.barras.findIndex((b) => b.agora)
  const nota =
    v.ate === null
      ? undefined
      : v.ate === 0
        ? "o Google ainda está somando as de hoje"
        : `hoje, até as ${v.ate}h`
  return (
    <Cartao
      dado="visitas"
      rotulo="Visitas"
      icone="olho"
      valor={INTEIRO.format(v.visitas.valor)}
      comparado={v.visitas}
      antes={v.visitas.antes === null ? null : `${INTEIRO.format(v.visitas.antes)} ${noAntes(p)}`}
      nota={nota}
    >
      <Barrinhas
        valores={v.barras.map((b) => b.visitas)}
        antes={p.comparar ? v.barras.map((b) => b.antes) : null}
        agora={agora}
        descricao={
          `Visitas por ${p.passo === "hora" ? "hora" : p.passo === "dia" ? "dia" : "semana"}: ` +
          v.barras
            .map((b, i) => `${n.barras[i]?.nome ?? i}, ${INTEIRO.format(b.visitas)}`)
            .join("; ")
        }
      />
      <Eixo barras={n.barras} />
    </Cartao>
  )
}

export async function NumeroDasVisitasNoPeriodo({
  consulta,
  n,
}: {
  consulta: string
  n: InicioNoPeriodo
}) {
  return <CartaoDasVisitas r={await lerVisitasNoPeriodo(consulta)} n={n} />
}

/* ── o que as visitas fizeram e o checkout ────────────────────────────────── */

/** Uma linha de barra deitada: o nome, a barra (do tamanho do maior) e o número com a conta. */
function Linha({
  nome,
  n,
  maior,
  conta,
  tom,
}: {
  nome: string
  n: number
  maior: number
  conta: string
  tom?: "alvo" | "perda"
}) {
  return (
    <li className="degrau" data-tom={tom}>
      <span className="degrau__nome">{nome}</span>
      <span className="degrau__trilho" aria-hidden="true">
        <i
          style={{ width: `${n ? Math.max(1, (n / Math.max(maior, 1)) * 100).toFixed(1) : 0}%` }}
        />
      </span>
      <span className="degrau__n">
        <b className="num">{INTEIRO.format(n)}</b>
        <span>{conta}</span>
      </span>
    </li>
  )
}

const AJUDA_DO_GOOGLE =
  "Do Google Analytics, de todo mundo menos quem recusa os cookies: cada visita conta uma vez em cada passo. Hoje entra tudo o que o Google já contou; o de antes vai até a mesma hora. Antes da virada (27/09), as visitas eram as do site da Nuvemshop."

export async function OQueAsVisitasFizeram({ consulta }: { consulta: string }) {
  const r = await lerVisitasNoPeriodo(consulta)
  const c = r.estado === "ok" ? r.periodo.comportamento : undefined
  // Hoje o Google soma com atraso: o bloco diz até que hora (o checkout, dos carrinhos, vai até agora).
  const ate = r.estado === "ok" && r.periodo.ate ? ` · até as ${r.periodo.ate}h` : ""
  return (
    <section className="bloco" data-bloco="visitas-fizeram">
      <CabecaDoBloco
        titulo="O que as visitas fizeram"
        ajuda={AJUDA_DO_GOOGLE}
        lado={<span className="pilula pilula--suave">Google Analytics{ate}</span>}
      />
      {c ? (
        <ol className="degraus">
          <Linha nome="Visitas" n={c.visitas} maior={c.visitas} conta="todas" />
          {(
            [
              ["Viram uma categoria", c.categoria],
              ["Viram um produto", c.produto],
              ["Puseram na sacola", c.sacola],
            ] as const
          ).map(([nome, n], i) => (
            <Linha
              key={nome}
              nome={nome}
              n={n}
              maior={Math.max(c.visitas, n)}
              conta={c.visitas ? `${porcentoCurto((n / c.visitas) * 100)} das visitas` : "—"}
              tom={i === 2 ? "alvo" : undefined}
            />
          ))}
        </ol>
      ) : (
        <p className="sem-dados">
          {r.estado === "ok" ? "Sem visitas no período." : `${SEM_GOOGLE[r.estado]}.`}
        </p>
      )}
    </section>
  )
}

/** Onde cada passo perde gente — a frase da maior perda. */
const ONDE_SAEM = [
  "",
  "no contato (o e-mail e o CPF)",
  "na entrega",
  "no pagamento",
  "sem pagar (o Pix que venceu, o cartão recusado)",
]

type Motivo = { chave: string; nome: string; n: number; cor?: "erro" }

/**
 * POR QUE SAÍRAM NO PAGAMENTO (0244) — o que aconteceu por último em cada
 * carrinho que chegou no pagamento e não virou pedido. Os nomes do cartão são
 * os do bloco Cartão do Marketing (Pagamento e frete). Só o que aconteceu.
 */
function motivosDaSaida(s: SaidasDoPagamento): Motivo[] {
  const motivos: Motivo[] = [
    {
      chave: "banco",
      nome: "Cartão recusado pelo banco (saldo, limite)",
      n: s.recusado.banco,
      cor: "erro",
    },
    {
      chave: "antifraude",
      nome: "Cartão barrado pela análise de fraude",
      n: s.recusado.antifraude,
      cor: "erro",
    },
    { chave: "dados", nome: "Dados do cartão errados", n: s.recusado.dados, cor: "erro" },
    {
      chave: "na-tela",
      nome: "O cartão não passou da tela (o Pagar.me não validou)",
      n: s.naTela,
      cor: "erro",
    },
    { chave: "barrado", nome: "Barrados pela trava da loja (robô, limite do Pix)", n: s.barrado },
    {
      chave: "erro",
      nome: "Deu erro (o parceiro fora, o Pix que não gerou)",
      n: s.erro,
      cor: "erro",
    },
    { chave: "sem-tentar", nome: "Saíram sem tentar pagar", n: s.semTentar },
    {
      chave: "sem-registro",
      nome: "Sem registro (antes de 27/09 ou há mais de 30 dias)",
      n: s.semRegistro,
    },
  ]
  return motivos.filter((m) => m.n > 0)
}

function PorQueSairam({ s }: { s: SaidasDoPagamento }) {
  return (
    <div className="saidas" data-saidas={s.total}>
      <h3 className="rotulo saidas__rotulo">
        Por que {vezes(s.total, "saiu", "saíram")} no pagamento
      </h3>
      <ul className="barras-h" data-barras="saidas">
        {motivosDaSaida(s).map((m) => (
          <li key={m.chave} data-saida={m.chave}>
            <span className="barras-h__nome">{m.nome}</span>
            <span className="barras-h__num">
              {INTEIRO.format(m.n)} <small>· {porcentoCurto((m.n / s.total) * 100)}</small>
            </span>
            <span className="barras-h__trilho">
              <i style={{ width: `${((m.n / s.total) * 100).toFixed(1)}%` }} data-cor={m.cor} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function NoCheckout({
  passos,
  saidas,
}: {
  passos: PassoDoCheckout[]
  saidas: SaidasDoPagamento | null
}) {
  const comeco = passos[0]?.n ?? 0
  const pior = passos.findIndex((p) => p.pior)
  return (
    <section className="bloco" data-bloco="checkout">
      <CabecaDoBloco
        titulo="No checkout"
        ajuda="Os carrinhos da loja criados no período — de todo mundo, com cookie ou sem. Cada passo conta quem chegou nele; o aviso amarelo é o passo com a maior taxa de saída. O carrinho de antes de a loja marcar a abertura do checkout (fim de setembro de 2026) começa a contar do e-mail. Por que saíram no pagamento: a última coisa que aconteceu em cada carrinho que chegou lá e não virou pedido — a recusa do cartão, o erro, ou nenhuma tentativa."
        lado={<span className="pilula pilula--suave">carrinhos da loja</span>}
      />
      {comeco ? (
        <>
          <ol className="degraus">
            {passos.map((p, i) => (
              <Linha
                key={p.nome}
                nome={p.nome}
                n={p.n}
                maior={comeco}
                conta={
                  i === 0
                    ? "o começo"
                    : p.taxa === null
                      ? "—"
                      : `${p.taxa}%${passos[i - 1].n > p.n ? ` · ${INTEIRO.format(passos[i - 1].n - p.n)} saíram` : ""}`
                }
                tom={p.pior ? "perda" : i === passos.length - 1 ? "alvo" : undefined}
              />
            ))}
          </ol>
          {pior > 0 ? (
            <p className="degraus__nota" data-maior-perda>
              <b>
                {INTEIRO.format(passos[pior - 1].n - passos[pior].n)} de{" "}
                {INTEIRO.format(passos[pior - 1].n)} saíram {ONDE_SAEM[pior]}
              </b>{" "}
              — a maior taxa de saída do período.
            </p>
          ) : null}
          {saidas && saidas.total > 0 ? <PorQueSairam s={saidas} /> : null}
        </>
      ) : (
        <p className="sem-dados">Nenhum checkout no período.</p>
      )}
    </section>
  )
}

/* ── as taxas ─────────────────────────────────────────────────────────────── */

function CartaoDaTaxa({
  dado,
  titulo,
  ajuda,
  taxa,
  conta,
  p,
}: {
  dado: string
  titulo: string
  ajuda: string
  taxa: Taxa | null
  conta: string
  p: PeriodoNaTela
}) {
  const [rotuloAgora, rotuloAntes] = rotulosDoPeriodo(p)
  return (
    <div className="taxa" data-taxa={dado}>
      <div className="taxa__topo">
        <p className="numero__rot">{titulo}</p>
        <Ajuda>{ajuda}</Ajuda>
      </div>
      <p className="taxa__valor">
        <b className="num">{taxa?.valor === null || !taxa ? "—" : porcento(taxa.valor)}</b>
        {taxa ? <Variacao v={taxa.variacao} /> : null}
      </p>
      <p className="taxa__conta">{conta}</p>
      {taxa && taxa.valor !== null ? (
        <DuasBarras
          agora={{ valor: taxa.valor, texto: porcento(taxa.valor) }}
          antes={
            p.comparar && taxa.antes !== null
              ? { valor: taxa.antes, texto: porcento(taxa.antes) }
              : null
          }
          rotuloAgora={rotuloAgora}
          rotuloAntes={rotuloAntes}
        />
      ) : null}
    </div>
  )
}

export async function TaxasDoGoogle({ consulta, p }: { consulta: string; p: PeriodoNaTela }) {
  const r = await lerVisitasNoPeriodo(consulta)
  const t = r.estado === "ok" ? r.periodo.taxas : undefined
  const semGoogle = r.estado === "ok" ? "sem visitas no período" : SEM_GOOGLE[r.estado]
  // As vendas da taxa param na hora que o Google já somou hoje, como as visitas.
  const ate = r.estado === "ok" && r.periodo.ate ? `, até as ${r.periodo.ate}h` : ""
  // As que entraram depois do corte (as do card Vendas): "(4 no dia)".
  const noPeriodo = t?.compraram.noPeriodo
  const todas =
    ate && t && noPeriodo !== undefined && noPeriodo > t.compraram.de
      ? ` (${INTEIRO.format(noPeriodo)} ${p.passo === "hora" ? "no dia" : "no período"})`
      : ""
  return (
    <>
      <CartaoDaTaxa
        dado="compraram"
        titulo="Visitas que compraram"
        ajuda="Todas as vendas pagas (das duas lojas) divididas por todas as visitas do Google, até agora; o de antes, até a mesma hora. Quem recusa os cookies compra sem virar visita: o número real é um pouco menor — o do Marketing conta só as compras que o Google viu."
        taxa={t?.compraram ?? null}
        conta={
          t
            ? `${vezes(t.compraram.de, "venda", "vendas")} em ${vezes(t.compraram.em, "visita", "visitas")}${ate}${todas}`
            : semGoogle
        }
        p={p}
      />
      <CartaoDaTaxa
        dado="sacola"
        titulo="Visitas que puseram na sacola"
        ajuda="Das visitas do período, quantas puseram algum produto na sacola — as duas contas do Google Analytics. O de antes vai até a mesma hora."
        taxa={t?.sacola ?? null}
        conta={
          t
            ? `${vezes(t.sacola.de, "sacola", "sacolas")} em ${vezes(t.sacola.em, "visita", "visitas")}${ate}`
            : semGoogle
        }
        p={p}
      />
    </>
  )
}

export function TaxaDasTaxasCarregando() {
  return (
    <>
      <div className="taxa" data-taxa="compraram" data-carregando>
        <p className="numero__rot">Visitas que compraram</p>
        <p className="taxa__valor">
          <b>…</b>
        </p>
        <p className="taxa__conta">{SEM_GOOGLE.carregando}</p>
      </div>
      <div className="taxa" data-taxa="sacola" data-carregando>
        <p className="numero__rot">Visitas que puseram na sacola</p>
        <p className="taxa__valor">
          <b>…</b>
        </p>
        <p className="taxa__conta">{SEM_GOOGLE.carregando}</p>
      </div>
    </>
  )
}

/** De quem começou o checkout, quantos pagaram (em %, duas casas); `null` sem ninguém. */
const pagaramDe = (passos: PassoDoCheckout[]) => {
  const comecaram = passos[0]?.n ?? 0
  const pagaram = passos[passos.length - 1]?.n ?? 0
  return {
    comecaram,
    pagaram,
    valor: comecaram ? Math.round((pagaram / comecaram) * 10_000) / 100 : null,
  }
}

/** A taxa dos carrinhos: de quem começou o checkout, quantos pagaram — e o mesmo no de antes. */
export function TaxaDoCheckout({
  passos,
  antes,
  p,
}: {
  passos: PassoDoCheckout[]
  antes: PassoDoCheckout[] | null
  p: PeriodoNaTela
}) {
  const { comecaram, pagaram, valor } = pagaramDe(passos)
  const deAntes = antes ? pagaramDe(antes).valor : null
  const variacao =
    valor !== null && deAntes !== null && deAntes > 0
      ? Math.round(((valor - deAntes) / deAntes) * 100)
      : null
  return (
    <CartaoDaTaxa
      dado="checkout"
      titulo="Checkouts que viraram venda"
      ajuda="Dos carrinhos que começaram o checkout no período, quantos foram pagos — de todo mundo, com cookie ou sem."
      taxa={{ valor, antes: deAntes, variacao, de: pagaram, em: comecaram }}
      conta={`${vezes(pagaram, "venda", "vendas")} em ${vezes(comecaram, "checkout", "checkouts")}`}
      p={p}
    />
  )
}

/* ── embaixo: os mais vendidos, de onde vieram e os pedidos ───────────────── */

export function MaisVendidosNoPeriodo({ n }: { n: InicioNoPeriodo }) {
  const maior = Math.max(...n.maisVendidos.map((i) => i.unidades), 1)
  return (
    <section className="bloco" data-bloco="mais-vendidos">
      <CabecaDoBloco
        titulo="Mais vendidos"
        ajuda={
          "Em unidades, dos pedidos pagos do período." +
          (n.daNuvemshop
            ? ` Antes da virada (27/09), das vendas da Nuvemshop que o CRM guardou (${vezes(n.daNuvemshop, "pedido", "pedidos")} no período).`
            : "")
        }
        lado={<span className="pilula">unidades</span>}
      />
      {n.maisVendidos.length ? (
        <ol className="ranking">
          {n.maisVendidos.map((i, k) => (
            <li key={i.nome}>
              <b className="num">{k + 1}</b>
              <span className={`foto${i.imagem ? "" : " foto--vazia"}`}>
                {i.imagem ? (
                  // eslint-disable-next-line @next/next/no-img-element -- foto do Medusa, de qualquer host
                  <img src={i.imagem} alt="" loading="lazy" />
                ) : (
                  <Icone nome="produtos" />
                )}
              </span>
              <span className="ranking__miolo">
                <span className="ranking__nome">
                  <span className="mini__titulo">{i.nome}</span>
                  <span className="num">{i.unidades}</span>
                </span>
                <span className="ranking__trilho" aria-hidden="true">
                  <i style={{ width: `${((i.unidades / maior) * 100).toFixed(1)}%` }} />
                </span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="vazio vazio--curto">Nenhuma venda paga no período.</p>
      )}
    </section>
  )
}

export async function DeOndeVieram({ consulta }: { consulta: string }) {
  const r = await lerVisitasNoPeriodo(consulta)
  const v: VisitasNoPeriodo | null = r.estado === "ok" ? r.periodo : null
  const origens = v?.origens ?? []
  const total = origens.reduce((s, o) => s + o.visitas, 0)
  const maior = Math.max(...origens.map((o) => o.visitas), 1)
  return (
    <section className="bloco" data-bloco="origens">
      <CabecaDoBloco
        titulo="De onde vieram"
        ajuda="As visitas do período pela origem que o Google Analytics viu: rede social, busca, direto (quem digitou o endereço ou veio de um app que não diz de onde)."
        lado={
          typeof v?.agora === "number" ? (
            <span className="agora" title="Nos últimos 30 minutos">
              <i />
              {INTEIRO.format(v.agora)} no site agora
            </span>
          ) : null
        }
      />
      {origens.length ? (
        <ul className="barras-h">
          {origens.map((o) => (
            <li key={o.nome}>
              <span className="barras-h__nome">{o.nome}</span>
              <span className="barras-h__num">
                {INTEIRO.format(o.visitas)}
                {total ? <small> · {porcentoCurto((o.visitas / total) * 100)}</small> : null}
              </span>
              <span className="barras-h__trilho" aria-hidden="true">
                <i style={{ width: `${((o.visitas / maior) * 100).toFixed(1)}%` }} />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="sem-dados">
          {r.estado === "ok" ? "Sem visitas no período." : `${SEM_GOOGLE[r.estado]}.`}
        </p>
      )}
    </section>
  )
}

/** "Pedidos de hoje", "Pedidos de ontem", "Pedidos de 27/09" ou "Pedidos do período". */
function tituloDosPedidos(p: PeriodoNaTela): string {
  if (p.atalho === "hoje") return "Pedidos de hoje"
  if (p.atalho === "ontem") return "Pedidos de ontem"
  if (p.passo === "hora") return `Pedidos de ${p.de.slice(8, 10)}/${p.de.slice(5, 7)}`
  return "Pedidos do período"
}

export function PedidosDoPeriodo({ n }: { n: InicioNoPeriodo }) {
  const pedidos = n.pedidos
  if (!pedidos) return null
  const resto = pedidos.total - pedidos.lista.length
  return (
    <section className="bloco" data-bloco="pedidos-do-periodo">
      <div className="bloco__cabeca">
        <span className="bloco__titulos">
          <h2 className="bloco__titulo">{tituloDosPedidos(n.periodo)}</h2>
          {pedidos.total ? <span className="contagem num">{pedidos.total}</span> : null}
        </span>
        <Link className="link pequeno" href="/pedidos">
          Ver todos
        </Link>
      </div>
      {pedidos.lista.length ? (
        <>
          <div className="mini mini--fotos">
            {pedidos.lista.map((l) => (
              <Link key={l.id} href={`/pedidos/${l.id}` as Route}>
                <Fotos fotos={l.fotos} produtos={l.produtos} rotulo={l.itens} />
                <span className="mini__meio">
                  <p className="mini__titulo">
                    #{l.numero} · {l.cliente.nome}
                  </p>
                  <p className="mini__txt">
                    <Forma forma={l.forma} />
                    {l.quando.replace("hoje, ", "")}
                  </p>
                </span>
                <span className="mini__lado">
                  <span className="num">{reais(l.total)}</span>
                  <Status p={l} />
                </span>
              </Link>
            ))}
          </div>
          {resto > 0 ? (
            <p className="pedidos-do-periodo__mais">
              <Link className="link pequeno" href="/pedidos">
                +{vezes(resto, "pedido", "pedidos")} em Pedidos
              </Link>
            </p>
          ) : null}
        </>
      ) : (
        <p className="vazio vazio--curto">
          Nenhum pedido da loja nova no período.
          {n.daNuvemshop ? " As vendas da Nuvemshop entram nos números, mas não nesta lista." : ""}
        </p>
      )}
    </section>
  )
}

/** Enquanto o Google responde: o bloco com o título, e a frase de espera. */
export function BlocoEsperandoOGoogle({ titulo, dado }: { titulo: string; dado: string }) {
  return (
    <section className="bloco" data-bloco={dado} data-carregando>
      <CabecaDoBloco titulo={titulo} />
      <p className="sem-dados">{SEM_GOOGLE.carregando}</p>
    </section>
  )
}
