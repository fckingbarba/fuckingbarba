import Image, { getImageProps } from "next/image"
import Link from "next/link"
import { Raio } from "@/components/icones"
import { frasesDoFrete } from "@/lib/configuracoes"
import { parcelamento } from "@/lib/site"
import { buscarProdutoPorHandle, configuracoes, home } from "@/lib/medusa"

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
 * O chapéu, o título, o botão e a foto vêm do painel ("Layout da home"): a
 * foto própria da faixa (a do computador e a do celular, trocada no ponto
 * em que a faixa vira uma coluna) ou, sem ela, a de um produto.
 */
export async function Fechamento() {
  const { fechamento } = (await home()).conteudo
  const produto =
    !fechamento.imagem && fechamento.fotoDe ? await buscarProdutoPorHandle(fechamento.fotoDe) : null

  /*
   * A terceira linha era "Barba na cara ou sua grana de volta". Essa garantia
   * não existe, e aqui ela aparecia no fecho da home — o último argumento
   * antes do rodapé, que é onde uma promessa pega mais. Depois foi o direito
   * de arrependimento, que saiu em 23/09 pelo mesmo motivo da esteira (ver
   * `layout/anuncio.tsx`): fecho de venda não é lugar de lembrar de devolver.
   */
  const frases = frasesDoFrete((await configuracoes()).frete)
  const garantias = [...(frases ? [frases.completa] : []), `${parcelamento} no cartão`]

  return (
    <section className="fechamento" aria-labelledby="fechamento-titulo">
      {fechamento.imagem ? (
        <FotoPropria computador={fechamento.imagem} celular={fechamento.imagemCelular} />
      ) : produto?.thumbnail ? (
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
            <Raio /> {fechamento.chapeu}
          </p>
          <h2 className="fechamento__titulo" id="fechamento-titulo">
            {fechamento.titulo}
          </h2>
          <Link href="#vitrine" className="btn">
            {fechamento.chamada}
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

/**
 * A foto própria da faixa: um `<picture>` pelo `getImageProps` do Next (a
 * "direção de arte"), com a do celular até 720 px — o corte em que a faixa
 * vira uma coluna (`fechamento.css`). Sem a do celular, ele usa a do
 * computador, cortada no meio.
 */
function FotoPropria({ computador, celular }: { computador: string; celular?: string }) {
  const comum = { alt: "", fill: true, sizes: "100vw" } as const
  const {
    props: { srcSet: doComputador, ...imagem },
  } = getImageProps({ ...comum, src: computador })
  const doCelular = celular ? getImageProps({ ...comum, src: celular }).props.srcSet : null
  return (
    <picture className="fechamento__foto">
      {doCelular ? <source media="(max-width: 720px)" srcSet={doCelular} sizes="100vw" /> : null}
      <img {...imagem} srcSet={doComputador} alt="" loading="lazy" decoding="async" />
    </picture>
  )
}
