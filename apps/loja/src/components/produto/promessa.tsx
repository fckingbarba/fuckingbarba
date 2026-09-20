import Link from "next/link"
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
 * O RODAPÉ NÃO É LETRA MIÚDA. "Resultado varia" e "não faz nascer onde não
 * existe folículo" são o que separa cosmético de promessa de milagre — e é
 * o que evita a compra que vira reembolso. Ele fica dentro da mesma seção da
 * lista de benefícios porque promessa e ressalva têm que ser lidas juntas;
 * jogada pro pé da página, a ressalva não cumpre função nenhuma.
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

        {c.rodape ? (
          <p className="promessa__rodape">
            {c.rodape}{" "}
            <Link href="#duvidas" style={{ color: "inherit" }}>
              leia isto antes
            </Link>
            .
          </p>
        ) : null}
      </div>
    </section>
  )
}
