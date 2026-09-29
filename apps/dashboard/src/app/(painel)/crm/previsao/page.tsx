import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { SoPara } from "@/components/area"
import { AbasDoCrm } from "@/components/crm"
import {
  BuscaDaPrevisao,
  ListaDaPrevisao,
  NumerosDaPrevisao,
  RegrasDaPrevisao,
} from "@/components/previsao-do-crm"
import { Cabeca, ForaDoAr, SemAcesso } from "@/components/telas"
import { CAMINHO_DA_PREVISAO, type TelaDaPrevisao } from "@/lib/crm"
import { ler } from "@/lib/medusa"

export const metadata: Metadata = { title: "Previsão do CRM" }

type Props = { searchParams: Promise<{ email?: string | string[] }> }

/**
 * A PREVISÃO POR CLIENTE (entrega 0220) — quem deve comprar em 7 e em 30
 * dias, a chance de sair e o LTV da base, as duas listas de quem agir e a
 * busca por e-mail. Vem do Medusa (`GET /dashboard/crm/previsao`); quem abre
 * o CRM.
 */
export default async function Pagina({ searchParams }: Props) {
  const { email } = await searchParams
  const busca = typeof email === "string" ? email.trim().slice(0, 254) : ""
  const caminho = busca
    ? `${CAMINHO_DA_PREVISAO}?email=${encodeURIComponent(busca)}`
    : CAMINHO_DA_PREVISAO
  void ler(caminho)
  return (
    <SoPara area="crm">
      <Previsao caminho={caminho} />
    </SoPara>
  )
}

async function Previsao({ caminho }: { caminho: string }) {
  const r = await ler(caminho)
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return <SemAcesso area="crm" />
  if (r.status !== 200) return <ForaDoAr />
  const tela = r.corpo as unknown as TelaDaPrevisao

  return (
    <div data-tela data-previsao-crm-tela>
      <Cabeca
        titulo="CRM"
        sub="Quem deve comprar, quem está pra sair, e quanto cada cliente vale."
      />
      <AbasDoCrm atual="previsao" />
      <NumerosDaPrevisao n={tela.numeros} />
      <BuscaDaPrevisao busca={tela.busca} />
      <ListaDaPrevisao
        jeito="semana"
        titulo="Devem comprar nos próximos 7 dias"
        sub="Os de maior ticket. A reposição, ligada, fala com eles no dia."
        linhas={tela.semana}
      />
      <ListaDaPrevisao
        jeito="risco"
        titulo="Os que mais gastaram, com chance alta de sair"
        sub="Os clientes mais valiosos que passaram do dia de comprar de novo. O resgate, ligado, fala com eles."
        linhas={tela.emRisco}
      />
      <RegrasDaPrevisao />
    </div>
  )
}
