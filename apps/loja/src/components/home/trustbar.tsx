import { Caminhao, Cartao, Escudo, EscudoCerto } from "@/components/icones"
import { emReais } from "@/lib/formato"
import { FRETE_GRATIS_ACIMA_DE, parcelamento } from "@/lib/site"

/**
 * A barra preta logo abaixo do banner: as quatro respostas que o visitante
 * procura antes de olhar preço — quanto custa o frete, dá pra parcelar, o
 * site é seguro, e se der errado.
 *
 * Os dois números que aparecem aqui (piso do frete grátis e parcelamento)
 * vêm do mesmo lugar que a esteira e o rodapé usam. Dito de outro jeito: se
 * um dia o frete grátis mudar, ele muda numa linha e em toda a loja junto —
 * em vez de mudar em três telas e ficar errado na quarta.
 */
const VANTAGENS = [
  {
    Icone: Caminhao,
    titulo: "Frete Grátis",
    detalhe: `Em compras acima de ${emReais(FRETE_GRATIS_ACIMA_DE)}`,
  },
  { Icone: Cartao, titulo: parcelamento, detalhe: "No cartão de crédito" },
  { Icone: Escudo, titulo: "Loja Segura", detalhe: "Para suas compras" },
  { Icone: EscudoCerto, titulo: "Compra Garantida", detalhe: "Satisfação garantida" },
]

export function Trustbar() {
  return (
    <section className="trustbar" aria-label="Vantagens da compra">
      <ul className="trustbar__list">
        {VANTAGENS.map(({ Icone, titulo, detalhe }) => (
          <li className="trustbar__item" key={titulo}>
            <span className="trustbar__icon-frame">
              <Icone className="trustbar__icon" />
            </span>
            <span className="trustbar__copy">
              <span className="trustbar__title">{titulo}</span>
              <span className="trustbar__subtitle">{detalhe}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
