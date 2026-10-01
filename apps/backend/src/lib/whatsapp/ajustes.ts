import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

/**
 * OS AJUSTES DO ATENDENTE DO WHATSAPP — no `metadata` da loja, como as
 * configurações (`lib/configuracoes.ts`): mudar não pede deploy.
 *
 * `ligado`: com `false`, as mensagens continuam chegando e ficando guardadas,
 *   e ninguém responde sozinho (a equipe responde pelo painel). Padrão: ligado.
 * `regras`: o que o dono quer que o atendente siga, em texto livre ("trate
 *   por irmão", "não fale de atacado"). Vale acima das regras do código, e
 *   NUNCA acima dos fatos: preço, frete e prazo continuam vindo do sistema.
 *
 * A tela pra mudar os dois é a do painel (próxima entrega); até lá vale o
 * padrão.
 */
export const CHAVE_NO_METADATA = "fb_whatsapp"

/** O tamanho máximo das regras: elas vão em toda conversa, pro cache da IA. */
export const LIMITE_DAS_REGRAS = 4000

export type AjustesDoWhatsapp = { ligado: boolean; regras: string | null }

export const AJUSTES_PADRAO: AjustesDoWhatsapp = { ligado: true, regras: null }

export function lerAjustesDoWhatsapp(metadata: unknown): AjustesDoWhatsapp {
  const raiz =
    metadata && typeof metadata === "object"
      ? (metadata as Record<string, unknown>)[CHAVE_NO_METADATA]
      : null
  if (!raiz || typeof raiz !== "object") return AJUSTES_PADRAO
  const o = raiz as Record<string, unknown>
  const regras = typeof o.regras === "string" ? o.regras.trim().slice(0, LIMITE_DAS_REGRAS) : ""
  return { ligado: o.ligado !== false, regras: regras || null }
}

export async function ajustesDoWhatsapp(container: MedusaContainer): Promise<AjustesDoWhatsapp> {
  const [loja] = await container
    .resolve(Modules.STORE)
    .listStores({}, { select: ["id", "metadata"], take: 1 })
  return lerAjustesDoWhatsapp(loja?.metadata)
}
