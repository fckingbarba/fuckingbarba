import { createHash, timingSafeEqual } from "node:crypto"
import type { TipoDeEvento } from "./situacao"

/**
 * O CONTRATO DE UM PARCEIRO DE ENTREGA — tudo o que o núcleo pede a ele.
 *
 * Um parceiro é um TRADUTOR: recebe o aviso no formato dele e devolve
 * novidades no vocabulário do núcleo (`situacao.ts`). Não grava nada, não
 * mexe em pedido, não manda e-mail. Isso é o que permite trocar a Frenet
 * por outro amanhã escrevendo UM arquivo: o novo tradutor, registrado em
 * `parceiros.ts`.
 *
 * ┌─ O QUE AINDA NÃO ESTÁ NO CONTRATO, E ONDE ENTRA ───────────────────────┐
 * │ • `registrarPedido(pedido)` — mandar o pedido pago pro painel do       │
 * │   parceiro, pra etiqueta sair sem digitar. Na Frenet exige o token de  │
 * │   parceiro (homologação); o gancho é o `pagamento-capturado.ts`.       │
 * │ • `consultar(envio)` — perguntar como está um pacote, pro parceiro sem │
 * │   webhook (ou pro aviso que se perdeu). Devolveria `Novidade`, e o job │
 * │   `acompanhar-envios` passaria a chamar. Na Frenet pede o código do    │
 * │   serviço cotado, que o pedido ainda não guarda.                       │
 * │ Os dois são métodos OPCIONAIS: parceiro que não tem, não implementa.   │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

/** Um evento da transportadora, já traduzido. */
export type EventoDoParceiro = {
  tipo: TipoDeEvento
  /** A hora do fato, na transportadora — não a da chegada do aviso. */
  quando: Date
  /** O texto como a transportadora escreveu: "Objeto saiu para entrega ao destinatário". */
  descricao: string
  /** "Blumenau-SC", quando vem. */
  local: string | null
  /** O evento cru, pra auditoria. Nunca vai pra tela. */
  bruto?: unknown
}

/** O que um aviso diz sobre UM pacote. */
export type Novidade = {
  /**
   * Como o parceiro chama o pedido: o id do Medusa (`order_…`), o número que
   * a loja mostra (`1042` ou `#1042`), ou nada. O núcleo resolve.
   */
  pedido: string | null
  /** O id do envio NO parceiro (o `ShipmentId` da Frenet). */
  idNoParceiro: string | null
  /** O código de rastreio. */
  codigo: string | null
  /** O link de rastreio que o parceiro mandou. */
  url: string | null
  transportadora: string | null
  /** "PAC", "SEDEX", ".Package"… */
  servico: string | null
  eventos: EventoDoParceiro[]
}

/** O aviso como chegou na rota, sem interpretação nenhuma. */
export type Chegada = {
  cabecalhos: Record<string, string | string[] | undefined>
  /** A query string (onde fica a `?chave=`, pra quem autentica por ela). */
  consulta: Record<string, unknown>
  /** O corpo já lido como JSON. */
  corpo: unknown
  /** O corpo cru, pra quem confere assinatura. `null` se não veio. */
  bruto: string | null
}

export type LeituraDoAviso =
  | { ok: true; novidades: Novidade[] }
  | {
      ok: false
      /**
       * `nao-autorizado` → 401 (e o parceiro reenvia, se reenviar).
       * `sem-configuracao` → 401 também: quem está fora não precisa saber
       *   que falta variável; o log diz qual.
       * `ilegivel` → 400: não é deste parceiro, ou mudou o formato.
       * `ignorado` → 200: entendido, e não há o que fazer (outro tipo de
       *   aviso, por exemplo). Responder erro aqui só faria o parceiro
       *   reenviar a mesma coisa.
       */
      motivo: "nao-autorizado" | "sem-configuracao" | "ilegivel" | "ignorado"
      detalhe: string
    }

export interface ParceiroDeEntrega {
  /** Sem acento, minúsculo: vai no endereço do aviso, `/hooks/envio/<id>`. */
  id: string
  /** Pro log: "Frenet". */
  nome: string
  /** Confere se o aviso é mesmo do parceiro e traduz. Não pode lançar. */
  lerAviso(chegada: Chegada): LeituraDoAviso
}

/* ── o que todo tradutor usa ──────────────────────────────────────────────── */

/**
 * Compara dois segredos em tempo constante — o tempo da resposta não pode
 * contar quantas letras do chute estavam certas. O hash iguala o tamanho,
 * que o `timingSafeEqual` exige.
 */
export function mesmoSegredo(recebido: string, esperado: string): boolean {
  if (!recebido || !esperado) return false
  const a = createHash("sha256").update(recebido).digest()
  const b = createHash("sha256").update(esperado).digest()
  return timingSafeEqual(a, b)
}

/** Um cabeçalho, sem se preocupar com caixa nem com repetição. */
export function cabecalho(chegada: Chegada, nome: string): string {
  const alvo = nome.toLowerCase()
  for (const [k, v] of Object.entries(chegada.cabecalhos)) {
    if (k.toLowerCase() !== alvo) continue
    return (Array.isArray(v) ? v[0] : v)?.trim() ?? ""
  }
  return ""
}

/** Texto limpo, ou `null` — o que chega de fora nunca é confiável quanto a tipo. */
export function texto(v: unknown, maximo = 300): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(v)
  if (typeof v !== "string") return null
  const limpo = v.replace(/\s+/g, " ").trim()
  return limpo ? limpo.slice(0, maximo) : null
}
