import { Raio } from "@/components/icones"
import { conteudoDaPdp } from "@/conteudo/produto"

/**
 * PRA QUEM É, PRA QUEM NÃO É.
 *
 * A coluna da direita é a que mais vende, e é a que quase ninguém tem
 * coragem de escrever. Ela faz três coisas que nenhum texto elogioso faz:
 * evita a compra que vira reembolso, prova que a página não está tentando
 * vender pra qualquer um, e — no caso deste produto — é o único lugar que
 * manda procurar dermatologista, que é a orientação certa pra quem não tem
 * folículo na região.
 *
 * Por isso as duas colunas têm o mesmo peso visual. Encolher a do "não"
 * seria desfazer o que ela veio fazer.
 */
export async function Quem({ handle }: { handle: string }) {
  const c = (await conteudoDaPdp(handle)).quem
  if (!c) return null

  return (
    <section className="quem" aria-labelledby="quem-titulo">
      <div className="quem__wrap">
        <h2 className="quem__titulo" id="quem-titulo">
          <Raio />
          {c.titulo}
        </h2>

        <div className="quem__colunas">
          <div className="quem__coluna quem__coluna--sim">
            <h3>
              <Certo />
              É, se você
            </h3>
            <ul>
              {c.sim.map((item) => (
                <li key={item}>
                  <Certo /> {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="quem__coluna quem__coluna--nao">
            <h3>
              <Xis />
              Não é, se você
            </h3>
            <ul>
              {c.nao.map((item) => (
                <li key={item}>
                  <Xis /> {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

/* Os dois ícones moram aqui: só esta seção usa, e virar ícone geral só
   aumentaria a lista que todo mundo precisa ler pra achar o que quer. */

function Certo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M9.15 19.55 1.75 12.15l1.6-1.6h2.5l3.3 3.3 8.5-8.5h2.5l1.6 1.6z" />
    </svg>
  )
}

function Xis() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M5.2 3.6 12 10.4l6.8-6.8 1.6 1.6L13.6 12l6.8 6.8-1.6 1.6L12 13.6l-6.8 6.8-1.6-1.6L10.4 12 3.6 5.2z" />
    </svg>
  )
}
