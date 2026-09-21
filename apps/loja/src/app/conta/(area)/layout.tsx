import { Suspense, type ReactNode } from "react"
import { MenuDaConta, MenuEsperando } from "@/components/conta/menu"

/**
 * A ÁREA LOGADA — o menu à esquerda (no celular, abas no topo) e a tela da
 * vez à direita. O grupo `(area)` não entra no endereço: é só o que separa
 * as telas de dentro das de entrar, que não têm menu.
 *
 * O menu fala com o Medusa (quem é, quantos pedidos) e por isso mora num
 * `<Suspense>`; a casca dele sai na hora, igual pra todo mundo.
 */
export default function LayoutDaArea({ children }: { children: ReactNode }) {
  return (
    <div className="area">
      <Suspense fallback={<MenuEsperando />}>
        <MenuDaConta />
      </Suspense>
      <div className="area__miolo">{children}</div>
    </div>
  )
}
