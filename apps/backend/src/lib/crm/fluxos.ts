import { createHash } from "node:crypto"

/**
 * OS FLUXOS DO CRM — as regras do motor, puras e com testes: quem recebe
 * qual e-mail, quando, e quem fica de fora. Quem busca as pessoas no banco,
 * monta o e-mail e manda é a rotina `fluxos-do-crm` (a cada 5 minutos); aqui
 * é só a decisão.
 *
 * Os dois primeiros fluxos são os de "dinheiro rápido" do plano (o Ciclo da
 * Barba), de quem chegou mais perto de pagar:
 *
 *   - PIX PENDENTE: gerou o Pix e não pagou. Um aviso 15 minutos antes de
 *     vencer; depois de vencido (o pedido é cancelado e o e-mail do
 *     cancelamento já tem o "refazer o pedido"), o desconto em 24 h e a
 *     última chamada em 48 h.
 *   - CHECKOUT ABANDONADO: digitou o e-mail no checkout e não pagou. Em 30
 *     minutos, 4 horas, 24 horas (com o desconto) e 48 horas (a última).
 *   - CARRINHO ABANDONADO (entrega 0169): pôs na sacola, não foi pro
 *     checkout, e a loja sabe quem é (aceitou os cookies e já se identificou:
 *     a conta, a newsletter, uma compra de antes). Em 1 hora, 12 horas (o que
 *     os clientes acharam), 24 horas (o desconto, que vale 3 dias), 3 dias (o
 *     desconto vence amanhã) e 5 dias (a última). As horas são as do dono.
 *   - BOAS-VINDAS (entrega 0177): quem se cadastra no pop-up da 1ª compra (o
 *     nome e o e-mail, em troca do cupom). O cupom sai na hora do cadastro,
 *     pela rota do pop-up (`lib/crm/primeira-compra.ts`), e não pelo motor.
 *     Depois, a sequência da TRILHA do que a pessoa estava vendo (entrega
 *     0178): 1, 2, 5, 7 e 10 dias, essa pelo motor (`lib/crm/boas-vindas.ts`).
 *   - ESTREIA (entrega 0181): a campanha da loja nova pra base da Nuvemshop,
 *     pra quem aceitou ofertas lá (`lib/crm/estreia.ts`). Começa DESLIGADA:
 *     sai quando o dono liga, em 4 lotes, um por dia.
 *   - REPOSIÇÃO (entrega 0185): o produto que a pessoa comprou está pra
 *     acabar — 7 e 2 dias antes, 3 e 10 dias depois do dia em que ele acaba
 *     (`lib/crm/reposicao.ts`), com o "Refazer o pedido". Pra todo cliente
 *     (escolha do dono), sem cupom. Começa DESLIGADA.
 *
 * Os dois primeiros vão pra QUEM DIGITOU O E-MAIL, e o do carrinho pra quem a
 * loja já conhece (escolhas do dono, 27/09): é sobre a compra que a pessoa
 * começou. Quem saiu da lista não recebe mais nada.
 *
 * AS REGRAS:
 *   1. Só vale o que começou DEPOIS de o fluxo ser ligado — ligar não
 *      dispara pros carrinhos de meses atrás.
 *   2. Um fluxo por vez: o Pix vem antes do checkout.
 *   3. Comprou, parou: um pedido pago depois do começo encerra o fluxo.
 *   4. Um e-mail por vez: se a rotina ficou parada e dois toques venceram, só
 *      o mais novo sai (o outro fica como pulado).
 *   5. Teto por pessoa: 3 e-mails do CRM em 24 horas, 6 em 7 dias.
 *   6. Grupo de controle: 5% de cada fluxo não recebe nada — é como se sabe
 *      quanto o fluxo vende a mais de verdade. Menos nas boas-vindas: foi a
 *      pessoa que pediu (`semControle`).
 *   7. O desconto: um cupom só da pessoa, de uso único, e no máximo um a cada
 *      60 dias pro mesmo e-mail. Sem cupom, o e-mail sai sem o desconto.
 *   8. De madrugada, só o urgente: o aviso do Pix e o de 30 minutos saem na
 *      hora; os outros esperam as 8h (em Brasília).
 */

