import type { Metadata } from "next"
import { FormularioDaEmergencia, FormularioDoFrete } from "@/components/configuracoes"
import { ForaDoAr, SemAcesso } from "@/components/telas"
import { lerConfiguracoes } from "@/lib/ler-configuracoes"

export const metadata: Metadata = { title: "Frete" }

/** A promoção de frete e o que fazer se a Frenet cair. */
export default async function Pagina() {
  const t = await lerConfiguracoes()
  if (t === "sem-acesso") return <SemAcesso area="configuracoes" />
  if (!t) return <ForaDoAr />
  const { emergencia, frase, ...frete } = t.frete
  return (
    <>
      <FormularioDoFrete key={JSON.stringify(frete)} inicial={frete} frase={frase} />
      <FormularioDaEmergencia key={JSON.stringify(emergencia)} inicial={emergencia} />
    </>
  )
}
