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
  OQueOsDadosDizem,
  OQueOsDadosDizemCarregando,
  Periodos,
} from "@/components/marketing"
import { Cabeca, ForaDoAr, SemAcesso } from "@/components/telas"
import {
  lerAchadosDoMarketing,
  lerCanais,
  lerPeriodo,
  lerResumo,
  lerVisitasDoMarketing,
  type Periodo,
} from "@/lib/marketing"

export const metadata: Metadata = { title: "Marketing" }

type Busca = Promise<{ periodo?: string }>

/**
 * MARKETING — de onde vem a venda e como o mês está indo. A aba do Resumo:
 * os cinco números do período contra o de antes, a meta do mês, o que os
 * dados dizem (as frases de todas as abas), a receita no tempo, os canais e
 * os produtos que mais venderam. As outras seis abas têm uma página cada. O
 * período fica no endereço (`?periodo=7d`): o voltar do celular volta pro de
 * antes. Dono e marketing; a meta, só o dono muda.
 *
 * As visitas (do Google) e as frases (as contas de todas as abas) chegam
 * depois do resto, cada uma no seu `<Suspense>`.
 */
export default async function Pagina({ searchParams }: { searchParams: Busca }) {
  const periodo: Periodo = lerPeriodo((await searchParams).periodo)
  // Tudo sai junto com a pergunta de quem é, sem esperar um pelo outro: o
  // Resumo, as visitas, as frases e os canais (as respostas ficam no `cache`).
  void lerResumo(periodo)
  void lerVisitasDoMarketing(periodo)
  void lerAchadosDoMarketing(periodo)
  void lerCanais(periodo)
  return (
    <SoPara area="marketing">
      <Marketing periodo={periodo} />
    </SoPara>
  )
}

async function Marketing({ periodo }: { periodo: Periodo }) {
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
      <Suspense fallback={<OQueOsDadosDizemCarregando periodo={periodo} />}>
        <OQueOsDadosDizem periodo={periodo} />
      </Suspense>
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
