import type { Falha } from "./estado"

/**
 * O DISJUNTOR DOS PARCEIROS — quando um parceiro de pagamento está instável,
 * a loja para de mandar gente pra ele por uns minutos, e ele volta sozinho.
 * Código puro, com testes. Quem lê o banco é o serviço da observabilidade
 * (`terminadasDosParceiros`); quem anota e avisa é a porta do `complete`
 * (`lib/cartao/porta.ts`); quem escolhe o parceiro é a loja (`finalizar`),
 * perguntando ao Medusa (`GET /store/pagamento`).
 *
 * ┌─ INSTÁVEL É NÃO ATENDER ───────────────────────────────────────────────┐
 * │ Conta só a tentativa em que o parceiro NÃO ATENDEU (`Falha` "fora": sem │
 * │ resposta, tempo esgotado, 5xx, chave recusada). Cartão recusado pelo   │
 * │ banco, Pix que ele recusou e erro nosso não contam: o parceiro atendeu. │
 * │ Três dessas SEGUIDAS — sem nenhuma que deu certo no meio — e ele sai do │
 * │ caminho por 5 minutos, contados da última.                             │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * E VOLTA SOZINHO: passados os 5 minutos, a próxima compra vai pra ele de
 * novo. Deu certo, a queda acabou; falhou de novo, mais 5 minutos — e quem
 * comprava tem o Pix pelo outro parceiro no mesmo clique, só um pouco mais
 * lento. Com pouca venda, uma queda pode levar horas pra juntar três falhas
 * seguidas; por isso "seguidas" é entre as tentativas, não no relógio.
 *
 * O QUE A LOJA FAZ COM ISSO (`rotaDoPagamento`, em
 * `apps/loja/src/lib/checkout-visivel.ts`): o Pix pula o parceiro fora do
 * caminho, e o cartão (só no Pagar.me) sai da tela enquanto houver Pix por
 * outro parceiro. Com TODOS fora, nada sai do caminho — a loja segue
 * tentando, como antes do disjuntor existir: tirar o último parceiro seria
 * transformar um parceiro instável em loja sem pagamento nenhum.
 */

export const DISJUNTOR = {
  /** Falhas "fora" seguidas que tiram o parceiro do caminho. */
  falhas: 3,
  /** Quanto tempo ele fica fora, contado da última falha. */
  minutos: 5,
}

/**
 * Quanto tempo o parceiro fica fora, em ms. `PAGAMENTO_DISJUNTOR_SEGUNDOS`
 * existe pro conferidor não esperar 5 minutos (no mínimo 10 segundos); em
 * produção, ninguém põe.
 */
export function tempoFora(env: NodeJS.ProcessEnv = process.env): number {
  const segundos = Number(env.PAGAMENTO_DISJUNTOR_SEGUNDOS)
  return Number.isFinite(segundos) && segundos >= 10 ? segundos * 1000 : DISJUNTOR.minutos * 60_000
}

/**
 * Quanto o Pix espera a criação quando há outro parceiro esperando
 * (`reserva`, na entrada): o Pix nasce em um ou dois segundos nos dois
 * parceiros; dez é folga pro dia lento, e pouco pra quem está parado no
 * checkout com o outro parceiro pronto.
 */
export const PIX_COM_RESERVA_MS = 10_000

/** O erro do cliente de um parceiro (os dois têm os mesmos tipos) em `Falha`. */
export function falhaDoErro(
  tipo: "rede" | "servidor" | "validacao" | "autenticacao" | "nao_encontrado"
): Falha {
  return tipo === "validacao" ? "recusa" : "fora"
}

/* ── a saúde de cada parceiro ──────────────────────────────────────────── */

/** Uma tentativa que terminou (`obs_tentativa`), do parceiro `provedor`. */
export type Terminada = {
  provedor: string
  resultado: string
  motivo: string | null
  /** Quando terminou. */
  em: Date | string
}

/** O parceiro não atendeu: "erro" com o motivo "fora" ou "incerto" (`resultadoDaSessao`). */
export const naoAtendeu = (t: Pick<Terminada, "resultado" | "motivo">) =>
  t.resultado === "erro" && (t.motivo === "fora" || t.motivo === "incerto")

export type Saude = {
  id: string
  /** As falhas "fora" seguidas, da tentativa mais nova pra trás. */
  seguidas: number
  /** Em queda (`seguidas` chegou no limite): desde a primeira dessas falhas. */
  emQuedaDesde: Date | null
  /**
   * Fora do caminho até esta hora — o disjuntor aberto. `null` é no
   * caminho: o parceiro bem, ou em queda com os 5 minutos já passados (a
   * próxima tentativa é a que vê se ele voltou).
   */
  foraAte: Date | null
}

const quando = (v: Date | string) => (v instanceof Date ? v : new Date(v))

/** A saúde de um parceiro pelas tentativas dele que terminaram (em qualquer ordem). */
export function saudeDoParceiro(
  id: string,
  terminadas: readonly Terminada[],
  agora: Date,
  foraMs = tempoFora()
): Saude {
  const dele = terminadas
    .filter((t) => t.provedor === id)
    .sort((a, b) => quando(b.em).getTime() - quando(a.em).getTime())
  let seguidas = 0
  for (const t of dele) {
    if (!naoAtendeu(t)) break
    seguidas++
  }
  if (seguidas < DISJUNTOR.falhas) return { id, seguidas, emQuedaDesde: null, foraAte: null }
  const ate = new Date(quando(dele[0].em).getTime() + foraMs)
  return {
    id,
    seguidas,
    emQuedaDesde: quando(dele[seguidas - 1].em),
    foraAte: ate > agora ? ate : null,
  }
}

/** O que mudou com a tentativa que acabou de terminar: caiu, voltou, ou nada. */
export type Virada = { tipo: "caiu" } | { tipo: "voltou"; desde: Date } | null

export function virada(antes: Saude, depois: Saude): Virada {
  if (!antes.emQuedaDesde && depois.emQuedaDesde) return { tipo: "caiu" }
  if (antes.emQuedaDesde && !depois.emQuedaDesde) {
    return { tipo: "voltou", desde: antes.emQuedaDesde }
  }
  return null
}
