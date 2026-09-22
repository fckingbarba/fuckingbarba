import {
  cabecalho,
  mesmoSegredo,
  texto,
  type Chegada,
  type EventoDoParceiro,
  type LeituraDoAviso,
  type Novidade,
  type ParceiroDeEntrega,
} from "../../lib/envios/parceiro"
import type { TipoDeEvento } from "../../lib/envios/situacao"

/**
 * A FRENET COMO PARCEIRO DE ENTREGA — o tradutor do aviso de rastreio.
 *
 * É o webhook "Atualização de Tracking" da documentação deles: a Frenet
 * chama `POST /hooks/envio/frenet` a cada evento da transportadora, com UM
 * evento por vez (o mais recente). Este arquivo confere se veio dela e
 * traduz pro vocabulário do núcleo. Tudo que é FORMATO DELES mora aqui,
 * como a cotação mora no `client.ts` — no dia em que a Frenet sair, esta
 * pasta sai junto e o núcleo nem percebe.
 *
 *   {
 *     "OrderId": "1042",             ← como o pedido foi cadastrado lá
 *     "ShipmentId": 21255,           ← o id do envio na Frenet
 *     "TrackingNumber": "QS123456789BR",
 *     "TrackingUrl": "https://…",
 *     "ServiceDescrition": "PAC",    ← assim mesmo, sem o "p". É o nome deles.
 *     "TrackingEvents": [{ "EventDateTime": "10/02/2017 16:48",
 *       "EventDescription": "Objeto entregue ao destinatário",
 *       "EventLocation": "Boa Nova-BA", "EventType": "9" }]
 *   }
 *
 * ┌─ QUEM PODE CHAMAR ─────────────────────────────────────────────────────┐
 * │ A Frenet manda um cabeçalho de segurança que ELA configura com o nome  │
 * │ e o valor que você passar (o TOKEN_NAME/TOKEN_VALUE da documentação).  │
 * │ Aqui: cabeçalho `x-webhook-token` com o valor do `FRENET_WEBHOOK_TOKEN`│
 * │ (Railway). Se a Frenet só aceitar a URL, a mesma chave vai no fim     │
 * │ dela: `…/hooks/envio/frenet?chave=<valor>`.                            │
 * │                                                                         │
 * │ Sem a variável, ninguém passa — a porta falha FECHADA, e o log diz    │
 * │ por quê. O aviso sem autenticação que a documentação permite não      │
 * │ serve aqui: qualquer um que soubesse a URL marcaria pedido como       │
 * │ entregue.                                                              │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * O OUTRO WEBHOOK DELES ("Atualização de Dados de Pedidos", com
 * `ShipmentStatus` e saldo da carteira) não interessa ao cliente: se chegar
 * aqui, é respondido com 200 e ignorado. O "postado" que ele traz, o de
 * rastreio também traz — com o código junto.
 */

export const CABECALHO_DO_TOKEN = "x-webhook-token"

/**
 * Os códigos do `EventType`, da documentação ("Atualização de Tracking").
 * O 18 é "o cliente deixou no ponto de postagem e está aguardando coleta":
 * pra quem comprou, a encomenda já saiu da loja — é "postado".
 */
const CODIGOS: Record<string, TipoDeEvento> = {
  "18": "postado",
  "0": "postado",
  "1": "em_transito",
  "2": "atrasado",
  "3": "devolvido",
  "4": "extraviado",
  "5": "saiu_para_entrega",
  "9": "entregue",
}

/** O texto da documentação, pra quando o evento vier sem descrição. */
const DESCRICAO_PADRAO: Record<string, string> = {
  "18": "Aguardando coleta no ponto de postagem",
  "0": "Postado",
  "1": "Em trânsito",
  "2": "Atraso",
  "3": "Objeto devolvido",
  "4": "Extravio",
  "5": "Saiu para entrega",
  "9": "Objeto entregue",
}

/**
 * "10/02/2017 16:48" — a hora de Brasília, sem fuso escrito. O Brasil não
 * tem horário de verão desde 2019, então é sempre −03:00. Aceita segundos e
 * ISO, por via das dúvidas.
 */
