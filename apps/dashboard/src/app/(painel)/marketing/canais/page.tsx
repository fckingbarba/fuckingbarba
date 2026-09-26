import type { Metadata } from "next"
import { Suspense } from "react"
import { SoPara } from "@/components/area"
import { AbasDoMarketing, Periodos, UmDiaEPouco } from "@/components/marketing"
import { TelaDosCanais } from "@/components/marketing-canais"
import { Cabeca } from "@/components/telas"
import { lerPeriodo } from "@/lib/marketing"

export const metadata: Metadata = { title: "Canais · Marketing" }

type Busca = Promise<{ periodo?: string }>

/**
 * MARKETING → CANAIS — de onde vêm as visitas e as vendas, as campanhas e o
 * montador de link (`components/marketing-canais.tsx`). O conteúdo espera
 * o Google num `<Suspense>`; a cabeça e as abas aparecem na hora.
 */
export default function Pagina({ searchParams }: { searchParams: Busca }) {
  return (
    <SoPara area="marketing">
      <Canais searchParams={searchParams} />
    </SoPara>
  )
}

async function Canais({ searchParams }: { searchParams: Busca }) {
  const periodo = lerPeriodo((await searchParams).periodo)
  return (
    <div data-tela>
      <Cabeca titulo="Marketing" sub="De onde vêm as visitas e as vendas." />
      <AbasDoMarketing atual="canais" periodo={periodo} />
      <Periodos atual={periodo} caminho="/marketing/canais" />
      {periodo === "hoje" ? <UmDiaEPouco /> : null}
      <Suspense
        fallback={
          <p className="sem-dados" data-carregando>
            Perguntando ao Google…
          </p>
        }
      >
        <TelaDosCanais periodo={periodo} />
      </Suspense>
      <p className="fonte-dados">
        <b>De onde vêm os números:</b> visitas, pedidos e receita por canal — Google Analytics, só
        de quem aceitou os cookies (as compras, a loja manda pelo servidor, com a sessão de quem
        comprou); o total da loja — os pedidos pagos.
      </p>
    </div>
  )
}
