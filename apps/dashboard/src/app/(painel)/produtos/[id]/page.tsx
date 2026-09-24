import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { SoPara } from "@/components/area"
import { Icone } from "@/components/icones"
import { CaixaDeCompra } from "@/components/produto/caixa-de-compra"
import { Publicar } from "@/components/produto/publicar"
import { SecoesDaPagina } from "@/components/produto/secoes-da-pagina"
import { TextosDoProduto } from "@/components/produto/textos-do-produto"
import { SeloDoProduto } from "@/components/produtos"
import { Cabeca, ForaDoAr, SemAcesso } from "@/components/telas"
import { medusa } from "@/lib/medusa"
import { ehIdDeProduto, fraseDoHistorico, reais, type PaginaDoProduto } from "@/lib/produtos"

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  return { title: ehIdDeProduto(id) ? "Produto" : "Produto não encontrado" }
}

/**
 * O PRODUTO — a caixa de compra, os textos e as fotos de um lado; do outro,
 * as seções da página (na ordem do site, com o texto e o fundo de cada uma),
 * o preço e o estoque (do Bling) e o desconto por quantidade. Tudo vem
 * pronto do backend (`GET /dashboard/produtos/:id`); quem edita é o
 * marketing e o dono — a operação vê a mesma tela, sem os botões.
 *
 * No celular vira uma coluna só, na ordem do que mais se mexe.
 */
export default function Pagina({ params }: Props) {
  return (
    <SoPara area="produtos">
      <Produto params={params} />
    </SoPara>
  )
}

