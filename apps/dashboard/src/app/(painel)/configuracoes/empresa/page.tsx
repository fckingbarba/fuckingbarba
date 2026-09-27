import type { Metadata } from "next"
import { FormularioDaEmpresa } from "@/components/configuracoes"
import { ForaDoAr, SemAcesso } from "@/components/telas"
import { Faixa } from "@/components/visual"
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
        // O que falta à vista, em etiquetas; o porquê no "?" (0158).
        <Faixa
          nivel="atencao"
          icone="alerta"
          titulo="Em branco na loja de hoje"
          etiquetas={emBranco}
          ajuda="Enquanto estiverem vazios, as páginas legais mostram a tarja de “dado pendente” no lugar de cada um. Preenchidos, aparecem sozinhos."
          data-em-branco=""
        />
      ) : null}
      {/* A chave é o que está gravado: salvo, o formulário renasce com o valor arrumado (o CNPJ com pontos). */}
      <FormularioDaEmpresa key={JSON.stringify(inicial)} inicial={inicial} />
    </>
  )
}
