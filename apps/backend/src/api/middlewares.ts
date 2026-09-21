import {
  authenticate,
  defineMiddlewares,
  type MedusaNextFunction,
  type MedusaRequest,
  type MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"

/**
 * URLs em português, limpas e congeladas (seção SEO da arquitetura).
 *
 * O Medusa guarda só o `handle` (slug) de produto e categoria; a URL
 * /produtos/<handle> e /<categoria> é montada pelo Next.js. Aqui garantimos,
 * na entrada do admin, que todo handle é `a-z`, `0-9` e hífen — sem acento,
 * sem maiúscula, sem espaço — e que um handle gerado a partir do título
 * também obedece a isso ("Óleo para Barba" → "oleo-para-barba").
 */
const HANDLE_VALIDO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function gerarHandle(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // tira acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

type CorpoComHandle = { handle?: unknown; title?: unknown; name?: unknown }

function normalizaHandle(req: MedusaRequest, _res: MedusaResponse, next: MedusaNextFunction) {
  const corpo = (req.body ?? {}) as CorpoComHandle
  const criando = !req.params?.id

  if (typeof corpo.handle === "string" && corpo.handle.length > 0) {
    if (!HANDLE_VALIDO.test(corpo.handle)) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `Handle "${corpo.handle}" inválido: use só letras minúsculas sem acento, números e hífen (ex.: "oleo-para-barba"). Esse texto vira a URL da página e não deve mudar depois de publicado.`
      )
    }
    return next()
  }

  // Sem handle na criação: gera um limpo a partir do título/nome em vez de
  // deixar o Medusa gerar com acento ("óleo-para-barba-ação").
  // O handler da rota lê `req.validatedBody` (já validado pelo core antes de
  // chegar aqui), então o handle precisa entrar nos dois objetos.
  if (criando) {
    const base = corpo.title ?? corpo.name
    if (typeof base === "string" && base.trim()) {
      const handle = gerarHandle(base)
      corpo.handle = handle
      const validado = (req as MedusaRequest & { validatedBody?: CorpoComHandle }).validatedBody
      if (validado && typeof validado === "object") {
        validado.handle = handle
      }
    }
  }
  next()
}

/**
 * PAGAMENTO DE PEDIDO FECHADO NÃO SE REABRE pela API pública.
 *
 * `POST /store/payment-collections/:id/payment-sessions` abre uma sessão de
 * pagamento nova — e, antes, APAGA todas as da coleção. O Medusa não confere
 * se a coleção já é de um pedido: basta o id dela (que vem no carrinho) e a
 * chave publicável. Num pedido com o Pix esperando, isso apaga a sessão do
 * Pix; o cliente paga o QR que está na tela dele, o aviso do Pagar.me chega
 * procurando uma sessão que não existe, e o pedido fica "aguardando" pra
 * sempre — com o dinheiro sendo estornado pela conciliação como órfão.
 *
 * Então: coleção que já é de um pedido (ou de um carrinho fechado) e que já
 * teve sessão ou pagamento, não recebe sessão nova por aqui. O que continua
 * livre: o checkout normal (carrinho aberto, trocando Pix por cartão, tentando
 * de novo depois de um cartão recusado) e a coleção nova que uma edição de
 * pedido cria, que nasce sem sessão nenhuma. O admin marca pedido como pago
 * por outro caminho, que não passa por esta rota.
 */
async function pagamentoDePedidoFechado(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "payment_collection",
    fields: ["id", "order.id", "cart.completed_at", "payment_sessions.id", "payments.id"],
    filters: { id: req.params.id },
  })
  const colecao = data[0] as
    | {
        order?: { id?: string } | null
        cart?: { completed_at?: unknown } | null
        payment_sessions?: unknown[] | null
        payments?: unknown[] | null
      }
    | undefined

  const fechada = Boolean(colecao?.order?.id || colecao?.cart?.completed_at)
  const usada = Boolean(colecao?.payment_sessions?.length || colecao?.payments?.length)
  if (fechada && usada) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Este pagamento já é de um pedido fechado e não pode ser aberto de novo."
    )
  }
  next()
}

export default defineMiddlewares({
  routes: [
    {
      matcher: "/store/payment-collections/:id/payment-sessions",
      method: ["POST"],
      middlewares: [pagamentoDePedidoFechado],
    },
    /*
      O token que chega aqui ainda não tem cliente (é pra isso que a rota
      existe), então `allowUnregistered`. Só `bearer`: quem chama é o
      servidor da loja, que guarda o token no cookie dela — sessão do Medusa
      não entra nessa conversa.
    */
    {
      matcher: "/store/conta/vincular",
      method: ["POST"],
      middlewares: [authenticate("customer", ["bearer"], { allowUnregistered: true })],
    },
    { matcher: "/admin/products", method: ["POST"], middlewares: [normalizaHandle] },
    { matcher: "/admin/products/:id", method: ["POST"], middlewares: [normalizaHandle] },
    { matcher: "/admin/product-categories", method: ["POST"], middlewares: [normalizaHandle] },
    { matcher: "/admin/product-categories/:id", method: ["POST"], middlewares: [normalizaHandle] },
  ],
})
