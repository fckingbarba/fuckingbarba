import {
  authenticate,
  defineMiddlewares,
  type AuthenticatedMedusaRequest,
  type MedusaNextFunction,
  type MedusaRequest,
  type MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { portaDoPagamento } from "../lib/cartao/porta"
import { parcelaMinimaDaLoja } from "../lib/pagamento/parcela"
import { checkStatusNaTravaDoCarrinho } from "../lib/check-status-na-trava"
import { criarLimite } from "../lib/limite"
import { daLoja, quemPede } from "../lib/quem-pede"
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

/**
 * CUPOM SÓ ENTRA PELA PORTA DOS CUPONS (`/store/carts/:id/promotions`), que é
 * a que a loja usa e onde vale o "um cupom por pedido". O Medusa aceita
 * `promo_codes` também no corpo de criar e de atualizar o carrinho, e ali a
 * lista SUBSTITUI a do carrinho: cinco cupons somados passavam (entrega 0136,
 * no banco local: R$ 153,90 → R$ 81,06). O gancho dos cupons também recusa
 * (`outroCupomNoCarrinho`, no `replace`); isto fecha a porta antes.
 */
function cupomSoPelaPortaDosCupons(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) {
  const corpo = req.body as Record<string, unknown> | undefined
  if (corpo && typeof corpo === "object" && "promo_codes" in corpo) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Cupom entra pelo /store/carts/:id/promotions, um de cada vez."
    )
  }
  next()
}

/**
 * O `metadata` DO CARRINHO É DA LOJA, NÃO DE QUEM COMPRA (auditoria de 27/09).
 *
 * O Medusa aceita `metadata` livre no corpo de criar e de atualizar o
 * carrinho, só com a chave publicável — e no fechamento COPIA esse
 * `metadata` pro pedido. Só que o `metadata` do pedido é onde a loja guarda
 * os registros dela (`estornos`, `emails`, `fb_parceiro`, `fb_cupons`,
 * `fb_bump`…), e quem lê esses registros confia que foi ela que escreveu:
 * um `estornos` plantado acendia no painel a faixa grave "o estorno não
 * saiu, devolva pelo Pagar.me"; um `fb_parceiro` fazia a loja cancelar na
 * Frenet um envio de outra pessoa; um `emails.venda` calava o aviso de venda.
 *
 * A loja nunca manda `metadata` no carrinho (o CPF mora no `metadata` do
 * ENDEREÇO, que continua livre), então a porta fecha sem exceção.
 */
function semMetadataNoCarrinho(req: MedusaRequest, _res: MedusaResponse, next: MedusaNextFunction) {
  const corpo = req.body as Record<string, unknown> | undefined
  if (corpo && typeof corpo === "object" && "metadata" in corpo) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "O carrinho não aceita metadata.")
  }
  next()
}

/**
 * O FREIO DA SENHA DO ADMIN (auditoria de 27/09). O `/app` do Medusa entra
 * com e-mail e senha, e o core não limita as tentativas. Aqui, em 15
 * minutos: 10 senhas erradas por rede (`quemPede`, o IPv6 por /64) e 30 por
 * e-mail. A tentativa conta ANTES de ir (`reservar`), pra uma rajada não
 * passar junta, e a certa devolve a vaga — quem acerta a senha nunca esbarra.
 * O cadastro do admin (é por ele que o convite entra), 10 por hora por rede.
 */
const QUINZE_MINUTOS = 15 * 60_000
const ERRADAS_POR_REDE = { limite: 10, ms: QUINZE_MINUTOS }
const ERRADAS_POR_EMAIL = { limite: 30, ms: QUINZE_MINUTOS }
const CADASTROS_POR_REDE = { limite: 10, ms: 60 * 60_000 }
const freioDoAdmin = criarLimite()
const MUITAS_TENTATIVAS = "Muitas tentativas. Espere 15 minutos e tente de novo."

function freioDaSenhaDoAdmin(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  const rede = quemPede(req).chave
  const bruto = (req.body as { email?: unknown } | undefined)?.email
  const email = typeof bruto === "string" ? bruto.trim().toLowerCase().slice(0, 254) : ""
  if (
    !freioDoAdmin.cabe(rede, ERRADAS_POR_REDE) ||
    (email && !freioDoAdmin.cabe(`email:${email}`, ERRADAS_POR_EMAIL))
  ) {
    res.status(429).json({ type: "not_allowed", message: MUITAS_TENTATIVAS })
    return
  }
  const devolver = [
    freioDoAdmin.reservar(rede, ERRADAS_POR_REDE),
    ...(email ? [freioDoAdmin.reservar(`email:${email}`, ERRADAS_POR_EMAIL)] : []),
  ]
  res.on("finish", () => {
    if (res.statusCode < 400) devolver.forEach((d) => d())
  })
  next()
}

function freioDoCadastroDoAdmin(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  const chave = `cadastro:${quemPede(req).chave}`
  if (!freioDoAdmin.cabe(chave, CADASTROS_POR_REDE)) {
    res.status(429).json({ type: "not_allowed", message: MUITAS_TENTATIVAS })
    return
  }
  freioDoAdmin.contar(chave, CADASTROS_POR_REDE)
  next()
}

