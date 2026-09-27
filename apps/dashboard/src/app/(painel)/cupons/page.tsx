import type { Metadata, Route } from "next"
import Form from "next/form"
import { redirect } from "next/navigation"
import { SoPara } from "@/components/area"
import { ListaDeCupons, NovoCupom } from "@/components/cupons"
import { Icone } from "@/components/icones"
import { Paginas } from "@/components/paginas"
import { ListaDePromocoes, NovaPromocao } from "@/components/promocoes"
import { Cabeca, ForaDoAr, SemAcesso } from "@/components/telas"
import type { PaginaDeCupons } from "@/lib/cupons"
import { ler } from "@/lib/medusa"
import { paginaDoEndereco } from "@/lib/paginas"

type Busca = Promise<{ busca?: string; pagina?: string }>

/** O endereço da tela: a busca pelo código e a página (a primeira não vai). */
const endereco = (busca: string, pagina: number) => {
  const q = new URLSearchParams()
  if (busca) q.set("busca", busca)
  if (pagina > 1) q.set("pagina", String(pagina))
  const s = q.toString()
  return (s ? `/cupons?${s}` : "/cupons") as Route
}

export const metadata: Metadata = { title: "Cupons e descontos" }

/**
 * CUPONS E DESCONTOS — os cupons que alguém digita no checkout (criar,
 * pausar e acompanhar), as promoções que a loja aplica sozinha e que o
 * painel cria (o "Leve X, pague Y", entrega 0133) e os descontos automáticos
 * de sempre. Vem pronto do backend (`GET /dashboard/cupons`). Marketing e
 * dono. Os cupons vêm de 20 em 20, com a busca pelo código (`?busca=`).
 */
export default async function Pagina({ searchParams }: { searchParams: Busca }) {
  const { busca, pagina } = await searchParams
  const q = new URLSearchParams()
  if (busca?.trim()) q.set("busca", busca.trim().slice(0, 40))
  const p = paginaDoEndereco(pagina)
  if (p && p > 1) q.set("pagina", String(p))
  const caminho = `/dashboard/cupons?${q}`
  void ler(caminho)
  return (
    <SoPara area="cupons">
      <Cupons caminho={caminho} />
    </SoPara>
  )
}

async function Cupons({ caminho }: { caminho: string }) {
  const r = await ler(caminho)
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return <SemAcesso area="cupons" />
  if (r.status !== 200) return <ForaDoAr />
  const {
    cupons,
    busca = "",
    paginacao,
    promocoes = [],
    automaticos,
    catalogo,
    loja = null,
  } = r.corpo as unknown as PaginaDeCupons
  // A busca só aparece quando a lista passa de uma página (ou já buscou).
  const comBusca = Boolean(busca) || (paginacao?.paginas ?? 1) > 1

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
        {comBusca ? (
          <Form className="busca" action="/cupons" role="search">
            <label htmlFor="busca-cupons" className="sr-only">
              Buscar cupom pelo código
            </label>
            <Icone nome="busca" />
            <input
              type="search"
              id="busca-cupons"
              name="busca"
              placeholder="Código do cupom"
              defaultValue={busca}
              autoComplete="off"
            />
            <button type="submit">Buscar</button>
          </Form>
        ) : null}
        {busca && !cupons.length ? (
          <p className="vazio vazio--curto">Nenhum cupom com &ldquo;{busca}&rdquo; no código.</p>
        ) : (
          <ListaDeCupons cupons={cupons} loja={loja} />
        )}
        {paginacao ? (
          <Paginas paginacao={paginacao} endereco={(n) => endereco(busca, n)} rotulo="cupons" />
        ) : null}
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
