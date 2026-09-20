import { Raio, Relogio } from "@/components/icones"
import { conteudoDaPdp } from "@/conteudo/produto"

/**
 * TEMPO — o calendário do resultado.
 *
 * A objeção real deste produto não é preço, é "será que funciona". E o maior
 * motivo de reembolso não é o produto falhar: é o cara desistir na semana 2,
 * quando ainda não era pra ter acontecido nada.
 *
 * Dizer o prazo na cara dura faz três coisas de uma vez: posiciona como
 * tratamento sério em vez de milagre, segura o reembolso de quem desistiria
 * cedo, e — a que mais importa pro caixa — justifica o kit de três frascos
 * sem precisar empurrar nada. Quem entende que o marco é o dia 90 faz a
 * conta sozinho.
 *
 * `<dl>` e não `<ul>`: cada passo é um par prazo/o-que-acontece, que é
 * exatamente o que uma lista de definição descreve. Leitor de tela anuncia
 * os dois ligados.
 */
export async function Tempo({ handle }: { handle: string }) {
  const c = (await conteudoDaPdp(handle)).tempo
  if (!c) return null

  return (
    <section className="tempo" aria-labelledby="tempo-titulo">
      <div className="tempo__wrap">
        <h2 className="tempo__titulo" id="tempo-titulo">
          <Relogio />
          {c.titulo}
        </h2>

        <dl className="tempo__trilha">
          {c.passos.map((p) => (
            <div
              key={p.quando}
              className={p.alvo ? "tempo__passo tempo__passo--alvo" : "tempo__passo"}
            >
              <p className="tempo__quando">
                <Raio /> {p.quando}
              </p>
              <dt>{p.titulo}</dt>
              <dd>{p.texto}</dd>
            </div>
          ))}
        </dl>

        {c.aviso ? (
          <p className="tempo__aviso">
            <Raio />
            <span>{c.aviso}</span>
          </p>
        ) : null}
      </div>
    </section>
  )
}
