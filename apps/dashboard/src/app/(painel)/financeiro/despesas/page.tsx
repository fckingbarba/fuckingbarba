import type { Metadata, Route } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { SoPara } from "@/components/area"
import { AbasDoFinanceiro } from "@/components/financeiro"
import { DespesaDaLista, LancarDespesa } from "@/components/financeiro-despesas"
import { Icone } from "@/components/icones"
import { Cabeca, ForaDoAr, SemAcesso } from "@/components/telas"
import { CabecaDoBloco } from "@/components/visual"
import { reais, type TelaDasDespesas } from "@/lib/financeiro"
import { ler } from "@/lib/medusa"

export const metadata: Metadata = { title: "Despesas · Financeiro" }

type Busca = Promise<{ mes?: string }>

const MES = /^\d{4}-(0[1-9]|1[0-2])$/
const doMes = (mes: string) => `/financeiro/despesas?mes=${mes}` as Route
const plural = (n: number) => (n === 1 ? "1 mês" : `${n} meses`)

/**
 * AS DESPESAS DO FINANCEIRO — o que o dono lança mês a mês (anúncio,
 * sistemas, pró-labore, contador) e, antes da loja nova, o total de taxas e
 * de frete que a Nuvemshop cobrou. O mês fica no endereço (`?mes=2026-09`);
 * sem ele, este mês.
 */
export default async function Pagina({ searchParams }: { searchParams: Busca }) {
  const { mes } = await searchParams
  const caminho = `/dashboard/financeiro/despesas${mes && MES.test(mes) ? `?mes=${mes}` : ""}`
  void ler(caminho)
  return (
    <SoPara area="financeiro">
      <Despesas caminho={caminho} />
    </SoPara>
  )
}

async function Despesas({ caminho }: { caminho: string }) {
  const r = await ler(caminho)
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return <SemAcesso area="financeiro" />
  if (r.status !== 200) return <ForaDoAr />
  const t = r.corpo as unknown as TelaDasDespesas
  const falta = t.antesDaLojaNova.filter((m) => m.vendeu && (!m.taxas || !m.frete))
  const semTaxa = t.antesDaLojaNova.filter((m) => m.vendeu && !m.taxas).length
  const semFrete = t.antesDaLojaNova.filter((m) => m.vendeu && !m.frete).length

  return (
    <div data-tela data-despesas={t.mes}>
      <Cabeca
        titulo="Financeiro"
        ajuda="O que o sistema não sabe sozinho: os anúncios, os sistemas, o pró-labore, o contador. Cada despesa entra no DRE do mês em que você lança; a que repete entra todo mês até você tirar."
      />
      <AbasDoFinanceiro atual="despesas" />
      <div className="fin-duas-colunas">
        <section className="bloco bloco--sem-pad" data-lista-de-despesas>
          <div className="fin-mes">
            <div className="fin-mes__ir">
              {t.anterior ? (
                <Link className="fin-icone" href={doMes(t.anterior)} aria-label="Mês anterior">
                  <Icone nome="esquerda" />
                </Link>
              ) : (
                <span className="fin-icone" aria-hidden="true" />
              )}
              <h2 className="bloco__titulo" data-mes-das-despesas>
                {t.nome}
              </h2>
              {t.proximo ? (
                <Link className="fin-icone" href={doMes(t.proximo)} aria-label="Próximo mês">
                  <Icone nome="seta" />
                </Link>
              ) : null}
            </div>
            <p className="fin-mes__total">
              Lançado no mês{" "}
              <b className="num" data-total-das-despesas>
                {reais(t.total)}
              </b>
            </p>
          </div>
          {t.grupos.length ? (
            t.grupos.map((g) => (
              <div key={g.categoria} className="fin-grupo" data-categoria={g.categoria}>
                <div className="fin-grupo__cabeca">
                  <span>
                    {g.nome} <small>→ {g.linha}</small>
                  </span>
                  <b className="num">{reais(g.total)}</b>
                </div>
                {g.itens.map((d) => (
                  <DespesaDaLista key={`${d.id}-${t.mes}`} despesa={d} tela={t} />
                ))}
              </div>
            ))
          ) : (
            <p className="fin-nota fin-nota--pe">Nada lançado em {t.nome}.</p>
          )}
        </section>
        <div className="fin-lado">
          <LancarDespesa key={t.mes} tela={t} />
          <section className="bloco" data-antes-da-loja-nova>
            <CabecaDoBloco
              titulo="Antes da loja nova"
              ajuda="De fevereiro a 26/09 a taxa do pagamento e o frete estavam na Nuvemshop: lance o total de cada mês (Nuvem Pago → Extrato; Nuvemshop → Envios), nas categorias “Taxas de pagamento” e “Frete pago pela loja”."
            />
            <div className="fin-grade" role="table" aria-label="Taxas e frete lançados por mês">
              <div role="row" className="fin-grade__linha">
                <span role="columnheader" />
                {t.antesDaLojaNova.map((m) => (
                  <span key={m.mes} role="columnheader" className="fin-grade__mes">
                    {m.curto}
                  </span>
                ))}
              </div>
              {(["taxas", "frete"] as const).map((qual) => (
                <div key={qual} role="row" className="fin-grade__linha" data-grade={qual}>
                  <span role="rowheader" className="fin-grade__rot">
                    {qual === "taxas" ? "Taxas" : "Frete"}
                  </span>
                  {t.antesDaLojaNova.map((m) => (
                    <span
                      key={m.mes}
                      role="cell"
                      className="fin-grade__cel"
                      data-estado={m[qual] ? "ok" : m.vendeu ? "falta" : "sem-venda"}
                      title={m[qual] ? "Lançado" : m.vendeu ? "Falta lançar" : "Sem venda"}
                    >
                      {m[qual] ? "✓" : m.vendeu ? "!" : "·"}
                    </span>
                  ))}
                </div>
              ))}
            </div>
            {falta.length ? (
              <p className="fin-nota" data-falta-lancar>
                Os “!” são meses que venderam na Nuvemshop e ainda não têm o lançamento: falta{" "}
                {[
                  semTaxa ? `a taxa de ${plural(semTaxa)}` : null,
                  semFrete ? `o frete de ${plural(semFrete)}` : null,
                ]
                  .filter(Boolean)
                  .join(" e ")}
                .
              </p>
            ) : (
              <p className="fin-nota" data-falta-lancar>
                Tudo lançado.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
