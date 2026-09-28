import type { Metadata } from "next"
import { Suspense } from "react"
import { SoPara } from "@/components/area"
import { AbasDoMarketing, PeriodoDoMarketing, UmDiaEPouco } from "@/components/marketing"
import { TelaDosProdutos } from "@/components/marketing-produtos"
import { Cabeca } from "@/components/telas"
import { lerPeriodoNaTela } from "@/lib/ler-periodo"
import { lerProdutosDoMarketing, PADRAO_DO_MARKETING } from "@/lib/marketing"
import { consultaDoPeriodo, type BuscaDoPeriodo } from "@/lib/periodo"

export const metadata: Metadata = { title: "Produtos · Marketing" }

type Busca = Promise<BuscaDoPeriodo>

/**
 * MARKETING → PRODUTOS — o que cada produto atrai, põe na sacola e vende
 * (`components/marketing-produtos.tsx`). O conteúdo espera o Google num
 * `<Suspense>`; a cabeça e as abas aparecem na hora.
 */
export default async function Pagina({ searchParams }: { searchParams: Busca }) {
  const consulta = consultaDoPeriodo(await searchParams, PADRAO_DO_MARKETING)
  // O período e a aba saem junto com a pergunta de quem é (as respostas ficam no `cache`).
  void lerPeriodoNaTela(consulta, PADRAO_DO_MARKETING)
  void lerProdutosDoMarketing(consulta)
  return (
    <SoPara area="marketing">
      <Produtos consulta={consulta} />
    </SoPara>
  )
}

async function Produtos({ consulta }: { consulta: string }) {
  const p = await lerPeriodoNaTela(consulta, PADRAO_DO_MARKETING)
  return (
    <div data-tela>
      <Cabeca titulo="Marketing" ajuda="O que cada produto atrai, põe na sacola e vende." />
      <AbasDoMarketing atual="produtos" p={p} />
      <PeriodoDoMarketing p={p} caminho="/marketing/produtos" />
      {p.passo === "hora" ? <UmDiaEPouco /> : null}
      <Suspense
        fallback={
          <p className="sem-dados" data-carregando>
            Somando os produtos…
          </p>
        }
      >
        <TelaDosProdutos consulta={consulta} />
      </Suspense>
    </div>
  )
}
