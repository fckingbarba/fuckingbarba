import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { SoPara } from "@/components/area"
import { RegrasDasCampanhas } from "@/components/campanhas-do-crm"
import { FormularioDaCampanha } from "@/components/formulario-da-campanha"
import { Cabeca, ForaDoAr, SemAcesso } from "@/components/telas"
import { CAMINHO_DAS_CAMPANHAS, type TelaDasCampanhas } from "@/lib/crm"
import { ler } from "@/lib/medusa"

export const metadata: Metadata = { title: "Nova campanha" }

/**
 * UMA CAMPANHA NOVA (entrega 0206) — o formulário vazio. Os públicos (com
 * quantas pessoas cada um tem agora) e os produtos vêm da mesma leitura da
 * lista (`GET /dashboard/crm/campanhas`).
 */
export default function Pagina() {
  void ler(CAMINHO_DAS_CAMPANHAS)
  return (
    <SoPara area="crm">
      <Nova />
    </SoPara>
  )
}

async function Nova() {
  const r = await ler(CAMINHO_DAS_CAMPANHAS)
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return <SemAcesso area="crm" />
  if (r.status !== 200) return <ForaDoAr />
  const tela = r.corpo as unknown as TelaDasCampanhas

  return (
    <div data-tela data-nova-campanha-tela>
      <Cabeca
        titulo="Nova campanha"
        sub="Escreva o e-mail, escolha pra quem e quando. Antes de agendar, mande pra você."
        voltar={{ href: "/crm/campanhas", texto: "Campanhas" }}
      />
      <FormularioDaCampanha tela={tela} campanha={null} />
      <RegrasDasCampanhas />
    </div>
  )
}
