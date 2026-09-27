import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { DO_CHECKOUT, lerLote, type Lote } from "../../../../lib/crm/eventos"
import { criarLimite, criarTetoDoDia } from "../../../../lib/limite"
import { dominioDe } from "../../../../lib/observabilidade/telemetria"
import { daLoja, quemPede } from "../../../../lib/quem-pede"
import { normalizarEmail } from "../../../../modules/codigo/regras"
import { CRM } from "../../../../modules/crm"
import type CrmService from "../../../../modules/crm/service"
import type { VisitanteLido } from "../../../../modules/crm/service"

/**
 * POST /store/crm/eventos — `{ visitante, carrinho?, identificacao?, eventos }`:
 * o que um navegador fez na loja, pro CRM (`lib/crm/eventos.ts`).
 *
 * Quem chama é o servidor da loja, assinado (`x-loja-segredo`): a rota
 * dela (`apps/loja/src/app/api/eventos`) repassa o recado do navegador — e só
 * depois de conferir o "sim" dos cookies —, e as ações da newsletter e da
 * conta anotam a inscrição e a entrada. O navegador nunca fala direto com o
 * Medusa, e o visitante é o cookie que a loja guarda, não o que ele diz.
 *
 * ┌─ DE QUEM É O NAVEGADOR — nunca do que o navegador diz ─────────────────┐
 * │ 1. o token do cliente (`Authorization`, o Medusa confere a assinatura):│
 * │    é a conta, e o e-mail é o dela;                                     │
 * │ 2. o carrinho, nos passos do checkout: o e-mail que a pessoa digitou   │
 * │    lá, lido do Medusa;                                                 │
 * │ 3. a newsletter: o e-mail que o servidor da loja acabou de inscrever.  │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * Cada visitante manda no máximo 30 recados por minuto, cada IP 120, e a
 * loja inteira 3.000. Passou disso, 429 e nada gravado. Falhar ao gravar não é problema
 * de quem visitou: 204 do mesmo jeito, e o log conta.
 *
 * RESPOSTAS: 204; 400 `sem_visitante`; 401 sem assinatura; 429 `limite`.
 */

const POR_VISITANTE = { limite: 30, ms: 60_000 }
/** A casa inteira atrás de um IP só (o wi-fi, a operadora do celular). */
const POR_IP = { limite: 120, ms: 60_000 }
const DA_LOJA = { limite: 3000, ms: 60_000 }
const limite = criarLimite()

/*
  O TETO DO DIA (auditoria de 27/09). Os limites por minuto contam recados,
  não o que eles gravam, e o visitante é o que a loja manda — sem o cookie,
  cada recado é um visitante novo. Então, por dia: 10.000 eventos por rede
  (`quemPede`, o IPv6 por /64) e 200.000 pra loja toda. Passou, 429 e nada
  gravado: o banco não enche por aqui.
*/
const EVENTOS_POR_REDE_NO_DIA = 10_000
const EVENTOS_DA_LOJA_NO_DIA = 200_000
const teto = criarTetoDoDia()
let ultimoAvisoDoTeto = 0

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (!daLoja(req)) {
    res.status(401).json({ message: "sem_assinatura" })
    return
  }
  const lote = lerLote(req.body, dominioDe(process.env.LOJA_URL))
  if (!lote) {
    res.status(400).json({ message: "sem_visitante" })
    return
  }
  const ip = quemPede(req).chave
  const visitante = `${ip}|${lote.visitante}`
  if (
    !limite.cabe(visitante, POR_VISITANTE) ||
    !limite.cabe(ip, POR_IP) ||
    !limite.cabe("loja", DA_LOJA)
  ) {
    res.status(429).json({ message: "limite" })
    return
  }
  limite.contar(visitante, POR_VISITANTE)
  limite.contar(ip, POR_IP)
  limite.contar("loja", DA_LOJA)

  const n = lote.eventos.length
  if (n) {
    const cabeNaLoja = teto.cabe("loja", EVENTOS_DA_LOJA_NO_DIA, n)
    if (!cabeNaLoja || !teto.cabe(ip, EVENTOS_POR_REDE_NO_DIA, n)) {
      if (!cabeNaLoja && Date.now() - ultimoAvisoDoTeto > 60 * 60_000) {
        ultimoAvisoDoTeto = Date.now()
        req.scope
          .resolve(ContainerRegistrationKeys.LOGGER)
          .warn(
            `[crm] a loja passou de ${EVENTOS_DA_LOJA_NO_DIA} eventos hoje — o resto do dia não grava`
          )
      }
      res.status(429).json({ message: "limite" })
      return
    }
    teto.somar(ip, n)
    teto.somar("loja", n)
  }

  if (lote.eventos.length) {
    try {
      const crm = req.scope.resolve<CrmService>(CRM)
      const visitante = await crm.anotar(lote, new Date())
      await identificar(req, crm, visitante, lote)
    } catch (e) {
      req.scope
        .resolve(ContainerRegistrationKeys.LOGGER)
        .warn(
          `[crm] não anotei ${lote.eventos.length} eventos: ${e instanceof Error ? e.message : e}`
        )
    }
  }
  res.status(204).send()
}

/** O e-mail do visitante, se desta vez der pra saber — na ordem do quadro lá em cima. */
async function identificar(
  req: AuthenticatedMedusaRequest,
  crm: CrmService,
  visitante: VisitanteLido,
  lote: Lote
) {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const auth = req.auth_context
  const clienteId = auth?.actor_type === "customer" ? auth.actor_id : null

  if (clienteId) {
    if (visitante.cliente_id === clienteId && visitante.como === "conta") return
    const {
      data: [cliente],
    } = await query.graph({
      entity: "customer",
      fields: ["id", "email"],
      filters: { id: clienteId },
    })
    const email = normalizarEmail(cliente?.email)
    if (email) await crm.identificar(visitante.id, { email, clienteId, como: "conta" })
    return
  }

  if (lote.identificacao?.como === "newsletter") {
    if (visitante.email !== lote.identificacao.email)
      await crm.identificar(visitante.id, {
        email: lote.identificacao.email,
        clienteId: null,
        como: "newsletter",
      })
    return
  }

  if (lote.carrinho && lote.eventos.some((e) => DO_CHECKOUT.has(e.tipo))) {
    const {
      data: [carrinho],
    } = await query.graph({
      entity: "cart",
      fields: ["id", "email", "customer_id"],
      filters: { id: lote.carrinho },
    })
    const email = normalizarEmail(carrinho?.email)
    if (email && email !== visitante.email)
      await crm.identificar(visitante.id, {
        email,
        clienteId: carrinho?.customer_id ?? null,
        como: "checkout",
      })
  }
}
