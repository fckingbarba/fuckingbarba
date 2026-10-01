import type { MedusaContainer } from "@medusajs/framework/types"
import { WHATSAPP } from "../../modules/whatsapp"
import type WhatsappService from "../../modules/whatsapp/service"
import { credenciaisDoWhatsapp, enviarTexto, ErroDaMeta, LIMITE_DO_TEXTO } from "./meta"
import { JANELA_H } from "./regras"

/**
 * A EQUIPE RESPONDE PELO PAINEL — o texto sai pelo WhatsApp da loja, fica na
 * conversa com o nome de quem mandou, e a conversa passa a ser da equipe: o
 * atendente fica quieto até `VOLTA_PRO_BOT_EM_H` depois da última mensagem
 * dela (ou até alguém devolver).
 *
 * Só dentro da janela de 24 horas da última mensagem do cliente: fora dela a
 * Meta recusa texto livre (131047), e a tela diz por quê.
 */

export type RespostaDaEquipe =
  | { ok: true }
  | { ok: false; motivo: "nao_encontrada" | "vazia" | "janela" | "sem_credencial" | "meta" }

export async function responderComoEquipe(
  container: MedusaContainer,
  p: { conversa: string; texto: string; membro: { id: string; nome: string | null } },
  agora = new Date()
): Promise<RespostaDaEquipe> {
  const whatsapp = container.resolve<WhatsappService>(WHATSAPP)
  const c = await whatsapp.conversaDoPainel(p.conversa)
  if (!c) return { ok: false, motivo: "nao_encontrada" }
  const texto = p.texto.trim().slice(0, LIMITE_DO_TEXTO)
  if (!texto) return { ok: false, motivo: "vazia" }
  if (
    !c.ultima_entrada_em ||
    agora.getTime() - c.ultima_entrada_em.getTime() >= JANELA_H * 3_600_000
  )
    return { ok: false, motivo: "janela" }
  const cred = credenciaisDoWhatsapp()
  if (!cred) return { ok: false, motivo: "sem_credencial" }

  const dados = {
    membro: p.membro.id,
    nome: p.membro.nome?.trim().split(/\s+/)[0] || null,
  }
  try {
    const { wamid } = await enviarTexto(cred, c.telefone, texto)
    await whatsapp.anotarSaida({
      conversaId: c.id,
      autor: "equipe",
      texto,
      wamid,
      situacao: "enviada",
      dados,
      em: new Date(),
    })
  } catch (e) {
    await whatsapp.anotarSaida({
      conversaId: c.id,
      autor: "equipe",
      texto,
      wamid: null,
      situacao: "falhou",
      erro: e instanceof Error ? e.message : String(e),
      dados,
      em: new Date(),
    })
    return { ok: false, motivo: e instanceof ErroDaMeta && e.codigo === 131047 ? "janela" : "meta" }
  }
  await whatsapp.equipeAssumiu(c.id, agora)
  return { ok: true }
}

/** Devolve a conversa pro atendente (e, se o cliente está esperando, ele responde na próxima rodada). */
export async function devolverProAtendente(
  container: MedusaContainer,
  conversa: string
): Promise<boolean> {
  const whatsapp = container.resolve<WhatsappService>(WHATSAPP)
  if (!(await whatsapp.conversaDoPainel(conversa))) return false
  await whatsapp.devolver(conversa)
  return true
}
