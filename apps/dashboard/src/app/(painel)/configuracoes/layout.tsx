import type { ReactNode } from "react"
import { SoPara } from "@/components/area"
import { AbasDasConfiguracoes } from "@/components/configuracoes"
import { Cabeca } from "@/components/telas"
import { lerMembro } from "@/lib/eu"

/**
 * CONFIGURAÇÕES — no padrão, só do dono; o dono pode liberar pra operação
 * ou pro marketing, na tabela da equipe. As abas do protótipo: os dados da
 * empresa, o frete, o pagamento, a nota, a entrega, os e-mails e a equipe.
 * As três primeiras mudam como a loja funciona; pagamento e entrega são pra
 * conferir; os e-mails dizem o que sai e pra quem. A aba da equipe só
 * aparece pra quem abre ela (o dono).
 */
export default async function LayoutDasConfiguracoes({ children }: { children: ReactNode }) {
  const leitura = await lerMembro()
  const areas = leitura.estado === "ok" ? leitura.areas : []
  return (
    <SoPara area="configuracoes">
      <div data-tela>
        <Cabeca titulo="Configurações" ajuda="O que muda como a loja funciona." />
        <AbasDasConfiguracoes areas={areas} />
        {children}
      </div>
    </SoPara>
  )
}
