import { createHmac } from "node:crypto"
import { RECUSAS } from "../../modules/pagarme/situacao"
import type { Estado } from "../pagamento/estado"
import { ehParceiro, estadoDaSessao, PAGARME } from "../pagamento/parceiros"

/**
 * O ROBÔ TESTANDO CARTÃO — quando uma tentativa de pagar com cartão vai pro
 * Pagar.me, e quando é barrada antes. Código puro, com testes; quem lê o
 * banco e responde é a porta (`lib/cartao/porta.ts`).
 *
 * ┌─ O GOLPE ──────────────────────────────────────────────────────────────┐
 * │ Quem compra uma lista de cartões roubados não sabe quais ainda         │
 * │ funcionam. Pra descobrir, põe um robô numa loja pequena: o produto     │
 * │ mais barato na sacola, dados falsos, e um cartão atrás do outro. Cada  │
 * │ tentativa pede autorização ao banco — o "sim" diz que o cartão é bom.  │
 * │ Pra loja, são centenas de recusas no nome dela: o Pagar.me e as        │
 * │ bandeiras vigiam isso, e a conta pode ser segurada ou bloqueada. E o   │
 * │ cartão roubado que passa vira pedido, e depois contestação.            │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * AS TRÊS TRAVAS, da mais estreita pra mais larga:
 *
 *   - POR SACOLA e POR PESSOA (o IP que a loja manda, assinado): quem erra o
 *     cartão tenta de novo duas, três vezes; o robô, dezenas. O limite fica
 *     acima de qualquer engano de gente;
 *   - O QUE CHEGA SEM A ASSINATURA DA LOJA, tudo junto: a loja sempre assina
 *     (`x-loja-segredo`), então quem chega sem ela pulou a loja — é robô
 *     falando direto com o Medusa, ou o segredo errado entre a Vercel e o
 *     Railway. Um balde pequeno, pros dois casos: o robô quase não passa, e
 *     o segredo errado não fecha o cartão da loja inteira (o log e a
 *     Observabilidade apontam);
 *   - O FREIO, a loja toda: muita recusa, e quase só recusa, em pouco tempo.
 *     É o que pega o robô que troca de IP e de sacola a cada tentativa — as
 *     duas primeiras travas não veem esse. Com o freio ligado, a loja toda
 *     passa poucas tentativas de cartão por vez, e o dono recebe um e-mail.
 *     O Pix não passa por nada disso: Pix não testa cartão.
 *
 * O QUE CONTA É O QUE FOI PRO PAGAR.ME. A tentativa barrada aqui não conta
 * pra trava seguinte (senão o robô batendo na porta manteria a porta
 * fechada pra sempre), e a que parou antes do Pagar.me (estoque que acabou)
 * também não. A em andamento conta: é assim que duas tentativas ao mesmo
 * tempo não passam juntas pelo último lugar da fila.
 */

/** O provedor do Pagar.me, como o Medusa chama (o registro em `lib/pagamento/parceiros.ts`). */
export const PROVEDOR_DO_PAGARME = PAGARME.id

export const LIMITES = {
  /** Uma sacola, na última hora. */
  carrinho: { vezes: 5, minutos: 60 },
  /** Uma pessoa (o IP que a loja manda, assinado), na última hora. */
  pessoa: { vezes: 8, minutos: 60 },
  /** Tudo que chegou sem a assinatura da loja, junto, na última hora. */
  diretas: { vezes: 3, minutos: 60 },
  /**
   * O freio: 8 recusas nos últimos 30 minutos, e pelo menos 3 de cada 4 das
   * que terminaram (aprovadas, em análise, recusadas). As duas condições: 8
   * recusas numa hora boa de Black Friday, com as vendas passando no meio,
   * não é robô.
   */
  freio: { recusas: 8, parte: 0.75, minutos: 30 },
  /** Com o freio ligado. */
  noFreio: { carrinho: 2, pessoa: 2, loja: { vezes: 3, minutos: 10 } },
} as const

