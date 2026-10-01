import type { Metadata } from "next"
import { SoPara } from "@/components/area"
import { caminhoDaLista, TelaDasConversas, type BuscaDoWhatsapp } from "@/components/whatsapp-tela"
import { ler } from "@/lib/medusa"

export const metadata: Metadata = { title: "WhatsApp" }

/**
 * UMA CONVERSA DO WHATSAPP, com a lista ao lado (a mesma fita e busca de
 * antes, no endereço): as mensagens, o que o atendente fez em cada resposta,
 * responder como equipe, devolver pro atendente e quem escreve.
 */
export default async function Pagina({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<BuscaDoWhatsapp>
}) {
  const [{ id }, busca] = await Promise.all([params, searchParams])
  const caminho = caminhoDaLista(busca)
  void ler(caminho)
  return (
    <SoPara area="whatsapp">
      <TelaDasConversas caminho={caminho} conversa={id} />
    </SoPara>
  )
}
