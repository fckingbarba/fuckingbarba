import type { HttpTypes } from "@medusajs/types"
import Image from "next/image"
import Link from "next/link"
import { Carrinho, Cronometro, Curva, Frasco, Raio } from "@/components/icones"
import { BotaoComprar } from "@/components/produto/comprar"
import { emReais } from "@/lib/formato"
import type { ProdutoNoPalco } from "@/lib/home"
import { buscarProdutoPorHandle, home, precosDe, varianteDoCard } from "@/lib/medusa"
import { PARCELA_MINIMA, PARCELAS_SEM_JUROS } from "@/lib/site"
import { PalcoAltaPerformance } from "./palco-alta-performance"

/**
 * "Alta Performance": um palco que troca de produto sozinho, e pra cada um
 * três cards — o que é, como se usa, o que esperar.
 *
 * A divisão de trabalho vale registrar: **o texto (e quais produtos, em que
 * ordem) vem do painel, no "Layout da home"; o resto vem do catálogo.** Nome,
 * foto e preço mudam no admin e mudam aqui junto. No protótipo os três
 * preços estavam escritos no HTML — e já estavam errados em relação ao
 * catálogo quando fui conferir.
 *
 * Produto que não existe no catálogo não vira slide, mesmo tendo texto. Com
 * menos de dois, a seção inteira sai: palco de um slide é só um bloco com
 * bolinha inútil embaixo.
 */
export async function AltaPerformance() {
  const { altaPerformance } = (await home()).conteudo
  const encontrados = await Promise.all(
    altaPerformance.produtos.map(async (texto) => {
      const produto = await buscarProdutoPorHandle(texto.produto)
      return produto ? { produto, texto } : null
    })
  )
  // O mesmo produto duas vezes vira um slide só (o backend já grava assim; aqui é a garantia).
  const slides = encontrados
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .filter((s, i, todos) => todos.findIndex((o) => o.produto.id === s.produto.id) === i)
  if (slides.length < 2) return null

  return (
    <PalcoAltaPerformance rotulos={slides.map((s) => s.texto.nomeCurto ?? s.produto.title)}>
      {slides.map(({ produto, texto }, i) => (
        <Slide key={produto.id} produto={produto} texto={texto} indice={i} total={slides.length} />
      ))}
    </PalcoAltaPerformance>
  )
}

function Slide({
  produto,
  texto,
  indice,
  total,
}: {
  produto: HttpTypes.StoreProduct
  texto: ProdutoNoPalco
  indice: number
  total: number
}) {
  const precos = precosDe(produto)
  const caminho = `/produtos/${produto.handle}` as const
  const parcela = precos ? precos.atual / PARCELAS_SEM_JUROS : 0
  const variante = varianteDoCard(produto)

  return (
    <div
      className="benefits__slide"
      id={`perf-slide-${indice}`}
      role="group"
      aria-roledescription="slide"
      aria-label={`${indice + 1} de ${total}: ${texto.nomeCurto ?? produto.title}`}
    >
      <div className="benefits__ficha">
        <span className="benefits__foto">
          {produto.thumbnail ? (
            <Image
              src={produto.thumbnail}
              alt={produto.title}
              width={600}
              height={600}
              loading="lazy"
              sizes="180px"
            />
          ) : null}
        </span>

        <div className="benefits__dados">
          <h3 className="benefits__nome">
            <Link href={caminho}>{produto.title}</Link>
          </h3>
          {precos ? (
            <p className="benefits__preco">
              {precos.cheio != null ? (
                <span className="benefits__de">{emReais(precos.cheio)}</span>
              ) : null}
              <span className="benefits__por">{emReais(precos.atual)}</span>
              {parcela >= PARCELA_MINIMA ? (
                <span className="benefits__parcela">
                  ou {PARCELAS_SEM_JUROS}x de {emReais(parcela)} sem juros
                </span>
              ) : null}
            </p>
          ) : null}
        </div>

        {/* Põe na sacola, como o card da vitrine (ver `BotaoComprar`). */}
        {variante ? (
          <BotaoComprar
            varianteId={variante}
            nome={produto.title}
            previa={
              precos
                ? { handle: produto.handle, imagem: produto.thumbnail ?? null, preco: precos.atual }
                : undefined
            }
            className="btn benefits__compra"
            icone={<Carrinho className="btn__icone" />}
          />
        ) : (
          <Link href={caminho} className="btn benefits__compra">
            Comprar
            <Carrinho className="btn__icone" />
          </Link>
        )}
      </div>

      <div className="benefits__grid">
        <article className="benefit-card">
          <Frasco className="benefit-card__icon" />
          <Chapeu>O Produto</Chapeu>
          <h4 className="benefit-card__heading">{texto.titulo}</h4>
          <p className="benefit-card__text">{texto.texto}</p>
        </article>

        <article className="benefit-card">
          <Cronometro className="benefit-card__icon" />
          <Chapeu>Modo de Uso</Chapeu>
          <h4 className="benefit-card__heading">{texto.usoTitulo}</h4>
          <p className="benefit-card__text">{texto.usoTexto}</p>
          <ol className="benefit-card__steps">
            {texto.passos.map((passo, n) => (
              <li key={`${n}-${passo}`}>
                <span className="benefit-card__step-number" aria-hidden="true">
                  <span>{n + 1}</span>
                </span>
                {passo}
              </li>
            ))}
          </ol>
        </article>

        <article className="benefit-card">
          <Curva className="benefit-card__icon" />
          <Chapeu>O Resultado</Chapeu>
          <p className="benefit-card__stat" aria-label={`${texto.numero} ${texto.unidade}`}>
            <span className="benefit-card__stat-number">{texto.numero}</span>
            <span className="benefit-card__stat-unit">{texto.unidade}</span>
          </p>
          <p className="benefit-card__stat-caption">{texto.legenda}</p>
          <p className="benefit-card__text">{texto.resultado}</p>
        </article>
      </div>
    </div>
  )
}

function Chapeu({ children }: { children: React.ReactNode }) {
  return (
    <p className="benefit-card__eyebrow">
      <Raio className="benefit-card__eyebrow-bolt" />
      {children}
    </p>
  )
}
