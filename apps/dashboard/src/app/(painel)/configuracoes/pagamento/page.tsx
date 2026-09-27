import type { Metadata } from "next"
import { FormularioDoParcelamento } from "@/components/configuracoes"
import { LinhasDeStatus } from "@/components/configuracoes-lidas"
import { ForaDoAr, SemAcesso } from "@/components/telas"
import { lerConfiguracoes } from "@/lib/ler-configuracoes"

export const metadata: Metadata = { title: "Pagamento" }

/**
 * O pagamento: a parcela mínima do cartão se muda aqui (0157); o resto é pra
 * conferir — muda no Pagar.me, no Mercado Pago e nas variáveis do Railway.
 */
export default async function Pagina() {
  const t = await lerConfiguracoes()
  if (t === "sem-acesso") return <SemAcesso area="configuracoes" />
  if (!t) return <ForaDoAr />
  return (
    <>
      <FormularioDoParcelamento
        inicial={{ parcelaMinima: t.parcelamento.parcelaMinima }}
        parcelas={t.parcelamento.parcelas}
      />
      <LinhasDeStatus linhas={t.pagamento} dado="pagamento" />
    </>
  )
}
