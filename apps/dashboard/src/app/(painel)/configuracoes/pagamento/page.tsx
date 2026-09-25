import type { Metadata } from "next"
import { LinhasDeStatus } from "@/components/configuracoes-lidas"
import { ForaDoAr, SemAcesso } from "@/components/telas"
import { lerConfiguracoes } from "@/lib/ler-configuracoes"

export const metadata: Metadata = { title: "Pagamento" }

/** O pagamento, pra conferir: muda no Pagar.me e nas variáveis do Railway, não aqui. */
export default async function Pagina() {
  const t = await lerConfiguracoes()
  if (t === "sem-acesso") return <SemAcesso area="configuracoes" />
  if (!t) return <ForaDoAr />
  return <LinhasDeStatus linhas={t.pagamento} dado="pagamento" />
}
