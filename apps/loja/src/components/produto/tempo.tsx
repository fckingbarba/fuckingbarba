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
 * Cada passo é um item de `<ol>` — é uma sequência no tempo — com o par
 * título/texto num `<dl>` dele. Leitor de tela anuncia "lista, 4 itens" e,
 * em cada um, os dois ligados. Até a entrega 0105 era um `<dl>` só com o
 * prazo (`<p>`) solto dentro de cada grupo, o que o `<dl>` não aceita: o
 * Lighthouse tirava 3 pontos de acessibilidade de toda página com a seção.
 *
 * Sem o aviso embaixo, desde 26/09 (pedido da loja: a seção fica mais enxuta).
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

        <ol className="tempo__trilha">
          {c.passos.map((p) => (
            <li
              key={p.quando}
              className={p.alvo ? "tempo__passo tempo__passo--alvo" : "tempo__passo"}
            >
              <p className="tempo__quando">
                <Raio /> {p.quando}
              </p>
              <dl>
                <dt>{p.titulo}</dt>
                <dd>{p.texto}</dd>
              </dl>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
