import { Raio } from "@/components/icones"
import { conteudoDaPdp } from "@/conteudo/produto"

/**
 * DÚVIDAS — o acordeão, e o FAQ que o Google lê.
 *
 * `<details>` nativo, sem JavaScript: abre, fecha, responde ao teclado e
 * funciona antes de qualquer bundle carregar. O acordeão em JS que quase
 * todo mundo escreve existe pra fechar os outros ao abrir um — comportamento
 * que atrapalha exatamente quem está comparando duas respostas.
 *
 * O JSON-LD SAI DAS MESMAS PERGUNTAS que a tela mostra, do mesmo array.
 * Structured data que diz uma coisa e página que mostra outra é motivo de
 * penalização manual, não só de perder o rich result — e a única forma de
 * garantir que não divirjam é não manter duas listas.
 *
 * A primeira vem aberta: quem chega aqui tem uma pergunta, e a primeira é a
 * mais feita. Acordeão inteiro fechado obriga um clique pra descobrir se
 * vale ler.
 */
export async function Duvidas({ handle }: { handle: string }) {
  const c = (await conteudoDaPdp(handle)).duvidas
  if (!c?.perguntas.length) return null

  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: c.perguntas.map((p) => ({
      "@type": "Question",
      name: p.pergunta,
      acceptedAnswer: { "@type": "Answer", text: p.resposta.join(" ") },
    })),
  }

  return (
    <section className="duvidas" id="duvidas" aria-labelledby="duvidas-titulo">
      <div className="duvidas__wrap">
        <h2 className="duvidas__titulo" id="duvidas-titulo">
          <Raio />
          {c.titulo}
        </h2>

        {c.perguntas.map((p, i) => (
          <details className="duvidas__item" key={p.pergunta} open={i === 0}>
            <summary>
              {p.pergunta}
              <span className="duvidas__mais" aria-hidden="true" />
            </summary>
            <div className="duvidas__resposta">
              {p.resposta.map((paragrafo) => (
                <p key={paragrafo}>{paragrafo}</p>
              ))}
            </div>
          </details>
        ))}
      </div>

      <script
        type="application/ld+json"
        // O conteúdo é nosso e é texto puro (o tipo não deixa entrar HTML),
        // então não há entrada de terceiro pra escapar aqui.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faq) }}
      />
    </section>
  )
}
