import type { Metadata } from "next"
import { FormularioDaEmpresa } from "@/components/configuracoes"
import { Icone } from "@/components/icones"
import { ForaDoAr, SemAcesso } from "@/components/telas"
import { lerConfiguracoes } from "@/lib/ler-configuracoes"

export const metadata: Metadata = { title: "Dados da empresa" }

/** Os dados da empresa e do atendimento: o rodapé e as páginas legais leem daqui. */
export default async function Pagina() {
  const t = await lerConfiguracoes()
  if (t === "sem-acesso") return <SemAcesso area="configuracoes" />
  if (!t) return <ForaDoAr />
  const { emBranco, ...inicial } = t.empresa
  return (
    <>
      {emBranco.length ? (
        <div className="faixa" data-nivel="atencao" data-em-branco>
          <Icone nome="alerta" />
          <div>
            <p className="faixa__titulo">Em branco na loja de hoje</p>
            <p>
              {emBranco.join(", ")}. Enquanto estiverem vazios, as páginas legais mostram a tarja de
              &ldquo;dado pendente&rdquo; no lugar de cada um. Preenchidos, aparecem sozinhos.
            </p>
          </div>
        </div>
      ) : null}
      {/* A chave é o que está gravado: salvo, o formulário renasce com o valor arrumado (o CNPJ com pontos). */}
      <FormularioDaEmpresa key={JSON.stringify(inicial)} inicial={inicial} />
    </>
  )
}
