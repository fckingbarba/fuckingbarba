import type { Metadata } from "next"
import { AreaEmBreve } from "@/components/area"

export const metadata: Metadata = { title: "Cupons e descontos" }

export default function Pagina() {
  return <AreaEmBreve area="cupons" />
}
