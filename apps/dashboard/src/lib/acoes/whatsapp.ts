"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { semAcessoA } from "@/lib/equipe"
import { medusa } from "@/lib/medusa"
import type { Resultado } from "@/lib/produtos"
import { ehIdDeConversa, type FalaDoTeste, type RespostaDoTeste } from "@/lib/whatsapp"

/**
 * O QUE A EQUIPE FAZ NO WHATSAPP — responder uma conversa, devolver pro
 * atendente, ligar e desligar, as regras e o teste. Quem decide é o Medusa
 * (`/dashboard/whatsapp/…`), que confere o papel, manda pela Meta e deixa a
 * linha no registro da equipe. Feito, a tela se refaz.
 */

const GENERICO = "Não consegui falar com a loja agora. Tenta de novo em instantes."

function sairSe401(r: { status: number; corpo: Record<string, unknown> }) {
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
}

const NAO_RESPONDEU: Record<string, string> = {
  vazia: "Escreva a mensagem antes de enviar.",
  janela:
    "Passou de 24 horas da última mensagem do cliente: o WhatsApp não deixa a loja escrever primeiro. Quando ele mandar mensagem de novo, dá pra responder.",
  meta: "O WhatsApp recusou a mensagem agora. Tenta de novo em instantes; se continuar, olhe a Observabilidade.",
  sem_credencial: "O WhatsApp da loja ainda não está ligado: falta o WHATSAPP_TOKEN no Railway.",
  nao_encontrada: "Essa conversa não existe mais.",
}

export async function responderNoWhatsapp(conversa: string, texto: string): Promise<Resultado> {
  if (!ehIdDeConversa(conversa)) return { ok: false, texto: GENERICO }
  const r = await medusa(`/dashboard/whatsapp/conversas/${conversa}`, {
    token: "sessao",
    corpo: { acao: "responder", texto },
    tempoLimite: 20_000,
  })
  sairSe401(r)
  revalidatePath(`/whatsapp/${conversa}`)
  if (r.status === 403) return { ok: false, texto: semAcessoA("whatsapp") }
  if (r.status !== 200)
    return { ok: false, texto: NAO_RESPONDEU[String(r.corpo.message)] ?? GENERICO }
  return {
    ok: true,
    texto: "Enviada pelo WhatsApp da loja. O atendente fica quieto nesta conversa.",
  }
}

export async function devolverAoAtendente(conversa: string): Promise<Resultado> {
  if (!ehIdDeConversa(conversa)) return { ok: false, texto: GENERICO }
  const r = await medusa(`/dashboard/whatsapp/conversas/${conversa}`, {
    token: "sessao",
    corpo: { acao: "devolver" },
  })
  sairSe401(r)
  revalidatePath(`/whatsapp/${conversa}`)
  if (r.status === 403) return { ok: false, texto: semAcessoA("whatsapp") }
  if (r.status === 404) return { ok: false, texto: NAO_RESPONDEU.nao_encontrada }
  if (r.status !== 200) return { ok: false, texto: GENERICO }
  return {
    ok: true,
    texto:
      "Devolvida: o atendente volta a responder (se o cliente está esperando, em até 1 minuto).",
  }
}

export async function salvarAjustesDoWhatsapp(ajustes: {
  ligado?: boolean
  regras?: string
}): Promise<Resultado> {
  const r = await medusa("/dashboard/whatsapp/ajustes", { token: "sessao", corpo: ajustes })
  sairSe401(r)
  revalidatePath("/whatsapp/ajustes")
  revalidatePath("/whatsapp")
  if (r.status === 403) return { ok: false, texto: semAcessoA("whatsapp") }
  if (r.status === 422) return { ok: false, texto: "As regras passaram do tamanho máximo." }
  if (r.status !== 200) return { ok: false, texto: GENERICO }
  if (ajustes.ligado === true)
    return { ok: true, texto: "Atendente ligado: ele volta a responder." }
  if (ajustes.ligado === false)
    return {
      ok: true,
      texto: "Atendente desligado: as mensagens chegam aqui, e só a equipe responde.",
    }
  return { ok: true, texto: "Regras salvas: valem na próxima resposta do atendente." }
}

const NAO_TESTOU: Record<string, string> = {
  sem_chave:
    "Falta a ANTHROPIC_API_KEY no Railway: sem ela o atendente não responde (nem no teste).",
  sem_loja: "Falta o LOJA_URL no Railway.",
  conversa: "Escreva a mensagem de teste.",
  regras: "As regras passaram do tamanho máximo.",
  ia_fora: "A IA não respondeu agora. Tenta de novo em instantes.",
  limite: "Muitos testes nesta hora (cada um custa): tenta daqui a pouco.",
}

export async function testarOAtendente(p: {
  falas: FalaDoTeste[]
  telefone: string
  regras: string
}): Promise<{ ok: true; resposta: RespostaDoTeste } | { ok: false; texto: string }> {
  const r = await medusa("/dashboard/whatsapp/testar", {
    token: "sessao",
    corpo: { falas: p.falas, telefone: p.telefone || undefined, regras: p.regras },
    tempoLimite: 90_000,
  })
  sairSe401(r)
  if (r.status === 403) return { ok: false, texto: semAcessoA("whatsapp") }
  if (r.status !== 200) return { ok: false, texto: NAO_TESTOU[String(r.corpo.message)] ?? GENERICO }
  return { ok: true, resposta: r.corpo as unknown as RespostaDoTeste }
}
