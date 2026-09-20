import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  CHAVE_NO_METADATA,
  lerConfiguracoes,
  type Configuracoes,
} from "../lib/configuracoes"
import { ondeEstou } from "./onde-estou"

/**
 * AS CONFIGURAÇÕES DA LOJA — semeadura e conferência.
 *
 *   npm run backend:configuracoes
 *
 * Depois que a tela do admin existir, ninguém precisa mais deste script pra
 * MUDAR nada. Ele fica por dois motivos: semear um banco novo sem abrir o
 * admin, e — mais útil — RODAR SEM ARGUMENTO E SÓ CONTAR o que está gravado.
 * Quando a loja anunciar um número estranho, a primeira pergunta é "o que
 * tem lá dentro?", e a resposta é um comando, não uma consulta SQL.
 *
 * ┌─ O QUE NÃO É SEMEADO ──────────────────────────────────────────────────┐
 * │ CNPJ, razão social, endereço, WhatsApp e e-mail ficam `null`. Este     │
 * │ script não inventa dado de empresa: as páginas legais já sabem mostrar │
 * │ a tarja de "pendente" quando o valor não existe, e isso é melhor que   │
 * │ um CNPJ de exemplo com cara de verdadeiro sobrevivendo até o dia em    │
 * │ que um cliente o copia pra uma reclamação.                             │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * A POLÍTICA DE FRETE semeada é a que a loja já praticava: grátis a partir
 * de R$ 149,90, na opção mais barata. Isso NÃO é uma decisão nova — é o que
 * estava escrito na constante `FRETE_GRATIS_A_PARTIR_DE` e na regra da opção
 * PAC. Mudar de ideia agora é trocar `SEMENTE` abaixo, ou usar o admin.
 */

const SEMENTE: Configuracoes = {
  frete: { modo: "gratis", piso: 149.9, alvo: "mais-barata", tetoDeCusto: null },
  empresa: { razaoSocial: null, cnpj: null, endereco: null },
  atendimento: { whatsapp: null, email: null, horario: null, prazoDePostagem: null },
  /*
    Sem preço de emergência: queda da transportadora para a loja em vez de
    cobrar um valor que ninguém escolheu. É a mesma regra do resto deste
    arquivo — o script não inventa número que vira oferta na tela.
  */
  cotacao: { precoDeEmergencia: null },
}

/**
 * `true` sobrescreve o que já estiver gravado. Fica `false` porque o caminho
 * normal é o admin: um script que sobrescreve em silêncio desfaz, sem avisar,
 * a alteração que alguém fez na tela cinco minutos antes.
 */
const SOBRESCREVER = false

export default async function configuracoes({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const service = container.resolve(Modules.STORE)

  ondeEstou(logger, "configuracoes")

  const [loja] = await service.listStores({}, { select: ["id", "name", "metadata"], take: 1 })
  if (!loja) {
    logger.error("[configuracoes] nenhuma loja no Medusa — rode as migrações antes")
    return
  }

  const atual = lerConfiguracoes(loja.metadata)
  const jaTem = Boolean((loja.metadata as Record<string, unknown> | null)?.[CHAVE_NO_METADATA])

  if (jaTem && !SOBRESCREVER) {
    logger.info("[configuracoes] já existe — nada foi escrito. O que está valendo:")
    relatar(logger, atual)
    logger.info("[configuracoes] pra mudar, use a tela de Configurações no admin.")
    return
  }

  await service.updateStores(loja.id, {
    metadata: { ...(loja.metadata ?? {}), [CHAVE_NO_METADATA]: SEMENTE },
  })

  logger.info(`[configuracoes] gravadas em "${loja.name}".`)
  relatar(logger, SEMENTE)
  logger.info(
    "[configuracoes] LEMBRE: enquanto o frete não vier do Frenet, o piso também está " +
      "na regra de preço da opção PAC (npm run backend:frete). Os dois precisam bater."
  )
}

function relatar(logger: { info: (m: string) => void }, c: Configuracoes) {
  const f = c.frete
  const reais = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`

  logger.info(
    `  frete: ${
      f.modo === "nenhuma"
        ? "sem promoção"
        : f.modo === "gratis"
          ? `grátis a partir de ${reais(f.piso)} (${f.alvo})`
          : `${reais(f.preco)} fixo a partir de ${reais(f.piso)} (${f.alvo})`
    }${f.modo !== "nenhuma" && f.tetoDeCusto !== null ? `, teto de custo ${reais(f.tetoDeCusto)}` : ""}`
  )

  const faltando = [
    ["razão social", c.empresa.razaoSocial],
    ["CNPJ", c.empresa.cnpj],
    ["endereço", c.empresa.endereco],
    ["WhatsApp", c.atendimento.whatsapp],
    ["e-mail", c.atendimento.email],
    ["horário", c.atendimento.horario],
    ["prazo de postagem", c.atendimento.prazoDePostagem],
  ]
    .filter(([, v]) => v === null)
    .map(([nome]) => nome)

  if (faltando.length) {
    logger.info(`  pendente (aparece como tarja vermelha nas páginas legais): ${faltando.join(", ")}`)
  } else {
    logger.info("  dados da empresa: completos")
  }
}