const MINUTO = 60 * 1000
const HORA = 60 * MINUTO
const DIA = 24 * HORA

export type IdDoFluxo = "pix" | "checkout" | "carrinho" | "reposicao" | "boas-vindas" | "estreia"

/** Os toques dos fluxos de compra — os que o motor manda (`lib/emails/fluxos.ts`). */
export type IdDoToqueDeCompra =
  | "pix-vence"
  | "pix-24h"
  | "pix-48h"
  | "checkout-30min"
  | "checkout-4h"
  | "checkout-24h"
  | "checkout-48h"
  | "carrinho-1h"
  | "carrinho-12h"
  | "carrinho-24h"
  | "carrinho-3d"
  | "carrinho-5d"

/**
 * Os toques das boas-vindas: o cupom da 1ª compra, que sai na hora do
 * cadastro no pop-up (`lib/crm/primeira-compra.ts`, e não pelo motor), e a
 * sequência da trilha de quem se cadastrou (`lib/emails/boas-vindas.ts`, pelo
 * motor — entrega 0178).
 */
export type IdDoToqueDasBoasVindas =
  | "boas-vindas-agora"
  | "boas-vindas-1d"
  | "boas-vindas-2d"
  | "boas-vindas-5d"
  | "boas-vindas-7d"
  | "boas-vindas-10d"

/**
 * Os toques da estreia (entrega 0181): o e-mail da loja nova, no dia do lote
 * da pessoa, e o "vence amanhã" de quem ganhou cupom (`lib/emails/estreia.ts`).
 */
export type IdDoToqueDaEstreia = "estreia-agora" | "estreia-2d"

/**
 * Os toques da reposição (entrega 0185), contados do dia em que o produto
 * acaba: 7 e 2 dias antes, 3 e 10 dias depois (`lib/emails/reposicao.ts`).
 */
export type IdDoToqueDaReposicao =
  "reposicao-antes-7d" | "reposicao-antes-2d" | "reposicao-depois-3d" | "reposicao-depois-10d"

export type IdDoToque =
  IdDoToqueDeCompra | IdDoToqueDasBoasVindas | IdDoToqueDaEstreia | IdDoToqueDaReposicao

/** Se o toque é de um fluxo de compra (os de `lib/emails/fluxos.ts`). */
export const ehToqueDeCompra = (id: IdDoToque): id is IdDoToqueDeCompra =>
  /^(pix|checkout|carrinho)-/.test(id)

/** Se o toque é das boas-vindas (`lib/emails/boas-vindas.ts`). */
export const ehToqueDasBoasVindas = (id: IdDoToque): id is IdDoToqueDasBoasVindas =>
  id.startsWith("boas-vindas-")

/** Se o toque é da estreia (`lib/emails/estreia.ts`). */
export const ehToqueDaEstreia = (id: IdDoToque): id is IdDoToqueDaEstreia =>
  id.startsWith("estreia-")

/** Se o toque é da reposição (`lib/emails/reposicao.ts`). */
export const ehToqueDaReposicao = (id: IdDoToque): id is IdDoToqueDaReposicao =>
  id.startsWith("reposicao-")

export type ToqueDoFluxo = {
  id: IdDoToque
  /** O nome na tela do painel. */
  nome: string
  /** Quando sai, em frase, pra tela ("30 min depois"). */
  quando: string
  /** Quando sai, contado do começo (o pedido do Pix, a última mexida no checkout). */
  depois: number
  /** Se é o toque que dá o cupom. */
  cupom?: true
  /** Até quanto tempo depois da hora ainda sai (sem isto, `VALIDADE_DO_TOQUE`). */
  validade?: number
  /** Sai mesmo de madrugada (regra 8). */
  urgente?: true
}

