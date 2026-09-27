import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { SoPara } from "@/components/area"
import { EnviarBase } from "@/components/base-da-nuvemshop"
import { AbasDoCrm, NumerosDaBase, QuemEQuemNaBase } from "@/components/crm"
import { Cabeca, ForaDoAr, SemAcesso } from "@/components/telas"
import { CAMINHO_DA_BASE, type TelaDaBase } from "@/lib/crm"
import { ler } from "@/lib/medusa"

export const metadata: Metadata = { title: "Base da Nuvemshop" }

/**
 * A BASE DA NUVEMSHOP — os clientes, os pedidos e os carrinhos da loja
 * antiga, pras etiquetas do CRM valerem pra todo mundo. Os números do que
 * entrou, quem é quem na base inteira, e o lugar de mandar os três arquivos
 * que a Nuvemshop exporta. Vem do Medusa (`GET /dashboard/crm/base`); quem
 * abre o CRM (no padrão, o dono e o marketing). A leitura sai junto com a
 * pergunta de quem é (`ler`).
 */
export default function Pagina() {
  void ler(CAMINHO_DA_BASE)
  return (
    <SoPara area="crm">
      <Base />
    </SoPara>
  )
}

async function Base() {
  const r = await ler(CAMINHO_DA_BASE)
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return <SemAcesso area="crm" />
  if (r.status !== 200) return <ForaDoAr />
  const tela = r.corpo as unknown as TelaDaBase

  return (
    <div data-tela data-base-crm>
      <Cabeca
        titulo="CRM"
        sub="Os clientes, os pedidos e os carrinhos da loja antiga, pras etiquetas valerem pra todo mundo."
      />
      <AbasDoCrm atual="base" />
      {tela.vazia ? null : (
        <>
          <NumerosDaBase numeros={tela.numeros} />
          <QuemEQuemNaBase
            etapas={tela.etapas}
            engajamento={tela.engajamento}
            importadoEm={tela.numeros.importadoEm}
          />
        </>
      )}
      <EnviarBase vazia={tela.vazia} />
    </div>
  )
}
