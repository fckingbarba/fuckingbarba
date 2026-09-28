import type { Metadata } from "next"
import { Suspense } from "react"
import { SoPara } from "@/components/area"
import { AbasDoMarketing, PeriodoDoMarketing, UmDiaEPouco } from "@/components/marketing"
import { TelaDosClientes } from "@/components/marketing-clientes"
import { Cabeca } from "@/components/telas"
import { lerPeriodoNaTela } from "@/lib/ler-periodo"
import { lerClientesDoMarketing, PADRAO_DO_MARKETING } from "@/lib/marketing"
import { consultaDoPeriodo, type BuscaDoPeriodo } from "@/lib/periodo"

export const metadata: Metadata = { title: "Clientes · Marketing" }

type Busca = Promise<BuscaDoPeriodo>

/**
 * MARKETING → CLIENTES — quem compra, se volta, em quanto tempo e de onde;
 * e a newsletter (`components/marketing-clientes.tsx`). Tudo da loja, sem o
 * Google.
 */
export default async function Pagina({ searchParams }: { searchParams: Busca }) {
  const consulta = consultaDoPeriodo(await searchParams, PADRAO_DO_MARKETING)
  // O período e a aba saem junto com a pergunta de quem é (as respostas ficam no `cache`).
  void lerPeriodoNaTela(consulta, PADRAO_DO_MARKETING)
  void lerClientesDoMarketing(consulta)
  return (
    <SoPara area="marketing">
      <Clientes consulta={consulta} />
    </SoPara>
  )
}

async function Clientes({ consulta }: { consulta: string }) {
  const p = await lerPeriodoNaTela(consulta, PADRAO_DO_MARKETING)
  return (
    <div data-tela>
      <Cabeca
        titulo="Marketing"
        ajuda={
          "Quem compra, se volta, em quanto tempo e de onde.\n" +
          "A pessoa é o e-mail do pedido. A primeira compra é a primeira na loja nova: quem já comprava na Nuvemshop conta como novo aqui. A 2ª compra é a média de toda a história da loja nova."
        }
      />
      <AbasDoMarketing atual="clientes" p={p} />
      <PeriodoDoMarketing p={p} caminho="/marketing/clientes" />
      {p.passo === "hora" ? <UmDiaEPouco /> : null}
      <Suspense
        fallback={
          <p className="sem-dados" data-carregando>
            Somando os clientes…
          </p>
        }
      >
        <TelaDosClientes consulta={consulta} />
      </Suspense>
    </div>
  )
}
