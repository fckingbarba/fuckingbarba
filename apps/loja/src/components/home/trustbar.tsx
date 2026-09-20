import { Caminhao, Cartao, Escudo, EscudoCerto } from "@/components/icones"
import { frasesDoFrete } from "@/lib/configuracoes"
import { configuracoes } from "@/lib/medusa"
import { parcelamento } from "@/lib/site"

/**
 * A barra preta logo abaixo do banner: as quatro respostas que o visitante
 * procura antes de olhar preço — quanto custa o frete, dá pra parcelar, o
 * site é seguro, e se der errado.
 *
 * O frete sai das configurações do Medusa, não de uma constante: é o mesmo
 * número que a esteira, o rodapé e o CARRINHO usam. Sem promoção de frete, a
 * barra mostra três vantagens em vez de quatro — porque a alternativa seria
 * um card dizendo "Frete Grátis" numa loja que não dá frete grátis.
 */
const OUTRAS = [
  { Icone: Cartao, titulo: parcelamento, detalhe: "No cartão de crédito" },
  { Icone: Escudo, titulo: "Loja Segura", detalhe: "Para suas compras" },
  { Icone: EscudoCerto, titulo: "Compra Garantida", detalhe: "Satisfação garantida" },
]

export async function Trustbar() {
  const { frete } = await configuracoes()
  const frases = frasesDoFrete(frete)

  const VANTAGENS = frases
    ? [{ Icone: Caminhao, titulo: frases.selo, detalhe: frases.condicao }, ...OUTRAS]
    : OUTRAS

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
