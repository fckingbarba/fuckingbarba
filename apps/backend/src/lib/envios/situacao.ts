/**
 * O VOCABULÁRIO DOS ENVIOS — a língua do núcleo, e a única que ele fala.
 *
 * Cada parceiro de entrega (Frenet hoje; amanhã outro) tem os códigos dele:
 * a Frenet diz "5", outro diria "OUT_FOR_DELIVERY", um terceiro "saiu p/
 * entrega". O tradutor de cada um (`src/modules/<parceiro>/rastreio.ts`)
 * converte pra ESTAS palavras, e daqui pra frente — o banco, o Medusa, a tela
 * da conta, os e-mails — ninguém sabe de onde a notícia veio.
 *
 * ┌─ ACRESCENTAR UMA PALAVRA É MEXER NO NÚCLEO; TROCAR DE PARCEIRO, NÃO ───┐
 * │ A lista abaixo é o que um CLIENTE precisa saber de uma encomenda no    │
 * │ Brasil, e não o que a Frenet sabe dizer. `aguardando_retirada` e       │
 * │ `nao_entregue`, por exemplo, a Frenet nem manda — mas os Correios      │
 * │ fazem isso toda semana, e o próximo parceiro pode mandar. Evento que o │
 * │ tradutor não souber classificar vira `informativo`: entra na linha do  │
 * │ tempo com o texto da transportadora e não muda a situação.             │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ESTE ARQUIVO TEM UM GÊMEO na loja: `apps/loja/src/lib/conta-visivel.ts`
 * (os rótulos e as frases de cada situação). São dois pacotes, e a rota
 * `/store/conta/pedidos/:id/rastreio` é o contrato entre eles — quem
 * acrescentar uma palavra aqui acrescenta lá.
 */

export const TIPOS_DE_EVENTO = [
  /** Saiu da loja: postado na agência, ou deixado no ponto esperando a coleta. */
  "postado",
  "em_transito",
  /** No carro, a caminho do endereço. Precisa ter alguém pra receber. */
  "saiu_para_entrega",
  /** Esperando o cliente buscar na agência (tentativa frustrada, ou endereço sem entrega). */
  "aguardando_retirada",
  "entregue",
  /** A transportadora avisou atraso. Alerta: não muda onde o pacote está. */
  "atrasado",
  /** Tentaram entregar e não conseguiram (ninguém em casa, endereço). Alerta. */
  "nao_entregue",
  /** Voltando pra loja. Fim da linha pra este pacote. */
  "devolvido",
  /** Perdido. Fim da linha — a loja resolve com o cliente. */
  "extraviado",
  /** O que o tradutor não soube classificar: só texto na linha do tempo. */
  "informativo",
] as const

export type TipoDeEvento = (typeof TIPOS_DE_EVENTO)[number]

/**
 * Onde o pacote está — o título do rastreio na conta. `aguardando` é o
 * envio que existe sem notícia nenhuma ainda.
 */
export type SituacaoDoEnvio =
  | "aguardando"
  | "postado"
  | "em_transito"
  | "saiu_para_entrega"
  | "aguardando_retirada"
  | "entregue"
  | "devolvido"
  | "extraviado"

export type AlertaDoEnvio = "atrasado" | "nao_entregue"

const EM_ANDAMENTO = new Set<TipoDeEvento>([
  "postado",
  "em_transito",
  "saiu_para_entrega",
  "aguardando_retirada",
])
const FINAIS = new Set<string>(["entregue", "devolvido", "extraviado"])
const ALERTAS = new Set<string>(["atrasado", "nao_entregue"])

export const ehTipoDeEvento = (v: unknown): v is TipoDeEvento =>
  typeof v === "string" && (TIPOS_DE_EVENTO as readonly string[]).includes(v)

/** Já saiu da loja? É o que faz o pedido virar "enviado" no Medusa. */
export const jaSaiu = (s: SituacaoDoEnvio) => s !== "aguardando"

export type EventoParaResumir = { tipo: TipoDeEvento; quando: Date }

export type Resumo = {
  situacao: SituacaoDoEnvio
  alerta: AlertaDoEnvio | null
  /** Quando a transportadora disse a situação de agora (a hora DELA). */
  desde: Date | null
  postadoEm: Date | null
  entregueEm: Date | null
}

