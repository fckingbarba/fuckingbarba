import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { EQUIPE } from "../../modules/equipe"
import type EquipeService from "../../modules/equipe/service"
import { destinatarios, type MembroParaAviso } from "../painel/configuracoes"
import type { Papel } from "./regras"

/**
 * PRA QUEM VAI O AVISO DA EQUIPE — o e-mail da nota que não saiu, da conexão
 * do Bling caída, do estorno que não voltou. Vai pro papel que resolve (a
 * tabela é a da aba E-mails das Configurações, `AVISOS_DA_EQUIPE`): a nota
 * pra operação e pro dono; o Bling e o estorno, pro dono.
 *
 * Antes do painel ia pra todo mundo com login no admin do Medusa. Continua
 * indo pra lá enquanto o painel não tiver ninguém — e, sem ninguém do papel,
 * vai pro dono (`destinatarios`).
 */
export async function emailsPraAvisar(container: MedusaContainer, papeis: readonly Papel[]) {
  const [membros, usuarios] = await Promise.all([
    container
      .resolve<EquipeService>(EQUIPE)
      .listMembros(
        { situacao: "ativo" },
        { select: ["nome", "email", "papel", "situacao"], take: 200 }
      )
      .catch(() => []),
    container
      .resolve(Modules.USER)
      .listUsers({}, { select: ["email"], take: 20 })
      .catch(() => []),
  ])
  return destinatarios(
    papeis,
    membros as unknown as MembroParaAviso[],
    usuarios.map((u) => u.email).filter(Boolean) as string[]
  ).emails
}
