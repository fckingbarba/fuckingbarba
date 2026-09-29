/**
 * O BALÃO DO PEDIDO (0203) — as regras, sem tela.
 *
 * Quem acabou de comprar e volta pra loja (clicou no logo, no "continuar
 * comprando") perdia o pedido de vista: o Pix a pagar, o "já caiu?". O balão
 * fica no canto de baixo da loja por meia hora, mostra em que pé está e abre
 * o resumo com o Pix pra copiar.
 *
 * QUEM SABE QUE HOUVE PEDIDO É UM COOKIE LEGÍVEL, curto (`COOKIE_BALAO`),
 * gravado junto do crachá no `abrirPedido`. O crachá é `httpOnly` e dura uma
 * semana — o navegador não enxerga, e uma semana é tempo demais pra um
 * balão. Este aqui só diz "houve um pedido agora há pouco, e é este id": o
 * vigia lê e só então pergunta ao servidor. Quem não comprou não faz
 * requisição nenhuma, e a casca da loja continua estática.
 *
 * O id no cookie não abre nada: os detalhes vêm de `/api/pedido-recente`, que
 * exige o crachá — o mesmo direito da tela de obrigado.
 */

export const COOKIE_BALAO = "pedido_recente"

/** Meia hora de balão depois do pedido — o pedido dele. */
export const JANELA_MS = 30 * 60_000

/**
 * O Pix vale 30 minutos, e o balão também: sem folga, quem gerou o Pix no
 * último instante veria o balão sumir junto com o código, sem saber que
 * venceu. O balão fica até 10 minutos depois do vencimento, pra dizer isso.
 */
export const FOLGA_DEPOIS_DO_PIX_MS = 10 * 60_000

/** A vida do cookie: a janela mais o Pix mais longo que se espera, com sobra. */
export const VIDA_DO_COOKIE_S = 60 * 60

/** Onde o balão não aparece: o próprio checkout (e o obrigado, que já é o pedido inteiro). */
export function semBalaoNesta(caminho: string): boolean {
  return caminho === "/checkout" || caminho.startsWith("/checkout/")
}

/** A chave de "esconder" do X, por pedido: um pedido novo volta a mostrar. */
export const chaveDeEsconder = (pedidoId: string) => `balao-escondido:${pedidoId}`

export type ItemDoBalao = {
  nome: string
  variante: string | null
  imagem: string | null
  quantidade: number
  total: number
}

/** O que `/api/pedido-recente` responde quando há o que mostrar. */
export type DadosDoBalao = {
  id: string
  numero: number
  /** Quando o pedido nasceu (ISO). */
  quando: string
  estado: "aguardando" | "analise" | "pago" | "cancelado" | "combinar"
  pix: { copiaECola: string; expiraEm: string } | null
  itens: ItemDoBalao[]
  total: number
}

export type EstadoDoBalao = "pix" | "analise" | "pago" | "venceu" | "combinar"

/**
 * O estado que a tela mostra. O Pix vencido ainda aparece como "aguardando"
 * até o backend cancelar o pedido (há uma folga lá) — a tela não espera: com
 * o código vencido, já é "venceu".
 */
export function estadoNaTela(d: DadosDoBalao, agora: number): EstadoDoBalao {
  if (d.estado === "pago") return "pago"
  if (d.estado === "cancelado") return "venceu"
  if (d.estado === "analise") return "analise"
  if (d.estado === "combinar") return "combinar"
  const vence = Date.parse(d.pix?.expiraEm ?? "")
  if (Number.isFinite(vence) && agora >= vence) return "venceu"
  return "pix"
}

/**
 * Até quando o balão fica: meia hora depois do pedido, esticada até 10
 * minutos depois do vencimento do Pix quando ele vence mais tarde — só
 * enquanto o Pix não foi pago (ou venceu). Pago, o Pix não conta mais.
 */
export function prazoDoBalao(d: Pick<DadosDoBalao, "quando" | "pix" | "estado">): number {
  const nasceu = Date.parse(d.quando)
  const base = Number.isFinite(nasceu) ? nasceu + JANELA_MS : Date.now() + JANELA_MS
  if (d.estado !== "aguardando" && d.estado !== "cancelado") return base
  const vence = Date.parse(d.pix?.expiraEm ?? "")
  return Number.isFinite(vence) ? Math.max(base, vence + FOLGA_DEPOIS_DO_PIX_MS) : base
}

/** Os minutos que o Pix ainda vale, arredondados pra cima (como na tela de obrigado). */
export function minutosDoPix(expiraEm: string | undefined, agora: number): number | null {
  const fim = Date.parse(expiraEm ?? "")
  if (!Number.isFinite(fim)) return null
  return Math.max(0, Math.ceil((fim - agora) / 60_000))
}
