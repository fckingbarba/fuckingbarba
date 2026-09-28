import { chaveDoDia, dia, diaDaSemana } from "./formato"
import { meiaNoite, somarDias, type Janela } from "./marketing"
import { horaNoFuso } from "./visitas"

/**
 * O PERÍODO DO INÍCIO (entrega 0186) — o que a barra de cima escolhe: hoje,
 * ontem, os últimos 7 ou 30 dias, este mês, o mês passado ou as datas que a
 * pessoa quiser; e se compara com o período de antes.
 *
 * Código puro, com testes (`__tests__/periodo.unit.spec.ts`). Os dias são os
 * de Brasília (`chaveDoDia`); o período vai do começo do primeiro dia até o
 * fim do último — ou até agora, quando o último é hoje.
 *
 * ┌─ O DE ANTES ───────────────────────────────────────────────────────────┐
 * │ Tem o mesmo tamanho e termina logo antes do período. Quando o período  │
 * │ chega até agora, o de antes para na mesma hora do último dia dele: o   │
 * │ hoje pela metade não compete com um dia inteiro (a regra do Marketing, │
 * │ `janelasDo`). "Este mês" compara com o mês passado até o mesmo dia; "o │
 * │ mês passado", com o mês antes dele.                                    │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * O ENDEREÇO É O CONTRATO com o painel: `?periodo=ontem`, ou
 * `?de=2026-09-14&ate=2026-09-20` (as datas que a pessoa escolheu), e
 * `&comparar=nenhum` pra não comparar. O que não se lê vira "hoje", com um
 * aviso (`aviso`), e o painel mostra o período que valeu.
 *
 * OS BALDES DO GRÁFICO (`baldesDo`): um dia vai hora a hora; até 62 dias, dia
 * a dia; mais que isso, de semana em semana, contando de trás pra frente (a
 * semana mais velha fica com o que sobrar, como no Marketing). O de antes cai
 * nos mesmos baldes, pela posição: o 1º dia de antes com o 1º do período.
 */

const FUSO = "America/Sao_Paulo"
const DIA_MS = 24 * 60 * 60 * 1000

export const ATALHOS = ["hoje", "ontem", "7d", "30d", "mes", "mes-passado"] as const
export type Atalho = (typeof ATALHOS)[number]

/** Até quantos dias as datas escolhidas cobrem de uma vez (o de antes, outro tanto). */
export const MAXIMO_DE_DIAS = 186
/** Até quantos dias o gráfico vai dia a dia; acima, por semana. */
const DIAS_NO_GRAFICO = 62
/** A data mais velha que se pode escolher. */
const PRIMEIRO_DIA = "2020-01-01"

export type Passo = "hora" | "dia" | "semana"

/** Os dias de um lado (o período ou o de antes) e o instante em que ele começa e termina. */
export type Lado = { de: string; ate: string; dias: string[]; janela: Janela }

export type Periodo = {
  /** O botão escolhido; `null` quando são as datas da pessoa. */
  atalho: Atalho | null
  /** O primeiro e o último dia ("2026-09-27"), e todos, em ordem. */
  de: string
  ate: string
  dias: string[]
  /** Do começo do primeiro dia até o fim do último, ou até agora (`ateAgora`). */
  atual: Janela
  /** O último dia é hoje: o período vai até agora, e o de antes para na mesma hora. */
  ateAgora: boolean
  /** O de antes; `null` quando a pessoa escolheu não comparar. */
  antes: Lado | null
  passo: Passo
  /** "Hoje", "Ontem", "Últimos 7 dias", "Este mês", "Agosto", "14/09 a 20/09". */
  nome: string
  /** "domingo, 27/09" ou "22/09 a 28/09": os dias, pra dizer embaixo da barra. */
  datas: string
  /** "ontem", "26/09", "07/09 a 13/09", "julho"; `null` sem comparar. */
  nomeDoAntes: string | null
  /** Por que o período pedido não valeu (e virou hoje); `null` quando valeu. */
  aviso: string | null
}

/** Um número do período e o do de antes; `variacao` em %, `null` sem nada antes (ou sem comparar). */
export type Comparado = { valor: number; antes: number | null; variacao: number | null }

export type BuscaDoPeriodo = {
  periodo?: unknown
  de?: unknown
  ate?: unknown
  comparar?: unknown
}

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
]

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "")
const maiuscula = (t: string) => `${t[0]?.toUpperCase() ?? ""}${t.slice(1)}`

