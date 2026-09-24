import type { Metadata } from "next"
import { AreaEmBreve } from "@/components/area"

export const metadata: Metadata = { title: "Layout da home" }

export default function Pagina() {
  return <AreaEmBreve area="home" />
}
