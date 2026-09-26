import { Raio } from "@/components/icones"
import { Realce } from "@/components/realce"
import { conteudoDaPdp } from "@/conteudo/produto"

/**
 * PROMESSA — o que muda na sua cara.
 *
 * Primeira coisa depois da dobra, de propósito: benefício vende e mecanismo
 * só convence depois. Na loja de hoje isso está no meio de um textão que
 * ninguém lê.
 *
 * SEM A RESSALVA EMBAIXO, desde 26/09 (entrega 0105, pedido da loja: a
 * seção fica mais enxuta). O "resultado varia" e o "não faz nascer onde não
 * existe folículo" continuam na página: nas Perguntas frequentes e no "Pra
 * quem é" de cada produto, e embaixo dos casos de antes e depois.
 */
export async function Promessa({ handle }: { handle: string }) {
  const c = (await conteudoDaPdp(handle)).promessa
  if (!c) return null

  return (
    <section className="promessa" aria-labelledby="promessa-titulo">
      <div className="promessa__wrap">
        <p className="promessa__chapeu">
          <Raio />
          {c.chapeu}
        </p>

        <h2 className="promessa__titulo" id="promessa-titulo">
          <Realce texto={c.titulo} como="em" />
        </h2>

        <ul className="promessa__lista">
          {c.itens.map((item) => (
            <li key={item}>
              <Raio /> {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