/**
 * O que a porta conta antes de decidir, desde a última soltura (o
 * `POST /admin/cartao` com "soltar") — a tentativa de agora INCLUÍDA nas três
 * primeiras e no `daLoja`.
 */
export type Contagem = {
  /** As da sacola na última hora. */
  doCarrinho: number
  /** As da pessoa (o mesmo `quem`) na última hora. */
  daPessoa: number
  /** As sem assinatura, de todo mundo, na última hora. */
  diretas: number
  /** As recusadas nos últimos 30 minutos. */
  recusas: number
  /** As que terminaram (aprovadas, em análise, recusadas) nos últimos 30 minutos. */
  terminadas: number
  /** As da loja toda nos últimos 10 minutos. */
  daLoja: number
}

export function freioLigado(c: Pick<Contagem, "recusas" | "terminadas">): boolean {
  return (
    c.recusas >= LIMITES.freio.recusas &&
    c.recusas >= LIMITES.freio.parte * Math.max(c.terminadas, 1)
  )
}

export type MotivoDaBarrada = "carrinho" | "pessoa" | "diretas" | "freio"

export type Decisao = { passa: true } | { passa: false; motivo: MotivoDaBarrada }

/**
 * Passa ou não passa. A contagem inclui esta tentativa, então passa quem
 * está DENTRO do limite (5 de 5 passa; a 6ª, não).
 */
export function decidir(c: Contagem, assinada: boolean): Decisao {
  // Sem a assinatura, o `quem` é o endereço da conexão — o da Vercel, ou o do
  // robô: o balde é um só pra todo mundo que chegou assim.
  if (!assinada && c.diretas > LIMITES.diretas.vezes) return { passa: false, motivo: "diretas" }

  if (freioLigado(c)) {
    if (c.daLoja > LIMITES.noFreio.loja.vezes) return { passa: false, motivo: "freio" }
    if (c.doCarrinho > LIMITES.noFreio.carrinho) return { passa: false, motivo: "freio" }
    if (assinada && c.daPessoa > LIMITES.noFreio.pessoa) return { passa: false, motivo: "freio" }
    return { passa: true }
  }

  if (c.doCarrinho > LIMITES.carrinho.vezes) return { passa: false, motivo: "carrinho" }
  if (assinada && c.daPessoa > LIMITES.pessoa.vezes) return { passa: false, motivo: "pessoa" }
  return { passa: true }
}

/**
 * O que a porta responde (429), no `message` — onde o Medusa põe o motivo de
 * todo erro, e de onde a loja lê (`apps/loja/src/lib/pagamento.ts`). A loja
 * escreve a frase: pra quem compra, "muitas tentativas" e "pausa de
 * segurança" são o que importa, não qual trava foi.
 */
export const RESPOSTA_DA_BARRADA: Record<MotivoDaBarrada, string> = {
  carrinho: "cartao_limite",
  pessoa: "cartao_limite",
  diretas: "cartao_limite",
  freio: "cartao_freio",
}

/**
 * QUEM, SEM O IP: "loja:189.10.20.30" → "loja:5f1c…" (16 letras de um HMAC
 * com o segredo da loja). Conta "a mesma pessoa" do mesmo jeito, e o IP não
 * vai pro banco. Sem segredo nenhum (só fora de produção), o resumo sai com
 * uma chave fixa — ainda não é o IP.
 */
export function semOIp(chave: string, segredo = segredoDoResumo()): string {
  const [origem, ...resto] = chave.split(":")
  const resumo = createHmac("sha256", segredo).update(resto.join(":")).digest("hex").slice(0, 16)
  return `${origem}:${resumo}`
}

const segredoDoResumo = () =>
  process.env.REVALIDAR_SEGREDO || process.env.JWT_SECRET || "fuckingbarba-sem-segredo"

/* ── a sessão que vai pro Pagar.me ─────────────────────────────────────── */

type SessaoCrua = {
  id?: string | null
  provider_id?: string | null
  data?: Record<string, unknown> | null
}

