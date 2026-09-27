import type { Metadata } from "next"
import { SoPara } from "@/components/area"
import { CaminhoDoCrm, NumerosDoCrm, PeriodosDoCrm, UltimasDoCrm } from "@/components/crm"
import { Cabeca, ForaDoAr, SemAcesso } from "@/components/telas"
import { lerPeriodoDoCrm, lerTelaDoCrm } from "@/lib/crm"

export const metadata: Metadata = { title: "CRM" }

type Busca = Promise<{ periodo?: string }>

/**
 * CRM — o começo: o que cada pessoa faz na loja, anotado pela própria loja
 * e ligado ao e-mail dela (a Fundação do "Ciclo da Barba"). Os e-mails
 * automáticos, a ficha de cada pessoa e os ajustes vêm nas próximas partes.
 * O período fica no endereço (`?periodo=hoje`). Dono e marketing.
 */
export default function Pagina({ searchParams }: { searchParams: Busca }) {
  return (
    <SoPara area="crm">
      <Crm searchParams={searchParams} />
    </SoPara>
  )
}

async function Crm({ searchParams }: { searchParams: Busca }) {
  const periodo = lerPeriodoDoCrm((await searchParams).periodo)
  const leitura = await lerTelaDoCrm(periodo)
  if (leitura.estado !== "ok")
    return leitura.estado === "sem-acesso" ? <SemAcesso area="crm" /> : <ForaDoAr />
  const { tela } = leitura

  return (
    <div data-tela data-crm>
      <Cabeca
        titulo="CRM"
        sub="O que cada pessoa faz na loja, anotado pela própria loja e ligado ao e-mail dela. Os e-mails automáticos vêm nas próximas partes."
      />
      <PeriodosDoCrm atual={periodo} />
      <NumerosDoCrm numeros={tela.numeros} />
      <CaminhoDoCrm tipos={tela.tipos} />
      <UltimasDoCrm ultimos={tela.ultimos} />
      <p className="lista-nota">
        Só entra quem disse sim aos cookies da loja; quem recusou não aparece aqui, e quem muda a
        resposta pra não tem o que foi anotado apagado. O e-mail chega quando a pessoa entra na
        conta, deixa o e-mail no checkout ou assina a newsletter — e o que ela fez antes, no mesmo
        navegador, passa a ser dela. Tudo sai sozinho depois de 13 meses.
      </p>
    </div>
  )
}
