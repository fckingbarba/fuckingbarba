import { DISJUNTOR, naoAtendeu } from "../pagamento/disjuntor"
import { PARCEIROS } from "../pagamento/parceiros"
import { duracao, minutosEntre } from "./formato"
import { dentro, type Janela } from "./marketing"
import type { Achado } from "./marketing-canais"
import { pagamentoDo, type PedidoCru } from "./pedido"

/**
 * OS PARCEIROS DE PAGAMENTO, LADO A LADO — o ranking do Pix reserva (parte 4,
 * entrega 0150+): quem gera o Pix, quem deixa de gerar, quanto demora, e
 * quantas vezes cada um ficou fora do ar. No Marketing → Pagamento e frete,
 * acima do cartão. Código puro, com testes
 * (`__tests__/marketing-parceiros.unit.spec.ts`).
 *
 * ┌─ DE ONDE SAI CADA NÚMERO ──────────────────────────────────────────────┐
 * │ • GERADOS e PAGOS: os pedidos do período no Pix, pelo parceiro da      │
 * │   sessão (`pagamentoDo`) — os mesmos do bloco "Pix" ao lado, só que    │
 * │   separados: somados, dão os de lá. Todo Pix gerado vira pedido.       │
 * │ • NÃO GERARAM, o tempo pra gerar, SEM RESPOSTA e FORA DO AR: as        │
 * │   tentativas que a porta do `complete` anota com o parceiro           │
 * │   (`obs_tentativa`, desde a 0150). O Pix que não nasceu não vira       │
 * │   pedido — só existe ali.                                              │
 * │ • FORA DO AR é a regra do disjuntor (`lib/pagamento/disjuntor.ts`):    │
 * │   três tentativas seguidas sem resposta, até a primeira que ele        │
 * │   atendeu (ou até agora).                                              │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * SEM VENCEDOR SEM VOLUME: "quem gera mais Pix" só sai com pelo menos
 * `MINIMO_PRA_COMPARAR` tentativas de Pix em cada um. Com a reserva, isso
 * pode nunca acontecer — o Mercado Pago só cobra quando o Pagar.me falha —,
 * e está certo: meia dúzia de Pix não diz qual parceiro é melhor.
 *
 * O CARTÃO NÃO ENTRA: só o Pagar.me passa cartão, e os números dele estão no
 * bloco "Cartão" ao lado. Se um dia outro parceiro passar cartão, a
 * comparação entra aqui.
 */

/** Uma tentativa de pagar que terminou no período, com o parceiro (`obs_tentativa`). */
export type TentativaDoPeriodo = {
  provedor: string
  forma: string
  resultado: string
  motivo: string | null
  /** Quando foi pro `complete`. */
  inicio: Date | string
  /** Quando a resposta saiu. */
  fim: Date | string
}

export type ParceiroNoRanking = {
  id: string
  nome: string
  /** Cobrou alguma coisa no período, ou foi tentado. */
  usado: boolean
  pix: {
    /** Os pedidos do período no Pix por ele. */
    gerados: number
    pagos: number
    /** As tentativas de Pix que não geraram o QR (ele não respondeu, ou recusou). */
    naoGeraram: number
    /** Do clique ao QR, em segundos (a mediana das que geraram). */
    praGerar: number | null
    /** Do pedido ao pagamento, em minutos (a mediana dos pagos). */
    atePagar: number | null
  }
  /** Tentativas (Pix e cartão) em que ele não respondeu. */
  semResposta: number
  /** As quedas do período: quantas, e quanto tempo fora ao todo. */
  fora: { vezes: number; minutos: number }
}

export type RankingDosParceiros = {
  parceiros: ParceiroNoRanking[]
  /** Quem gerou mais Pix, quando cada um teve volume pra comparar. */
  melhorNoPix: { nome: string; parte: number; outro: string; parteDoOutro: number } | null
}

/** Abaixo disso de tentativas de Pix num parceiro, a comparação é acaso. */
export const MINIMO_PRA_COMPARAR = 10

const quando = (v: Date | string) => (v instanceof Date ? v : new Date(v))

/** "10 min", "1 h 05" — e a queda de segundos, que o minuto redondo diria "0 min". */
const tempoFora = (minutos: number) => (minutos < 1 ? "menos de 1 min" : duracao(minutos))

const arredondar = (v: number | null, casas: number) =>
  v === null ? null : Math.round(v * 10 ** casas) / 10 ** casas

function mediana(valores: number[]): number | null {
  if (!valores.length) return null
  const v = [...valores].sort((a, b) => a - b)
  const meio = Math.floor(v.length / 2)
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2
}

export type Queda = { de: Date; ate: Date }

/**
 * As quedas de um parceiro, pelas tentativas dele em ordem: três seguidas
 * sem resposta começam uma (na primeira delas); a primeira que não é "sem
 * resposta" acaba (quando a resposta saiu). A que não acabou vai até `fim`.
 */
