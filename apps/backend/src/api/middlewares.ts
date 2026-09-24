import {
  authenticate,
  defineMiddlewares,
  type AuthenticatedMedusaRequest,
  type MedusaNextFunction,
  type MedusaRequest,
  type MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { portaDoPainel } from "../lib/equipe/acesso"
import { gerarHandle, HANDLE_VALIDO } from "../lib/handle"
import {
  acessoAoPedido,
  CABECALHO_DO_CARRINHO,
  CAMPOS_PUBLICOS,
  type Posse,
  respostaPublica,
} from "../lib/pedido-publico"

/**
 * URLs em português, limpas e congeladas (seção SEO da arquitetura).
 *
 * O Medusa guarda só o `handle` (slug) de produto e categoria; a URL
 * /produtos/<handle> e /<categoria> é montada pelo Next.js. Aqui garantimos,
 * na entrada do admin, que todo handle é `a-z`, `0-9` e hífen — sem acento,
 * sem maiúscula, sem espaço — e que um handle gerado a partir do título
 * também obedece a isso ("Óleo para Barba" → "oleo-para-barba"). A regra
 * mora em `lib/handle.ts`, que a importação do ERP também usa.
 */
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

/**
 * O PEDIDO INTEIRO SÓ PRA QUEM COMPROU — o porquê está em
 * `lib/pedido-publico.ts`.
 *
 * Roda depois da validação do core, que já montou o `req.queryConfig`, e
 * antes da rota. Pra quem não é dono, duas coisas: os campos pedidos viram
 * os públicos (o resto nem sai do banco), e a resposta passa pela versão
 * pública, montada campo a campo — se um dia o core mudar a ordem e os
 * campos pedidos voltarem, a resposta continua sem dado pessoal.
 */
async function pedidoSoPraQuemComprou(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "order",
    fields: ["id", "customer_id", "cart.id"],
    filters: { id: req.params.id },
  })
  const pedido = data[0] as Posse | undefined
  const quem = (req as Partial<AuthenticatedMedusaRequest>).auth_context
  const carrinho = req.headers[CABECALHO_DO_CARRINHO]
  // Pedido que não existe segue como público: a rota responde o 404 dela.
  const acesso = pedido
    ? acessoAoPedido(pedido, {
        cliente: quem?.actor_type === "customer" ? quem.actor_id : null,
        carrinho: typeof carrinho === "string" ? carrinho : undefined,
      })
    : "publico"

  if (acesso === "dono") return next()
  if (acesso === "recusado") {
    throw new MedusaError(MedusaError.Types.FORBIDDEN, "Este carrinho não é o deste pedido.")
  }
  if (req.queryConfig) req.queryConfig.fields = [...CAMPOS_PUBLICOS]
  const responder = res.json.bind(res)
  res.json = (corpo: unknown) => responder(respostaPublica(corpo))
  next()
}

/**
 * ROTAS DO CORE QUE A LOJA NÃO USA e que abrem o pedido de outra pessoa.
 *
 * - Troca de dono (`/store/orders/:id/transfer/*`): qualquer conta pede a
 *   transferência de qualquer pedido pelo id, e a resposta traz o pedido
 *   INTEIRO — e-mail, endereço, CPF. O Medusa só confere que a conta existe e
 *   que o pedido não é dela. Aqui os pedidos do convidado entram na conta
 *   quando o e-mail é provado pelo código (`/store/conta/vincular`).
 * - Devolução (`POST /store/returns`): qualquer um com o id abre uma
 *   devolução no pedido. Aqui a troca e a devolução são conversadas no
 *   WhatsApp e registradas pelo admin.
 */
function rotaQueALojaNaoUsa(_req: MedusaRequest, _res: MedusaResponse, _next: MedusaNextFunction) {
  throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Esta loja não usa esta rota.")
}