type CarrinhoCru = {
  payment_collection?: { payment_sessions?: (SessaoCrua | null)[] | null } | null
} | null

/**
 * A sessão de cartão que o `complete` vai mandar pro parceiro — a de um
 * parceiro de pagamento (hoje, só o Pagar.me passa cartão), no cartão, ainda
 * `nova` (nada enviado). Sessão que já foi (recusada, em análise) não volta
 * a ir: o provedor responde o que ela é, sem chamar o parceiro de novo (ver
 * o `authorizePayment` do Pagar.me), então não tem o que barrar. Pix, nem
 * olha.
 */
export function sessaoDeCartao(
  carrinho: CarrinhoCru | undefined
): { id: string; valor: number } | null {
  for (const s of carrinho?.payment_collection?.payment_sessions ?? []) {
    if (!s?.id || !ehParceiro(s.provider_id)) continue
    const estado = estadoDaSessao(s)
    if (estado?.forma === "cartao" && estado.situacao === "nova") {
      return { id: s.id, valor: estado.valor }
    }
  }
  return null
}

/* ── o fim de cada tentativa ───────────────────────────────────────────── */

/**
 * "andando": foi pro `complete` e ainda não voltou. "parou": voltou sem ter
 * chegado no Pagar.me (o estoque acabou antes). "barrada": a porta não
 * deixou. "solta": não é tentativa — é a marca do `POST /admin/cartao`
 * ("soltar"), e as contas só olham o que veio depois dela.
 */
export type Resultado =
  "andando" | "aprovada" | "analise" | "recusada" | "erro" | "parou" | "barrada" | "solta"

/** As que foram (ou podem ter ido) pro Pagar.me — as que contam pras travas. */
export const CONTAM: readonly Resultado[] = ["andando", "aprovada", "analise", "recusada", "erro"]

/**
 * Como a tentativa terminou, pelo que o provedor gravou na sessão. Recusa é
 * o banco que disse não, a análise de fraude que reprovou, e o dado do
 * cartão que o Pagar.me recusou (cartão vencido, número que não existe —
 * o robô manda muito disso). O Pagar.me fora do ar é erro, não recusa: não
 * liga o freio.
 */
export function resultadoDaSessao(estado: Estado | null): {
  resultado: Resultado
  motivo: string | null
} {
  if (!estado) return { resultado: "erro", motivo: "sem-sessao" }
  switch (estado.situacao) {
    case "pago":
      return { resultado: "aprovada", motivo: null }
    case "analise":
      return { resultado: "analise", motivo: null }
    case "nova":
      return { resultado: "parou", motivo: null }
    case "recusado":
    case "falhou":
      if (estado.recusa === RECUSAS.banco) return { resultado: "recusada", motivo: "banco" }
      if (estado.recusa === RECUSAS.antifraude)
        return { resultado: "recusada", motivo: "antifraude" }
      if (estado.recusa === RECUSAS.dados) return { resultado: "recusada", motivo: "dados" }
      return { resultado: "erro", motivo: estado.recusa === RECUSAS.incerto ? "incerto" : "fora" }
    default:
      return { resultado: "erro", motivo: estado.situacao }
  }
}

/* ── o resumo, pra tela e pro vigia ────────────────────────────────────── */

/** As últimas 24 horas, e o freio agora (`resumoDoCartao`, no serviço). */
export type ResumoDoCartao = {
  tentativas: number
  aprovadas: number
  analise: number
  recusadas: number
  barradas: number
  /** As que chegaram sem a assinatura da loja. */
  diretas: number
  /** Nos últimos 30 minutos, desde a última soltura. */
  freio: { recusas: number; terminadas: number; desde: Date | string | null }
}

/** Nenhuma tentativa — e o que a tela mostra num banco sem a tabela. */
export const RESUMO_VAZIO: ResumoDoCartao = {
  tentativas: 0,
  aprovadas: 0,
  analise: 0,
  recusadas: 0,
  barradas: 0,
  diretas: 0,
  freio: { recusas: 0, terminadas: 0, desde: null },
}
