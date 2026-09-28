/**
 * O ESQUELETO DE UMA TELA — o que aparece NO CLIQUE, enquanto o Medusa
 * responde (os `loading.tsx`). Tem o desenho da tela que vem: o título, os
 * números de cima, a lista ou as duas colunas. O menu fica onde está.
 *
 * Sem ele, o painel não mudava nada até a resposta inteira chegar, e o clique
 * parecia perdido. Com ele, o Next guarda o esqueleto de cada link do menu
 * de antemão (o prefetch) e a troca de tela é na hora.
 *
 * CLASSES PRÓPRIAS (`esq-*`, `osso*`), nunca as da tela de verdade: o React
 * mostra o conteúdo que chegou em lotes, e por um instante o esqueleto e a
 * tela moram juntos na página — um conferidor que espera `.numeros` ou
 * `.bloco` acharia o esqueleto.
 */

/**
 * `aba`: só o miolo, pra quem tem o título e as abas no layout (as
 * Configurações) — o esqueleto entra embaixo delas.
 */
type Forma = "inicio" | "lista" | "detalhe" | "abas" | "aba"

export function Esqueleto({ forma }: { forma: Forma }) {
  return (
    <div className="esqueleto" data-esqueleto={forma} aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando…</span>
      {forma === "detalhe" ? <i className="osso osso--voltar" /> : null}
      {forma !== "aba" ? (
        <>
          <i className="osso osso--titulo" />
          <i className="osso osso--sub" />
        </>
      ) : null}
      {forma === "inicio" ? <Inicio /> : null}
      {forma === "lista" ? <Lista /> : null}
      {forma === "detalhe" ? <Detalhe /> : null}
      {forma === "abas" ? <Abas /> : null}
      {forma === "aba" ? <Aba /> : null}
    </div>
  )
}

const Linhas = ({ n }: { n: number }) => (
  <>
    {Array.from({ length: n }, (_, i) => (
      <div key={i} className="osso-linha">
        <i className="osso osso--quadrado" />
        <span>
          <i className="osso osso--texto" />
          <i className="osso osso--texto-curto" />
        </span>
        <i className="osso osso--valor" />
      </div>
    ))}
  </>
)

function Numeros() {
  return (
    <div className="esq-numeros">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="esq-numero">
          <i className="osso osso--rotulo" />
          <i className="osso osso--numero" />
        </div>
      ))}
    </div>
  )
}

/** O Início (0186): a fila em faixa, a barra do período, os números e as duas colunas. */
function Inicio() {
  return (
    <>
      <div className="esq-bloco">
        <i className="osso osso--rotulo" />
        <Linhas n={1} />
      </div>
      <i className="osso osso--busca" />
      <Numeros />
      <div className="esq-grade">
        <div className="esq-bloco">
          <i className="osso osso--rotulo" />
          <Linhas n={5} />
        </div>
        <div className="esq-bloco">
          <i className="osso osso--rotulo" />
          <Linhas n={5} />
        </div>
      </div>
    </>
  )
}

function Lista() {
  return (
    <>
      <i className="osso osso--busca" />
      <div className="osso-fitas">
        {[0, 1, 2, 3].map((i) => (
          <i key={i} className="osso osso--fita" />
        ))}
      </div>
      <div className="esq-bloco esq-bloco--lista">
        <Linhas n={8} />
      </div>
    </>
  )
}

function Detalhe() {
  return (
    <div className="esq-grade esq-grade--detalhe">
      <div>
        <div className="esq-bloco">
          <i className="osso osso--rotulo" />
          <Linhas n={3} />
        </div>
        <div className="esq-bloco">
          <i className="osso osso--rotulo" />
          <Linhas n={4} />
        </div>
      </div>
      <div>
        <div className="esq-bloco">
          <i className="osso osso--rotulo" />
          <i className="osso osso--texto" />
          <i className="osso osso--texto-curto" />
        </div>
      </div>
    </div>
  )
}

function Abas() {
  return (
    <>
      <div className="osso-fitas">
        {[0, 1, 2, 3, 4].map((i) => (
          <i key={i} className="osso osso--aba" />
        ))}
      </div>
      <Numeros />
      <div className="esq-bloco">
        <i className="osso osso--rotulo" />
        <Linhas n={4} />
      </div>
    </>
  )
}

function Aba() {
  return (
    <div className="esq-bloco">
      <i className="osso osso--rotulo" />
      <Linhas n={4} />
    </div>
  )
}