export type Fluxo = {
  id: IdDoFluxo
  nome: string
  /** Menor ganha: é o fluxo de quem está mais perto de pagar. */
  prioridade: number
  toques: readonly ToqueDoFluxo[]
  /** Quanto o cupom do fluxo vale depois do e-mail que o dá (sem isto, `VALIDADE_DO_CUPOM`). */
  validadeDoCupom?: number
  /** Sem grupo de controle: foi a pessoa que pediu (as boas-vindas do pop-up). */
  semControle?: true
  /** Começa desligado: só sai quando o dono liga no painel (a estreia tem dia pra começar). */
  comecaDesligado?: true
}

export const FLUXOS: Record<IdDoFluxo, Fluxo> = {
  pix: {
    id: "pix",
    nome: "Pix pendente",
    prioridade: 1,
    toques: [
      // O começo do Pix é a hora em que ele VENCE menos 15 minutos (ver `comecoDoPix`).
      // Depois de vencido, o aviso não faz sentido: vale só até 1 minuto antes.
      {
        id: "pix-vence",
        nome: "Vence em 15 minutos",
        quando: "15 min antes de vencer",
        depois: 0,
        validade: 14 * MINUTO,
        urgente: true,
      },
      {
        id: "pix-24h",
        nome: "Um desconto pra refazer",
        quando: "1 dia depois",
        depois: DIA,
        cupom: true,
      },
      { id: "pix-48h", nome: "O último lembrete", quando: "2 dias depois", depois: 2 * DIA },
    ],
  },
  checkout: {
    id: "checkout",
    nome: "Checkout abandonado",
    prioridade: 2,
    toques: [
      {
        id: "checkout-30min",
        nome: "Faltou só o pagamento",
        quando: "30 min depois",
        depois: 30 * MINUTO,
        urgente: true,
      },
      { id: "checkout-4h", nome: "Ficou alguma dúvida?", quando: "4 h depois", depois: 4 * HORA },
      {
        id: "checkout-24h",
        nome: "Um desconto pra fechar",
        quando: "1 dia depois",
        depois: DIA,
        cupom: true,
      },
      { id: "checkout-48h", nome: "O último lembrete", quando: "2 dias depois", depois: 2 * DIA },
    ],
  },
  carrinho: {
    id: "carrinho",
    nome: "Carrinho abandonado",
    prioridade: 3,
    // O desconto sai em 24 h e o e-mail de 3 dias diz que ele vence amanhã: vale 3 dias.
    validadeDoCupom: 3 * DIA,
    toques: [
      {
        id: "carrinho-1h",
        nome: "Sua compra ficou pela metade",
        quando: "1 h depois",
        depois: HORA,
      },
      {
        id: "carrinho-12h",
        nome: "O que os clientes acharam",
        quando: "12 h depois",
        depois: 12 * HORA,
      },
      {
        id: "carrinho-24h",
        nome: "Um desconto pra decidir",
        quando: "1 dia depois",
        depois: DIA,
        cupom: true,
      },
      {
        id: "carrinho-3d",
        nome: "O desconto vence amanhã",
        quando: "3 dias depois",
        depois: 3 * DIA,
      },
      { id: "carrinho-5d", nome: "O último lembrete", quando: "5 dias depois", depois: 5 * DIA },
    ],
  },
  reposicao: {
    id: "reposicao",
    nome: "Reposição",
    // Na ordem do plano: depois dos de compra, antes das boas-vindas e das campanhas.
    prioridade: 4,
    comecaDesligado: true,
    // O começo de cada entrada é o dia em que o produto acaba (`lib/crm/reposicao.ts`).
    toques: [
      {
        id: "reposicao-antes-7d",
        nome: "Acaba em uma semana",
        quando: "7 dias antes de acabar",
        depois: -7 * DIA,
      },
      {
        id: "reposicao-antes-2d",
        nome: "Não deixa acabar",
        quando: "2 dias antes",
        depois: -2 * DIA,
      },
      { id: "reposicao-depois-3d", nome: "Acabou?", quando: "3 dias depois", depois: 3 * DIA },
      {
        id: "reposicao-depois-10d",
        nome: "O último lembrete",
        quando: "10 dias depois",
        depois: 10 * DIA,
      },
    ],
  },
  "boas-vindas": {
    id: "boas-vindas",
    nome: "Boas-vindas",
    prioridade: 5,
    // O cupom da 1ª compra vale 3 dias, como o do carrinho.
    validadeDoCupom: 3 * DIA,
    semControle: true,
    // Depois do cupom, a trilha do que a pessoa estava vendo (`lib/emails/boas-vindas.ts`).
    toques: [
      {
        id: "boas-vindas-agora",
        nome: "O cupom da 1ª compra",
        quando: "na hora do cadastro",
        depois: 0,
        cupom: true,
        urgente: true,
      },
      { id: "boas-vindas-1d", nome: "O começo da trilha", quando: "1 dia depois", depois: DIA },
      {
        id: "boas-vindas-2d",
        nome: "O cupom vence amanhã",
        quando: "2 dias depois",
        depois: 2 * DIA,
      },
      { id: "boas-vindas-5d", nome: "Como usar", quando: "5 dias depois", depois: 5 * DIA },
      {
        id: "boas-vindas-7d",
        nome: "As perguntas que todo mundo faz",
        quando: "7 dias depois",
        depois: 7 * DIA,
      },
      { id: "boas-vindas-10d", nome: "O melhor preço", quando: "10 dias depois", depois: 10 * DIA },
    ],
  },
  estreia: {
    id: "estreia",
    nome: "Estreia da loja nova",
    prioridade: 6,
    // O cupom de quem nunca comprou e de quem sumiu vale 3 dias, como o do pop-up.
    validadeDoCupom: 3 * DIA,
    comecaDesligado: true,
    // O começo de cada pessoa é o dia do lote dela (`comecoDoLote`, em `lib/crm/estreia.ts`).
    toques: [
      {
        id: "estreia-agora",
        nome: "A loja nova chegou",
        quando: "no dia do lote",
        depois: 0,
        cupom: true,
      },
      {
        id: "estreia-2d",
        nome: "O cupom vence amanhã",
        quando: "2 dias depois",
        depois: 2 * DIA,
      },
    ],
  },
}