export function lerHoraDaFrenet(v: unknown): Date | null {
  const bruto = String(v ?? "").trim()
  const m = bruto.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/)
  if (m) {
    const [, dia, mes, ano, hora = "00", minuto = "00", segundo = "00"] = m
    const d = new Date(`${ano}-${mes}-${dia}T${hora}:${minuto}:${segundo}-03:00`)
    return Number.isNaN(d.getTime()) ? null : d
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(bruto)) {
    const d = new Date(bruto)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

function traduzirEvento(bruto: unknown, chegouEm: Date): EventoDoParceiro | null {
  if (!bruto || typeof bruto !== "object") return null
  const e = bruto as Record<string, unknown>
  const codigo = texto(e.EventType, 10) ?? ""
  const tipo = CODIGOS[codigo] ?? "informativo"
  const descricao = texto(e.EventDescription) ?? DESCRICAO_PADRAO[codigo] ?? null
  if (!descricao) return null
  return {
    tipo,
    /*
      Sem hora legível, vale a da chegada: melhor um evento com a hora
      aproximada do que um "entregue" jogado fora. O preço é que o mesmo
      evento reenviado sem hora não se reconhece como repetido — e a
      documentação diz que a hora sempre vem.
    */
    quando: lerHoraDaFrenet(e.EventDateTime) ?? chegouEm,
    descricao,
    local: texto(e.EventLocation, 120),
    bruto,
  }
}

/** Um aviso de rastreio da Frenet → uma novidade. `null` se não for um. */
export function traduzirAviso(corpo: unknown, chegouEm = new Date()): Novidade | null {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return null
  const a = corpo as Record<string, unknown>
  if (!("TrackingNumber" in a) && !("TrackingEvents" in a)) return null
  const eventos = (Array.isArray(a.TrackingEvents) ? a.TrackingEvents : [])
    .map((e) => traduzirEvento(e, chegouEm))
    .filter((e): e is EventoDoParceiro => e !== null)
  return {
    pedido: texto(a.OrderId, 80),
    idNoParceiro: texto(a.ShipmentId, 40),
    codigo: texto(a.TrackingNumber, 60),
    url: texto(a.TrackingUrl, 500),
    // A Frenet não diz a transportadora — o núcleo reconhece a dos Correios pelo código.
    transportadora: null,
    servico: texto(a.ServiceDescrition ?? a.ServiceDescription, 80),
    eventos,
  }
}

export const frenet: ParceiroDeEntrega = {
  id: "frenet",
  nome: "Frenet",

  lerAviso(chegada: Chegada): LeituraDoAviso {
    const esperado = process.env.FRENET_WEBHOOK_TOKEN ?? ""
    if (!esperado) {
      return {
        ok: false,
        motivo: "sem-configuracao",
        detalhe: "FRENET_WEBHOOK_TOKEN não configurado — nenhum aviso da Frenet é aceito",
      }
    }
    const chave = chegada.consulta.chave
    const recebido =
      cabecalho(chegada, CABECALHO_DO_TOKEN) || (typeof chave === "string" ? chave : "")
    if (!mesmoSegredo(recebido, esperado)) {
      return {
        ok: false,
        motivo: "nao-autorizado",
        detalhe: recebido ? "token errado" : `sem o cabeçalho ${CABECALHO_DO_TOKEN}`,
      }
    }

    const corpos = Array.isArray(chegada.corpo) ? chegada.corpo : [chegada.corpo]
    const chegouEm = new Date()
    const novidades = corpos
      .map((c) => traduzirAviso(c, chegouEm))
      .filter((n): n is Novidade => n !== null)
    if (novidades.length) return { ok: true, novidades }

    const primeiro = corpos[0] as Record<string, unknown> | undefined
    if (primeiro && typeof primeiro === "object" && "ShipmentStatus" in primeiro) {
      return {
        ok: false,
        motivo: "ignorado",
        detalhe: "aviso de status do pedido (carteira) — só o de rastreio interessa",
      }
    }
    return { ok: false, motivo: "ilegivel", detalhe: "não parece um aviso de rastreio da Frenet" }
  },
}
