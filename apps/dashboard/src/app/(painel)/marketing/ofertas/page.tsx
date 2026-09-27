import type { Metadata } from "next"
import { Suspense } from "react"
import { SoPara } from "@/components/area"
import { AbasDoMarketing, Periodos, UmDiaEPouco } from "@/components/marketing"
import { TelaDasOfertas } from "@/components/marketing-ofertas"
import { Cabeca } from "@/components/telas"
import { lerOfertas, lerPeriodo } from "@/lib/marketing"

export const metadata: Metadata = { title: "Ofertas · Marketing" }

type Busca = Promise<{ periodo?: string }>

/**
 * MARKETING → OFERTAS — o que a caixa de compra de cada produto, a oferta do
 * checkout e os cupons somam (`components/marketing-ofertas.tsx`). Tudo da
 * loja, sem o Google.
 */
export default async function Pagina({ searchParams }: { searchParams: Busca }) {
  // A aba sai junto com a pergunta de quem é (a resposta fica no `cache`).
  void lerOfertas(lerPeriodo((await searchParams).periodo))
  return (
    <SoPara area="marketing">
      <Ofertas searchParams={searchParams} />
    </SoPara>
  )
}

async function Ofertas({ searchParams }: { searchParams: Busca }) {
  const periodo = lerPeriodo((await searchParams).periodo)
  return (
    <div data-tela>
      <Cabeca
        titulo="Marketing"
        ajuda={
          "O que as ofertas e os cupons somam.\n" +
          "A oferta do checkout é a caixinha logo antes de pagar: quem escolhe o produto é o motor de recomendação, sacola a sacola, e ela não se configura na página do produto. O leve junto conta o pedido que levou o produto e um dos de junto — pelo caminho que for."
        }
      />
      <AbasDoMarketing atual="ofertas" periodo={periodo} />
      <Periodos atual={periodo} caminho="/marketing/ofertas" />
      {periodo === "hoje" ? <UmDiaEPouco /> : null}
      <Suspense
        fallback={
          <p className="sem-dados" data-carregando>
            Somando as ofertas…
          </p>
        }
      >
        <TelaDasOfertas periodo={periodo} />
      </Suspense>
    </div>
  )
}
