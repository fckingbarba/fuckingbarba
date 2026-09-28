import type { Metadata } from "next"
import { Suspense } from "react"
import { SoPara } from "@/components/area"
import { AbasDoMarketing, PeriodoDoMarketing, UmDiaEPouco } from "@/components/marketing"
import { TelaDasOfertas } from "@/components/marketing-ofertas"
import { Cabeca } from "@/components/telas"
import { lerPeriodoNaTela } from "@/lib/ler-periodo"
import { lerOfertas, PADRAO_DO_MARKETING } from "@/lib/marketing"
import { consultaDoPeriodo, type BuscaDoPeriodo } from "@/lib/periodo"

export const metadata: Metadata = { title: "Ofertas · Marketing" }

type Busca = Promise<BuscaDoPeriodo>

/**
 * MARKETING → OFERTAS — o que a caixa de compra de cada produto, a oferta do
 * checkout e os cupons somam (`components/marketing-ofertas.tsx`). Tudo da
 * loja, sem o Google.
 */
export default async function Pagina({ searchParams }: { searchParams: Busca }) {
  const consulta = consultaDoPeriodo(await searchParams, PADRAO_DO_MARKETING)
  // O período e a aba saem junto com a pergunta de quem é (as respostas ficam no `cache`).
  void lerPeriodoNaTela(consulta, PADRAO_DO_MARKETING)
  void lerOfertas(consulta)
  return (
    <SoPara area="marketing">
      <Ofertas consulta={consulta} />
    </SoPara>
  )
}

async function Ofertas({ consulta }: { consulta: string }) {
  const p = await lerPeriodoNaTela(consulta, PADRAO_DO_MARKETING)
  return (
    <div data-tela>
      <Cabeca
        titulo="Marketing"
        ajuda={
          "O que as ofertas e os cupons somam.\n" +
          "A oferta do checkout é a caixinha logo antes de pagar: quem escolhe o produto é o motor de recomendação, sacola a sacola, e ela não se configura na página do produto. O leve junto conta o pedido que levou o produto e um dos de junto — pelo caminho que for."
        }
      />
      <AbasDoMarketing atual="ofertas" p={p} />
      <PeriodoDoMarketing p={p} caminho="/marketing/ofertas" />
      {p.passo === "hora" ? <UmDiaEPouco /> : null}
      <Suspense
        fallback={
          <p className="sem-dados" data-carregando>
            Somando as ofertas…
          </p>
        }
      >
        <TelaDasOfertas consulta={consulta} />
      </Suspense>
    </div>
  )
}
