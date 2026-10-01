import type Anthropic from "@anthropic-ai/sdk"
import type { TipoDaMensagem } from "./meta"

/**
 * AS REGRAS DO ATENDENTE DO WHATSAPP — os números e as contas sem banco nem
 * rede, pra testar sozinhas.
 */

/**
 * Quanto esperar depois da última mensagem da pessoa antes de responder.
 * Quem escreve em três mensagens seguidas recebe UMA resposta, que leu as
 * três. Com o job de minuto em minuto, a resposta sai entre 15 e ~75
 * segundos depois — o tempo de uma pessoa, não de um robô.
 */
export const ESPERA_S = 15

/** Passou pra equipe e ninguém respondeu em tanto tempo: o atendente volta. */
export const VOLTA_PRO_BOT_EM_H = 24

/** A janela da Meta: texto livre só até 24 horas depois da última mensagem da pessoa. */
export const JANELA_H = 24

/**
 * O teto de respostas do atendente numa conversa, por hora. Acima disso
 * (alguém testando o robô, outro robô do outro lado), a conversa vai pra
 * equipe — protege a conta da IA e a qualidade do número.
 */
export const TETO_POR_HORA = 12

/** Quantas mensagens da conversa o atendente lê, e de quantos dias pra trás. */
export const MENSAGENS_LIDAS = 40
export const DIAS_LIDOS = 30

/** A resposta de quando o atendente não consegue responder (a IA fora, três rodadas seguidas). */
export const RESPOSTA_DE_SOCORRO =
  "Opa! Vou chamar alguém do time pra continuar com você por aqui, só um instante."

/** Rodadas seguidas sem conseguir responder antes de chamar a equipe. */
export const TENTATIVAS_ANTES_DO_SOCORRO = 3

/**
 * A RESPOSTA AUTOMÁTICA DO OUTRO LADO — o "estou ausente" do WhatsApp
 * Business de quem escreveu. Responder a ela é robô conversando com robô (e
 * gastando IA): a mensagem fica guardada, e o atendente não responde. A
 * lista veio do Loopfy, que via isso todo dia.
 */
const AUTOMATICA =
  /^(mensagem autom[áa]tica|mensagens? autom[áa]ticas?|automatic reply|auto.?reply|out of office)\b|estou ocupad[oa]|momento ocupad|respondo (em breve|depois|logo|assim que|mais tarde)|fora do hor[áa]rio|hor[áa]rio comercial|agrade(ç|c)o (a |sua )?mensagem|agradecemos (a |sua )?mensagem|aus[êe]ncia|estou ausent|n[ãa]o consigo responder agora|retornar(ei|emos) (em breve|depois|logo|assim)/i

export function ehRespostaAutomatica(texto: string | null | undefined): boolean {
  return Boolean(texto && AUTOMATICA.test(texto))
}

/* ── a conversa pra IA ───────────────────────────────────────────────────── */

/** Uma mensagem do banco, só com o que o atendente lê. */
export type MensagemLida = {
  autor: "cliente" | "bot" | "equipe"
  tipo: string
  texto: string | null
  em: Date
  /**
   * A ordem na conversa, quando não é a do `em`: a resposta do atendente vai
   * logo depois da última mensagem que ele leu (`historico`, no serviço).
   */
  ordem?: Date
}

const SEM_TEXTO: Record<TipoDaMensagem, string> = {
  texto: "[mensagem vazia]",
  botao: "[tocou num botão]",
  imagem: "[mandou uma foto]",
  audio: "[mandou um áudio — o atendente não consegue ouvir]",
  video: "[mandou um vídeo — o atendente não consegue ver]",
  documento: "[mandou um arquivo]",
  figurinha: "[mandou uma figurinha]",
  localizacao: "[mandou uma localização]",
  contato: "[mandou um contato]",
  outro: "[mandou uma mensagem que o WhatsApp não mostra pro atendente]",
}

/** O que o atendente lê de uma mensagem do cliente. */
export function textoDoCliente(m: Pick<MensagemLida, "tipo" | "texto">): string {
  const tipo = (m.tipo in SEM_TEXTO ? m.tipo : "outro") as TipoDaMensagem
  if (tipo === "texto") return m.texto ?? SEM_TEXTO.texto
  if (tipo === "botao") return m.texto ? `[tocou no botão] ${m.texto}` : SEM_TEXTO.botao
  // A foto com legenda: a legenda é o que a pessoa disse.
  return m.texto ? `${SEM_TEXTO[tipo]} ${m.texto}` : SEM_TEXTO[tipo]
}

/**
 * A CONVERSA NO FORMATO DA IA: o cliente é `user`; a loja (o atendente e a
 * equipe) é `assistant`. Mensagens seguidas do mesmo lado viram um turno só
 * (a API exige que os papéis alternem). A da equipe vai marcada — o
 * atendente precisa saber que uma pessoa já disse aquilo.
 *
 * Começa no cliente (o que a loja disse antes da primeira mensagem dele, na
 * janela lida, fica de fora) e TERMINA no cliente: sem mensagem nova dele,
 * não há o que responder (`null`).
 */
