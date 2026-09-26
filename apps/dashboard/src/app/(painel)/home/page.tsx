import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { SoPara } from "@/components/area"
import { FaixaDaHome, PublicarHome } from "@/components/home/publicar-home"
import { SecoesDaHome } from "@/components/home/secoes-da-home"
import { Icone } from "@/components/icones"
import { Cabeca, ForaDoAr, SemAcesso } from "@/components/telas"
import { fraseDoHistoricoDaHome, quantasMudancas, type PaginaDaHome } from "@/lib/home"
import { medusa } from "@/lib/medusa"

export const metadata: Metadata = { title: "Layout da home" }

/**
 * O LAYOUT DA HOME — as seções da página inicial, na ordem em que aparecem:
 * ligar, desligar, subir, descer e o texto de cada uma; e, em cima delas, a
 * barra de avisos do topo (a esteira amarela de toda página). Tudo vai pro
 * RASCUNHO; a loja só muda no "Publicar". Vem pronto do backend
 * (`GET /dashboard/home`). Marketing e dono.
 */
export default function Pagina() {
  return (
    <SoPara area="home">
      <Home />
    </SoPara>
  )
}

async function Home() {
  const r = await medusa("/dashboard/home", { metodo: "GET", token: "sessao" })
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return <SemAcesso area="home" />
  if (r.status !== 200) return <ForaDoAr />
  const { secoes, anuncio, pendentes, publicacao, catalogo, provas, noSite, historico } =
    r.corpo as unknown as PaginaDaHome

  return (
    <div data-tela>
      <Cabeca
        titulo="Layout da home"
        sub="A barra de avisos do topo e as seções da página inicial, na ordem em que aparecem. Em “Editar” fica o texto de cada uma."
        acoes={
          <>
            {noSite ? (
              <a
                className="btn btn--menor btn--contorno"
                href={noSite}
                target="_blank"
                rel="noreferrer"
              >
                <Icone nome="fora" />
                Ver a home
              </a>
            ) : null}
            <PublicarHome mudancas={quantasMudancas(pendentes)} />
          </>
        }
      />

      <FaixaDaHome pendentes={pendentes} publicacao={publicacao} />

      <section className="bloco">
        <SecoesDaHome secoes={secoes} anuncio={anuncio} catalogo={catalogo} provas={provas ?? []} />
      </section>

      {historico.length ? (
        <section className="bloco" data-historico>
          <div className="bloco__cabeca">
            <h2 className="bloco__titulo">O que a equipe mudou</h2>
            <span className="selo selo--auto">pelo painel</span>
          </div>
          <ul className="historico">
            {historico.map((h, n) => {
              const { titulo, detalhe } = fraseDoHistoricoDaHome(h)
              return (
                <li key={`${h.em}-${n}`}>
                  <time dateTime={h.em}>{h.quando}</time>
                  <span>
                    {titulo}
                    {detalhe ? <small>{detalhe}</small> : null}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
