import type { ResultadoDoRegistro } from "../envios/registro"
import type { ResultadoDaNota } from "../erp/notas"
import { lerRegistros as lerEstornos, type Tentativa } from "../estornos"
import { hora, reais, type Data } from "./formato"
import type { Contexto, NotaCrua, Situacao } from "./pedido"

/**
 * AS AÇÕES DO PEDIDO NO PAINEL — "Emitir a nota agora" e "Tentar o estorno
 * de novo": quando o botão aparece, a frase depois do clique e a linha do
 * histórico com o nome de quem apertou.
 *
 * Código puro, como o `pedido.ts`. Quem faz de verdade são as funções que o
 * admin já usava — `tentarDeNovo` (`lib/erp/notas.ts`) e `tentarEstornoAgora`
 * (`lib/estornos.ts`) —, chamadas pelas rotas `POST /dashboard/pedidos/:id/nota`
 * e `/estorno`, que perguntam aqui antes de chamar.
 *
 * ┌─ O BOTÃO SÓ APARECE ONDE O ADMIN TAMBÉM DEIXARIA ──────────────────────┐
 * │ • a nota: a que espera a janela ("Emitir a nota agora") e a que a loja │
 * │   desistiu de emitir ("Tentar a nota de novo") — nunca a que a loja    │
 * │   ainda está tentando sozinha, nem a de pedido cancelado;              │
 * │ • o estorno: só o do pagamento inteiro que falhou (o que a loja pede   │
 * │   de novo sozinha), e só pro dono. O parcial fica pro painel do        │
 * │   Pagar.me: pedido de novo, podia devolver duas vezes.                 │
 * │ A rota confere de novo antes de fazer — o botão na tela é conforto.    │
 * └────────────────────────────────────────────────────────────────────────┘
 */

export type AcaoDaNota = "agora" | "de-novo"

/** Os códigos das ações no pedido, no registro da equipe (`equipe_registro.acao`). */
export const EMITIU_NOTA = "emitiu-nota"
export const PEDIU_ESTORNO = "pediu-estorno"
export const MANDOU_PRA_FRENET = "mandou-pra-frenet"
export const ACOES_NO_PEDIDO = [EMITIU_NOTA, PEDIU_ESTORNO, MANDOU_PRA_FRENET]

/** Quando a nota sai sozinha: o pagamento, mais a janela de cancelamento. */
export const notaSaiEm = (pagoEm: Date, ctx: Pick<Contexto, "janelaDaNota">) =>
  new Date(pagoEm.getTime() + ctx.janelaDaNota * 60_000)

export function acaoDaNota(
  nota: NotaCrua | null,
  situacao: Situacao,
  pagoEm: Date | null,
  ctx: Contexto
): AcaoDaNota | null {
  if (!ctx.notasDesde || !nota || nota.cancelar || situacao === "cancelado") return null
  if (nota.situacao !== "a-emitir") return null
  if (nota.definitivo) return "de-novo"
  // Com erro, a loja segue tentando sozinha e diz quando: o botão atropelaria a espera.
  if (nota.erro || !pagoEm) return null
  return notaSaiEm(pagoEm, ctx).getTime() > ctx.agora.getTime() ? "agora" : null
}

/** O estorno que dá pra pedir de novo agora — o que a loja também pede sozinha. */
export function estornoPraTentar(metadata: unknown): boolean {
  return Object.values(lerEstornos(metadata)).some(
    (e) => e.situacao === "falhou" && e.sozinha === true
  )
}

/**
 * O pedido que a Frenet recusou e dá pra mandar de novo — depois de corrigir
 * o que ela apontou (ou o nosso lado, como no #19). A loja não manda de novo
 * sozinha: a recusa é definitiva até alguém apertar.
 */
export function frenetPraTentar(o: { status?: string | null; metadata?: unknown }): boolean {
  const r = (o.metadata as Record<string, unknown> | null | undefined)?.fb_parceiro as
    { entrou?: unknown; definitivo?: unknown } | undefined
  return o.status !== "canceled" && Boolean(r) && r?.entrou === false && r?.definitivo === true
}

