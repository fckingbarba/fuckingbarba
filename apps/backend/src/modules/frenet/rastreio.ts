import {
  cabecalho,
  mesmoSegredo,
  texto,
  type Chegada,
  type Consulta,
  type EventoDoParceiro,
  type LeituraDoAviso,
  type Novidade,
  type ParceiroDeEntrega,
  type PerguntaDeRastreio,
} from "../../lib/envios/parceiro"
import { transportadoraPeloCodigo, type TipoDeEvento } from "../../lib/envios/situacao"

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
 *
 * ┌─ A ETIQUETA DO PAINEL NÃO AVISA — ENTÃO A LOJA PERGUNTA ───────────────┐
 * │ A Frenet confirmou (23/09): o aviso de rastreio só sai pros pedidos da │
 * │ plataforma onde ele foi cadastrado — os que entram pela API de pedidos │
 * │ deles, que exige o token de PARCEIRO (homologação). A etiqueta gerada  │
 * │ à mão no painel não é de plataforma nenhuma, e não avisa ninguém.      │
 * │                                                                        │
 * │ Por isso existe o `consultar`, lá embaixo: com o código que o admin    │
 * │ cadastrou no pedido ("Mark as shipped"), a loja pergunta à Frenet, de  │
 * │ hora em hora, como está o pacote (`POST /tracking/trackinginfo`, com o │
 * │ token da própria loja). A resposta tem o MESMO formato do aviso e      │
 * │ passa pelo mesmo tradutor.                                             │
 * └────────────────────────────────────────────────────────────────────────┘
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

/**
 * A consulta mora no mesmo servidor da cotação — o `FRENET_URL`, que os
 * conferidores apontam pra Frenet falsa (ver `client.ts`).
 */
function enderecoDaConsulta(): string {
  return new URL(
    "/tracking/trackinginfo",
    process.env.FRENET_URL || "https://api.frenet.com.br"
  ).toString()
}

/**
 * A consulta pede o serviço da entrega junto com o código: é por ele que a
 * Frenet sabe em qual transportadora perguntar. O pedido guarda o da
 * cotação (`validateFulfillmentData`, em `service.ts`); sem ele — pedido de
 * antes de 23/09, ou cotação que falhou na hora —, o código dos Correios
 * vai pelo PAC, que é a mesma transportadora. Suposição: se a consulta dos
 * Correios voltar com erro de serviço, é este número.
 */
const PAC = "04510"

const PRAZO_DA_CONSULTA_MS = 8_000

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

  async consultar({ codigo, servico }: PerguntaDeRastreio): Promise<Consulta> {
    const token = process.env.FRENET_TOKEN
    if (!token) return { ok: false, motivo: "sem FRENET_TOKEN" }
    const doServico = servico ?? (transportadoraPeloCodigo(codigo) === "Correios" ? PAC : null)
    if (!doServico) {
      return {
        ok: false,
        motivo: "o pedido não guardou o serviço da entrega, e o código não é dos Correios",
      }
    }

    const desistir = new AbortController()
    const relogio = setTimeout(() => desistir.abort(), PRAZO_DA_CONSULTA_MS)
    try {
      const r = await fetch(enderecoDaConsulta(), {
        method: "POST",
        headers: { token, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ ShippingServiceCode: doServico, TrackingNumber: codigo }),
        signal: desistir.signal,
      })
      if (!r.ok) return { ok: false, motivo: `a Frenet respondeu ${r.status}` }
      const corpo = (await r.json()) as Record<string, unknown> | null
      const erro = texto(corpo?.ErrorMessage)
      if (erro) return { ok: false, motivo: `a Frenet disse: ${erro}` }
      const novidade = traduzirAviso({ ...corpo, TrackingNumber: corpo?.TrackingNumber || codigo })
      return novidade ? { ok: true, novidade } : { ok: false, motivo: "resposta sem rastreio" }
    } catch (e) {
      return {
        ok: false,
        motivo: desistir.signal.aborted
          ? "a Frenet não respondeu a tempo"
          : e instanceof Error
            ? e.message
            : String(e),
      }
    } finally {
      clearTimeout(relogio)
    }
  },
}