export const IDS_DOS_FLUXOS: readonly IdDoFluxo[] = [
  "pix",
  "checkout",
  "carrinho",
  "reposicao",
  "boas-vindas",
  "estreia",
]

/** Os toques depois deste tempo sem sair são largados: o e-mail não faz mais sentido. */
export const VALIDADE_DO_TOQUE = 12 * HORA

const validadeDo = (t: ToqueDoFluxo) => t.validade ?? VALIDADE_DO_TOQUE

/** O teto de e-mails do CRM por pessoa (os de pedido não contam). */
export const TETO = { dia: 3, semana: 6 } as const

/** A madrugada, em Brasília: das 22h às 8h, só o urgente sai (regra 8). */
export const MADRUGADA = { de: 22, ate: 8 } as const

const HORA_DE_BRASILIA = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo",
  hour: "numeric",
  hourCycle: "h23",
})

/** Se é madrugada em Brasília. */
export function deMadrugada(agora: Date): boolean {
  const h = Number(HORA_DE_BRASILIA.format(agora))
  return h >= MADRUGADA.de || h < MADRUGADA.ate
}

/** Quantos por cento de cada fluxo ficam de fora pra medir. */
export const CONTROLE = 5

/** Um cupom do CRM por e-mail a cada tantos dias. */
export const DIAS_ENTRE_CUPONS = 60

/**
 * O começo do Pix, pra régua: 15 minutos antes de vencer. Assim o "vence em
 * 15 minutos" é o toque zero, e os outros contam dali — o desconto sai perto
 * de 24 horas depois do pedido.
 */
export function comecoDoPix(venceEm: Date): Date {
  return new Date(venceEm.getTime() - 15 * MINUTO)
}

