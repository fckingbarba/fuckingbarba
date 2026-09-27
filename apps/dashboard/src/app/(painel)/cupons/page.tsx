import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { SoPara } from "@/components/area"
import { ListaDeCupons, NovoCupom } from "@/components/cupons"
import { ListaDePromocoes, NovaPromocao } from "@/components/promocoes"
import { Cabeca, ForaDoAr, SemAcesso } from "@/components/telas"
import type { PaginaDeCupons } from "@/lib/cupons"
import { medusa } from "@/lib/medusa"

export const metadata: Metadata = { title: "Cupons e descontos" }

/**
 * CUPONS E DESCONTOS — os cupons que alguém digita no checkout (criar,
 * pausar e acompanhar), as promoções que a loja aplica sozinha e que o
 * painel cria (o "Leve X, pague Y", entrega 0133) e os descontos automáticos
 * de sempre. Vem pronto do backend (`GET /dashboard/cupons`). Marketing e
 * dono.
 */
export default function Pagina() {
  return (
    <SoPara area="cupons">
      <Cupons />
    </SoPara>
  )
}

async function Cupons() {
  const r = await medusa("/dashboard/cupons", { metodo: "GET", token: "sessao" })
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return <SemAcesso area="cupons" />
  if (r.status !== 200) return <ForaDoAr />
  const {
    cupons,
    promocoes = [],
    automaticos,
    catalogo,
    loja = null,
  } = r.corpo as unknown as PaginaDeCupons

  return (
    <div data-tela>
      <Cabeca
        titulo="Cupons e descontos"
        sub="Os cupons que alguém digita no checkout, e os descontos que a loja aplica sozinha."
        acoes={<NovoCupom catalogo={catalogo} loja={loja} />}
      />
      <section className="bloco" data-cupons>
        <div className="bloco__cabeca">
          <h2 className="bloco__titulo">Cupons</h2>
          <span className="selo">quem valida é a loja, não a tela</span>
        </div>
        <ListaDeCupons cupons={cupons} loja={loja} />
      </section>
      <section className="bloco" data-promocoes>
        <div className="bloco__cabeca">
          <div>
            <h2 className="bloco__titulo">Promoções</h2>
            <p className="bloco__sub">
              Leve X, pague Y: ninguém digita código, o desconto entra sozinho no carrinho.
            </p>
          </div>
          <NovaPromocao catalogo={catalogo} />
        </div>
        <ListaDePromocoes promocoes={promocoes} />
      </section>
      <section className="bloco" data-automaticos>
        <div className="bloco__cabeca">
          <div>
            <h2 className="bloco__titulo">Descontos automáticos</h2>
            <p className="bloco__sub">Ninguém digita nada: a loja aplica sozinha.</p>
          </div>
        </div>
        <div className="linhas">
          {automaticos.map((d) => (
            <div className="linha" key={d.id} data-automatico={d.id}>
              <div>
                <p className="linha__titulo">{d.titulo}</p>
                <p className="linha__txt">{d.texto}</p>
              </div>
              <span className="status" data-s={d.valendo ? "ativo" : "pausado"}>
                {d.valendo ? "Valendo" : "Desligado"}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
