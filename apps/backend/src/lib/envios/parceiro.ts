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
 * DOIS JEITOS DE SABER DE UM PACOTE, e o parceiro tem um ou os dois:
 *
 *   `lerAviso` — o parceiro AVISA (webhook), a cada evento;
 *   `consultar` — a loja PERGUNTA, de hora em hora (o job
 *     `acompanhar-envios`). É o que faz andar o pacote que não tem aviso:
 *     na Frenet, toda etiqueta gerada à mão no painel (ver `rastreio.ts`).
 *
 * E UM JEITO DE O PACOTE NASCER NO PARCEIRO: `registrarPedido` manda o
 * pedido pago pro painel dele, pra etiqueta sair sem ninguém digitar nada —
 * e o aviso de rastreio, na postagem, voltar sozinho com o número do pedido
 * (ver `lib/envios/registro.ts`). `tirarPedido` desfaz, quando o pedido é
 * cancelado antes de sair. Os três são OPCIONAIS: parceiro que não tem, não
 * implementa.
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

/** O que a loja pergunta ao parceiro sobre um pacote. */
export type PerguntaDeRastreio = {
  /** O código de rastreio. */
  codigo: string
  /**
   * O serviço NO parceiro (o `ServiceCode` da Frenet), quando o pedido
   * guardou — ele é escolhido na cotação, junto com a entrega.
   */
  servico: string | null
}

/** A resposta: a novidade, ou por que não deu (vai pro log). */
export type Consulta = { ok: true; novidade: Novidade } | { ok: false; motivo: string }

/**
 * O pedido pago, com o que a etiqueta precisa — no vocabulário da loja, e
 * não no do parceiro (o tradutor de cada um monta o formato dele).
 */
export type PedidoParaOParceiro = {
  /** O número que a loja mostra (o `#` da conta e do admin). */
  numero: number
  /**
   * Como o pedido se chama no parceiro: `referenciaDoPedido(numero)`. É o
   * que o aviso de rastreio traz de volta, e por onde o núcleo acha o pedido.
   */
  referencia: string
  /** ISO. */
  criadoEm: string
  /** Em reais: o que a pessoa pagou, frete incluído. */
  total: number
  /** Em reais: o que os produtos custaram, já com desconto. Vale como valor declarado. */
  valorDosProdutos: number
  /** Em reais: o frete que a pessoa pagou. */
  frete: number
  email: string | null
  destinatario: {
    nome: string
    /** CPF ou CNPJ, sem pontuação (o CNPJ novo tem letras). */
    documento: string | null
    /** Só dígitos, com DDD. */
    telefone: string | null
    endereco: {
      /** Só dígitos. */
      cep: string
      rua: string
      numero: string
      complemento: string | null
      bairro: string
      cidade: string
      uf: string
    }
  }
  itens: {
    /** O id da linha do pedido. */
    id: string
    produtoId: string | null
    sku: string | null
    nome: string
    quantidade: number
    /** Em reais, por unidade. */
    preco: number
    pesoEmGramas: number
    /** Em centímetros. */
    comprimento: number
    largura: number
    altura: number
  }[]
  /** O serviço escolhido na cotação (`data.servico` do método de entrega), quando guardado. */
  servico: { codigo: string; nome: string | null; transportadora: string | null } | null
  /**
   * A nota fiscal autorizada, quando o ERP emite (`lib/erp/notas.ts`): vai
   * junto, pra etiqueta sair sem ninguém digitar a nota. Sem ela, o painel
   * recebe o pedido como sempre, e a nota é a feita à mão.
   */
  nota: {
    numero: string
    serie: string | null
    chave: string
    /** Em reais. */
    valor: number | null
    /** ISO. */
    emitidaEm: string | null
  } | null
}

/**
 * O NOME DO PEDIDO NO PARCEIRO: "FB-1042", o número da loja com o prefixo da
 * marca.
 *
 * A Nuvemshop continua ligada na mesma conta da Frenet, com a numeração
 * dela. Sem o prefixo, o 1042 da loja nova e o 1042 de lá seriam o mesmo
 * número no painel — e no aviso de rastreio que volta. O núcleo aceita
 * "FB-1042", "#1042" e "1042" (`pedidoDaReferencia`, em `nucleo.ts`).
 */
export const referenciaDoPedido = (numero: number) => `FB-${numero}`

export type RegistroNoParceiro =
  | { ok: true; idNoParceiro: string }
  | {
      ok: false
      motivo: string
      /** Tentar de novo não resolve: o parceiro recusou o que recebeu. */
      definitivo: boolean
    }

export interface ParceiroDeEntrega {
  /** Sem acento, minúsculo: vai no endereço do aviso, `/hooks/envio/<id>`. */
  id: string
  /** Pro log: "Frenet". */
  nome: string
  /** Confere se o aviso é mesmo do parceiro e traduz. Não pode lançar. */
  lerAviso(chegada: Chegada): LeituraDoAviso
  /**
   * Pergunta como está um pacote — o caminho do pacote que não tem aviso.
   * Opcional. Não pode lançar: o job pergunta por vários de uma vez, e um
   * erro não pode parar os outros.
   */
  consultar?(pergunta: PerguntaDeRastreio): Promise<Consulta>
  /**
   * O registro de pedidos está ligado? (Na Frenet, só com o token de
   * parceiro.) Desligado, a loja nem monta o pedido pra mandar.
   */
  registraPedidos?(): boolean
  /** Manda o pedido pago pro painel do parceiro. Não pode lançar. */
  registrarPedido?(pedido: PedidoParaOParceiro): Promise<RegistroNoParceiro>
  /** Tira do painel o pedido que foi cancelado antes de sair. Não pode lançar. */
  tirarPedido?(idNoParceiro: string): Promise<{ ok: true } | { ok: false; motivo: string }>
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
