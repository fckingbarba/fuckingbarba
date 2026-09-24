import { Module } from "@medusajs/framework/utils"
import EquipeService from "./service"

/**
 * A EQUIPE DO PAINEL DA LOJA (dashboard.fuckingbarba.com.br) — quem entra,
 * com que papel, e o registro de quem fez o quê. Ver o ESTADO.md, 4.5.
 *
 * Não é o `user` do admin do Medusa: o admin continua do dono, como reserva,
 * e o token da equipe não abre as rotas `/admin` (o Medusa só aceita lá o
 * ator `user`). As regras dos papéis moram em `lib/equipe/regras.ts`; as
 * rotas, em `api/dashboard/`.
 */
export const EQUIPE = "equipe"

export default Module(EQUIPE, { service: EquipeService })
