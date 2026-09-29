import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { SoPara } from "@/components/area"
import { Icone } from "@/components/icones"
import { CaixaDeCompra } from "@/components/produto/caixa-de-compra"
import { GaleriaDoProduto } from "@/components/produto/galeria-do-produto"
import { Publicar } from "@/components/produto/publicar"
import { SecoesDaPagina } from "@/components/produto/secoes-da-pagina"
import { TextosDoProduto } from "@/components/produto/textos-do-produto"
import { SeloDoProduto } from "@/components/produtos"
import { Cabeca, ForaDoAr, SemAcesso } from "@/components/telas"
import { Ajuda, Faixa, Pilula } from "@/components/visual"
import { ler } from "@/lib/medusa"
import {
  categoriasNaCabeca,
  ehIdDeProduto,
  fraseDoHistorico,
  fraseDosAvisos,
  reais,
  SEM_FRETE,
  type PaginaDoProduto,
} from "@/lib/produtos"

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
 *
 * MAIS VISUAL (0155) — as explicações de cada bloco moram no "?" ao lado do
 * título; quem não edita vê a pílula "Só pra ver" no alto, uma vez só.
 */
export default async function Pagina({ params }: Props) {
  const { id } = await params
  // A leitura sai junto com a pergunta de quem é (a resposta fica no `cache`).
  if (ehIdDeProduto(id)) void ler(`/dashboard/produtos/${id}`)
  return (
    <SoPara area="produtos">
      <Produto params={params} />
    </SoPara>
  )
}

async function Produto({ params }: Props) {
  const { id } = await params
  if (!ehIdDeProduto(id)) return <NaoAchei />

  const r = await ler(`/dashboard/produtos/${id}`)
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
    avisos,
    frete,
  } = r.corpo as unknown as PaginaDoProduto
  const frasesDosAvisos = fraseDosAvisos(avisos)

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
        selo={
          <>
            <SeloDoProduto p={p} />
            {p.podeEditar ? null : (
              <Pilula icone="cadeado" suave data-so-ver="">
                Só pra ver
              </Pilula>
            )}
          </>
        }
        ajuda={
          p.podeEditar
            ? undefined
            : "A operação vê o produto como ele está no site; quem edita é o marketing ou o dono."
        }
        sub={[p.sku ? `SKU ${p.sku}` : null, categoriasNaCabeca(p)].filter(Boolean).join(" · ")}
        acoes={acoes}
      />

      {!p.publicado ? (
        <Faixa
          nivel="atencao"
          icone="lapis"
          titulo="Em rascunho, fora do site"
          ajuda="Todo SKU novo do Bling entra assim, pra alguém revisar: a foto, o subtítulo, a categoria e a página. Pronto, é só publicar."
        />
      ) : null}
      {p.publicado && p.estoque === 0 ? (
        <Faixa
          nivel="grave"
          titulo="Esgotado"
          etiquetas={["0 no Bling"]}
          extra={
            avisos?.esperando ? (
              <Pilula icone="email" data-avisos-na-faixa="">
                {avisos.esperando === 1
                  ? "1 pessoa pediu o aviso"
                  : `${avisos.esperando} pessoas pediram o aviso`}
              </Pilula>
            ) : null
          }
          ajuda="O site mostra “esgotado”, com o “avise-me quando chegar” no lugar do botão de comprar. Deu entrada no Bling, a loja copia em até 5 minutos — e manda o e-mail de volta pra quem pediu."
        />
      ) : null}

      <div className="duas">
        <div>
          {/* A chave remonta a caixa quando o que está gravado muda (depois do "Salvar"). */}
          <CaixaDeCompra
            key={JSON.stringify(p.caixa)}
            produto={p}
            catalogo={catalogo}
            frete={frete ?? SEM_FRETE}
          />
          <TextosDoProduto
            key={`${p.subtitulo}|${p.categoriaId ?? ""}|${(p.tambemEmIds ?? []).join(",")}`}
            produto={p}
            categorias={categorias}
          />
          <GaleriaDoProduto produto={p} />
        </div>

        <div>
          <section className="bloco">
            <div className="bloco__cabeca">
              <div className="bloco__titulos">
                <h2 className="bloco__titulo">A página do produto</h2>
                <Ajuda>
                  As seções, nesta ordem. Em “Editar” ficam o texto e a imagem de fundo de cada uma,
                  neste produto.
                </Ajuda>
              </div>
            </div>
            <SecoesDaPagina produto={p} catalogo={catalogo} />
          </section>

          <section className="bloco">
            <div className="bloco__cabeca">
              <div className="bloco__titulos">
                <h2 className="bloco__titulo">Preço e estoque</h2>
                <Ajuda>
                  O preço e o promocional se mudam na{" "}
                  <Link className="link" href="/produtos">
                    lista de produtos
                  </Link>
                  ; o preço mudado lá a importação do Bling não troca mais. O estoque o site copia
                  sozinho, de 5 em 5 minutos, e peso e medidas chegam quando alguém traz o catálogo
                  do Bling de novo.
                </Ajuda>
              </div>
              <span className="selo selo--bling">estoque do Bling</span>
            </div>
            <div className="preco-bling">
              <div data-preco-no-detalhe>
                <small>Preço {p.precoDoPainel ? "(mudado no painel)" : "(do Bling)"}</small>
                <b>{p.preco ? reais(p.preco) : "—"}</b>
              </div>
              <div data-promocao-no-detalhe>
                <small>Promocional</small>
                <b>
                  {p.promocao
                    ? `${reais(p.promocao.por)} (−${p.promocao.desconto}%)`
                    : "Sem promoção"}
                </b>
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
            {frasesDosAvisos ? (
              <p style={{ margin: "12px 0 0" }}>
                <Pilula icone="email" data-avisos="">
                  Avise-me: {frasesDosAvisos}
                </Pilula>
              </p>
            ) : null}
          </section>

          {p.degraus.length > 1 ? (
            <section className="bloco">
              <div className="bloco__cabeca">
                <div className="bloco__titulos">
                  <h2 className="bloco__titulo">Desconto por quantidade</h2>
                  <Ajuda>
                    4% levando 2, 6% levando 3, calculado do preço de hoje (o da promoção, se
                    houver) e arredondado pra baixo até um “,90” que divida certo. Vale pra todo
                    produto.
                  </Ajuda>
                </div>
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
