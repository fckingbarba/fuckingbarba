import type { Metadata } from "next"
import { Suspense } from "react"
import { SoPara } from "@/components/area"
import { AbasDoMarketing, PeriodoDoMarketing, UmDiaEPouco } from "@/components/marketing"
import { TelaDosCanais } from "@/components/marketing-canais"
import { Cabeca } from "@/components/telas"
import { lerPeriodoNaTela } from "@/lib/ler-periodo"
import { lerCanais, PADRAO_DO_MARKETING } from "@/lib/marketing"
import { consultaDoPeriodo, type BuscaDoPeriodo } from "@/lib/periodo"

export const metadata: Metadata = { title: "Canais · Marketing" }

type Busca = Promise<BuscaDoPeriodo>

/**
 * MARKETING → CANAIS — de onde vêm as visitas e as vendas, as campanhas e o
 * montador de link (`components/marketing-canais.tsx`). O conteúdo espera
 * o Google num `<Suspense>`; a cabeça e as abas aparecem na hora.
 */
export default async function Pagina({ searchParams }: { searchParams: Busca }) {
  const consulta = consultaDoPeriodo(await searchParams, PADRAO_DO_MARKETING)
  // O período e a aba saem junto com a pergunta de quem é (as respostas ficam no `cache`).
  void lerPeriodoNaTela(consulta, PADRAO_DO_MARKETING)
  void lerCanais(consulta)
  return (
    <SoPara area="marketing">
      <Canais consulta={consulta} />
    </SoPara>
  )
}

async function Canais({ consulta }: { consulta: string }) {
  const p = await lerPeriodoNaTela(consulta, PADRAO_DO_MARKETING)
  return (
    <div data-tela>
      <Cabeca titulo="Marketing" ajuda="De onde vêm as visitas e as vendas." />
      <AbasDoMarketing atual="canais" p={p} />
      <PeriodoDoMarketing p={p} caminho="/marketing/canais" />
      {p.passo === "hora" ? <UmDiaEPouco /> : null}
      <Suspense
        fallback={
          <p className="sem-dados" data-carregando>
            Perguntando ao Google…
          </p>
        }
      >
        <TelaDosCanais consulta={consulta} />
      </Suspense>
      <p className="fonte-dados">
        <b>De onde vêm os números:</b> visitas, pedidos e receita por canal — Google Analytics, de
        todo mundo menos quem recusou os cookies (as compras, a loja manda pelo servidor, com a
        sessão de quem comprou); o total da loja — os pedidos pagos.
      </p>
    </div>
  )
}