/** Quem está num fluxo: a pessoa, o que a pôs lá (o pedido ou o carrinho) e quando começou. */
export type Entrada = {
  fluxo: IdDoFluxo
  /** O id do pedido (Pix) ou do carrinho (checkout). */
  chave: string
  email: string
  /** A base da régua: os toques contam daqui (no Pix, 15 minutos antes de vencer). */
  comeco: Date
  /**
   * Quando a pessoa entrou (o pedido do Pix, a última mexida no carrinho) — é
   * por ela que se sabe se entrou depois de o fluxo ligar. Sem ela, o começo.
   */
  inicio?: Date
  /** Se a pessoa pagou algum pedido depois do começo. */
  comprou: boolean
}

/** Um e-mail que o motor já decidiu (mandou, pulou ou guardou pro controle). */
export type Registro = {
  email: string
  fluxo: IdDoFluxo
  chave: string
  toque: IdDoToque
  em: Date
  /** "enviado" conta no teto; "pulado" e "controle", não. */
  como: "enviado" | "pulado" | "controle"
  /** O código do cupom, se este toque deu um. */
  cupom?: string | null
}

export type Decisao =
  | { tipo: "nada" }
  | { tipo: "controle"; toque: ToqueDoFluxo; pulados: IdDoToque[] }
  | { tipo: "teto"; toque: ToqueDoFluxo }
  | { tipo: "mandar"; toque: ToqueDoFluxo; pulados: IdDoToque[]; darCupom: boolean }

/**
 * O toque que guarda, no registro, a escolha do "Barba ou cabelo?" (a trilha
 * no `como`; `lib/crm/escolha.ts`). Não é e-mail.
 */
export const TOQUE_DA_ESCOLHA = "boas-vindas-escolha"

/**
 * As linhas do registro (`crm_envio`) como o motor conta. A reserva que não
 * foi confirmada conta como envio: melhor perder um e-mail que mandar dois. A
 * escolha do "Barba ou cabelo?" mora no registro, mas não é e-mail: fica de
 * fora, e não conta no teto.
 */
export function registrosDoMotor(
  lidos: readonly {
    email: string
    fluxo: string
    chave: string
    toque: string
    como: string
    em: Date | string
    cupom?: string | null
  }[]
): Registro[] {
  return lidos
    .filter((r) => r.toque !== TOQUE_DA_ESCOLHA)
    .map((r) => ({
      email: r.email,
      fluxo: r.fluxo as IdDoFluxo,
      chave: r.chave,
      toque: r.toque as IdDoToque,
      em: new Date(r.em),
      como: r.como === "pulado" || r.como === "controle" ? r.como : "enviado",
      cupom: r.cupom ?? null,
    }))
}

/** A pessoa cai no grupo de controle deste fluxo? Sempre a mesma resposta pro mesmo e-mail. */
export function noControle(email: string, fluxo: IdDoFluxo, porCento = CONTROLE): boolean {
  const h = createHash("sha256").update(`${email.trim().toLowerCase()}|${fluxo}`).digest()
  return h.readUInt32BE(0) % 100 < porCento
}

const doMesmo = (e: Entrada) => (r: Registro) => r.fluxo === e.fluxo && r.chave === e.chave

/**
 * O próximo toque desta entrada, se algum venceu e ainda não saiu. Se mais de
 * um venceu (a rotina parou), sai só o mais novo; os de antes ficam como
 * pulados. Toque vencido há mais de 12 horas não sai mais.
 */
export function toqueDaVez(
  entrada: Entrada,
  registros: readonly Registro[],
  agora: Date
): { toque: ToqueDoFluxo; pulados: IdDoToque[] } | null {
  const feitos = new Set(registros.filter(doMesmo(entrada)).map((r) => r.toque))
  const fluxo = FLUXOS[entrada.fluxo]
  const vencidos = fluxo.toques.filter(
    (t) => !feitos.has(t.id) && entrada.comeco.getTime() + t.depois <= agora.getTime()
  )
  const toque = vencidos.at(-1)
  if (!toque) return null
  if (agora.getTime() - (entrada.comeco.getTime() + toque.depois) > validadeDo(toque)) return null
  return { toque, pulados: vencidos.slice(0, -1).map((t) => t.id) }
}

