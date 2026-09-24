import { redirect } from "next/navigation"

/** Por enquanto, a única aba é a equipe. */
export default function Pagina() {
  redirect("/configuracoes/equipe")
}
