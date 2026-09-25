import type { Metadata } from "next"
import { FormularioDasIntegracoes } from "@/components/configuracoes"
import { LinhasDeStatus } from "@/components/configuracoes-lidas"
import { ForaDoAr, SemAcesso } from "@/components/telas"
import { lerConfiguracoes } from "@/lib/ler-configuracoes"

export const metadata: Metadata = { title: "Integrações" }

/**
 * Os códigos de medição e anúncio (GA4, Google Ads, Meta, Clarity, TikTok),
 * e a compra de cada plataforma: por onde sai e o que falta.
 */
export default async function Pagina() {
  const t = await lerConfiguracoes()
  if (t === "sem-acesso") return <SemAcesso area="configuracoes" />
  if (!t) return <ForaDoAr />
  const { formulario, campos, compra } = t.integracoes
  return (
    <>
      {/* A chave é o que está gravado: salvo, o formulário renasce com o código achado no trecho colado. */}
      <FormularioDasIntegracoes
        key={JSON.stringify(formulario)}
        inicial={formulario}
        campos={campos}
      />
      <LinhasDeStatus
        linhas={compra}
        dado="compra"
        titulo="A compra"
        sub="Cada plataforma recebe a compra de quem aceitou os cookies. Sem o aceite, nada sai — nem na loja, nem do servidor."
      />
    </>
  )
}