export default defineMiddlewares({
  routes: [
    {
      matcher: "/store/payment-collections/:id/payment-sessions",
      method: ["POST"],
      middlewares: [pagamentoDePedidoFechado],
    },
    { matcher: "/store/orders/:id", method: ["GET"], middlewares: [pedidoSoPraQuemComprou] },
    {
      matcher: "/store/orders/:id/transfer/request",
      method: ["POST"],
      middlewares: [rotaQueALojaNaoUsa],
    },
    {
      matcher: "/store/orders/:id/transfer/cancel",
      method: ["POST"],
      middlewares: [rotaQueALojaNaoUsa],
    },
    {
      matcher: "/store/orders/:id/transfer/accept",
      method: ["POST"],
      middlewares: [rotaQueALojaNaoUsa],
    },
    {
      matcher: "/store/orders/:id/transfer/decline",
      method: ["POST"],
      middlewares: [rotaQueALojaNaoUsa],
    },
    { matcher: "/store/returns", method: ["POST"], middlewares: [rotaQueALojaNaoUsa] },
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
    /*
      O rastreio de um pedido da conta: só com token de cliente de verdade
      (sem `allowUnregistered`) — a rota filtra pelo cliente do token.
    */
    {
      matcher: "/store/conta/pedidos/:id/rastreio",
      method: ["GET"],
      middlewares: [authenticate("customer", ["bearer"])],
    },
    /*
      Trocar o e-mail da conta (pedir o código e confirmar): também só com
      token de cliente de verdade — as duas rotas leem a conta do token
      (`lib/conta-do-token.ts`), nunca do corpo do pedido.
    */
    {
      matcher: "/store/conta/email",
      method: ["POST"],
      middlewares: [authenticate("customer", ["bearer"])],
    },
    {
      matcher: "/store/conta/email/codigo",
      method: ["POST"],
      middlewares: [authenticate("customer", ["bearer"])],
    },
    /*
      Os avisos dos parceiros de entrega: o corpo cru fica guardado
      (`req.rawBody`) pro parceiro que autentica assinando o corpo — a
      Frenet manda token, mas o próximo pode não mandar.
    */
    {
      matcher: "/hooks/envio/*",
      method: ["POST"],
      bodyParser: { preserveRawBody: true },
    },
    /* Os avisos do ERP: o Bling assina o corpo cru (HMAC com o segredo do app). */
    {
      matcher: "/hooks/erp/*",
      method: ["POST"],
      bodyParser: { preserveRawBody: true },
    },
    /*
      O PAINEL DA LOJA (dashboard.fuckingbarba.com.br) — as rotas de
      `api/dashboard/`. Uma porta só pra todas (`lib/equipe/acesso.ts`): a
      assinatura do servidor do painel, e o token da equipe com membro ativo
      em tudo que não é o caminho de entrar. Rota nova já nasce trancada.
    */
    { matcher: "/dashboard/*", middlewares: [portaDoPainel] },
    /*
      A imagem de fundo sobe em base64 dentro do JSON: o limite padrão do
      corpo (100 KB) não passa uma foto. O painel já encolhe antes de mandar;
      o teto aqui é pro arquivo estranho chegar e ser recusado com frase.
    */
    {
      matcher: "/dashboard/produtos/:id/imagens",
      method: ["POST"],
      bodyParser: { sizeLimit: "17mb" },
    },
    /*
      O vídeo do painel chega cru, direto do navegador (`api/painel-envio/`,
      `lib/videos.ts`): sem leitor de corpo — a rota grava em fluxo, e quem
      autoriza é o bilhete no endereço.
    */
    { matcher: "/painel-envio/*", method: ["PUT"], bodyParser: false },
    { matcher: "/admin/products", method: ["POST"], middlewares: [normalizaHandle] },
    { matcher: "/admin/products/:id", method: ["POST"], middlewares: [normalizaHandle] },
    { matcher: "/admin/product-categories", method: ["POST"], middlewares: [normalizaHandle] },
    { matcher: "/admin/product-categories/:id", method: ["POST"], middlewares: [normalizaHandle] },
  ],
})
