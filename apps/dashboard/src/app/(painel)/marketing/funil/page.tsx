import type { Metadata } from "next"
import { Suspense } from "react"
import { SoPara } from "@/components/area"
import { AbasDoMarketing, PeriodoDoMarketing, UmDiaEPouco } from "@/components/marketing"
import { TelaDoFunil } from "@/components/marketing-funil"
import { Cabeca } from "@/components/telas"
import { lerPeriodoNaTela } from "@/lib/ler-periodo"
import { lerFunil, PADRAO_DO_MARKETING } from "@/lib/marketing"
import { consultaDoPeriodo, type BuscaDoPeriodo } from "@/lib/periodo"

export const metadata: Metadata = { title: "Funil · Marketing" }

type Busca = Promise<BuscaDoPeriodo>

/**
 * MARKETING → FUNIL — onde as pessoas desistem: do site até o pagamento, da
 * sacola ao pagamento e o celular contra o computador
 * (`components/marketing-funil.tsx`). O conteúdo espera o Google num
 * `<Suspense>`; a cabeça e as abas aparecem na hora.
 */
export default async function Pagina({ searchParams }: { searchParams: Busca }) {
  const consulta = consultaDoPeriodo(await searchParams, PADRAO_DO_MARKETING)
  // O período e a aba saem junto com a pergunta de quem é (as respostas ficam no `cache`).
  void lerPeriodoNaTela(consulta, PADRAO_DO_MARKETING)
  void lerFunil(consulta)
  return (
    <SoPara area="marketing">
      <Funil consulta={consulta} />
    </SoPara>
  )
}

async function Funil({ consulta }: { consulta: string }) {
  const p = await lerPeriodoNaTela(consulta, PADRAO_DO_MARKETING)
  return (
    <div data-tela>
      <Cabeca titulo="Marketing" ajuda="Onde as pessoas desistem, do site até o pagamento." />
      <AbasDoMarketing atual="funil" p={p} />
      <PeriodoDoMarketing p={p} caminho="/marketing/funil" />
      {p.passo === "hora" ? <UmDiaEPouco /> : null}
      <Suspense
        fallback={
          <p className="sem-dados" data-carregando>
            Montando o funil…
          </p>
        }
      >
        <TelaDoFunil consulta={consulta} />
      </Suspense>
      <p className="fonte-dados">
        <b>De onde vêm os números:</b> do site até o pagamento e os aparelhos — Google Analytics, de
        todo mundo menos quem recusou os cookies (as compras, a loja manda pelo servidor); da sacola
        ao pagamento — os carrinhos da loja, de todo mundo.
      </p>
    </div>
  )
}
