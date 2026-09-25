import { redirect } from "next/navigation"
import type { ReactNode } from "react"
import { SoltarSoNoQuadro } from "@/components/arrastar"
import { ComAvisos } from "@/components/avisos"
import { Casca } from "@/components/casca"
import { ForaDoAr } from "@/components/telas"
import { lerMembro } from "@/lib/eu"

/**
 * TODA TELA DO PAINEL PASSA POR AQUI — a casca pergunta ao Medusa quem é.
 *
 * O proxy só olhou o cookie. Aqui é a pergunta de verdade: token recusado ou
 * pessoa tirada da equipe vão pro `/sair` (que apaga o cookie e explica no
 * "entrar"); Medusa fora do ar mostra o aviso, sem tirar ninguém do painel.
 *
 * O aviso de baixo (`ComAvisos`) mora aqui, acima das telas: a frase de uma
 * ação sobrevive à tela se refazendo depois dela. E o arquivo arrastado que
 * cai fora de um quadro de foto não abre no lugar do painel
 * (`SoltarSoNoQuadro`).
 */
export default async function LayoutDoPainel({ children }: { children: ReactNode }) {
  const leitura = await lerMembro()
  if (leitura.estado === "sem-sessao") redirect("/entrar")
  if (leitura.estado === "fora") redirect(`/sair?motivo=${leitura.motivo}`)
  if (leitura.estado === "fora-do-ar") {
    return (
      <main className="miolo">
        <ForaDoAr />
      </main>
    )
  }
  return (
    <Casca membro={leitura.membro} areas={leitura.areas} avisos={leitura.avisos}>
      <SoltarSoNoQuadro />
      <ComAvisos>{children}</ComAvisos>
    </Casca>
  )
}
