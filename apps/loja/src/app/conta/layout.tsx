import type { Metadata } from "next"
import type { ReactNode } from "react"
import { MarcaDaTela } from "@/components/marca-da-tela"
// Só no checkout e na conta, e não no globals.css: ver "O QUE NÃO MORA AQUI" lá.
import "@/estilos/telas/checkout-e-conta.css"

/**
 * /conta — a área do cliente. O desenho é o de
 * `ferramentas/porte/prototipo-conta.html`.
 *
 * Cabeçalho e rodapé são os da loja (vêm do layout raiz): aqui a pessoa
 * confere pedido e volta a comprar, e ficar sem o caminho de volta pra
 * vitrine seria o contrário do checkout, onde tirar as saídas é de
 * propósito. O fundo vira cinza, como no checkout — é tela de conferir e
 * preencher, não de passear (`estilos/conta.css`).
 *
 * NADA AQUI LÊ COOKIE NO TOPO: cada página lê a sessão dentro de um
 * `<Suspense>`, e o que é igual pra todo mundo sai na casca estática.
 */
export const metadata: Metadata = {
  // O robots.ts já bloqueia /conta; isto é a segunda tranca.
  robots: { index: false, follow: false },
}

export default function LayoutDaConta({ children }: { children: ReactNode }) {
  return (
    // Na gravação da Clarity, os dados da conta ficam cobertos.
    <main className="conta" id="conteudo" data-clarity-mask="true">
      <MarcaDaTela tela="conta" />
      <div className="conta__wrap">{children}</div>
    </main>
  )
}
