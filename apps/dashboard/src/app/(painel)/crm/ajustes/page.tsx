import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { SoPara } from "@/components/area"
import { FormularioDosAjustes } from "@/components/ajustes-do-crm"
import { AbasDoCrm } from "@/components/crm"
import { Cabeca, ForaDoAr, SemAcesso } from "@/components/telas"
import { CAMINHO_DOS_AJUSTES, type TelaDosAjustes } from "@/lib/crm"
import { ler } from "@/lib/medusa"

export const metadata: Metadata = { title: "Ajustes do CRM" }

/**
 * OS AJUSTES DO CRM — quanto dura cada tipo de produto e as regras das
 * etiquetas (a etapa, o engajamento, o sensível a cupom), que valem na ficha
 * de cada cliente. Vêm do Medusa (`GET /dashboard/crm/ajustes`), com o
 * padrão e os produtos da loja que contam como cada tipo. Quem abre o CRM
 * (no padrão, o dono e o marketing). A leitura sai junto com a pergunta de
 * quem é (`ler`).
 */
export default function Pagina() {
  void ler(CAMINHO_DOS_AJUSTES)
  return (
    <SoPara area="crm">
      <Ajustes />
    </SoPara>
  )
}

async function Ajustes() {
  const r = await ler(CAMINHO_DOS_AJUSTES)
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return <SemAcesso area="crm" />
  if (r.status !== 200) return <ForaDoAr />
  const tela = r.corpo as unknown as TelaDosAjustes

  return (
    <div data-tela data-ajustes-crm>
      <Cabeca
        titulo="CRM"
        sub="Quanto dura cada produto e quando cada pessoa muda de etiqueta. Vale na ficha de cada cliente."
      />
      <AbasDoCrm atual="ajustes" />
      <FormularioDosAjustes key={JSON.stringify(tela.ajustes)} tela={tela} />
    </div>
  )
}
