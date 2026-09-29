import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { CRM } from "../../modules/crm"
import type CrmService from "../../modules/crm/service"
import { normalizarEmail } from "../../modules/codigo/regras"
import { enviarEmail } from "../email"
import { emailDoPremio } from "../emails/indicacao"
import { urlDaLoja } from "../emails/moldura"
import { criarCupomDoFluxo } from "./cupom"
import { comQuemManda, dadosDaLoja } from "./envio"
import { PREFIXO_DO_PREMIO, TOQUE_DO_PREMIO } from "./fluxos"
import {
  CAMPANHA_DA_INDICACAO,
  codigoDoBrother,
  indicadorDoCodigo,
  PORCENTO_DO_PREMIO,
  semPremio,
  VALIDADE_DO_PREMIO,
} from "./indicacao"
import { daEquipe, nomesDasPessoas, quemVoltouPraLista } from "./motor"
import { linksDeSair } from "./sair"

/**
 * O PRÊMIO DE QUEM INDICOU (entrega 0215, `lib/crm/indicacao.ts`) — quando um
 * pedido com o cupom de um link (`BROTHER-…`) é PAGO (o Pix pago, o cartão
 * aprovado: o `payment.captured`, no subscriber `premio-da-indicacao.ts`):
 *
 *   1. quem é o dono do link;
 *   2. o brother é ele mesmo: nada, e a compra não conta como indicação;
 *   3. da equipe, ou já ganhou os 10 do ano: a compra fica no registro
 *      (pulada), sem cupom;
 *   4. o prêmio é RESERVADO no registro (`crm_envio`, o fluxo "indicacao", a
 *      chave `premio|<pedido>`): o aviso do pagamento que chega duas vezes
 *      não dá dois cupons;
 *   5. o cupom de 15%, só dele, que vale 60 dias (`VALEU-7KQ2MX`);
 *   6. o e-mail, na hora — menos pra quem saiu da lista, e pro e-mail que
 *      voltou ou reclamou. O cupom vale do mesmo jeito, e aparece em Minha
 *      conta. Sem grupo de controle e sem a madrugada: é o prêmio combinado.
 */

export type PremioDaIndicacao =
  | "sem-pedido"
  | "sem-codigo"
  | "sem-indicador"
  | "ele-mesmo"
  | "equipe"
  | "teto-do-ano"
  | "ja-premiado"
  | "premiado"

const ANO = 365 * 24 * 60 * 60 * 1000

type PedidoDoPremio = {
  id: string
  email?: string | null
  status?: string | null
  items?: { adjustments?: { code?: string | null }[] | null }[] | null
  shipping_methods?: { adjustments?: { code?: string | null }[] | null }[] | null
}

export async function premiarIndicacao(
  container: MedusaContainer,
  pedidoId: string,
  agora: Date = new Date()
): Promise<PremioDaIndicacao> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order",
    fields: [
      "id",
      "email",
      "status",
      "items.adjustments.code",
      "shipping_methods.adjustments.code",
    ],
    filters: { id: pedidoId },
  })
  const pedido = (data as unknown as PedidoDoPremio[])[0]
  if (!pedido || pedido.status === "canceled") return "sem-pedido"
  const codigo = codigoDoBrother(
    [...(pedido.items ?? []), ...(pedido.shipping_methods ?? [])]
      .flatMap((l) => l.adjustments ?? [])
      .map((a) => a.code)
  )
  if (!codigo) return "sem-codigo"
  const indicador = await indicadorDoCodigo(container, codigo)
  if (!indicador) return "sem-indicador"
  const email = indicador.email
  const amigo = normalizarEmail(pedido.email) ?? ""

  /* 2 e 3. ele mesmo, a equipe, o teto do ano */
  const crm = container.resolve<CrmService>(CRM)
  const [registros, equipe] = await Promise.all([
    crm.registrosDosFluxos(new Date(agora.getTime() - ANO), [email]),
    daEquipe(container),
  ])
  const premiosNoAno = registros.filter(
    (r) => r.fluxo === "indicacao" && r.toque === TOQUE_DO_PREMIO && r.cupom
  ).length
  const motivo = semPremio({ indicador: email, amigo, premiosNoAno })
  if (motivo === "ele-mesmo") return "ele-mesmo"
  const base = {
    email,
    fluxo: "indicacao",
    chave: `premio|${pedido.id}`,
    toque: TOQUE_DO_PREMIO,
    em: agora,
  }
  if (motivo || equipe.has(email)) {
    await crm.anotarNoFluxo({ ...base, como: "pulado" })
    return motivo ?? "equipe"
  }

  /* 4. a reserva: o aviso repetido não dá dois cupons */
  const reserva = await crm.reservarToque(base)
  if (!reserva) return "ja-premiado"

  /* 5. o cupom — sem ele, a reserva sai e o próximo aviso tenta de novo */
  let cupom: { codigo: string; ate: Date; id: string }
  try {
    cupom = await criarCupomDoFluxo(container, {
      porcento: PORCENTO_DO_PREMIO,
      agora,
      validade: VALIDADE_DO_PREMIO,
      prefixo: PREFIXO_DO_PREMIO,
      campanha: CAMPANHA_DA_INDICACAO,
    })
  } catch (e) {
    await crm.desfazerToque(reserva)
    throw e
  }

  /* 6. o e-mail — se não sair, o cupom vale do mesmo jeito */
  let resendId: string | null = null
  const loja = urlDaLoja()
  const [saidas, semEntrega] = await Promise.all([crm.quemSaiu([email]), crm.semEntrega([email])])
  const voltou = await quemVoltouPraLista(container, saidas)
  const fora = semEntrega.has(email) || (saidas.has(email) && !voltou.has(email))
  if (loja && !fora) {
    try {
      const [infoDaLoja, nomes] = await Promise.all([
        dadosDaLoja(container, loja),
        nomesDasPessoas(container, [email]),
      ])
      const enviado = await enviarEmail(
        comQuemManda(
          emailDoPremio({
            para: email,
            nome: nomes.get(email) ?? null,
            cupom: { codigo: cupom.codigo, porcento: PORCENTO_DO_PREMIO, ate: cupom.ate },
            sair: linksDeSair(loja, email),
            loja: infoDaLoja,
          })
        ),
        logger,
        { idempotencia: `crm-indicacao/premio/${pedido.id}`, tipo: "crm-indicacao" }
      )
      if (enviado.ok) resendId = enviado.id ?? null
      else logger.warn(`[crm] o e-mail do prêmio da indicação não saiu: ${enviado.motivo}`)
    } catch (e) {
      logger.warn(`[crm] o e-mail do prêmio da indicação não saiu: ${(e as Error).message}`)
    }
  }
  await crm.confirmarToque(reserva, { resendId, cupom: cupom.codigo, cupomAte: cupom.ate })
  return "premiado"
}
