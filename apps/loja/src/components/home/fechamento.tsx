import Image from "next/image"
import Link from "next/link"
import { Raio } from "@/components/icones"
import { FECHAMENTO } from "@/conteudo/home"
import { emReais } from "@/lib/formato"
import { buscarProdutoPorHandle } from "@/lib/medusa"
import { FRETE_GRATIS_ACIMA_DE, parcelamento } from "@/lib/site"

/** O "check" das garantias — só aqui, não vale a pena virar ícone geral. */
function Certo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M9.15 19.55 1.75 12.15l1.6-1.6h2.5l3.3 3.3 8.5-8.5h2.5l1.6 1.6z" />
    </svg>
  )
}

/**
 * A última chamada, no fim da home.
 *
 * A foto é fundo, e quem garante a leitura do texto branco é o degradê escuro
 * por cima — não a foto. Isso é de propósito: assim dá pra trocar a imagem sem
 * ter que reavaliar contraste a cada troca. Sem foto nenhuma a seção também
 * funciona, ficando só no escuro.
 *
 * As três garantias repetem o que a barra de vantagens e o rodapé já dizem, e
 * pela mesma fonte — se o frete grátis mudar, muda nos três lugares junto.
 */
export async function Fechamento() {
  const produto = await buscarProdutoPorHandle(FECHAMENTO.fotoDe)

  /*
   * A terceira linha era "Barba na cara ou sua grana de volta". Essa garantia
   * não existe, e aqui ela aparecia no fecho da home — o último argumento
   * antes do rodapé, que é onde uma promessa pega mais. Ver o comentário em
   * `layout/anuncio.tsx`: trocada pelo direito de arrependimento, que é lei.
   */
  const garantias = [
    `Frete grátis acima de ${emReais(FRETE_GRATIS_ACIMA_DE)}`,
    `${parcelamento} no cartão`,
    "7 dias pra desistir, por lei",
  ]

  return (
    <section className="fechamento" aria-labelledby="fechamento-titulo">
      {produto?.thumbnail ? (
        <div className="fechamento__foto">
          <Image
            src={produto.thumbnail}
            alt=""
            width={1600}
            height={700}
            loading="lazy"
            sizes="100vw"
          />
        </div>
      ) : null}
      <span className="fechamento__tape" aria-hidden="true" />

      <div className="fechamento__wrap">
        <div className="fechamento__miolo">
          <p className="fechamento__kicker">
            <Raio /> {FECHAMENTO.chapeu}
          </p>
          <h2 className="fechamento__titulo" id="fechamento-titulo">
            {FECHAMENTO.titulo}
          </h2>
          <Link href="#vitrine" className="btn">
            {FECHAMENTO.chamada}
            <Raio className="btn__bolt" />
          </Link>
        </div>

        <ul className="fechamento__garantias">
          {garantias.map((g) => (
            <li key={g}>
              <Certo /> {g}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