/* ── a frase depois do clique ─────────────────────────────────────────────── */

export type Frase = { ok: boolean; texto: string }

/** O "nada a fazer" de `emitirNotaDoPedido`, em português de gente. */
const POR_QUE_NADA: Record<string, string> = {
  "ja-tem": "a nota já existe",
  cancelado: "o pedido foi cancelado",
  "nao-pago": "o pedido não foi pago",
  "pago-antes": "o pedido foi pago antes de a loja emitir nota pelo Bling",
  recusado: "a loja desistiu desta nota",
  esperando: "a próxima tentativa já está marcada",
  "sem ERP": "o Bling não está ligado",
  "pedido não existe": "o pedido não existe",
  "nota processando": "a nota já está na SEFAZ",
  "nota rejeitada": "a SEFAZ rejeitou a nota — corrija e reenvie no Bling",
  "nota denegada": "a SEFAZ denegou a nota — fale com o contador",
}

export function motivoLegivel(motivo: string): string {
  if (POR_QUE_NADA[motivo]) return POR_QUE_NADA[motivo]
  if (/ desconectado$/.test(motivo)) return `o ${motivo} — reconecte no admin`
  return motivo
}

export function fraseDaNota(r: ResultadoDaNota): Frase {
  switch (r.resultado) {
    case "autorizada":
      return {
        ok: true,
        texto: `Nota autorizada${r.numero ? ` — NF-e ${r.numero}` : ""}. O pedido segue pro despacho.`,
      }
    case "processando":
      return {
        ok: true,
        texto: "A nota foi pra SEFAZ. A loja acompanha e avisa se ela não passar.",
      }
    case "esperando":
      return { ok: false, texto: `A nota espera a janela: sai às ${hora(r.notaEm)}.` }
    case "falhou":
      return {
        ok: false,
        texto:
          `A nota não saiu: ${r.motivo}.` +
          (r.definitivo
            ? " Corrija o que falta e tente de novo."
            : " A loja tenta de novo sozinha."),
      }
    default:
      return { ok: false, texto: `Nada a fazer: ${motivoLegivel(r.motivo)}.` }
  }
}

export function fraseDoEstorno(t: Tentativa): Frase {
  switch (t.resultado) {
    case "devolvido":
      return { ok: true, texto: "O Pagar.me confirmou: o dinheiro voltou pra quem comprou." }
    case "pedido":
      return {
        ok: true,
        texto:
          `Pedi de novo o estorno de ${reais(t.falta / 100)}. O Pagar.me leva alguns minutos ` +
          "pra confirmar — a loja confere sozinha, e a faixa muda quando ele voltar.",
      }
    case "andando":
      return { ok: true, texto: "O estorno está andando no Pagar.me: espere ele terminar." }
    case "sem-estorno":
      return { ok: false, texto: "Este pedido não tem estorno pra pedir de novo." }
    default:
      return { ok: false, texto: `Não deu: ${t.motivo}.` }
  }
}

/* ── o registro e o histórico ─────────────────────────────────────────────── */

/** O `detalhe` da linha do registro — o número do pedido e no que deu; nada do cliente. */
export function registroDaNota(r: ResultadoDaNota, tipo: AcaoDaNota, numero: number) {
  return {
    numero,
    tipo,
    resultado: r.resultado,
    ...("motivo" in r ? { motivo: r.motivo } : {}),
    ...(r.resultado === "autorizada" && r.numero ? { nf: r.numero } : {}),
  }
}

export function registroDoEstorno(t: Tentativa, numero: number) {
  return {
    numero,
    resultado: t.resultado,
    ...(t.resultado === "nao-da" ? { motivo: t.motivo } : {}),
    ...(t.resultado === "pedido" ? { falta: t.falta } : {}),
  }
}

/** O motivo sem o "a Frenet recusou o pedido:" da frente — quem lê já está na faixa que diz isso. */
export const motivoDaFrenet = (motivo: string) =>
  motivo.replace(/^a Frenet recusou o pedido:\s*/i, "")

