import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { Fila, Grafico, MaisVendidos, Numeros, PedidosDeHoje } from "@/components/inicio"
import {
  BlocoEsperandoOGoogle,
  CartaoDasVisitas,
  DeOndeVieram,
  MaisVendidosNoPeriodo,
  NoCheckout,
  NumeroDasVisitasNoPeriodo,
  NumerosDoPeriodo,
  OQueAsVisitasFizeram,
  PedidosDoPeriodo,
  TaxaDasTaxasCarregando,
  TaxaDoCheckout,
  TaxasDoGoogle,
} from "@/components/inicio-periodo"
import { BarraDoPeriodo, LegendaDoPeriodo } from "@/components/periodo"
import { Cabeca, ForaDoAr } from "@/components/telas"
import { BlocoDasVisitas, NumeroDasVisitas, NumeroDeVisitas } from "@/components/visitas"
import { lerMembro } from "@/lib/eu"
import { ler } from "@/lib/medusa"
import type { Inicio } from "@/lib/pedidos"
import { consultaDoPeriodo, type BuscaDoPeriodo, type InicioNoPeriodo } from "@/lib/periodo"
import { lerVisitas, lerVisitasNoPeriodo } from "@/lib/visitas"

export const metadata: Metadata = { title: "Início" }

type Busca = Promise<BuscaDoPeriodo>

/**
 * O INÍCIO — o que precisa de você agora, e a loja no período da barra de
 * cima (entrega 0186, o desenho aprovado pelo dono): as visitas, as vendas,
 * a receita e o ticket contra o período de antes, o que as visitas fizeram,
 * o checkout passo a passo, as taxas, os mais vendidos, de onde vieram e os
 * pedidos do período. Do jeito de cada papel: o dono e a operação veem a
 * fila e os pedidos; o marketing, os números sem nome de cliente; o que é do
 * Marketing (o que as visitas fizeram, o checkout, as taxas, a origem), só
 * quem abre o Marketing — quem corta é o backend
 * (`apps/backend/src/lib/painel/inicio.ts` e `inicio-periodo.ts`).
 *
 * O PERÍODO MORA NO ENDEREÇO (`/?periodo=ontem`, `/?de=…&ate=…`); sem nada,
 * hoje contra ontem até a mesma hora. AS VISITAS vêm do Google Analytics,
 * numa pergunta à parte (`GET /dashboard/visitas?…`), e chegam depois do
 * resto: cada pedaço delas está num `<Suspense>`, e o Início não espera o
 * Google.
 *
 * O backend de antes da 0186 não conhece o período (a resposta vem sem
 * `periodo`): aí o Início é o de antes, até o backend novo subir.
 */

const FUSO = "America/Sao_Paulo"
const HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "numeric", hourCycle: "h23" })
const DIA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
})

/** "Bom dia" até meio-dia, "Boa tarde" até as 18h, "Boa noite" depois — na hora da loja. */
function saudacao(agora: Date): string {
  const h = Number(HORA.format(agora))
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"
}

/** "Bom dia, Matheus" · "Quinta-feira, 24/09", na hora da loja. */
function cabecalho(nome: string, agora = new Date()) {
  const hoje = DIA.format(agora)
  return {
    titulo: `${saudacao(agora)}, ${nome.split(" ")[0]}`,
    sub: `${hoje[0].toUpperCase()}${hoje.slice(1)}`,
  }
}

