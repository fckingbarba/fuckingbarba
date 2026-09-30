import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { SoPara } from "@/components/area"
import {
  AbasDoFinanceiro,
  BarraDoFinanceiro,
  DeCada100,
  MesAMes,
  NumerosDoFinanceiro,
  PraFechar,
  TabelaDoDre,
} from "@/components/financeiro"
import { BaixarPlanilha } from "@/components/financeiro-planilha"
import { Cabeca, ForaDoAr, SemAcesso } from "@/components/telas"
import {
  consultaDoFinanceiro,
  type BuscaDoFinanceiro,
  type TelaDoFinanceiro,
} from "@/lib/financeiro"
import { ler } from "@/lib/medusa"

export const metadata: Metadata = { title: "Financeiro" }

type Busca = Promise<BuscaDoFinanceiro>

/**
 * FINANCEIRO — o DRE da loja: o que entrou, o que saiu e o que sobrou. O
 * período fica no endereço (`?periodo=mes-passado`, `?de=2026-06&ate=2026-09`,
 * `?comparar=nenhum`), e a vista também (`?ver=meses`: uma coluna por mês).
 * Sem nada, este mês comparado com o de antes. A conta é toda do Medusa
 * (`GET /dashboard/financeiro`); só o dono abre, no padrão.
 */
export default async function Pagina({ searchParams }: { searchParams: Busca }) {
  const busca = await searchParams
  const caminho = `/dashboard/financeiro?${consultaDoFinanceiro(busca)}`
  void ler(caminho)
  return (
    <SoPara area="financeiro">
      <Dre caminho={caminho} vista={busca.ver === "meses" ? "meses" : "periodo"} />
    </SoPara>
  )
}

async function Dre({ caminho, vista }: { caminho: string; vista: "periodo" | "meses" }) {
  const r = await ler(caminho)
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return <SemAcesso area="financeiro" />
  if (r.status !== 200) return <ForaDoAr />
  const t = r.corpo as unknown as TelaDoFinanceiro

  return (
    <div data-tela data-financeiro={vista}>
      <Cabeca
        titulo="Financeiro"
        ajuda="O DRE da loja: a receita das vendas (a loja nova e a Nuvemshop, desde fevereiro), o que sai dela (descontos, estornos, o Simples, o custo dos produtos, as taxas, o frete e as despesas) e o que sobra no fim. O que o sistema não sabe sozinho você preenche nas outras duas abas."
        acoes={<BaixarPlanilha t={t} />}
      />
      <AbasDoFinanceiro atual="dre" />
      <BarraDoFinanceiro p={t.periodo} vista={vista} />
      {vista === "meses" ? (
        <>
          <MesAMes t={t} />
          <PraFechar t={t} />
        </>
      ) : (
        <>
          <NumerosDoFinanceiro t={t} />
          <div className="fin-dois">
            <DeCada100 t={t} />
            <PraFechar t={t} />
          </div>
          <TabelaDoDre t={t} />
        </>
      )}
    </div>
  )
}
