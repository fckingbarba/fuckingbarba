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
  PeriodoDoMarketing,
} from "@/components/marketing"
import { Cabeca, ForaDoAr, SemAcesso } from "@/components/telas"
import { lerPeriodoNaTela } from "@/lib/ler-periodo"
import {
  lerAchadosDoMarketing,
  lerCanais,
  lerResumo,
  lerVisitasDoMarketing,
  PADRAO_DO_MARKETING,
} from "@/lib/marketing"
import { consultaDoPeriodo, type BuscaDoPeriodo } from "@/lib/periodo"

export const metadata: Metadata = { title: "Marketing" }

type Busca = Promise<BuscaDoPeriodo>

/**
 * MARKETING — de onde vem a venda e como o mês está indo. A aba do Resumo:
 * os cinco números do período contra o de antes, a meta do mês, o que os
 * dados dizem (as frases de todas as abas), a receita no tempo, os canais e
 * os produtos que mais venderam. As outras seis abas têm uma página cada. O
 * período é o da barra de cima, a do Início (0191), e fica no endereço
 * (`?periodo=7d`, `?de=…&ate=…`): o voltar do celular volta pro de antes, e
 * as abas levam o período junto. Sem nada, os últimos 30 dias. Dono e
 * marketing; a meta, só o dono muda.
 *
 * As visitas (do Google) e as frases (as contas de todas as abas) chegam
 * depois do resto, cada uma no seu `<Suspense>`.
 */
export default async function Pagina({ searchParams }: { searchParams: Busca }) {
  const consulta = consultaDoPeriodo(await searchParams, PADRAO_DO_MARKETING)
  // Tudo sai junto com a pergunta de quem é, sem esperar um pelo outro: o
  // período, o Resumo, as visitas, as frases e os canais (as respostas ficam
  // no `cache`).
  void lerPeriodoNaTela(consulta, PADRAO_DO_MARKETING)
  void lerResumo(consulta)
  void lerVisitasDoMarketing(consulta)
  void lerAchadosDoMarketing(consulta)
  void lerCanais(consulta)
  return (
    <SoPara area="marketing">
      <Marketing consulta={consulta} />
    </SoPara>
  )
}

async function Marketing({ consulta }: { consulta: string }) {
  const [leitura, p] = await Promise.all([
    lerResumo(consulta),
    lerPeriodoNaTela(consulta, PADRAO_DO_MARKETING),
  ])
  if (leitura.estado !== "ok")
    return leitura.estado === "sem-acesso" ? <SemAcesso area="marketing" /> : <ForaDoAr />
  const { resumo } = leitura

  return (
    <div data-tela>
      <Cabeca
        titulo="Marketing"
        ajuda={
          <>
            De onde vem a venda e como o mês está indo.
            {"\n"}
            <Glossario />
            {"\n"}
            <FonteDosDados />
          </>
        }
      />
      <AbasDoMarketing atual="resumo" p={p} />
      <PeriodoDoMarketing p={p} caminho="/marketing" />
      <Numeros resumo={resumo} consulta={consulta} p={p} />
      <Meta meta={resumo.meta} muda={resumo.mudaAMeta} />
      <Suspense fallback={<OQueOsDadosDizemCarregando p={p} />}>
        <OQueOsDadosDizem consulta={consulta} p={p} />
      </Suspense>
      <Grafico serie={resumo.serie} />
      <div className="duas">
        <Suspense fallback={<section className="bloco" data-canais-do-resumo="carregando" />}>
          <CanaisQueMaisVenderam consulta={consulta} p={p} />
        </Suspense>
        <MaisVendidos produtos={resumo.maisVendidos} />
      </div>
    </div>
  )
}
