import type { Metadata } from "next"
import { AreaEmBreve } from "@/components/area"

export const metadata: Metadata = { title: "Clientes" }

export default function Pagina() {
  return <AreaEmBreve area="clientes" />
}
