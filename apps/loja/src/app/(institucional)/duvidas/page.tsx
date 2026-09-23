import type { Metadata } from "next"
import Link from "next/link"
import { Abertura, P, Secao, Titulo } from "@/components/institucional/texto"
import { Realce } from "@/components/realce"
import { duvidasDaLoja, textoPuro, type Paragrafo } from "@/conteudo/duvidas"
import { configuracoes } from "@/lib/medusa"
import { site } from "@/lib/site"
// O acordeão desta página é o das dúvidas da PDP (as mesmas classes
// `duvidas__*`), e o CSS dele não mora mais no globals.css.
import "@/estilos/pdp-duvidas.css"

export const metadata: Metadata = {
  title: "Dúvidas frequentes",
  description: `Pagamento, entrega, trocas e conta: as perguntas mais comuns de quem compra na ${site.nome}.`,
  alternates: { canonical: "/duvidas" },
}

/**
 * DÚVIDAS FREQUENTES — as perguntas sobre a LOJA.
 *
 * O texto mora em `conteudo/duvidas.ts`, junto com as regras do que pode ser
 * respondido (só o que a loja cumpre hoje, nenhum canal citado, dado que
 * falta some a frase) e o formato dos links. Aqui é só o desenho.
 *
 * ┌─ O ACORDEÃO É O DA PÁGINA DE PRODUTO ──────────────────────────────────┐
 * │ `<details>` nativo com as mesmas classes `duvidas__*`                  │
 * │ (`estilos/pdp-duvidas.css`, que é global). Quem já abriu as perguntas  │
 * │ de um produto reconhece o desenho, e o comportamento vem junto: sem    │
 * │ JavaScript, responde ao teclado, e abrir uma não fecha as outras —     │
 * │ quem compara duas respostas precisa das duas abertas. Fica de fora só  │
 * │ o fundo menta da seção `.duvidas` de lá: aqui é página de texto, no    │
 * │ branco das outras (ver `estilos/institucional.css`).                   │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * TODAS COMEÇAM FECHADAS, ao contrário da PDP. Lá a primeira abre porque é
 * a mais feita sobre AQUELE produto; aqui a primeira coisa que a pessoa faz
 * é correr o olho pelas perguntas atrás da dela, e uma resposta aberta logo
 * no começo empurra todas as outras pra baixo da dobra.
 *
 * O JSON-LD sai das mesmas perguntas, do mesmo array, pelo `textoPuro` — a
 * única forma de a busca nunca ler uma coisa e a página mostrar outra.
 */
export default async function Duvidas() {
  const grupos = duvidasDaLoja(await configuracoes())

  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: grupos
      .flatMap((g) => g.duvidas)
      .map((d) => ({
        "@type": "Question",
        name: d.pergunta,
        acceptedAnswer: { "@type": "Answer", text: d.resposta.map(textoPuro).join(" ") },
      })),
  }

  return (
    <>
      <Titulo>Dúvidas frequentes</Titulo>

      <Abertura>
        Pagamento, entrega, trocas e conta — as perguntas que mais aparecem por aqui. Não achou a
        sua? <Link href="/contato">Fala com a gente</Link>.
      </Abertura>

      <nav aria-label="Assuntos" className="mt-6">
        <ul className="flex flex-wrap gap-x-5 gap-y-2 font-bold">
          {grupos.map((g) => (
            <li key={g.id}>
              <a href={`#${g.id}`}>{g.titulo}</a>
            </li>
          ))}
        </ul>
      </nav>

      {grupos.map((g) => (
        <Secao key={g.id} id={g.id} titulo={g.titulo}>
          {g.duvidas.map((d) => (
            <details className="duvidas__item" key={d.pergunta}>
              <summary>
                {d.pergunta}
                <span className="duvidas__mais" aria-hidden="true" />
              </summary>
              <div className="duvidas__resposta">
                {d.resposta.map((paragrafo, i) => (
                  <p key={i}>
                    <Resposta paragrafo={paragrafo} />
                  </p>
                ))}
              </div>
            </details>
          ))}
        </Secao>
      ))}

      <Secao titulo="Não achou?">
        <P>
          <Link href="/contato">Fala com a gente</Link> — dúvida de produto, de pedido ou de
          qualquer outra coisa.
        </P>
      </Secao>

      <script
        type="application/ld+json"
        // Quase tudo aqui é texto nosso, mas o prazo de postagem vem do admin
        // como texto livre — e um `</script>` digitado lá fecharia esta tag
        // no meio. Trocado pelo escape unicode, o `<` continua o mesmo
        // caractere pra quem lê o JSON, e não fecha tag nenhuma.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faq).replace(/</g, "\\u003c") }}
      />
    </>
  )
}

/**
 * Um parágrafo da resposta: o texto passa pelo `<Realce>` (o `*assim*`), e o
 * link vira `<Link>` com o destino que o compilador já conferiu.
 */
function Resposta({ paragrafo }: { paragrafo: Paragrafo }) {
  if (typeof paragrafo === "string") return <Realce texto={paragrafo} />
  return (
    <>
      {paragrafo.map((t, i) =>
        typeof t === "string" ? (
          <Realce key={i} texto={t} />
        ) : (
          <Link key={i} href={t.para}>
            {t.texto}
          </Link>
        )
      )}
    </>
  )
}
