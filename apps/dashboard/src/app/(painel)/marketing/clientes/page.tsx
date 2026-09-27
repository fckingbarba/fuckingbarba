import type { Metadata } from "next"
import { Suspense } from "react"
import { SoPara } from "@/components/area"
import { AbasDoMarketing, Periodos, UmDiaEPouco } from "@/components/marketing"
import { TelaDosClientes } from "@/components/marketing-clientes"
import { Cabeca } from "@/components/telas"
import { lerClientesDoMarketing, lerPeriodo } from "@/lib/marketing"

export const metadata: Metadata = { title: "Clientes · Marketing" }

type Busca = Promise<{ periodo?: string }>

/**
 * MARKETING → CLIENTES — quem compra, se volta, em quanto tempo e de onde;
 * e a newsletter (`components/marketing-clientes.tsx`). Tudo da loja, sem o
 * Google.
 */
export default async function Pagina({ searchParams }: { searchParams: Busca }) {
  // A aba sai junto com a pergunta de quem é (a resposta fica no `cache`).
  void lerClientesDoMarketing(lerPeriodo((await searchParams).periodo))
  return (
    <SoPara area="marketing">
      <Clientes searchParams={searchParams} />
    </SoPara>
  )
}

async function Clientes({ searchParams }: { searchParams: Busca }) {
  const periodo = lerPeriodo((await searchParams).periodo)
  return (
    <div data-tela>
      <Cabeca titulo="Marketing" sub="Quem compra, se volta, em quanto tempo e de onde." />
      <AbasDoMarketing atual="clientes" periodo={periodo} />
      <Periodos atual={periodo} caminho="/marketing/clientes" />
      {periodo === "hoje" ? <UmDiaEPouco /> : null}
      <Suspense
        fallback={
          <p className="sem-dados" data-carregando>
            Somando os clientes…
          </p>
        }
      >
        <TelaDosClientes periodo={periodo} />
      </Suspense>
    </div>
  )
}