/**
 * A SITUAÇÃO DE UM PACOTE, a partir de TODOS os eventos dele.
 *
 * Recalcular do zero a cada aviso, em vez de "aplicar o último", é o que
 * torna o núcleo imune às três coisas que parceiro faz: mandar o mesmo aviso
 * duas vezes, mandar fora de ordem (o "em trânsito" chegando depois do
 * "saiu pra entrega"), e pular etapas (o primeiro aviso já é "entregue").
 *
 * As regras, na ordem da transportadora (hora do evento, não da chegada):
 *
 *   - quem manda é o evento MAIS RECENTE de andamento: depois de "saiu pra
 *     entrega", um "em trânsito" mais novo quer dizer que o pacote voltou
 *     pra agência — e é isso que a tela tem que dizer;
 *   - ALERTA (atraso, tentativa frustrada) acende por cima da situação e
 *     apaga no próximo andamento;
 *   - o FIM não volta atrás: depois de "entregue", nada muda a situação.
 *     "Extraviado" cede a um "entregue" posterior (achou e entregou);
 *     "devolvido" não — "entregue" depois de devolvido é entregue AO
 *     REMETENTE, e dizer "entregue" ao cliente seria mentira;
 *   - qualquer notícia de verdade quer dizer que o pacote saiu: o primeiro
 *     aviso sendo um "atraso" põe o envio em "postado", não em "aguardando".
 */
export function resumir(eventos: EventoParaResumir[]): Resumo {
  // `sort` é estável: dois eventos no mesmo minuto ficam na ordem em que chegaram.
  const ordem = [...eventos].sort((a, b) => a.quando.getTime() - b.quando.getTime())

  let situacao: SituacaoDoEnvio = "aguardando"
  let alerta: AlertaDoEnvio | null = null
  let desde: Date | null = null
  let postadoEm: Date | null = null
  let entregueEm: Date | null = null

  for (const e of ordem) {
    if (e.tipo === "informativo") continue
    postadoEm ??= e.quando

    if (FINAIS.has(situacao)) {
      if (situacao === "extraviado" && e.tipo === "entregue") {
        situacao = "entregue"
        desde = e.quando
        entregueEm = e.quando
      }
      continue
    }

    if (ALERTAS.has(e.tipo)) {
      alerta = e.tipo as AlertaDoEnvio
      if (situacao === "aguardando") {
        situacao = "postado"
        desde = e.quando
      }
      continue
    }

    if (EM_ANDAMENTO.has(e.tipo) || FINAIS.has(e.tipo)) {
      situacao = e.tipo as SituacaoDoEnvio
      desde = e.quando
      alerta = null
      if (e.tipo === "entregue") entregueEm = e.quando
    }
  }

  return { situacao, alerta, desde, postadoEm, entregueEm }
}

/* ── os avisos ao cliente ─────────────────────────────────────────────────── */

/**
 * Os momentos que viram e-mail. Atraso, devolução e extravio ficam de fora
 * DE PROPÓSITO: aparecem na conta, mas e-mail automático dizendo "sua
 * encomenda foi extraviada" é o pior jeito de a pessoa saber — esses a loja
 * conversa.
 */
export type MomentoDoAviso = "enviado" | "saiu" | "retirar" | "entregue"

const ORDEM_DOS_MOMENTOS: Record<MomentoDoAviso, number> = {
  enviado: 1,
  saiu: 2,
  retirar: 3,
  entregue: 4,
}

export function momentoDe(situacao: SituacaoDoEnvio): MomentoDoAviso | null {
  switch (situacao) {
    case "postado":
    case "em_transito":
      return "enviado"
    case "saiu_para_entrega":
      return "saiu"
    case "aguardando_retirada":
      return "retirar"
    case "entregue":
      return "entregue"
    default:
      return null
  }
}

const HORA = 60 * 60 * 1000

/**
 * Até quanto tempo depois do FATO (a hora da transportadora) o e-mail ainda
 * é notícia. "Saiu pra entrega" que chega com um dia de atraso já é mentira
 * — o pacote provavelmente chegou. Já "foi enviado", com o código, serve a
 * semana inteira: é o e-mail que a pessoa guarda.
 */
