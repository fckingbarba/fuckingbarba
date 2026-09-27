"use server"

import { cabecalhosDeQuemPede, medusa } from "@/lib/conta"
import { esquecerLinkDeSair, lerLinkDeSair } from "@/lib/sair"
import type { EstadoDoSair } from "@/lib/sair-visivel"

/**
 * O BOTÃO "SAIR DA LISTA" da página `/sair`: manda o link guardado no
 * cookie pro Medusa (`POST /crm/sair`), que tira o e-mail das ofertas em
 * todo lugar — a newsletter, a conta, o avise-me e a base da Nuvemshop.
 *
 * O IP de quem pede vai assinado (`cabecalhosDeQuemPede`), pra o limite
 * contar por pessoa e não pela Vercel inteira.
 *
 * SAIU, O COOKIE FICA. Mexer em cookie numa ação faz o Next refazer a
 * página no servidor — e a página, sem o link, trocaria o "Pronto, você
 * saiu" por "Esse link não vale". Com o cookie, voltar à página e apertar de
 * novo só confirma (o Medusa responde igual). O link que não vale sai.
 */
export async function sairDaLista(): Promise<EstadoDoSair> {
  const t = await lerLinkDeSair()
  if (!t) return { tipo: "invalido" }

  const r = await medusa("/crm/sair", { corpo: { t }, extras: await cabecalhosDeQuemPede() })
  if (r.status === 200) return { tipo: "saiu" }
  if (r.status === 400) {
    await esquecerLinkDeSair()
    return { tipo: "invalido" }
  }
  if (r.status === 429) {
    return { tipo: "erro", texto: "Muitos pedidos daqui agora. Tenta de novo mais tarde." }
  }
  return {
    tipo: "erro",
    texto: "Não consegui tirar você da lista agora. Tenta de novo em instantes.",
  }
}
