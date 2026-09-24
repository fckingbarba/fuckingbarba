import {
  authenticate,
  type AuthenticatedMedusaRequest,
  type MedusaNextFunction,
  type MedusaRequest,
  type MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { EQUIPE } from "../../modules/equipe"
import type EquipeService from "../../modules/equipe/service"
import { daLoja } from "../quem-pede"
import { podeAbrir, type Area, type Papel, type Situacao } from "./regras"

/**
 * UMA MUDANÇA NA EQUIPE POR VEZ — convite, papel, remoção, entrada, o
 * primeiro dono e o código de entrar, todos na mesma trava.
 *
 * Uma só, e não uma por e-mail, por causa do último dono: dois donos se
 * removendo ao mesmo tempo contariam "2 donos ativos" cada um, e a loja
 * ficaria sem nenhum. A equipe muda poucas vezes por semana — a fila nunca
 * se nota.
 */
export const TRAVA_DA_EQUIPE = "equipe"

export type MembroDaEquipe = {
  id: string
  email: string
  nome: string
  papel: Papel
  situacao: Situacao
  convidado_em: Date | null
  convidado_por: string | null
  entrou_em: Date | null
  ultimo_acesso: Date | null
}

/** O pedido que passou por `membroAtivo`: tem o membro, lido do banco agora. */
export type PedidoDaEquipe = AuthenticatedMedusaRequest & { membro: MembroDaEquipe }

/**
 * DEPOIS DO TOKEN, O BANCO — em toda rota do painel.
 *
 * O token da equipe vale 30 dias (é o `jwtExpiresIn` do Medusa, igual pra
 * todo mundo) e não tem como ser desfeito. Então ele sozinho não basta: esta
 * etapa relê o membro a cada pedido, e quem foi removido — ou nunca entrou
 * de fato — esbarra aqui na hora, com o token ainda "válido". É o que faz o
 * "tirou da equipe, o acesso cai" ser verdade.
 *
 * Depois dela, o papel que as rotas conferem é o do banco, não o que o token
 * dizia quando foi emitido: mudou o papel, muda no próximo clique.
 */
async function membroAtivo(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  const id = req.auth_context?.actor_id
  let membro: MembroDaEquipe | undefined
  try {
    const equipe = req.scope.resolve<EquipeService>(EQUIPE)
    membro = id ? ((await equipe.listMembros({ id }))[0] as MembroDaEquipe | undefined) : undefined
  } catch (e) {
    next(e)
    return
  }
  if (!membro || membro.situacao !== "ativo") {
    res.status(401).json({ message: "fora_da_equipe" })
    return
  }
  ;(req as PedidoDaEquipe).membro = membro
  next()
}

/**
 * A PORTA DE `/dashboard/*` — toda rota do painel passa por aqui, e a
 * trancada é a regra: rota nova nasce exigindo membro ativo, sem ninguém
 * precisar lembrar de pôr nada no `middlewares.ts`. As exceções são as duas
 * do caminho de entrar:
 *
 *   /dashboard/entrar/*   aberta (é onde se pede o código);
 *   /dashboard/vincular   token da equipe ainda sem membro (a 1ª entrada);
 *   o resto               token da equipe + `membroAtivo`.
 *
 * E antes de tudo, a assinatura: só o SERVIDOR do painel chama estas rotas,
 * assinando com o `REVALIDAR_SEGREDO`, como a loja (`lib/quem-pede.ts`). O
 * navegador nunca fala com elas — o painel guarda o token num cookie
 * `httpOnly` e chama o Medusa do servidor dele. Então um token que vazasse
 * (num log, num print) não abre nada sozinho, de fora. Sem a assinatura,
 * 403 e um aviso no log, no máximo um por hora: se veio do painel, o
 * segredo não bate entre o Railway e a Vercel.
 */
const comToken = authenticate("equipe", ["bearer"])
const comTokenSemMembro = authenticate("equipe", ["bearer"], { allowUnregistered: true })
let ultimoAvisoSemAssinatura = 0

export async function portaDoPainel(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  if (!daLoja(req)) {
    if (Date.now() - ultimoAvisoSemAssinatura > 60 * 60 * 1000) {
      ultimoAvisoSemAssinatura = Date.now()
      req.scope
        .resolve(ContainerRegistrationKeys.LOGGER)
        .warn(
          "[painel] pedido em /dashboard sem a assinatura (x-loja-segredo). Se veio do painel, o REVALIDAR_SEGREDO não bate entre Railway e Vercel."
        )
    }
    res.status(403).json({ message: "sem_assinatura" })
    return
  }

  const caminho = (req.originalUrl || req.url).split("?")[0].replace(/\/+$/, "")
  if (caminho.startsWith("/dashboard/entrar/")) return next()
  if (caminho === "/dashboard/vincular") return comTokenSemMembro(req, res, next)
  return comToken(req, res, (erro?: unknown) =>
    erro ? next(erro) : membroAtivo(req as AuthenticatedMedusaRequest, res, next)
  )
}

/**
 * A pergunta que cada rota faz antes de responder. `false` quer dizer que a
 * resposta (403 `sem_acesso`) já foi dada — é só voltar.
 */
export function exigirArea(req: PedidoDaEquipe, res: MedusaResponse, area: Area): boolean {
  if (podeAbrir(req.membro.papel, area)) return true
  res.status(403).json({ message: "sem_acesso" })
  return false
}
