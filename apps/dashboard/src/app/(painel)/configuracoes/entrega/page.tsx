import type { Metadata } from "next"
import { LinhasDeStatus } from "@/components/configuracoes-lidas"
import { ForaDoAr, SemAcesso } from "@/components/telas"
import { lerConfiguracoes } from "@/lib/ler-configuracoes"

export const metadata: Metadata = { title: "Entrega" }

/** A entrega, pra conferir: a cotação, o pedido no painel da Frenet e o rastreio. */
export default async function Pagina() {
  const t = await lerConfiguracoes()
  if (t === "sem-acesso") return <SemAcesso area="configuracoes" />
  if (!t) return <ForaDoAr />
  return <LinhasDeStatus linhas={t.entrega} dado="entrega" />
}
