import { model } from "@medusajs/framework/utils"

/**
 * OS PAPÉIS QUE O DONO CRIA — "Atendimento", "Financeiro", "Designer" —, uma
 * linha por papel, na tela "Equipe e acessos".
 *
 * Aqui mora só o nome. O que o papel abre fica na `equipe_acesso`, como o
 * que o dono mudou na operação e no marketing (o papel novo nasce abrindo só
 * o Início, e cada caixinha marcada é uma linha lá); e quem tem o papel, no
 * `papel` do membro, com o id desta linha (`papel_01K…`). As regras (nome de
 * 2 a 30 letras, sem repetir, no máximo 10) moram em `lib/equipe/regras.ts`.
 *
 * Apagar é `softDelete`: o registro de quem fez o quê continua apontando pro
 * id, e só se apaga papel sem ninguém nele (ativo ou convidado).
 */
export const PapelDaEquipe = model.define("equipe_papel", {
  id: model.id({ prefix: "papel" }).primaryKey(),
  nome: model.text(),
})
