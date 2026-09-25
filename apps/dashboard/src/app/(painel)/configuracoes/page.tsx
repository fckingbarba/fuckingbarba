import { redirect } from "next/navigation"

/** A primeira aba é a dos dados da empresa. */
export default function Pagina() {
  redirect("/configuracoes/empresa")
}
