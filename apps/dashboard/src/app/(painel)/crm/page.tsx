import type { Metadata } from "next"
import { SoPara } from "@/components/area"
import {
  AbasDoCrm,
  CaminhoDoCrm,
  EmailsDoCrm,
  NumerosDoCrm,
  PeriodosDoCrm,
  UltimasDoCrm,
} from "@/components/crm"
import { Cabeca, ForaDoAr, SemAcesso } from "@/components/telas"
import { caminhoDoCrm, lerPeriodoDoCrm, lerTelaDoCrm, type PeriodoDoCrm } from "@/lib/crm"
import { ler } from "@/lib/medusa"

export const metadata: Metadata = { title: "CRM" }

type Busca = Promise<{ periodo?: string }>

/**
 * CRM — o começo: o que cada pessoa faz na loja, anotado pela própria loja
 * e ligado ao e-mail dela (a Fundação do "Ciclo da Barba"), e o que os
 * avisos do Resend contam dos e-mails da loja (parte 2). A ficha de cada
 * pessoa mora em Clientes (parte 3); os Ajustes, na aba do lado (parte 4).
 * Os e-mails automáticos vêm nas próximas partes. O período fica no
 * endereço (`?periodo=hoje`). Dono e marketing. A leitura sai junto com a
 * pergunta de quem é (`ler`).
 */
export default async function Pagina({ searchParams }: { searchParams: Busca }) {
  const periodo = lerPeriodoDoCrm((await searchParams).periodo)
  void ler(caminhoDoCrm(periodo))
  return (
    <SoPara area="crm">
      <Crm periodo={periodo} />
    </SoPara>
  )
}

async function Crm({ periodo }: { periodo: PeriodoDoCrm }) {
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
      <AbasDoCrm atual="resumo" />
      <PeriodosDoCrm atual={periodo} />
      <NumerosDoCrm numeros={tela.numeros} />
      <CaminhoDoCrm tipos={tela.tipos} />
      <EmailsDoCrm emails={tela.emails} />
      <UltimasDoCrm ultimos={tela.ultimos} />
      <p className="lista-nota">
        Só entra quem disse sim aos cookies da loja; quem recusou não aparece aqui, e quem muda a
        resposta pra não tem o que foi anotado apagado. O e-mail chega quando a pessoa entra na
        conta, deixa o e-mail no checkout ou assina a newsletter — e o que ela fez antes, no mesmo
        navegador, passa a ser dela. Tudo sai sozinho depois de 13 meses. Nos e-mails, só os de
        cliente contam (os da equipe ficam de fora), e &ldquo;abertos&rdquo; é aproximado: o Mail do
        iPhone abre sozinho pra proteger quem recebe, e quem bloqueia imagens não conta.
      </p>
    </div>
  )
}