export default async function PaginaInicio({ searchParams }: { searchParams: Busca }) {
  const consulta = consultaDoPeriodo(await searchParams)
  // O Início e as visitas saem junto com a pergunta de quem é, sem esperar
  // um pelo outro (as respostas ficam no `cache`).
  void ler(`/dashboard/inicio?${consulta}`)
  void lerVisitasNoPeriodo(consulta)
  const leitura = await lerMembro()
  if (leitura.estado !== "ok") return null
  const { membro } = leitura

  const r = await ler(`/dashboard/inicio?${consulta}`)
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status !== 200) return <ForaDoAr />
  const inicio = r.corpo as unknown as Inicio

  const { titulo, sub } = cabecalho(membro.nome)
  if (!inicio.periodo) return <InicioDeAntes inicio={inicio} titulo={titulo} sub={sub} />
  const n: InicioNoPeriodo = inicio.periodo

  return (
    <div data-tela data-inicio="periodo">
      <Cabeca titulo={titulo} sub={sub} />
      <Fila fila={inicio.fila} faixa />
      <BarraDoPeriodo p={n.periodo} />
      <LegendaDoPeriodo p={n.periodo} />
      <NumerosDoPeriodo
        n={n}
        visitas={
          <Suspense fallback={<CartaoDasVisitas r={{ estado: "carregando" }} n={n} />}>
            <NumeroDasVisitasNoPeriodo consulta={consulta} n={n} />
          </Suspense>
        }
      />
      {/* O checkout só vem pra quem abre o Marketing: é ele que diz se o meio aparece. */}
      {n.checkout ? (
        <div className="grade-periodo">
          <div>
            <Suspense
              fallback={
                <BlocoEsperandoOGoogle titulo="O que as visitas fizeram" dado="visitas-fizeram" />
              }
            >
              <OQueAsVisitasFizeram consulta={consulta} />
            </Suspense>
            <NoCheckout passos={n.checkout} />
          </div>
          <div className="taxas">
            <Suspense fallback={<TaxaDasTaxasCarregando />}>
              <TaxasDoGoogle consulta={consulta} p={n.periodo} />
            </Suspense>
            <TaxaDoCheckout passos={n.checkout} antes={n.checkoutAntes} p={n.periodo} />
          </div>
        </div>
      ) : null}
      <div
        className="grade-periodo grade-periodo--pe"
        data-colunas={1 + (n.checkout ? 1 : 0) + (n.pedidos ? 1 : 0)}
      >
        <MaisVendidosNoPeriodo n={n} />
        {n.checkout ? (
          <Suspense fallback={<BlocoEsperandoOGoogle titulo="De onde vieram" dado="origens" />}>
            <DeOndeVieram consulta={consulta} />
          </Suspense>
        ) : null}
        <PedidosDoPeriodo n={n} />
      </div>
    </div>
  )
}

/** O Início de antes da 0186: o backend ainda não conhece o período (só no meio do deploy). */
function InicioDeAntes({ inicio, titulo, sub }: { inicio: Inicio; titulo: string; sub: string }) {
  void lerVisitas()
  // A conta de quantas visitas viraram pedido é a de ontem: hoje o Google ainda está somando.
  const hoje = inicio.grafico.findIndex((d) => d.hoje)
  const ontem = hoje > 0 ? inicio.grafico[hoje - 1] : null
  const visitas = (
    <Suspense fallback={null}>
      <BlocoDasVisitas pedidosPagosOntem={ontem ? ontem.pedidos : null} />
    </Suspense>
  )
  return (
    <div data-tela>
      <Cabeca titulo={titulo} sub={sub} />
      <Numeros
        n={inicio.numeros}
        dias={inicio.grafico}
        visitas={
          <Suspense fallback={<NumeroDeVisitas r={{ estado: "carregando" }} />}>
            <NumeroDasVisitas />
          </Suspense>
        }
      />
      <div className="grade-inicio">
        <div>
          <Fila fila={inicio.fila} />
          <Grafico dias={inicio.grafico} />
        </div>
        <div>
          {inicio.pedidosDeHoje ? (
            <>
              <PedidosDeHoje pedidos={inicio.pedidosDeHoje} />
              {visitas}
            </>
          ) : (
            visitas
          )}
          <MaisVendidos itens={inicio.maisVendidos} />
        </div>
      </div>
    </div>
  )
}
