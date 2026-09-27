import type { Metadata } from "next"
import { Suspense } from "react"
import { SoPara } from "@/components/area"
import { AbasDoMarketing, Periodos, UmDiaEPouco } from "@/components/marketing"
import { TelaDoFunil } from "@/components/marketing-funil"
import { Cabeca } from "@/components/telas"
import { lerFunil, lerPeriodo } from "@/lib/marketing"

export const metadata: Metadata = { title: "Funil · Marketing" }

type Busca = Promise<{ periodo?: string }>

/**
 * MARKETING → FUNIL — onde as pessoas desistem: do site até o pagamento, da
 * sacola ao pagamento e o celular contra o computador
 * (`components/marketing-funil.tsx`). O conteúdo espera o Google num
 * `<Suspense>`; a cabeça e as abas aparecem na hora.
 */
export default async function Pagina({ searchParams }: { searchParams: Busca }) {
  // A aba sai junto com a pergunta de quem é (a resposta fica no `cache`).
  void lerFunil(lerPeriodo((await searchParams).periodo))
  return (
    <SoPara area="marketing">
      <Funil searchParams={searchParams} />
    </SoPara>
  )
}

async function Funil({ searchParams }: { searchParams: Busca }) {
  const periodo = lerPeriodo((await searchParams).periodo)
  return (
    <div data-tela>
      <Cabeca titulo="Marketing" ajuda="Onde as pessoas desistem, do site até o pagamento." />
      <AbasDoMarketing atual="funil" periodo={periodo} />
      <Periodos atual={periodo} caminho="/marketing/funil" />
      {periodo === "hoje" ? <UmDiaEPouco /> : null}
      <Suspense
        fallback={
          <p className="sem-dados" data-carregando>
            Montando o funil…
          </p>
        }
      >
        <TelaDoFunil periodo={periodo} />
      </Suspense>
      <p className="fonte-dados">
        <b>De onde vêm os números:</b> do site até o pagamento e os aparelhos — Google Analytics, de
        todo mundo menos quem recusou os cookies (as compras, a loja manda pelo servidor); da sacola
        ao pagamento — os carrinhos da loja, de todo mundo.
      </p>
    </div>
  )
}