function quedasDe(tentativas: TentativaDoPeriodo[], fim: Date): Queda[] {
  const quedas: Queda[] = []
  let seguidas: TentativaDoPeriodo[] = []
  for (const t of tentativas) {
    if (naoAtendeu(t)) {
      seguidas.push(t)
      continue
    }
    if (seguidas.length >= DISJUNTOR.falhas) {
      quedas.push({ de: quando(seguidas[0].inicio), ate: quando(t.fim) })
    }
    seguidas = []
  }
  if (seguidas.length >= DISJUNTOR.falhas) quedas.push({ de: quando(seguidas[0].inicio), ate: fim })
  return quedas
}

/**
 * O ranking do período: os pedidos (a mesma lista do Pagamento) e as
 * tentativas anotadas. As quedas de cada parceiro saem à parte (`quedas`),
 * pro achado — na resposta vão só as contas.
 */
export function rankingDosParceiros(
  pedidos: PedidoCru[],
  tentativas: TentativaDoPeriodo[],
  j: Janela,
  agora: Date
): { ranking: RankingDosParceiros; quedas: Map<string, Queda[]> } {
  const pixDoPeriodo = pedidos
    .filter((o) => dentro(new Date(o.created_at), j))
    .map((o) => ({ o, p: pagamentoDo(o) }))
    .filter(({ p }) => p.forma === "pix")
  const emOrdem = [...tentativas].sort((a, b) => quando(a.fim).getTime() - quando(b.fim).getTime())
  const fim = agora < j.ate ? agora : j.ate

  const quedas = new Map<string, Queda[]>()
  const parceiros = PARCEIROS.map((parceiro): ParceiroNoRanking => {
    const pedidosDele = pixDoPeriodo.filter(({ p }) => p.parceiro === parceiro.nome)
    const pagos = pedidosDele.filter(({ p }) => p.pagoEm)
    const dele = emOrdem.filter((t) => t.provedor === parceiro.id)
    const pixDele = dele.filter((t) => t.forma === "pix")
    const geraram = pixDele.filter((t) => t.resultado === "gerado")
    const quedasDele = quedasDe(dele, fim)
    quedas.set(parceiro.id, quedasDele)
    return {
      id: parceiro.id,
      nome: parceiro.nome,
      usado: pedidosDele.length > 0 || dele.length > 0,
      pix: {
        gerados: pedidosDele.length,
        pagos: pagos.length,
        naoGeraram: pixDele.filter((t) => t.resultado === "erro").length,
        praGerar: arredondar(
          mediana(
            geraram.map((t) => (quando(t.fim).getTime() - quando(t.inicio).getTime()) / 1000)
          ),
          1
        ),
        atePagar: arredondar(
          mediana(pagos.map(({ o, p }) => minutosEntre(o.created_at, p.pagoEm!))),
          0
        ),
      },
      semResposta: dele.filter(naoAtendeu).length,
      fora: {
        vezes: quedasDele.length,
        minutos: quedasDele.reduce((s, q) => s + minutosEntre(q.de, q.ate), 0),
      },
    }
  })

  const comVolume = parceiros
    .map((p) => ({ p, tentativas: p.pix.gerados + p.pix.naoGeraram }))
    .filter((x) => x.tentativas >= MINIMO_PRA_COMPARAR)
    .map((x) => ({ nome: x.p.nome, parte: Math.round((x.p.pix.gerados / x.tentativas) * 100) }))
    .sort((a, b) => b.parte - a.parte)
  const [primeiro, segundo] = comVolume
  const melhorNoPix =
    primeiro && segundo && primeiro.parte > segundo.parte
      ? {
          nome: primeiro.nome,
          parte: primeiro.parte,
          outro: segundo.nome,
          parteDoOutro: segundo.parte,
        }
      : null

  return { ranking: { parceiros, melhorNoPix }, quedas }
}

/**
 * O que o ranking quer dizer: o parceiro que ficou fora do ar no período — e
 * se o Pix saiu por outro nesse tempo (as tentativas que geraram, dentro das
 * quedas).
 */
export function achadosDosParceiros(
  r: RankingDosParceiros,
  quedas: Map<string, Queda[]>,
  tentativas: TentativaDoPeriodo[]
): Achado[] {
  return r.parceiros.flatMap((p): Achado[] => {
    if (!p.fora.vezes) return []
    const dele = quedas.get(p.id) ?? []
    const pelosOutros = tentativas.filter(
      (t) =>
        t.provedor !== p.id &&
        t.forma === "pix" &&
        t.resultado === "gerado" &&
        dele.some((q) => quando(t.fim) >= q.de && quando(t.fim) <= q.ate)
    )
    const outro = r.parceiros.find((x) => x.id === pelosOutros[0]?.provedor)?.nome
    const vezes = p.fora.vezes === 1 ? "1 vez" : `${p.fora.vezes} vezes`
    return [
      {
        tipo: "problema",
        titulo: `O ${p.nome} ficou fora do ar ${vezes} no período (${tempoFora(p.fora.minutos)})`,
        texto:
          (outro
            ? `Nesse tempo, ${pelosOutros.length} ${pelosOutros.length === 1 ? "Pix saiu" : "Pix saíram"} pelo ${outro}. `
            : "") +
          `Três tentativas seguidas sem resposta tiram o parceiro do caminho por ${DISJUNTOR.minutos} ` +
          `minutos. Se virar rotina, vale chamar o suporte do ${p.nome}.`,
      },
    ]
  })
}