/** Os dias de `de` até `ate`, inclusive. */
export function diasEntre(de: string, ate: string): string[] {
  const dias: string[] = []
  for (let d = de; d <= ate; d = somarDias(d, 1)) dias.push(d)
  return dias
}

/** "2026-09-14" é um dia de verdade? (o 31/02 não é). */
function ehDia(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const t = Date.parse(`${v}T12:00:00Z`)
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v
}

/** Quantos dias tem o mês de "2026-09-14". */
function diasNoMes(chave: string): number {
  const [ano, mes] = chave.split("-").map(Number)
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate()
}

/** "14/09" no ano de hoje; "14/09/2025" em outro. */
function nomeDoDia(chave: string, hoje: string): string {
  const d = dia(meiaNoite(chave))
  return chave.slice(0, 4) === hoje.slice(0, 4) ? d : `${d}/${chave.slice(0, 4)}`
}

/** "14/09 a 20/09", ou "14/09" quando é um dia só. */
function nomeDosDias(de: string, ate: string, hoje: string): string {
  return de === ate ? nomeDoDia(de, hoje) : `${nomeDoDia(de, hoje)} a ${nomeDoDia(ate, hoje)}`
}

/** "domingo, 27/09" num dia só; "22/09 a 28/09" em mais. */
function datasDe(de: string, ate: string, hoje: string): string {
  if (de !== ate) return nomeDosDias(de, ate, hoje)
  const semana = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "long" }).format(
    meiaNoite(de)
  )
  return `${semana}, ${nomeDoDia(de, hoje)}`
}

type Montagem = {
  atalho: Atalho | null
  de: string
  ate: string
  antes: [string, string] | null
  nome: string
  nomeDoAntes: (antesDe: string, antesAte: string) => string
}

function montar(m: Montagem, agora: Date, aviso: string | null = null): Periodo {
  const hoje = chaveDoDia(agora)
  const ateAgora = m.ate === hoje
  // Quanto do dia de hoje já passou: o de antes para nessa mesma hora do último dia dele.
  const doDia = agora.getTime() - meiaNoite(hoje).getTime()
  const fimDo = (ultimo: string) =>
    ateAgora ? new Date(meiaNoite(ultimo).getTime() + doDia) : meiaNoite(somarDias(ultimo, 1))
  const dias = diasEntre(m.de, m.ate)
  const antes: Lado | null = m.antes
    ? {
        de: m.antes[0],
        ate: m.antes[1],
        dias: diasEntre(m.antes[0], m.antes[1]),
        janela: { de: meiaNoite(m.antes[0]), ate: fimDo(m.antes[1]) },
      }
    : null
  return {
    atalho: m.atalho,
    de: m.de,
    ate: m.ate,
    dias,
    atual: { de: meiaNoite(m.de), ate: ateAgora ? agora : meiaNoite(somarDias(m.ate, 1)) },
    ateAgora,
    antes,
    passo: dias.length === 1 ? "hora" : dias.length <= DIAS_NO_GRAFICO ? "dia" : "semana",
    nome: m.nome,
    datas: datasDe(m.de, m.ate, hoje),
    nomeDoAntes: antes ? m.nomeDoAntes(antes.de, antes.ate) : null,
    aviso,
  }
}

