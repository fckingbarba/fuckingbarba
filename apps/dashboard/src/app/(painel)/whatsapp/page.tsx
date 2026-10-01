import type { Metadata } from "next"
import { SoPara } from "@/components/area"
import { caminhoDaLista, TelaDasConversas, type BuscaDoWhatsapp } from "@/components/whatsapp-tela"
import { ler } from "@/lib/medusa"

export const metadata: Metadata = { title: "WhatsApp" }

/**
 * WHATSAPP — as conversas de quem escreve pro número da loja: o atendente (a
 * IA) responde sozinho; o que precisa de alguém (troca, reclamação, "quero
 * falar com uma pessoa") fica com a equipe, com o número amarelo no menu. A
 * fita, a busca e a página ficam no endereço (`?filtro=equipe&busca=…`).
 * Dono e operação.
 */
export default async function Pagina({ searchParams }: { searchParams: Promise<BuscaDoWhatsapp> }) {
  const caminho = caminhoDaLista(await searchParams)
  void ler(caminho)
  return (
    <SoPara area="whatsapp">
      <TelaDasConversas caminho={caminho} />
    </SoPara>
  )
}
