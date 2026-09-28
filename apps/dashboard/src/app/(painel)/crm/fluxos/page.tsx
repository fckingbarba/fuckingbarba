import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { SoPara } from "@/components/area"
import { AbasDoCrm } from "@/components/crm"
import { DescontoDosFluxos, FluxosDoCrm } from "@/components/fluxos-do-crm"
import { Cabeca, ForaDoAr, SemAcesso } from "@/components/telas"
import { CAMINHO_DOS_FLUXOS, type TelaDosFluxos } from "@/lib/crm"
import { ler } from "@/lib/medusa"

export const metadata: Metadata = { title: "Fluxos do CRM" }

/**
 * OS FLUXOS DO CRM — os e-mails que saem sozinhos pra quem começou uma
 * compra e não terminou: o Pix pendente e o checkout abandonado. Cada um com
 * a chave de ligar, o que vendeu nos últimos 30 dias (contra os 5% que não
 * recebem) e os toques, com o "Mandar pra mim" de cada. Embaixo, o desconto
 * do cupom. Vem do Medusa (`GET /dashboard/crm/fluxos`); quem abre o CRM.
 */
export default function Pagina() {
  void ler(CAMINHO_DOS_FLUXOS)
  return (
    <SoPara area="crm">
      <Fluxos />
    </SoPara>
  )
}

async function Fluxos() {
  const r = await ler(CAMINHO_DOS_FLUXOS)
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return <SemAcesso area="crm" />
  if (r.status !== 200) return <ForaDoAr />
  const tela = r.corpo as unknown as TelaDosFluxos

  return (
    <div data-tela data-fluxos-crm>
      <Cabeca
        titulo="CRM"
        sub="Os e-mails que saem sozinhos pra quem começou uma compra e não terminou."
      />
      <AbasDoCrm atual="fluxos" />
      <FluxosDoCrm tela={tela} />
      <DescontoDosFluxos desconto={tela.desconto} limites={tela.limites} />
      <section className="bloco" aria-labelledby="fluxos-regras" data-regras-dos-fluxos>
        <h2 className="bloco__titulo" id="fluxos-regras">
          As regras
        </h2>
        <ul className="modelo-emails__regras">
          <li>Só vale quem começou a compra depois de o fluxo ser ligado.</li>
          <li>Comprou, parou: nenhum e-mail do fluxo sai depois do pedido pago.</li>
          <li>Um fluxo por vez: o Pix vem antes do checkout, e o checkout antes do carrinho.</li>
          <li>
            O carrinho vai pra quem a loja já conhece: aceitou os cookies e já entrou na conta,
            assinou a newsletter ou comprou antes.
          </li>
          <li>No máximo 3 e-mails em um dia e 6 numa semana, por pessoa.</li>
          <li>De madrugada (22h às 8h), só o aviso do Pix e o de 30 minutos do checkout.</li>
          <li>5% não recebem nada: é o grupo de controle, pra saber o que o fluxo vende a mais.</li>
          <li>Quem saiu da lista, ou marcou como spam, não recebe mais.</li>
          <li>
            O cupom da 1ª compra sai na hora do cadastro, até de madrugada, e sem grupo de controle:
            foi a pessoa que pediu.
          </li>
        </ul>
      </section>
    </div>
  )
}