const NADA_NA_FRENET: Record<string, string> = {
  "ja-entrou": "ele já está no painel da Frenet",
  "ja-tem-envio": "o pedido já tem envio no admin — alguém está cuidando dele à mão",
  "esperando-nota": "a nota ainda não saiu, e o pedido vai pra Frenet junto com ela",
  cancelado: "o pedido foi cancelado",
  "nao-pago": "o pedido ainda não foi pago",
  "pago-antes": "o pedido foi pago antes de o registro na Frenet ligar",
  desligado: "o registro na Frenet está desligado (sem o token de parceiro)",
}

/** A frase depois de "Mandar pra Frenet de novo". */
export function fraseDaFrenet(r: ResultadoDoRegistro): { ok: boolean; texto: string } {
  if (r.resultado === "entrou")
    return {
      ok: true,
      texto: `O #${r.numero} entrou no painel da Frenet. É só gerar a etiqueta lá.`,
    }
  if (r.resultado === "falhou")
    return {
      ok: false,
      texto: r.definitivo
        ? `A Frenet recusou de novo: ${motivoDaFrenet(r.motivo)}. Faça a etiqueta à mão no painel da Frenet.`
        : `A Frenet não respondeu agora (${r.motivo}). A loja tenta de novo sozinha.`,
    }
  return { ok: false, texto: `Nada a fazer: ${NADA_NA_FRENET[r.motivo] ?? r.motivo}.` }
}

/** A linha do registro da equipe. */
export function registroDaFrenet(r: ResultadoDoRegistro, numero: number): Record<string, unknown> {
  return {
    numero,
    resultado: r.resultado,
    ...(r.resultado === "entrou" ? { envio: r.id } : {}),
    ...(r.resultado === "falhou" ? { motivo: r.motivo, definitivo: r.definitivo } : {}),
    ...(r.resultado === "nada" ? { motivo: r.motivo } : {}),
  }
}

/** Uma ação da equipe no pedido, lida do registro. */
export type FeitoNoPedido = {
  em: Data
  acao: string
  /** O nome de quem apertou — o do membro, mesmo que ele tenha saído da equipe depois. */
  quem: string
  detalhe: Record<string, unknown> | null
}

export function eventoDoFeito(f: FeitoNoPedido): { titulo: string; detalhe: string } | null {
  const d = f.detalhe ?? {}
  const motivo = typeof d.motivo === "string" ? d.motivo : ""
  const resultado = String(d.resultado ?? "")
  if (f.acao === EMITIU_NOTA) {
    const nf = typeof d.nf === "string" ? ` — NF-e ${d.nf}` : ""
    const deu: Record<string, string> = {
      autorizada: `autorizada na hora${nf}`,
      processando: "foi pra SEFAZ",
      esperando: "ficou esperando a janela",
      falhou: `não saiu: ${motivo}`,
      nada: `nada a fazer: ${motivoLegivel(motivo)}`,
    }
    return {
      titulo:
        d.tipo === "de-novo"
          ? `${f.quem} mandou tentar a nota de novo`
          : `${f.quem} mandou emitir a nota antes da janela`,
      detalhe: deu[resultado] ?? "",
    }
  }
  if (f.acao === PEDIU_ESTORNO) {
    const deu: Record<string, string> = {
      pedido: "o Pagar.me aceitou — confirma em minutos",
      devolvido: "o Pagar.me devolveu na hora",
      andando: "já estava andando no Pagar.me",
      "sem-estorno": "não havia estorno pra pedir",
      "nao-da": `não deu: ${motivo}`,
    }
    return { titulo: `${f.quem} pediu o estorno de novo`, detalhe: deu[resultado] ?? "" }
  }
  if (f.acao === MANDOU_PRA_FRENET) {
    const deu: Record<string, string> = {
      entrou: "entrou no painel da Frenet",
      falhou: d.definitivo
        ? `a Frenet recusou de novo: ${motivoDaFrenet(motivo)}`
        : `a Frenet não respondeu: ${motivo}`,
      nada: `nada a fazer: ${NADA_NA_FRENET[motivo] ?? motivo}`,
    }
    return { titulo: `${f.quem} mandou o pedido pra Frenet de novo`, detalhe: deu[resultado] ?? "" }
  }
  return null
}
