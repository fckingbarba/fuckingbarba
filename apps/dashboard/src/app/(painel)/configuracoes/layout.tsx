import type { ReactNode } from "react"
import { SoPara } from "@/components/area"
import { AbasDasConfiguracoes } from "@/components/configuracoes"
import { Cabeca } from "@/components/telas"

/**
 * CONFIGURAÇÕES — só do dono. As abas do protótipo: os dados da empresa, o
 * frete, o pagamento, a nota, a entrega, os e-mails e a equipe. As três
 * primeiras mudam como a loja funciona; pagamento e entrega são pra
 * conferir; os e-mails dizem o que sai e pra quem.
 */
export default function LayoutDasConfiguracoes({ children }: { children: ReactNode }) {
  return (
    <SoPara area="configuracoes">
      <div data-tela>
        <Cabeca
          titulo="Configurações"
          sub="O que muda como a loja funciona. Só o dono entra aqui."
        />
        <AbasDasConfiguracoes />
        {children}
      </div>
    </SoPara>
  )
}
