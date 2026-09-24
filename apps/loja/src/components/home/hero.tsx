import Link from "next/link"
import { Raio } from "@/components/icones"
import { home } from "@/lib/medusa"

/** O "check" das garantias — o mesmo desenho do fechamento. */
function Certo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" className={className}>
      <path d="M9.15 19.55 1.75 12.15l1.6-1.6h2.5l3.3 3.3 8.5-8.5h2.5l1.6 1.6z" />
    </svg>
  )
}

/**
 * O bloco escuro do meio da home.
 *
 * É a única seção da página com `<h1>`, e por isso ela não é opcional: sem
 * ela a home começaria em `<h2>`, o que quebra a ordem de títulos e tira do
 * leitor de tela a frase que diz do que a página trata. O banner lá em cima
 * parece o título, mas é campanha — muda quando a promoção muda, e título de
 * página não pode depender disso.
 *
 * O texto vem do painel ("Layout da home"), com o aviso de que as
 * afirmações precisam ser conferidas: "aprovado em estudo interno" é
 * alegação sobre cosmético, e isso no Brasil tem regra. O comparativo, as
 * garantias e o aviso de baixo são opcionais: sem eles, a linha não sai.
 */
export async function Hero() {
  const { hero } = (await home()).conteudo
  return (
    <section className="hero hero--com-faixa" aria-labelledby="hero-heading">
      <p className="hero__eyebrow">
        <Raio className="hero__eyebrow-bolt" />
        {hero.chapeu}
      </p>

      <h1 id="hero-heading" className="hero__title">
        {hero.titulo}
      </h1>

      {hero.comparativo.length ? (
        <dl className="hero__compare">
          {hero.comparativo.map((item, i) => (
            <div className="hero__compare-item" key={`${i}-${item.rotulo}`}>
              <dt>{item.rotulo}</dt>
              <dd>{item.valor}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <Link href="#vitrine" className="btn btn--branco hero__cta">
        {hero.chamada}
        <Raio className="btn__bolt" />
      </Link>

      {hero.garantias.length ? (
        <>
          <hr className="hero__divider" aria-hidden="true" />

          <ul className="hero__trust">
            {hero.garantias.map((g, i) => (
              <li key={`${i}-${g}`}>
                <Certo className="hero__check" />
                <span>{g}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {hero.aviso ? <p className="hero__disclaimer">{hero.aviso}</p> : null}
    </section>
  )
}
