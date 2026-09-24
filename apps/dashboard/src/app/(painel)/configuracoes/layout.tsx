import Link from "next/link"
import type { ReactNode } from "react"
import { SoPara } from "@/components/area"
import { Cabeca } from "@/components/telas"

/**
 * CONFIGURAÇÕES — só do dono. Por enquanto, uma aba: a equipe. As outras
 * do protótipo (dados da empresa, frete, pagamento, nota, entrega, e-mails)
 * chegam na fase 6.
 */
export default function LayoutDasConfiguracoes({ children }: { children: ReactNode }) {
  return (
    <SoPara area="configuracoes">
      <div data-tela>
        <Cabeca
          titulo="Configurações"
          sub="O que muda como a loja funciona. Só o dono entra aqui."
        />
        <nav className="abas" aria-label="Configurações">
          <Link href="/configuracoes/equipe" aria-current="page">
            Equipe e acessos
          </Link>
        </nav>
        {children}
      </div>
    </SoPara>
  )
}
