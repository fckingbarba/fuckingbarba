import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Fila, Grafico, MaisVendidos, Numeros, PedidosDeHoje } from "@/components/inicio"
import { Cabeca, ForaDoAr } from "@/components/telas"
import { lerMembro } from "@/lib/eu"
import { medusa } from "@/lib/medusa"
import type { Inicio } from "@/lib/pedidos"

export const metadata: Metadata = { title: "Início" }

/**
 * O INÍCIO — o que precisa de você hoje, as vendas e os pedidos do dia, do
 * jeito de cada papel: o dono e a operação veem a fila do dia e os pedidos
 * de hoje; o marketing, os números e os mais vendidos (o backend nem manda
 * nome de cliente pra ele — `apps/backend/src/lib/painel/inicio.ts`).
 *
 * As visitas do dia (do Google Analytics) chegam na próxima entrega.
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

const DO_PAPEL = {
  dono: "tudo o que pede você hoje",
  operacao: "o dia da operação",
  marketing: "o dia do marketing",
} as const

/** "Bom dia, Matheus" · "Quinta-feira, 24/09 · o dia da operação", na hora da loja. */
function cabecalho(nome: string, papel: keyof typeof DO_PAPEL, agora = new Date()) {
  const hoje = DIA.format(agora)
  return {
    titulo: `${saudacao(agora)}, ${nome.split(" ")[0]}`,
    sub: `${hoje[0].toUpperCase()}${hoje.slice(1)} · ${DO_PAPEL[papel]}`,
  }
}

export default async function PaginaInicio() {
  const leitura = await lerMembro()
  if (leitura.estado !== "ok") return null
  const { membro } = leitura

  const r = await medusa("/dashboard/inicio", { metodo: "GET", token: "sessao" })
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status !== 200) return <ForaDoAr />
  const inicio = r.corpo as unknown as Inicio

  const { titulo, sub } = cabecalho(membro.nome, membro.papel)

  return (
    <div data-tela>
      <Cabeca titulo={titulo} sub={sub} />
      <Numeros n={inicio.numeros} />
      <div className="grade-inicio">
        <div>
          <Fila fila={inicio.fila} />
          <Grafico dias={inicio.grafico} />
        </div>
        <div>
          {inicio.pedidosDeHoje ? <PedidosDeHoje pedidos={inicio.pedidosDeHoje} /> : null}
          <MaisVendidos itens={inicio.maisVendidos} />
        </div>
      </div>
    </div>
  )
}
