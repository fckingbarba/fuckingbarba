import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { SoPara } from "@/components/area"
import { ForaDoAr, SemAcesso } from "@/components/telas"
import { TopoDoWhatsapp } from "@/components/whatsapp"
import { AjustesETeste } from "@/components/whatsapp-acoes"
import { ler } from "@/lib/medusa"
import type { AjustesDoWhatsapp } from "@/lib/whatsapp"

export const metadata: Metadata = { title: "WhatsApp: ajustes e teste" }

/**
 * OS AJUSTES DO ATENDENTE E O TESTE — ligar e desligar, as regras que o dono
 * escreve (o jeito de falar, o que oferecer, o que passar pra equipe) e o
 * "Testar o atendente": escrever como cliente e ver o que ele responderia,
 * sem sair nada pelo WhatsApp.
 */
export default async function Pagina() {
  void ler("/dashboard/whatsapp/ajustes")
  return (
    <SoPara area="whatsapp">
      <Ajustes />
    </SoPara>
  )
}

async function Ajustes() {
  const r = await ler("/dashboard/whatsapp/ajustes")
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return <SemAcesso area="whatsapp" />
  if (r.status !== 200) return <ForaDoAr />
  const ajustes = r.corpo as unknown as AjustesDoWhatsapp
  return (
    <div data-tela>
      <TopoDoWhatsapp aba="ajustes" ligado={ajustes.ligado} falta={ajustes.falta} />
      <AjustesETeste ajustes={ajustes} />
    </div>
  )
}
