import type { HttpTypes } from "@medusajs/types"
import Image from "next/image"
import Link from "next/link"
import {
  casosDoProduto,
  RESSALVA_DO_ANTES_E_DEPOIS,
  type CasoAntesDepois,
} from "@/conteudo/produto"
import { emReais } from "@/lib/formato"
import { home, listarProdutos, precosDe } from "@/lib/medusa"
import { lerPdp } from "@/lib/pdp"
import { ProvasCarrossel } from "./provas-carrossel"

/**
 * "Resultados reais": o carrossel de antes e depois.
 *
 * OS CASOS SÃO OS DOS PRODUTOS — os do "Antes e depois" da página de cada
 * um (`casosDoProduto`), cadastrados no painel com a autorização por escrito
 * da pessoa. A home não tem lista própria: um caso vale na página do produto
 * e aqui. **Sem caso nenhum, a seção não aparece** — nem título, nem moldura
 * vazia. Foto de rosto é dado pessoal, e publicar sem autorização é problema
 * de LGPD, além de falta de respeito com quem confiou a imagem.
 *
 * Até `CASOS_NA_HOME`, ALTERNANDO os produtos: o primeiro caso de cada um,
 * depois o segundo de cada um. Os primeiros cartões mostram produtos
 * diferentes, e um produto com três casos não toma o carrossel inteiro.
 *
 * Cada caso fecha com o produto que a pessoa usou, levando pra página dele.
 * Prova social que não leva ao produto é prova desperdiçada. E a ressalva de
 * "resultado varia" vem junto, como na página do produto.
 *
 * Quando um caso muda no painel, a página do produto avisa a loja com a
 * etiqueta `produtos` — a mesma da lista daqui: a home refaz junto.
 */

/** O bastante pra provar, pouco pra não virar álbum. O painel diz o mesmo número. */
const CASOS_NA_HOME = 8

export async function Provas() {
  const [produtos, { conteudo }] = await Promise.all([listarProdutos({ limite: 48 }), home()])
  const casos = alternados(
    produtos.map((produto) => ({
      produto,
      casos: produto.handle
        ? casosDoProduto(produto.handle, lerPdp(produto.metadata).conteudo)
        : [],
    }))
  ).slice(0, CASOS_NA_HOME)
  if (!casos.length) return null

  return (
    <section className="provas" aria-labelledby="provas-titulo">
      <div className="provas__wrap">
        <p className="provas__tag">{conteudo.provas.tag}</p>
        <h2 className="provas__titulo" id="provas-titulo">
          {conteudo.provas.titulo}
        </h2>
        <hr className="provas__risco" />

        <ProvasCarrossel total={casos.length}>
          {casos.map(({ caso, produto }) => (
            <Caso key={`${produto.id}-${caso.antes}`} caso={caso} produto={produto} />
          ))}
        </ProvasCarrossel>

        <p className="provas__aviso">{RESSALVA_DO_ANTES_E_DEPOIS}</p>
      </div>
    </section>
  )
}

/** O primeiro caso de cada produto, depois o segundo de cada um, e assim por diante. */
function alternados<P>(
  grupos: { produto: P; casos: CasoAntesDepois[] }[]
): { produto: P; caso: CasoAntesDepois }[] {
  const saida: { produto: P; caso: CasoAntesDepois }[] = []
  for (let i = 0; grupos.some((g) => i < g.casos.length); i++) {
    for (const g of grupos) {
      const caso = g.casos[i]
      if (caso) saida.push({ produto: g.produto, caso })
    }
  }
  return saida
}

function Caso({ caso, produto }: { caso: CasoAntesDepois; produto: HttpTypes.StoreProduct }) {
  const precos = precosDe(produto)

  return (
    <figure className="depo">
      <div className="depo__midia">
        <span className="depo__uso">{caso.tempo} de uso</span>
        <div className="depo__fotos">
          <div className="depo__foto">
            <Image
              src={caso.antes}
              alt={`${caso.nome}, antes`}
              width={600}
              height={700}
              loading="lazy"
              sizes="(max-width: 700px) 45vw, 300px"
            />
            <span className="depo__etiqueta">Antes</span>
          </div>
          <div className="depo__foto">
            <Image
              src={caso.depois}
              alt={`${caso.nome}, depois de ${caso.tempo} de uso`}
              width={600}
              height={700}
              loading="lazy"
              sizes="(max-width: 700px) 45vw, 300px"
            />
            <span className="depo__etiqueta depo__etiqueta--depois">Depois</span>
          </div>
        </div>
      </div>

      <figcaption className="depo__texto">
        {caso.texto ? (
          <blockquote className="depo__fala">
            <p>“{caso.texto}”</p>
          </blockquote>
        ) : null}

        <div className="depo__autor">
          <span className="depo__avatar" aria-hidden="true">
            {caso.nome.slice(0, 1).toUpperCase()}
          </span>
          <span className="depo__nome">{caso.nome}</span>
        </div>

        {precos ? (
          <Link className="minicard" href={`/produtos/${produto.handle}`}>
            <span className="minicard__foto">
              {produto.thumbnail ? (
                <Image
                  src={produto.thumbnail}
                  alt=""
                  width={160}
                  height={160}
                  loading="lazy"
                  sizes="60px"
                />
              ) : null}
            </span>
            <span className="minicard__info">
              <span className="minicard__rotulo">Produto usado</span>
              <span className="minicard__nome">{produto.title}</span>
              <span className="minicard__precos">
                {precos.cheio != null ? (
                  <s className="minicard__de">{emReais(precos.cheio)}</s>
                ) : null}
                <span className="minicard__por">{emReais(precos.atual)}</span>
              </span>
            </span>
            <span className="minicard__seta" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M1.8 11.3 3 10.1h9.2l1.2-1.2V6.2l.9-.5 7.2 5.6v1.4l-7.2 5.6-.9-.5v-2.7l-1.2-1.2H3l-1.2-1.2z" />
              </svg>
            </span>
          </Link>
        ) : null}
      </figcaption>
    </figure>
  )
}
