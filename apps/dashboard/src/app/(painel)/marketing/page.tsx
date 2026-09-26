import type { Metadata } from "next"
import { Suspense } from "react"
import { SoPara } from "@/components/area"
import {
  AbasDoMarketing,
  CanaisQueMaisVenderam,
  FonteDosDados,
  Glossario,
  Grafico,
  MaisVendidos,
  Meta,
  Numeros,
  Periodos,
} from "@/components/marketing"
import { Cabeca, ForaDoAr, SemAcesso } from "@/components/telas"
import { lerPeriodo, lerResumo, lerVisitasDoMarketing, type Periodo } from "@/lib/marketing"

export const metadata: Metadata = { title: "Marketing" }

type Busca = Promise<{ periodo?: string }>

/**
 * MARKETING — de onde vem a venda e como o mês está indo. A aba do Resumo
 * (a parte 1 da área do protótipo): os cinco números do período contra o de
 * antes, a meta do mês, a receita no tempo, os canais e os produtos que mais
 * venderam. As outras abas: Funil e Canais (a parte 2). O período fica no endereço (`?periodo=7d`): o voltar do
 * celular volta pro de antes. Dono e marketing; a meta, só o dono muda.
 *
 * As visitas vêm do Google, à parte, e chegam depois do resto
 * (`lerVisitasDoMarketing`, num `<Suspense>` dentro dos números).
 */
export default function Pagina({ searchParams }: { searchParams: Busca }) {
  return (
    <SoPara area="marketing">
      <Marketing searchParams={searchParams} />
    </SoPara>
  )
}

async function Marketing({ searchParams }: { searchParams: Busca }) {
  const periodo: Periodo = lerPeriodo((await searchParams).periodo)
  // As visitas saem junto com o Resumo, sem esperar por ele (a resposta fica no `cache`).
  void lerVisitasDoMarketing(periodo)
  const leitura = await lerResumo(periodo)
  if (leitura.estado !== "ok")
    return leitura.estado === "sem-acesso" ? <SemAcesso area="marketing" /> : <ForaDoAr />
  const { resumo } = leitura

  return (
    <div data-tela>
      <Cabeca titulo="Marketing" sub="De onde vem a venda e como o mês está indo." />
      <AbasDoMarketing atual="resumo" periodo={periodo} />
      <Periodos atual={periodo} />
      <Numeros resumo={resumo} />
      <Glossario />
      <Meta meta={resumo.meta} muda={resumo.mudaAMeta} />
      <Grafico serie={resumo.serie} />
      <div className="duas">
        <Suspense fallback={<section className="bloco" data-canais-do-resumo="carregando" />}>
          <CanaisQueMaisVenderam periodo={periodo} />
        </Suspense>
        <MaisVendidos produtos={resumo.maisVendidos} />
      </div>
      <FonteDosDados />
    </div>
  )
}