async function Produto({ params }: Props) {
  const { id } = await params
  if (!ehIdDeProduto(id)) return <NaoAchei />

  const r = await medusa(`/dashboard/produtos/${id}`, { metodo: "GET", token: "sessao" })
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return <SemAcesso area="produtos" />
  if (r.status === 404) return <NaoAchei />
  if (r.status !== 200) return <ForaDoAr />
  const {
    produto: p,
    catalogo,
    categorias,
    noSite,
    historico,
  } = r.corpo as unknown as PaginaDoProduto

  const acoes =
    p.podeEditar && !p.publicado ? (
      <Publicar produto={p} />
    ) : p.publicado && noSite ? (
      <a className="btn btn--menor btn--contorno" href={noSite} target="_blank" rel="noreferrer">
        <Icone nome="fora" />
        Ver no site
      </a>
    ) : null

  return (
    <div data-tela>
      <Cabeca
        voltar={{ href: "/produtos", texto: "Produtos" }}
        titulo={p.nome}
        selo={<SeloDoProduto p={p} />}
        sub={[p.sku ? `SKU ${p.sku}` : null, p.categoria ?? "sem categoria"]
          .filter(Boolean)
          .join(" · ")}
        acoes={acoes}
      />

      {!p.publicado ? (
        <div className="faixa" data-nivel="atencao">
          <Icone nome="alerta" />
          <div>
            <p className="faixa__titulo">Em rascunho, fora do site</p>
            <p>
              Todo SKU novo do Bling entra assim, pra alguém revisar: a foto, o subtítulo, a
              categoria e a página. Pronto, é só publicar.
            </p>
          </div>
        </div>
      ) : null}
      {p.publicado && p.estoque === 0 ? (
        <div className="faixa" data-nivel="grave">
          <Icone nome="alerta" />
          <div>
            <p className="faixa__titulo">Esgotado</p>
            <p>
              O Bling diz 0 unidades. O site mostra “esgotado” e não vende. Deu entrada no Bling, a
              loja copia em até 5 minutos.
            </p>
          </div>
        </div>
      ) : null}

      <div className="duas">
        <div>
          {/* A chave remonta a caixa quando o que está gravado muda (depois do "Salvar"). */}
          <CaixaDeCompra key={JSON.stringify(p.caixa)} produto={p} catalogo={catalogo} />
          <TextosDoProduto
            key={`${p.subtitulo}|${p.categoriaId ?? ""}`}
            produto={p}
            categorias={categorias}
          />
          <section className="bloco">
            <div className="bloco__cabeca">
              <h2 className="bloco__titulo">Fotos</h2>
              <span className="selo">a primeira é a capa</span>
            </div>
            {p.fotos.length ? (
              <ul className="galeria">
                {p.fotos.map((f, i) => (
                  <li className="galeria__item" key={f}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- foto do Medusa, de qualquer host */}
                    <img src={f} alt="" loading="lazy" />
                    {i === 0 ? <span className="galeria__capa">Capa</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="slot__aviso" style={{ margin: 0 }}>
                <Icone nome="alerta" />
                Sem foto: a vitrine, o Google e o link no WhatsApp ficam sem imagem.
              </p>
            )}
            <p className="pequeno suave" style={{ margin: "12px 0 0" }}>
              As fotos vêm do Bling, na primeira vez que o produto chega. Trocar, pôr em ordem e
              subir vídeo chega na próxima entrega.
            </p>
          </section>
        </div>

        <div>
          <section className="bloco">
            <div className="bloco__cabeca">
              <div>
                <h2 className="bloco__titulo">A página do produto</h2>
                <p className="bloco__sub">
                  As seções, nesta ordem. Em “Editar” ficam o texto e a imagem de fundo de cada uma,
                  neste produto.
                </p>
              </div>
            </div>
            <SecoesDaPagina produto={p} catalogo={catalogo} />
            {p.podeEditar ? null : (
              <p className="pequeno suave" style={{ margin: "12px 0 0" }}>
                A operação vê a página; quem edita é o marketing ou o dono.
              </p>
            )}
          </section>

          <section className="bloco">
            <div className="bloco__cabeca">
              <h2 className="bloco__titulo">Preço e estoque</h2>
              <span className="selo selo--bling">vem do Bling</span>
            </div>
            <div className="preco-bling">
              <div>
                <small>Preço</small>
                <b>{p.preco ? reais(p.preco) : "—"}</b>
              </div>
              <div>
                <small>Estoque</small>
                <b>{p.estoque === null ? "—" : `${p.estoque} un.`}</b>
              </div>
              <div>
                <small>Peso</small>
                <b>{p.peso ? `${p.peso} g` : "—"}</b>
              </div>
            </div>
            <p className="pequeno suave" style={{ margin: "12px 0 0" }}>
              O estoque o site copia sozinho, de 5 em 5 minutos. Preço, peso e medidas chegam quando
              alguém traz o catálogo do Bling de novo — mudar aqui criaria dois preços.
            </p>
          </section>

          {p.degraus.length > 1 ? (
            <section className="bloco">
              <div className="bloco__cabeca">
                <h2 className="bloco__titulo">Desconto por quantidade</h2>
                <span className="selo selo--auto">automático</span>
              </div>
              <dl className="pares">
                {p.degraus.map((d) => (
                  <div key={d.unidades}>
                    <dt>
                      {d.unidades} {d.unidades > 1 ? "unidades" : "unidade"}
                    </dt>
                    <dd>
                      {reais(d.total)}
                      {d.unidades > 1 ? (
                        <span className="suave"> ({reais(d.total / d.unidades)} cada)</span>
                      ) : null}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="pequeno suave" style={{ margin: "12px 0 0" }}>
                4% levando 2, 6% levando 3, calculado do preço do Bling e arredondado pra baixo até
                um “,90” que divida certo. Vale pra todo produto.
              </p>
            </section>
          ) : null}

          {historico.length ? (
            <section className="bloco" data-historico>
              <div className="bloco__cabeca">
                <h2 className="bloco__titulo">O que a equipe mudou</h2>
                <span className="selo selo--auto">pelo painel</span>
              </div>
              <ul className="historico">
                {historico.map((h, n) => {
                  const { titulo, detalhe } = fraseDoHistorico(h)
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
      </div>
    </div>
  )
}

function NaoAchei() {
  return (
    <div className="vazio" data-tela>
      <b>Produto não encontrado</b>
      <Link className="link" href="/produtos">
        Voltar pra lista
      </Link>
    </div>
  )
}
