/**
 * O ESTADO DE UM PAGAMENTO — a língua comum dos parceiros.
 *
 * Todo parceiro de pagamento (`./parceiros.ts`) grava na sessão do Medusa
 * este MESMO formato, cada um na sua chave de `data` (`data.pagarme`, …).
 * É daqui que lê tudo que mostra ou decide alguma coisa sobre um pagamento:
 * a tela de obrigado e a conta, os e-mails, o painel, a nota fiscal, o
 * Marketing. Nenhum deles sabe qual parceiro cobrou — só a forma, a
 * situação, o QR do Pix, o final do cartão, a frase da recusa e quanto
 * voltou.
 *
 * Como o parceiro grava (sempre o estado INTEIRO, com `null` explícito) e
 * por quê, está na caixa do `modules/pagarme/situacao.ts`: o Medusa MISTURA
 * o `data` da sessão com o que já estava lá, em vez de substituir.
 */

export type Forma = "pix" | "cartao"

export type Situacao =
  /** Sessão aberta, nada enviado ao parceiro ainda. */
  | "nova"
  /** Pix gerado, esperando o pagamento. */
  | "aguardando"
  /**
   * Cartão autorizado, com o valor só RESERVADO: esperando a análise de
   * fraude (ou, aprovada, a cobrança) — pode virar pago ou recusado. Ver
   * "A ANÁLISE ANTES DA COBRANÇA", no `modules/pagarme/situacao.ts`.
   */
  | "analise"
  | "pago"
  /** Cartão não autorizado (banco ou antifraude). */
  | "recusado"
  /** Não deu pra criar a cobrança (Pix fora do ar, dado inválido). */
  | "falhou"
  | "cancelado"
  | "estornado"
  /**
   * A criação sumiu no caminho (rede, 5xx) e a gente NÃO SABE se o parceiro
   * cobrou. A conciliação procura pelo código e estorna o que achar.
   */
  | "incerto"
  /**
   * O PEDIDO FOI CANCELADO AQUI, e a reserva do cartão ainda não foi desfeita
   * lá (no Pagar.me, o `DELETE` respondeu 412, ou não respondeu). A sessão
   * continua pendente, e a conciliação tenta de novo a cada rodada. Enquanto
   * isso, o cartão NUNCA é cobrado: sem esta marca, a análise que aprovasse
   * depois cobrava a compra de um pedido que não existe mais — e o dinheiro
   * aparecia e sumia da fatura (ver o `authorizePayment` do Pagar.me).
   */
  | "cancelando"

/**
 * POR QUE NÃO DEU, pra quem DECIDE — a frase (`recusa`) é pra quem lê. Só na
 * sessão que não deu ("falhou", "recusado", "incerto"); `null` no resto.
 *
 * - "fora": o parceiro não atendeu — sem resposta, tempo esgotado, 5xx, a
 *   chave recusada (401/403). É a única que o disjuntor conta
 *   (`lib/pagamento/disjuntor.ts`): parceiro instável é parceiro que não
 *   atende;
 * - "recusa": ele atendeu e disse não (um 4xx, o Pix que saiu "falhou" lá, o
 *   cartão que o banco ou a análise recusaram);
 * - "interno": nem chegou a ir — a sessão sem estado, a entrada que não
 *   passou na conferência, o valor que não bateu.
 *
 * Qualquer uma delas, no Pix, manda a loja tentar o outro parceiro no mesmo
 * clique (`finalizar`, na loja): QR que não nasceu não cobra ninguém.
 */
export type Falha = "fora" | "recusa" | "interno"

/** O que fica em `data[<chave do parceiro>]`. Sempre com todas as chaves. */
export type Estado = {
  forma: Forma
  situacao: Situacao
  /** Centavos. Antes de autorizar, o da sessão; depois, o do pedido no parceiro. */
  valor: number
  /** O pedido no parceiro (no Pagar.me, `or_…`). */
  pedido: string | null
  /** A cobrança no parceiro — é nela que se cancela e estorna (no Pagar.me, `ch_…`). */
  cobranca: string | null
  parcelas: number
  pix: { copiaECola: string; imagem: string; expiraEm: string } | null
  cartao: { bandeira: string; final: string } | null
  /** O que dizer pra quem teve o pagamento recusado. Frase pronta. */
  recusa: string | null
  /** Por que não deu (`Falha`) — só na sessão que falhou. */
  falha: Falha | null
  /** Centavos já devolvidos. */
  estornado: number
}

const FALHAS: readonly Falha[] = ["fora", "recusa", "interno"]

/** O estado de uma sessão recém-aberta: nada foi pro parceiro ainda. */
export function estadoNovo(forma: Forma, valor: number, parcelas: number): Estado {
  return {
    forma,
    situacao: "nova",
    valor,
    pedido: null,
    cobranca: null,
    parcelas,
    pix: null,
    cartao: null,
    recusa: null,
    falha: null,
    estornado: 0,
  }
}

/** O estado gravado em `data[chave]`, ou null se não há um lá. */
export function lerEstado(
  data: Record<string, unknown> | null | undefined,
  chave: string
): Estado | null {
  const d = data?.[chave]
  if (!d || typeof d !== "object") return null
  const e = d as Partial<Estado>
  if (e.forma !== "pix" && e.forma !== "cartao") return null
  const texto = (v: unknown) => (typeof v === "string" && v ? v : null)
  return {
    forma: e.forma,
    situacao: (e.situacao ?? "nova") as Situacao,
    valor: Number(e.valor ?? 0),
    pedido: texto(e.pedido),
    cobranca: texto(e.cobranca),
    parcelas: Number(e.parcelas ?? 1),
    pix: e.pix && typeof e.pix === "object" ? e.pix : null,
    cartao: e.cartao && typeof e.cartao === "object" ? e.cartao : null,
    recusa: texto(e.recusa),
    // A sessão gravada antes da 0150 não tem: fica `null`.
    falha: FALHAS.includes(e.falha as Falha) ? (e.falha as Falha) : null,
    estornado: Number(e.estornado ?? 0),
  }
}