/** Quantos e-mails do CRM esta pessoa recebeu nas últimas `ms`. */
function enviadosNos(registros: readonly Registro[], email: string, agora: Date, ms: number) {
  return registros.filter(
    (r) => r.email === email && r.como === "enviado" && agora.getTime() - r.em.getTime() < ms
  ).length
}

/** Se o e-mail já ganhou um cupom do CRM nos últimos 60 dias. */
export function ganhouCupomHaPouco(
  registros: readonly Registro[],
  email: string,
  agora: Date,
  dias = DIAS_ENTRE_CUPONS
): boolean {
  return registros.some(
    (r) => r.email === email && r.cupom && agora.getTime() - r.em.getTime() < dias * DIA
  )
}

/** Se a entrada ainda tem toque por fazer (nem saiu, nem passou da validade). */
export function aindaAtiva(entrada: Entrada, registros: readonly Registro[], agora: Date): boolean {
  const feitos = new Set(registros.filter(doMesmo(entrada)).map((r) => r.toque))
  return FLUXOS[entrada.fluxo].toques.some(
    (t) =>
      !feitos.has(t.id) && entrada.comeco.getTime() + t.depois + validadeDo(t) >= agora.getTime()
  )
}

/**
 * A DECISÃO DE UMA PESSOA: das entradas dela (pode estar em mais de um fluxo,
 * ou com dois carrinhos), qual é a da vez — e o que acontece com o toque.
 *
 * Um fluxo por vez (regra 2): a entrada de maior prioridade que ainda está
 * ativa é a dona da pessoa até acabar, mesmo esperando o próximo toque; no
 * empate, a mais nova.
 *
 *   - `ligados`: os fluxos ligados, com a hora em que ligaram (regra 1);
 *   - `registros`: tudo o que o motor já decidiu pra essa pessoa (e é só
 *     dela: o teto e o cupom contam por e-mail).
 */
export function decidir({
  entradas,
  registros,
  ligados,
  agora,
}: {
  entradas: readonly Entrada[]
  registros: readonly Registro[]
  ligados: Partial<Record<IdDoFluxo, Date>>
  agora: Date
}): { entrada: Entrada; decisao: Decisao } | null {
  const entrada = entradas
    .filter((e) => {
      const desde = ligados[e.fluxo]
      return (
        desde !== undefined &&
        (e.inicio ?? e.comeco) >= desde &&
        !e.comprou &&
        aindaAtiva(e, registros, agora)
      )
    })
    .sort(
      (a, b) =>
        FLUXOS[a.fluxo].prioridade - FLUXOS[b.fluxo].prioridade ||
        b.comeco.getTime() - a.comeco.getTime()
    )[0]
  if (!entrada) return null
  const vez = toqueDaVez(entrada, registros, agora)
  if (!vez) return { entrada, decisao: { tipo: "nada" } }
  if (!vez.toque.urgente && deMadrugada(agora)) return { entrada, decisao: { tipo: "nada" } }
  if (!FLUXOS[entrada.fluxo].semControle && noControle(entrada.email, entrada.fluxo))
    return { entrada, decisao: { tipo: "controle", ...vez } }
  const dia = enviadosNos(registros, entrada.email, agora, DIA)
  const semana = enviadosNos(registros, entrada.email, agora, 7 * DIA)
  if (dia >= TETO.dia || semana >= TETO.semana)
    return { entrada, decisao: { tipo: "teto", toque: vez.toque } }
  return {
    entrada,
    decisao: {
      tipo: "mandar",
      ...vez,
      darCupom: Boolean(vez.toque.cupom) && !ganhouCupomHaPouco(registros, entrada.email, agora),
    },
  }
}

/* ── o que o painel liga e desliga ───────────────────────────────────────── */

/**
 * Onde mora, no metadata da loja: `{ pix: { ligado, desde }, checkout: {…},
 * desconto }`. Sem nada guardado, os fluxos estão LIGADOS (escolha do dono,
 * 27/09) e o `desde` é a primeira rodada do motor — ligar não dispara pro que
 * aconteceu antes. A estreia é a exceção: começa desligada (`comecaDesligado`).
 */
export const CHAVE_DOS_FLUXOS = "fb_crm_fluxos"

