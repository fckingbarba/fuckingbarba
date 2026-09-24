import type { ReactNode } from "react"
import { Logo } from "@/components/icones"

/** O fundo preto, a marca e a caixa branca das telas de entrar — como no protótipo. */
export function MolduraDeEntrar({ children }: { children: ReactNode }) {
  return (
    <main className="entrar">
      <div className="entrar__caixa">
        <div className="entrar__logo">
          <Logo />
          <p className="lateral__nome">
            FuckingBarba <small>Painel da loja</small>
          </p>
        </div>
        <div className="bloco">{children}</div>
      </div>
    </main>
  )
}
