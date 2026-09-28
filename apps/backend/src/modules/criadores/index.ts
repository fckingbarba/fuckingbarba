import { Module } from "@medusajs/framework/utils"
import CriadoresService from "./service"

/**
 * OS CRIADORES — quem quer gravar vídeo pra loja, pela página escondida
 * `/criadores` (20 criativos pelo fixo ou pela comissão).
 *
 * Entram por `POST /store/criadores` (a loja); o painel aprova, recusa e
 * apaga (`/dashboard/criadores`, a área "Criadores"). A regra mora em
 * `src/lib/criadores/`. Ver o AGENTS.md, "Os criadores".
 */
export const CRIADORES = "criadores"

export default Module(CRIADORES, { service: CriadoresService })