export const VALIDADE_DO_AVISO: Record<MomentoDoAviso, number> = {
  enviado: 7 * 24 * HORA,
  saiu: 12 * HORA,
  retirar: 5 * 24 * HORA,
  entregue: 3 * 24 * HORA,
}

/** O registro do que já foi avisado, no `avisos` do envio. */
export type RegistroDeAvisos = Partial<
  Record<MomentoDoAviso, { em: string; como: "email" | "dispensado" }>
>

export function lerAvisos(v: unknown): RegistroDeAvisos {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {}
  const saida: RegistroDeAvisos = {}
  for (const m of Object.keys(ORDEM_DOS_MOMENTOS) as MomentoDoAviso[]) {
    const r = (v as Record<string, unknown>)[m] as { em?: unknown; como?: unknown } | undefined
    if (r && typeof r.em === "string" && (r.como === "email" || r.como === "dispensado")) {
      saida[m] = { em: r.em, como: r.como }
    }
  }
  return saida
}

/**
 * O QUE AVISAR AGORA — no máximo um momento, e só se ele for novidade:
 *
 *   - é o momento da situação ATUAL (o "saiu pra entrega" que já virou
 *     "entregue" não sai mais);
 *   - não foi avisado nem dispensado antes (o admin pode marcar "não
 *     avisar" ao postar);
 *   - não é anterior a um momento já avisado (depois do "saiu pra entrega",
 *     um "em trânsito" de volta não manda "foi enviado" de novo);
 *   - o fato ainda está dentro da validade.
 */
export function avisoPendente(
  envio: { situacao: SituacaoDoEnvio; desde: Date | null; avisos: RegistroDeAvisos },
  agora: Date
): MomentoDoAviso | null {
  const momento = momentoDe(envio.situacao)
  if (!momento || envio.avisos[momento]) return null
  const passados = (Object.keys(envio.avisos) as MomentoDoAviso[]).map((m) => ORDEM_DOS_MOMENTOS[m])
  if (passados.some((n) => n > ORDEM_DOS_MOMENTOS[momento])) return null
  if (!envio.desde) return null
  if (agora.getTime() - envio.desde.getTime() > VALIDADE_DO_AVISO[momento]) return null
  return momento
}

/* ── pequenas regras que todo parceiro usa ────────────────────────────────── */

/** O padrão S10 da UPU, que os Correios usam: duas letras, nove dígitos, BR. */
const S10_BR = /^[A-Za-z]{2}\d{9}BR$/i

/** Letra e número, com ponto, hífen ou sublinhado no meio — de 5 a 60. */
const FORMATO_DE_CODIGO = /^[A-Za-z0-9][A-Za-z0-9._-]{4,59}$/

/**
 * O código como o núcleo guarda: sem espaço nenhum, e o dos Correios em
 * maiúsculas. O admin digita "qs 123456789 br", a Frenet manda
 * "QS123456789BR" — e os dois têm que achar o mesmo envio. Código de outra
 * transportadora fica como veio: não dá pra saber se ela diferencia caixa.
 *
 * O que não tem cara de código ("#", "-", "n/a" — o que se digita pra
 * passar do campo obrigatório) não vira envio: um "#" guardado seria o
 * código de todo pedido dali em diante.
 */
export function limparCodigo(v: unknown): string | null {
  if (typeof v !== "string") return null
  const limpo = v.replace(/\s+/g, "")
  if (!FORMATO_DE_CODIGO.test(limpo)) return null
  return S10_BR.test(limpo) ? limpo.toUpperCase() : limpo
}

/** A transportadora que o próprio código denuncia. Hoje, só os Correios têm formato certo. */
export function transportadoraPeloCodigo(codigo: string | null): string | null {
  return codigo && S10_BR.test(codigo) ? "Correios" : null
}

/**
 * A chave de um evento, pra reconhecer o repetido. Tipo, hora e texto: o
 * mesmo aviso reenviado bate; dois eventos diferentes no mesmo minuto, não.
 */
export function chaveDoEvento(e: { tipo: TipoDeEvento; quando: Date; descricao: string }): string {
  return `${e.tipo}|${e.quando.toISOString()}|${e.descricao.trim().toLowerCase().replace(/\s+/g, " ")}`
}
