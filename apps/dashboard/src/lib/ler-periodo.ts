import "server-only"
import { redirect } from "next/navigation"
import { cache } from "react"
import { medusa } from "@/lib/medusa"
import { ATALHOS, type Atalho, type PeriodoNaTela } from "@/lib/periodo"

/**
 * O PERÍODO DA BARRA, como o backend entende (`GET /dashboard/periodo`,
 * entrega 0191): o nome, as datas, o de antes e o aviso. As abas do
 * Marketing desenham a barra com isto na hora, sem esperar os dados da aba
 * (que podem esperar o Google). Uma pergunta por página (`cache`).
 */
export const lerPeriodoNaTela = cache(
  async (consulta: string, padrao: Atalho): Promise<PeriodoNaTela> => {
    const r = await medusa(`/dashboard/periodo?${consulta}&padrao=${padrao}`, {
      metodo: "GET",
      token: "sessao",
    })
    if (r.status === 401)
      redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
    if (r.status === 200 && typeof r.corpo.nome === "string")
      return r.corpo as unknown as PeriodoNaTela
    return periodoDoBackendDeAntes(consulta)
  }
)

/* ── sem a resposta: o backend de antes da 0191 ───────────────────────────── */

const FUSO = "America/Sao_Paulo"
const DIA_MS = 24 * 60 * 60 * 1000

/** Os botões que o backend de antes conhecia, com os dias de cada um. */
const DE_ANTES: Partial<Record<Atalho, number>> = { hoje: 1, "7d": 7, "30d": 30, "90d": 90 }

const somarDias = (chave: string, n: number) =>
  new Date(Date.parse(`${chave}T12:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10)
const diaEMes = (chave: string) => `${chave.slice(8, 10)}/${chave.slice(5, 7)}`

/**
 * Sem o `/dashboard/periodo` — o backend de antes, nos minutos entre o
 * painel e o Railway subirem (ou a loja fora do ar): ele só sabe hoje, 7, 30
 * e 90 dias (o resto vira 30 dias) e compara sempre. A barra diz o que ele
 * vai mostrar.
 */
function periodoDoBackendDeAntes(consulta: string): PeriodoNaTela {
  const pedido = new URLSearchParams(consulta).get("periodo") as Atalho | null
  const atalho: Atalho = pedido && DE_ANTES[pedido] ? pedido : "30d"
  const n = DE_ANTES[atalho] ?? 30
  const ate = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date())
  const de = somarDias(ate, 1 - n)
  const antesDe = somarDias(de, -n)
  const antesAte = somarDias(ate, -n)
  const umDia = n === 1
  return {
    atalho,
    de,
    ate,
    ateAgora: true,
    passo: umDia ? "hora" : n <= 62 ? "dia" : "semana",
    nome: umDia ? "Hoje" : `Últimos ${ATALHOS.find(([a]) => a === atalho)?.[1] ?? ""}`,
    datas: umDia ? diaEMes(ate) : `${diaEMes(de)} a ${diaEMes(ate)}`,
    nomeDoAntes: umDia ? "ontem" : `${diaEMes(antesDe)} a ${diaEMes(antesAte)}`,
    aviso: null,
    comparar: true,
    antesDe,
    antesAte,
  }
}
