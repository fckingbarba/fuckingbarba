import { model } from "@medusajs/framework/utils"

/**
 * O QUE O DONO MUDOU NOS ACESSOS — uma linha por diferença do padrão: "a
 * operação abre os cupons", "o marketing não abre o carrinho".
 *
 * O padrão (quem abre o quê quando a loja nasce) mora no código,
 * `ACESSO_PADRAO` em `lib/equipe/regras.ts`; aqui fica só o que o dono
 * trocou, pela tabela da tela "Equipe e acessos". Sem linha nenhuma, a loja
 * é a do padrão — e a área nova, que chega pelo código, vale o padrão dela
 * até o dono mudar. `matrizCom` junta os dois.
 *
 * O dono não tem linha: abre tudo, sempre. Quem grava é o
 * `mudarAcessosWorkflow` (a coluna inteira de cada papel, na trava da
 * equipe), e cada gravação deixa uma linha `mudou_acessos` no registro.
 */
export const Acesso = model
  .define("equipe_acesso", {
    id: model.id({ prefix: "eqa" }).primaryKey(),
    papel: model.enum(["operacao", "marketing"]),
    area: model.text(),
    abre: model.boolean(),
  })
  .indexes([{ on: ["papel", "area"], unique: true }])
