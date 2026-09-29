import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { SoPara } from "@/components/area"
import {
  RegrasDasCampanhas,
  ResultadoDaCampanhaNaTela,
  situacaoEmTexto,
} from "@/components/campanhas-do-crm"
import {
  FormularioDaCampanha,
  PararACampanha,
  VerOEmailDaCampanha,
} from "@/components/formulario-da-campanha"
import { Cabeca, ForaDoAr, SemAcesso } from "@/components/telas"
import { CAMINHO_DAS_CAMPANHAS, type TelaDasCampanhas } from "@/lib/crm"
import { ler } from "@/lib/medusa"

type Props = { params: Promise<{ id: string }> }

export const metadata: Metadata = { title: "Campanha" }

/**
 * UMA CAMPANHA (entrega 0206). O rascunho e a agendada abrem no formulário
 * (a agendada ainda se muda, ou se desmarca). A que está saindo, a que saiu
 * e a parada mostram o resultado — por assunto, quem recebeu e comprou em 7
 * dias, contra o controle — e o e-mail como saiu; a que está saindo tem o
 * "Parar o envio". Vem da mesma leitura da lista (`GET
 * /dashboard/crm/campanhas`).
 */
export default function Pagina({ params }: Props) {
  void ler(CAMINHO_DAS_CAMPANHAS)
  return (
    <SoPara area="crm">
      <Campanha params={params} />
    </SoPara>
  )
}

async function Campanha({ params }: Props) {
  const { id } = await params
  const r = await ler(CAMINHO_DAS_CAMPANHAS)
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return <SemAcesso area="crm" />
  if (r.status !== 200) return <ForaDoAr />
  const tela = r.corpo as unknown as TelaDasCampanhas
  const c = tela.campanhas.find((x) => x.id === id)
  const voltar = { href: "/crm/campanhas" as const, texto: "Campanhas" }

  if (!c)
    return (
      <div data-tela data-campanha-sumiu>
        <Cabeca titulo="Campanha não encontrada" voltar={voltar} />
        <section className="bloco">
          <p className="bloco__sub">
            Ela pode ter sido apagada. <Link href="/crm/campanhas">Voltar pras campanhas</Link>.
          </p>
        </section>
      </div>
    )

  const selo = (
    <span className="campanha__situacao" data-situacao={c.situacao}>
      {situacaoEmTexto(c)}
    </span>
  )
  if (c.situacao === "rascunho" || c.situacao === "agendada")
    return (
      <div data-tela data-campanha={c.id} data-situacao={c.situacao}>
        <Cabeca titulo={c.texto.nome} selo={selo} voltar={voltar} />
        <FormularioDaCampanha tela={tela} campanha={c} />
        <RegrasDasCampanhas />
      </div>
    )

  return (
    <div data-tela data-campanha={c.id} data-situacao={c.situacao}>
      <Cabeca
        titulo={c.texto.nome}
        selo={selo}
        sub={`${c.nomeDoPublico} · ${c.nomeDoJeito}`}
        voltar={voltar}
        acoes={c.situacao === "enviando" ? <PararACampanha id={c.id} /> : null}
      />
      {c.resultado ? <ResultadoDaCampanhaNaTela r={c.resultado} /> : null}
      <VerOEmailDaCampanha texto={c.texto} />
    </div>
  )
}