/** O desconto do cupom dos fluxos, em %: o padrão e os limites do painel. */
export const DESCONTO_PADRAO = 10
export const LIMITES_DO_DESCONTO: readonly [number, number] = [5, 30]

/** O começo do código dos cupons dos fluxos (`VOLTA-7KQ2MX`): não é cupom do painel. */
export const PREFIXO_DO_CUPOM = "VOLTA-"

/** O começo do cupom da 1ª compra, o do pop-up (`BEMVINDO-7KQ2MX`): também não é do painel. */
export const PREFIXO_DO_CUPOM_DE_BOAS_VINDAS = "BEMVINDO-"

/** Se o código é de um cupom do CRM — os que a aba Fluxos conta, e a lista de Cupons não mostra. */
export const ehCupomDoCrm = (codigo: string | null | undefined) =>
  Boolean(
    codigo &&
    (codigo.startsWith(PREFIXO_DO_CUPOM) || codigo.startsWith(PREFIXO_DO_CUPOM_DE_BOAS_VINDAS))
  )

/** Quanto tempo o cupom vale depois do e-mail que o dá (o padrão; o fluxo pode ter o seu). */
export const VALIDADE_DO_CUPOM = 2 * DIA

/** Quanto o cupom deste fluxo vale. */
export const validadeDoCupom = (fluxo: IdDoFluxo) =>
  FLUXOS[fluxo].validadeDoCupom ?? VALIDADE_DO_CUPOM

/** Até quantos dias depois do começo um fluxo ainda tem toque por fazer: a janela do motor. */
export const diasDoFluxo = (fluxo: IdDoFluxo) =>
  Math.ceil((Math.max(...FLUXOS[fluxo].toques.map((t) => t.depois + validadeDo(t))) + DIA) / DIA)

export type EstadoDoFluxo = { ligado: boolean; desde: Date | null }
export type ConfigDosFluxos = { fluxos: Record<IdDoFluxo, EstadoDoFluxo>; desconto: number }

const data = (v: unknown): Date | null => {
  if (typeof v !== "string") return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** A configuração guardada, com o padrão no que faltar ou vier torto. */
export function lerConfigDosFluxos(metadata: unknown): ConfigDosFluxos {
  const bruto = (metadata as Record<string, unknown> | null | undefined)?.[CHAVE_DOS_FLUXOS]
  const g = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>
  const fluxos = Object.fromEntries(
    IDS_DOS_FLUXOS.map((id) => {
      const f = (g[id] && typeof g[id] === "object" ? g[id] : {}) as Record<string, unknown>
      const ligado = FLUXOS[id].comecaDesligado ? f.ligado === true : f.ligado !== false
      return [id, { ligado, desde: data(f.desde) }]
    })
  ) as Record<IdDoFluxo, EstadoDoFluxo>
  const [min, max] = LIMITES_DO_DESCONTO
  const d = Number(g.desconto)
  const desconto = Number.isInteger(d) && d >= min && d <= max ? d : DESCONTO_PADRAO
  return { fluxos, desconto }
}

/** A configuração como vai pro metadata. */
export function guardarConfigDosFluxos(c: ConfigDosFluxos) {
  return {
    ...Object.fromEntries(
      IDS_DOS_FLUXOS.map((id) => [
        id,
        { ligado: c.fluxos[id].ligado, desde: c.fluxos[id].desde?.toISOString() ?? null },
      ])
    ),
    desconto: c.desconto,
  }
}

/**
 * Os fluxos ligados, com o `desde` de cada um. O ligado sem `desde` (a
 * primeira rodada depois do deploy) ainda não vale: a rodada guarda a hora e
 * só a próxima olha as pessoas.
 */
export function fluxosLigados(c: ConfigDosFluxos): Partial<Record<IdDoFluxo, Date>> {
  return Object.fromEntries(
    IDS_DOS_FLUXOS.flatMap((id) =>
      c.fluxos[id].ligado && c.fluxos[id].desde ? [[id, c.fluxos[id].desde]] : []
    )
  )
}
