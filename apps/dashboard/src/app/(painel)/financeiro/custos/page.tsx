import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { SoPara } from "@/components/area"
import { AbasDoFinanceiro } from "@/components/financeiro"
import { FormularioDosCustos, FormularioDoSimples } from "@/components/financeiro-custos"
import { Cabeca, ForaDoAr, SemAcesso } from "@/components/telas"
import type { TelaDosCustos } from "@/lib/financeiro"
import { ler } from "@/lib/medusa"

export const metadata: Metadata = { title: "Custos e imposto · Financeiro" }

const CAMINHO = "/dashboard/financeiro/custos"

/**
 * CUSTOS E IMPOSTO — o custo de cada produto, a embalagem por pedido e a
 * alíquota do Simples de cada mês: o que o DRE precisa pra calcular o custo
 * dos produtos vendidos e o imposto.
 */
export default function Pagina() {
  void ler(CAMINHO)
  return (
    <SoPara area="financeiro">
      <Custos />
    </SoPara>
  )
}

async function Custos() {
  const r = await ler(CAMINHO)
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return <SemAcesso area="financeiro" />
  if (r.status !== 200) return <ForaDoAr />
  const t = r.corpo as unknown as TelaDosCustos

  return (
    <div data-tela data-custos-e-imposto>
      <Cabeca
        titulo="Financeiro"
        ajuda="O custo de cada produto vale a partir do dia que você escolher: as vendas de antes seguem com o custo de antes. O Simples é a alíquota efetiva de cada mês."
      />
      <AbasDoFinanceiro atual="custos" />
      {t.semCusto ? (
        <p className="fin-aviso" role="status" data-sem-custo>
          {t.semCusto === 1
            ? "1 produto no site sem custo"
            : `${t.semCusto} produtos no site sem custo`}
          : o custo dos produtos no DRE fica menor do que foi.
        </p>
      ) : null}
      <div className="fin-lado">
        <FormularioDosCustos
          key={JSON.stringify(t.produtos.map((p) => [p.custo, p.desde]))}
          tela={t}
        />
        <div className="fin-dois">
          <FormularioDoSimples key={JSON.stringify(t.simples.map((s) => s.valor))} tela={t} />
          <section className="bloco" data-o-que-vem-sozinho>
            <h2 className="bloco__titulo">O que vem sozinho</h2>
            <p className="fin-nota">
              <span className="fin-selo fin-selo--auto">Automático</span> As vendas, os cupons, os
              estornos e o custo × as unidades vendidas; a taxa de cada pagamento no cartão
              (Pagar.me) e no Pix do Mercado Pago; e o frete de cada pedido (a cotação da Frenet).
            </p>
            <p className="fin-nota">
              Não vêm: a % do Pix no Pagar.me (preencha ao lado), as tarifas de gateway e antifraude
              que o Pagar.me cobra no extrato do mês, e as taxas e o frete de antes da loja nova —
              esses, lance em Despesas.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
