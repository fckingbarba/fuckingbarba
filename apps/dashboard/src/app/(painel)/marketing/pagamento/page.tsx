import type { Metadata } from "next"
import { Suspense } from "react"
import { SoPara } from "@/components/area"
import { AbasDoMarketing, PeriodoDoMarketing, UmDiaEPouco } from "@/components/marketing"
import { TelaDoPagamento } from "@/components/marketing-pagamento"
import { Cabeca } from "@/components/telas"
import { lerPeriodoNaTela } from "@/lib/ler-periodo"
import { lerPagamento, PADRAO_DO_MARKETING } from "@/lib/marketing"
import { consultaDoPeriodo, type BuscaDoPeriodo } from "@/lib/periodo"

export const metadata: Metadata = { title: "Pagamento e frete · Marketing" }

type Busca = Promise<BuscaDoPeriodo>

/**
 * MARKETING → PAGAMENTO E FRETE — como as pessoas pagam, o que não passa e
 * o que o frete faz com a venda (`components/marketing-pagamento.tsx`).
 * Tudo da loja, sem o Google.
 */
export default async function Pagina({ searchParams }: { searchParams: Busca }) {
  const consulta = consultaDoPeriodo(await searchParams, PADRAO_DO_MARKETING)
  // O período e a aba saem junto com a pergunta de quem é (as respostas ficam no `cache`).
  void lerPeriodoNaTela(consulta, PADRAO_DO_MARKETING)
  void lerPagamento(consulta)
  return (
    <SoPara area="marketing">
      <Pagamento consulta={consulta} />
    </SoPara>
  )
}

async function Pagamento({ consulta }: { consulta: string }) {
  const p = await lerPeriodoNaTela(consulta, PADRAO_DO_MARKETING)
  return (
    <div data-tela>
      <Cabeca
        titulo="Marketing"
        ajuda="Como as pessoas pagam, o que não passa e o que o frete faz com a venda."
      />
      <AbasDoMarketing atual="pagamento" p={p} />
      <PeriodoDoMarketing p={p} caminho="/marketing/pagamento" />
      {p.passo === "hora" ? <UmDiaEPouco /> : null}
      <Suspense
        fallback={
          <p className="sem-dados" data-carregando>
            Somando os pagamentos…
          </p>
        }
      >
        <TelaDoPagamento consulta={consulta} />
      </Suspense>
    </div>
  )
}