/** O período de um dos botões. */
function doAtalho(atalho: Atalho, agora: Date, comparar: boolean, aviso: string | null): Periodo {
  const hoje = chaveDoDia(agora)
  const intervalo = (antesDe: string, antesAte: string) => nomeDosDias(antesDe, antesAte, hoje)
  const ultimos = (n: number, nome: string): Montagem => ({
    atalho,
    de: somarDias(hoje, 1 - n),
    ate: hoje,
    antes: comparar ? [somarDias(hoje, 1 - 2 * n), somarDias(hoje, -n)] : null,
    nome,
    nomeDoAntes: intervalo,
  })
  switch (atalho) {
    case "hoje":
      return montar(
        {
          atalho,
          de: hoje,
          ate: hoje,
          antes: comparar ? [somarDias(hoje, -1), somarDias(hoje, -1)] : null,
          nome: "Hoje",
          nomeDoAntes: () => "ontem",
        },
        agora,
        aviso
      )
    case "ontem": {
      const ontem = somarDias(hoje, -1)
      return montar(
        {
          atalho,
          de: ontem,
          ate: ontem,
          antes: comparar ? [somarDias(hoje, -2), somarDias(hoje, -2)] : null,
          nome: "Ontem",
          nomeDoAntes: intervalo,
        },
        agora,
        aviso
      )
    }
    case "7d":
      return montar(ultimos(7, "Últimos 7 dias"), agora, aviso)
    case "30d":
      return montar(ultimos(30, "Últimos 30 dias"), agora, aviso)
    case "mes": {
      const primeiro = `${hoje.slice(0, 7)}-01`
      const doMesPassado = somarDias(primeiro, -1).slice(0, 7)
      // O mês passado até o mesmo dia (ou até o fim dele, se ele for mais curto).
      const ultimo = Math.min(Number(hoje.slice(8, 10)), diasNoMes(`${doMesPassado}-01`))
      return montar(
        {
          atalho,
          de: primeiro,
          ate: hoje,
          antes: comparar
            ? [`${doMesPassado}-01`, `${doMesPassado}-${String(ultimo).padStart(2, "0")}`]
            : null,
          nome: "Este mês",
          nomeDoAntes: intervalo,
        },
        agora,
        aviso
      )
    }
    case "mes-passado": {
      const fim = somarDias(`${hoje.slice(0, 7)}-01`, -1)
      const comeco = `${fim.slice(0, 7)}-01`
      const fimDoAnterior = somarDias(comeco, -1)
      return montar(
        {
          atalho,
          de: comeco,
          ate: fim,
          antes: comparar ? [`${fimDoAnterior.slice(0, 7)}-01`, fimDoAnterior] : null,
          nome: maiuscula(MESES[Number(comeco.slice(5, 7)) - 1]),
          nomeDoAntes: (antesDe) => MESES[Number(antesDe.slice(5, 7)) - 1],
        },
        agora,
        aviso
      )
    }
  }
}

/** As datas que a pessoa escolheu, conferidas — ou o porquê de não valerem. */
function datasEscolhidas(
  de: string,
  ate: string,
  hoje: string
): { de: string; ate: string } | string {
  if (!ehDia(de) || !ehDia(ate)) return "As datas não valem — mostrando hoje."
  let [primeiro, ultimo] = de <= ate ? [de, ate] : [ate, de]
  if (primeiro > hoje) return "O período começa depois de hoje — mostrando hoje."
  if (primeiro < PRIMEIRO_DIA) return "A data é antiga demais — mostrando hoje."
  if (ultimo > hoje) ultimo = hoje
  if (diasEntre(primeiro, ultimo).length > MAXIMO_DE_DIAS)
    return "Escolha até 6 meses de cada vez — mostrando hoje."
  return { de: primeiro, ate: ultimo }
}

/**
 * O período do endereço (`?periodo=`, ou `?de=` e `?ate=`, e `?comparar=`).
 * Sem nada, hoje contra ontem até a mesma hora.
 */
export function lerPeriodo(busca: BuscaDoPeriodo, agora: Date): Periodo {
  const hoje = chaveDoDia(agora)
  const comparar = texto(busca.comparar) !== "nenhum"
  const de = texto(busca.de)
  const ate = texto(busca.ate)
  if (de || ate) {
    const datas = datasEscolhidas(de || ate, ate || de, hoje)
    if (typeof datas === "string") return doAtalho("hoje", agora, comparar, datas)
    const n = diasEntre(datas.de, datas.ate).length
    return montar(
      {
        atalho: null,
        de: datas.de,
        ate: datas.ate,
        antes: comparar ? [somarDias(datas.de, -n), somarDias(datas.de, -1)] : null,
        nome: nomeDosDias(datas.de, datas.ate, hoje),
        nomeDoAntes: (antesDe, antesAte) => nomeDosDias(antesDe, antesAte, hoje),
      },
      agora
    )
  }
  const pedido = texto(busca.periodo)
  const atalho = (ATALHOS as readonly string[]).includes(pedido) ? (pedido as Atalho) : "hoje"
  return doAtalho(atalho, agora, comparar, null)
}

/** Algum parâmetro do período veio? (o painel de antes da 0186 não manda nenhum). */
export const pediuPeriodo = (busca: BuscaDoPeriodo) =>
  [busca.periodo, busca.de, busca.ate, busca.comparar].some((v) => texto(v))