/**
 * A API DA LOJA É DO SERVIDOR DA LOJA (auditoria de 27/09). O navegador
 * nunca fala com o Medusa: quem chama `/store` é o servidor da loja, na
 * Vercel — e desde a 0168 ele assina TODA chamada (`x-loja-segredo`: o
 * cliente do Medusa em `apps/loja/src/lib/medusa.ts` e o `medusa()` de
 * `lib/conta.ts`). A chave publicável é pública por desenho; com ela
 * sozinha, qualquer um falava direto com o carrinho, o frete e o pagamento,
 * sem passar pela loja nem pelos limites dela.
 *
 * Em duas etapas, pra nada cair no deploy (a Vercel e o Railway sobem cada
 * um no seu tempo): por padrão, a chamada sem assinatura PASSA e vai pro log
 * (uma linha por hora, com quantas foram); com `STORE_SO_DA_LOJA=true` no
 * Railway, é recusada (401). Liga depois de o log mostrar que sem assinatura
 * só chega quem não é a loja.
 */
let semAssinatura = 0
let ultimoAvisoSemAssinatura = 0

function soDaLoja(req: MedusaRequest, res: MedusaResponse, next: MedusaNextFunction) {
  if (daLoja(req)) return next()
  if (process.env.STORE_SO_DA_LOJA === "true") {
    res.status(401).json({ type: "unauthorized", message: "sem_assinatura" })
    return
  }
  semAssinatura++
  if (Date.now() - ultimoAvisoSemAssinatura > 60 * 60_000) {
    const caminho = (req.originalUrl || req.url).split("?")[0]
    req.scope
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(
        `[loja] ${semAssinatura} pedido(s) em /store sem a assinatura da loja desde o último aviso ` +
          `(o último: ${req.method} ${caminho}). Com STORE_SO_DA_LOJA=true, seriam recusados.`
      )
    semAssinatura = 0
    ultimoAvisoSemAssinatura = Date.now()
  }
  next()
}

export default defineMiddlewares({
  routes: [
    { matcher: "/store/*", middlewares: [soDaLoja] },
    {
      matcher: "/store/carts",
      method: ["POST"],
      middlewares: [cupomSoPelaPortaDosCupons, semMetadataNoCarrinho],
    },
    {
      matcher: "/store/carts/:id",
      method: ["POST"],
      middlewares: [cupomSoPelaPortaDosCupons, semMetadataNoCarrinho],
    },
    /*
      E a parcela do cartão abaixo da mínima da loja (as Configurações, 0157)
      não abre sessão — ver `lib/pagamento/parcela.ts`.
    */
    {
      matcher: "/store/payment-collections/:id/payment-sessions",
      method: ["POST"],
      middlewares: [pagamentoDePedidoFechado, parcelaMinimaDaLoja],
    },
    /*
      A PORTA DO PAGAMENTO: o robô testando cartão roubado é barrado antes de
      o Medusa mandar o cartão pro Pagar.me, e toda tentativa (Pix também) é
      anotada pro disjuntor dos parceiros — ver `lib/cartao/porta.ts`.
    */
    { matcher: "/store/carts/:id/complete", method: ["POST"], middlewares: [portaDoPagamento] },
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
    { matcher: "/auth/user/emailpass", method: ["POST"], middlewares: [freioDaSenhaDoAdmin] },
    {
      matcher: "/auth/user/emailpass/register",
      method: ["POST"],
      middlewares: [freioDoCadastroDoAdmin],
    },
    /*
      O "Check status" do admin pega a trava do carrinho, a mesma do aviso do
      Pagar.me e da conciliação — ver `lib/check-status-na-trava.ts`.
    */
    {
      matcher: "/admin/orders/:id/payment-sessions/authorize",
      method: ["POST"],
      middlewares: [checkStatusNaTravaDoCarrinho],
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
      A caixa de ofertas desmarcada na conta (entrega 0184): só com token de
      cliente de verdade — a rota tira o e-mail da conta do token.
    */
    {
      matcher: "/store/crm/sair-das-ofertas",
      method: ["POST"],
      middlewares: [authenticate("customer", ["bearer"])],
    },
    /*
      O que a loja anota pro CRM: o token do cliente é opcional. Com ele, o
      navegador fica sendo da conta; sem ele (ou vencido), o recado entra do
      mesmo jeito, anônimo — por isso `allowUnauthenticated`.
    */
    {
      matcher: "/store/crm/eventos",
      method: ["POST"],
      middlewares: [authenticate("customer", ["bearer"], { allowUnauthenticated: true })],
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
    /* Os avisos do Resend (o padrão Svix): a assinatura é sobre o corpo cru. */
    {
      matcher: "/hooks/resend",
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
      A foto (da página do produto e da home) e a base da Nuvemshop sobem em
      base64 dentro do JSON — maiores que o limite padrão do corpo (100 KB).
      SEM LEITOR AQUI: o do Medusa roda antes de qualquer middleware, e com
      teto grande lia e interpretava o corpo de quem nem era do painel. A
      própria rota lê, depois da porta e da área, até 7 MB
      (`lib/corpo-grande.ts`; auditoria de 27/09).
    */
    { matcher: "/dashboard/produtos/:id/imagens", method: ["POST"], bodyParser: false },
    { matcher: "/dashboard/home/imagens", method: ["POST"], bodyParser: false },
    { matcher: "/dashboard/crm/base", method: ["POST"], bodyParser: false },
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
