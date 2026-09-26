import type { Metadata } from "next"
import { Suspense } from "react"
import { SoPara } from "@/components/area"
import { AbasDoMarketing, Periodos, UmDiaEPouco } from "@/components/marketing"
import { TelaDosProdutos } from "@/components/marketing-produtos"
import { Cabeca } from "@/components/telas"
import { lerPeriodo } from "@/lib/marketing"

export const metadata: Metadata = { title: "Produtos · Marketing" }

type Busca = Promise<{ periodo?: string }>

/**
 * MARKETING → PRODUTOS — o que cada produto atrai, põe na sacola e vende
 * (`components/marketing-produtos.tsx`). O conteúdo espera o Google num
 * `<Suspense>`; a cabeça e as abas aparecem na hora.
 */
export default function Pagina({ searchParams }: { searchParams: Busca }) {
  return (
    <SoPara area="marketing">
      <Produtos searchParams={searchParams} />
    </SoPara>
  )
}

async function Produtos({ searchParams }: { searchParams: Busca }) {
  const periodo = lerPeriodo((await searchParams).periodo)
  return (
    <div data-tela>
      <Cabeca titulo="Marketing" sub="O que cada produto atrai, põe na sacola e vende." />
      <AbasDoMarketing atual="produtos" periodo={periodo} />
      <Periodos atual={periodo} caminho="/marketing/produtos" />
      {periodo === "hoje" ? <UmDiaEPouco /> : null}
      <Suspense
        fallback={
          <p className="sem-dados" data-carregando>
            Somando os produtos…
          </p>
        }
      >
        <TelaDosProdutos periodo={periodo} />
      </Suspense>
    </div>
  )
}
