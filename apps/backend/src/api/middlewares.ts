import {
  defineMiddlewares,
  type MedusaNextFunction,
  type MedusaRequest,
  type MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

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

export default defineMiddlewares({
  routes: [
    { matcher: "/admin/products", method: ["POST"], middlewares: [normalizaHandle] },
    { matcher: "/admin/products/:id", method: ["POST"], middlewares: [normalizaHandle] },
    { matcher: "/admin/product-categories", method: ["POST"], middlewares: [normalizaHandle] },
    { matcher: "/admin/product-categories/:id", method: ["POST"], middlewares: [normalizaHandle] },
  ],
})