/* ── os baldes do gráfico ─────────────────────────────────────────────────── */

/**
 * Uma barra do gráfico: `rotulo` embaixo (vazio pra não amontoar), `nome` o
 * completo ("9h", "24/09", "07/09 a 13/09") e `agora`, a desta hora (ou de hoje).
 */
export type Balde = { rotulo: string; nome: string; agora: boolean }

/** Quantos dias vão em cada balde, e onde começa cada um (os de semana, de trás pra frente). */
function gruposDe(n: number): number[] {
  const comecos: number[] = []
  for (let fim = n; fim > 0; fim -= 7) comecos.unshift(Math.max(0, fim - 7))
  return comecos
}

export function baldesDo(p: Periodo, agora: Date): Balde[] {
  const hoje = chaveDoDia(agora)
  if (p.passo === "hora") {
    const horaAgora = p.ateAgora ? horaNoFuso(agora, FUSO) : -1
    return Array.from({ length: 24 }, (_, h) => ({
      rotulo: h === horaAgora ? "agora" : h % 6 === 0 ? `${h}h` : "",
      nome: `${h}h`,
      agora: h === horaAgora,
    }))
  }
  if (p.passo === "dia") {
    const n = p.dias.length
    return p.dias.map((chave, i) => {
      const d = meiaNoite(chave)
      const ehHoje = chave === hoje
      const rotulo = ehHoje
        ? "hoje"
        : n <= 7
          ? `${diaDaSemana(d)} ${dia(d).slice(0, 2)}`
          : i % 7 === 0 && i < n - 3
            ? dia(d)
            : ""
      return { rotulo, nome: dia(d), agora: ehHoje }
    })
  }
  const comecos = gruposDe(p.dias.length)
  return comecos.map((c, i) => {
    const fim = i + 1 < comecos.length ? comecos[i + 1] - 1 : p.dias.length - 1
    const nome = `${dia(meiaNoite(p.dias[c]))} a ${dia(meiaNoite(p.dias[fim]))}`
    const agoraNele = p.ateAgora && fim === p.dias.length - 1
    return {
      rotulo: agoraNele ? "esta" : i % 3 === 0 && i < comecos.length - 2 ? nome.slice(0, 5) : "",
      nome,
      agora: agoraNele,
    }
  })
}

/**
 * Em que balde cai um dia (e uma hora, no passo "hora") do período — ou do de
 * antes, pela posição. -1: fora.
 */
export function baldeDoDia(p: Periodo, chave: string, hora: number, doAntes = false): number {
  const lado = doAntes ? p.antes?.dias : p.dias
  if (!lado) return -1
  const i = lado.indexOf(chave)
  if (i < 0 || i >= p.dias.length) return -1
  if (p.passo === "hora") return Number.isInteger(hora) && hora >= 0 && hora < 24 ? hora : -1
  if (p.passo === "dia") return i
  const comecos = gruposDe(p.dias.length)
  let balde = 0
  for (let k = 0; k < comecos.length; k++) if (i >= comecos[k]) balde = k
  return balde
}

/** Em que balde cai um instante (a venda, no fuso da loja). */
export const baldeDoInstante = (p: Periodo, d: Date, doAntes = false) =>
  baldeDoDia(p, chaveDoDia(d), horaNoFuso(d, FUSO), doAntes)

/**
 * O corte do Google: quando o período chega até agora, o Google só somou
 * até a hora `ate` de hoje (sem ela) — as vendas que se comparam com as
 * visitas param na mesma hora, nos dois lados. `null`: sem corte.
 */
export function janelasNoCorte(
  p: Periodo,
  ate: number | null
): { atual: Janela; antes: Janela | null } {
  if (!p.ateAgora || ate === null) return { atual: p.atual, antes: p.antes?.janela ?? null }
  const corte = (ultimo: string) => new Date(meiaNoite(ultimo).getTime() + ate * 60 * 60 * 1000)
  return {
    atual: { de: p.atual.de, ate: corte(p.ate) },
    antes: p.antes ? { de: p.antes.janela.de, ate: corte(p.antes.ate) } : null,
  }
}

/** Desde quando ler os pedidos: o começo do de antes (ou do período), com três dias de folga. */
export const lerDesde = (p: Periodo) =>
  new Date((p.antes?.janela.de ?? p.atual.de).getTime() - 3 * DIA_MS)
