import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { SoPara } from "@/components/area"
import { ListaDasCampanhas, RegrasDasCampanhas } from "@/components/campanhas-do-crm"
import { AbasDoCrm } from "@/components/crm"
import { Icone } from "@/components/icones"
import { Cabeca, ForaDoAr, SemAcesso } from "@/components/telas"
import { CAMINHO_DAS_CAMPANHAS, type TelaDasCampanhas } from "@/lib/crm"
import { ler } from "@/lib/medusa"

export const metadata: Metadata = { title: "Campanhas do CRM" }

/**
 * AS CAMPANHAS DO CRM (entrega 0206) — os e-mails de data: a Black Friday, o
 * Natal, um lançamento. A lista (a que está saindo, as agendadas, os
 * rascunhos e as que saíram, com o que venderam em 7 dias) e o "Nova
 * campanha". Vem do Medusa (`GET /dashboard/crm/campanhas`); quem abre o CRM.
 */
export default function Pagina() {
  void ler(CAMINHO_DAS_CAMPANHAS)
  return (
    <SoPara area="crm">
      <Campanhas />
    </SoPara>
  )
}

async function Campanhas() {
  const r = await ler(CAMINHO_DAS_CAMPANHAS)
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return <SemAcesso area="crm" />
  if (r.status !== 200) return <ForaDoAr />
  const tela = r.corpo as unknown as TelaDasCampanhas

  return (
    <div data-tela data-campanhas-crm>
      <Cabeca
        titulo="CRM"
        sub="Os e-mails de data: a Black Friday, o Natal, um lançamento."
        acoes={
          <Link className="btn btn--menor" href="/crm/campanhas/nova" data-nova-campanha>
            <Icone nome="mais" />
            Nova campanha
          </Link>
        }
      />
      <AbasDoCrm atual="campanhas" />
      <ListaDasCampanhas tela={tela} />
      <RegrasDasCampanhas />
    </div>
  )
}
