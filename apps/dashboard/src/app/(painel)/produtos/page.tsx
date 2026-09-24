import type { Metadata } from "next"
import { AreaEmBreve } from "@/components/area"

export const metadata: Metadata = { title: "Produtos" }

export default function Pagina() {
  return <AreaEmBreve area="produtos" />
}
