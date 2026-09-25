"use server"

import { revalidatePath } from "next/cache"
import { medusa } from "@/lib/medusa"

/**
 * "CHAMOU NO WHATSAPP" — o botão da lista abre o WhatsApp numa aba nova e
 * anota aqui quem chamou (`POST /dashboard/carrinhos/:id/whatsapp`). Falhar
 * não impede a conversa: só a marca na lista não aparece.
 */
export async function anotarWhatsapp(id: string): Promise<void> {
  if (!/^cart_[0-9A-Z]{10,40}$/.test(id)) return
  const r = await medusa(`/dashboard/carrinhos/${id}/whatsapp`, { token: "sessao" })
  if (r.status === 200) revalidatePath("/carrinhos")
}
