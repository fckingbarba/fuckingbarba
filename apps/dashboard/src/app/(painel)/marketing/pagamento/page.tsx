import type { Metadata } from "next"
import { Suspense } from "react"
import { SoPara } from "@/components/area"
import { AbasDoMarketing, Periodos, UmDiaEPouco } from "@/components/marketing"
import { TelaDoPagamento } from "@/components/marketing-pagamento"
import { Cabeca } from "@/components/telas"
import { lerPeriodo } from "@/lib/marketing"

export const metadata: Metadata = { title: "Pagamento e frete · Marketing" }

type Busca = Promise<{ periodo?: string }>

/**
 * MARKETING → PAGAMENTO E FRETE — como as pessoas pagam, o que não passa e
 * o que o frete faz com a venda (`components/marketing-pagamento.tsx`).
 * Tudo da loja, sem o Google.
 */
export default function Pagina({ searchParams }: { searchParams: Busca }) {
  return (
    <SoPara area="marketing">
      <Pagamento searchParams={searchParams} />
    </SoPara>
  )
}

async function Pagamento({ searchParams }: { searchParams: Busca }) {
  const periodo = lerPeriodo((await searchParams).periodo)
  return (
    <div data-tela>
      <Cabeca
        titulo="Marketing"
        sub="Como as pessoas pagam, o que não passa e o que o frete faz com a venda."
      />
      <AbasDoMarketing atual="pagamento" periodo={periodo} />
      <Periodos atual={periodo} caminho="/marketing/pagamento" />
      {periodo === "hoje" ? <UmDiaEPouco /> : null}
      <Suspense
        fallback={
          <p className="sem-dados" data-carregando>
            Somando os pagamentos…
          </p>
        }
      >
        <TelaDoPagamento periodo={periodo} />
      </Suspense>
    </div>
  )
}
