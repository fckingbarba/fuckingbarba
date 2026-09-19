import type { HttpTypes } from "@medusajs/types"
import Image from "next/image"
import Link from "next/link"
import { Carrinho, Cronometro, Curva, Frasco, Raio } from "@/components/icones"
import { ALTA_PERFORMANCE, ORDEM_ALTA_PERFORMANCE, type Beneficios } from "@/conteudo/alta-performance"
import { emReais } from "@/lib/formato"
import { buscarProdutoPorHandle, precosDe } from "@/lib/medusa"
import { PARCELA_MINIMA, PARCELAS_SEM_JUROS } from "@/lib/site"
import { PalcoAltaPerformance } from "./palco-alta-performance"

/**
 * "Alta Performance": um palco que troca de produto sozinho, e pra cada um
 * três cards — o que é, como se usa, o que esperar.
 *
 * A divisão de trabalho vale registrar: **o texto vem de
 * `conteudo/alta-performance.ts`, o resto vem do Medusa.** Nome, foto e preço
 * mudam no admin e mudam aqui junto; a redação muda por commit. No protótipo
 * os três preços estavam escritos no HTML — e já estavam errados em relação
 * ao catálogo quando fui conferir.
 *
 * Produto que não existe no catálogo não vira slide, mesmo tendo texto. Com
 * menos de dois, a seção inteira sai: palco de um slide é só um bloco com
 * bolinha inútil embaixo.
 */
export async function AltaPerformance() {
  const encontrados = await Promise.all(
    ORDEM_ALTA_PERFORMANCE.map(async (handle) => {
      const produto = await buscarProdutoPorHandle(handle)
      return produto ? { produto, texto: ALTA_PERFORMANCE[handle] } : null
    })
  )
  const slides = encontrados.filter((s): s is NonNullable<typeof s> => s !== null)
  if (slides.length < 2) return null

  return (
    <PalcoAltaPerformance rotulos={slides.map((s) => s.texto.nomeCurto)}>
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
  texto: Beneficios
  indice: number
  total: number
}) {
  const precos = precosDe(produto)
  const caminho = `/produtos/${produto.handle}` as const
  const parcela = precos ? precos.atual / PARCELAS_SEM_JUROS : 0

  return (
    <div
      className="benefits__slide"
      id={`perf-slide-${indice}`}
      role="group"
      aria-roledescription="slide"
      aria-label={`${indice + 1} de ${total}: ${texto.nomeCurto}`}
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

        <Link href={caminho} className="btn benefits__compra">
          Comprar
          <Carrinho className="btn__icone" />
        </Link>
      </div>

      <div className="benefits__grid">
        <article className="benefit-card">
          <Frasco className="benefit-card__icon" />
          <Chapeu>O Produto</Chapeu>
          <h4 className="benefit-card__heading">{texto.produto.titulo}</h4>
          <p className="benefit-card__text">{texto.produto.texto}</p>
        </article>

        <article className="benefit-card">
          <Cronometro className="benefit-card__icon" />
          <Chapeu>Modo de Uso</Chapeu>
          <h4 className="benefit-card__heading">{texto.uso.titulo}</h4>
          <p className="benefit-card__text">{texto.uso.texto}</p>
          <ol className="benefit-card__steps">
            {texto.uso.passos.map((passo, n) => (
              <li key={passo}>
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
          <p
            className="benefit-card__stat"
            aria-label={`${texto.resultado.numero} ${texto.resultado.unidade}`}
          >
            <span className="benefit-card__stat-number">{texto.resultado.numero}</span>
            <span className="benefit-card__stat-unit">{texto.resultado.unidade}</span>
          </p>
          <p className="benefit-card__stat-caption">{texto.resultado.legenda}</p>
          <p className="benefit-card__text">{texto.resultado.texto}</p>
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