export function conversaPraIa(
  mensagens: readonly MensagemLida[]
): Anthropic.Beta.BetaMessageParam[] | null {
  const turnos: { role: "user" | "assistant"; partes: string[] }[] = []
  const quando = (m: MensagemLida) => (m.ordem ?? m.em).getTime()
  for (const m of [...mensagens].sort((a, b) => quando(a) - quando(b))) {
    const role = m.autor === "cliente" ? "user" : "assistant"
    if (!turnos.length && role === "assistant") continue
    const parte =
      m.autor === "cliente"
        ? textoDoCliente(m)
        : m.autor === "equipe"
          ? `[uma pessoa da equipe escreveu] ${m.texto ?? ""}`.trim()
          : (m.texto ?? "")
    if (!parte) continue
    const ultimo = turnos[turnos.length - 1]
    if (ultimo?.role === role) ultimo.partes.push(parte)
    else turnos.push({ role, partes: [parte] })
  }
  if (!turnos.length || turnos[turnos.length - 1].role !== "user") return null
  return turnos.map((t) => ({ role: t.role, content: t.partes.join("\n") }))
}

/* ── o texto que sai ─────────────────────────────────────────────────────── */

/**
 * O TEXTO DO JEITO DO WHATSAPP: o negrito de lá é UM asterisco (`*assim*`),
 * link em markdown não existe (vira "texto: endereço"), e título com `#`
 * aparece com o `#`. Corta no limite da Meta, sem quebrar palavra.
 */
export function textoPraEnviar(bruto: string, limite = 4000): string {
  let t = bruto
    .replace(/\r\n/g, "\n")
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/__(.+?)__/g, "_$1_")
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, (_, rotulo: string, url: string) =>
      rotulo.trim() === url ? url : `${rotulo}: ${url}`
    )
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  if (t.length > limite) {
    const corte = t.lastIndexOf(" ", limite - 1)
    t = `${t.slice(0, corte > limite / 2 ? corte : limite - 1).trimEnd()}…`
  }
  return t
}

/* ── quando responder ────────────────────────────────────────────────────── */

export type ConversaLida = {
  situacao: "bot" | "equipe"
  equipe_desde: Date | null
  ultima_entrada_em: Date | null
  pendente_desde: Date | null
}

export type Decisao =
  | { fazer: "responder" }
  /** A pessoa ainda pode estar escrevendo: espera a próxima rodada. */
  | { fazer: "esperar" }
  /** Não responde, e tira da fila (a equipe cuida; ou a janela fechou). */
  | { fazer: "largar"; porque: "equipe" | "janela" | "nada" }

/**
 * O que fazer com uma conversa da fila agora. A equipe tem a conversa até
 * alguém dela responder por último e passar `VOLTA_PRO_BOT_EM_H` sem
 * mensagem dela — `ultimaDaEquipe` é a hora da última mensagem da equipe
 * (ou `null`).
 */
export function decidir(c: ConversaLida, agora: Date, ultimaDaEquipe: Date | null = null): Decisao {
  if (!c.pendente_desde || !c.ultima_entrada_em) return { fazer: "largar", porque: "nada" }
  if (agora.getTime() - c.ultima_entrada_em.getTime() >= JANELA_H * 3_600_000)
    return { fazer: "largar", porque: "janela" }
  if (c.situacao === "equipe") {
    const desde = Math.max(c.equipe_desde?.getTime() ?? 0, ultimaDaEquipe?.getTime() ?? 0)
    if (agora.getTime() - desde < VOLTA_PRO_BOT_EM_H * 3_600_000)
      return { fazer: "largar", porque: "equipe" }
  }
  if (agora.getTime() - c.ultima_entrada_em.getTime() < ESPERA_S * 1000) return { fazer: "esperar" }
  return { fazer: "responder" }
}

/* ── o telefone ──────────────────────────────────────────────────────────── */

/**
 * A CHAVE DE UM TELEFONE DO BRASIL: o DDD e os 8 últimos dígitos. É o que
 * casa o número do WhatsApp com o telefone que a pessoa digitou no checkout,
 * do jeito que for: "+55 (11) 98888-7777", "11988887777", "5511988887777".
 *
 * Os 8 últimos, e não os 9: o WhatsApp de muita gente cadastrada antes do
 * nono dígito vem SEM ele (`5511 8888-7777`), e o checkout grava com. O DDD
 * junto impede o mesmo final de outra cidade de casar.
 */
export function chaveDoTelefone(v: string | null | undefined): string | null {
  let d = (v ?? "").replace(/\D/g, "")
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2)
  if (d.length !== 10 && d.length !== 11) return null
  return `${d.slice(0, 2)}${d.slice(-8)}`
}
