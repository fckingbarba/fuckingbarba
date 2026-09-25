"use client"

import { Icone } from "@/components/icones"
import { anotarWhatsapp } from "@/lib/acoes/carrinhos"

/**
 * Abre o WhatsApp numa aba nova, com a mensagem pronta — quem manda é a
 * pessoa da equipe, que muda o que quiser antes. O clique fica anotado (quem
 * chamou, e quando), pra ninguém chamar a mesma pessoa duas vezes.
 */
export function BotaoDoWhatsapp({ id, link }: { id: string; link: string }) {
  return (
    <a
      className="btn btn--menor btn--whatsapp"
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      data-whatsapp={id}
      onClick={() => void anotarWhatsapp(id)}
    >
      <Icone nome="whatsapp" />
      WhatsApp
    </a>
  )
}
