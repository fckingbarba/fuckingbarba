import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { updateStockLocationsWorkflow } from "@medusajs/medusa/core-flows"
import { ondeEstou } from "./onde-estou"

/**
 * DE ONDE AS ENCOMENDAS SAEM.
 *
 *   npm run backend:origem
 *
 * A transportadora cota de um CEP pro outro. O de destino é o do cliente; o
 * de ORIGEM é este, e o Medusa guarda ele no endereço do local de estoque —
 * não numa configuração nossa.
 *
 * ┌─ POR QUE NÃO É MAIS UM CAMPO NAS CONFIGURAÇÕES DA LOJA ────────────────┐
 * │ Porque o Medusa já tem o lugar certo, e dois lugares dizendo de onde   │
 * │ sai a encomenda é a origem de metade dos números divergentes deste     │
 * │ projeto. No dia em que existir um segundo depósito, o endereço vai ser │
 * │ o dele — e uma configuração global não saberia disso.                  │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * DÁ PRA FAZER PELO ADMIN também (Configurações → Localizações). Existe como
 * script pelo mesmo motivo dos outros: o valor fica versionado, e rodar de
 * novo num banco novo não depende de alguém lembrar de clicar.
 */

/* ─────────────────────────────────────────────────────────────────────────
   O ENDEREÇO. Trocar aqui se o galpão mudar.
   ───────────────────────────────────────────────────────────────────────── */

const ORIGEM = {
  /** Só dígitos ou com hífen, tanto faz — o cliente da Frenet limpa. */
  cep: "89036370",
  /**
   * Rua e número não entram na cotação (ela só olha o CEP), mas entram na
   * ETIQUETA no dia em que a emissão for por API — e endereço de remetente
   * pela metade é encomenda devolvida. Melhor completar agora, com calma,
   * do que na sexta em que a etiqueta não sair.
   */
  rua: "",
  cidade: "Blumenau",
  uf: "SC",
  pais: "br",
}

/* ───────────────────────────────────────────────────────────────────────── */

export default async function origem({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  ondeEstou(logger, "origem")

  const cep = ORIGEM.cep.replace(/\D/g, "")
  if (cep.length !== 8) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `CEP de origem inválido: "${ORIGEM.cep}". São oito dígitos.`
    )
  }

  const { data: locais } = await query.graph({
    entity: "stock_location",
    fields: ["id", "name", "address.id", "address.address_1", "address.postal_code"],
  })
  const local = locais[0]
  if (!local) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Nenhum local de estoque. Rode o produtos-iniciais antes."
    )
  }

  const antes = local.address?.postal_code ?? null

  await updateStockLocationsWorkflow(container).run({
    input: {
      selector: { id: local.id },
      update: {
        address: {
          /* A rua de antes é mantida quando a daqui está vazia: quem
             preencheu no admin sabe de algo que esta constante não sabe. */
          address_1: ORIGEM.rua || local.address?.address_1 || "",
          city: ORIGEM.cidade,
          province: ORIGEM.uf,
          country_code: ORIGEM.pais,
          postal_code: cep,
        },
      },
    },
  })

  logger.info(
    antes === cep
      ? `[origem] "${local.name}" já saía de ${cep} — nada mudou`
      : `[origem] "${local.name}" agora sai de ${cep} (${ORIGEM.cidade}/${ORIGEM.uf})` +
          (antes ? `, antes era ${antes}` : "")
  )

  if (!ORIGEM.rua) {
    logger.warn(
      "[origem] sem rua e número. A COTAÇÃO funciona (ela só olha o CEP), mas a " +
        "etiqueta vai precisar deles — preencha em Configurações → Localizações, " +
        "ou aqui na constante ORIGEM."
    )
  }
}
