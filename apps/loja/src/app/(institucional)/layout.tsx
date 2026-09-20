/**
 * Páginas de texto (privacidade, termos, trocas). O cabeçalho e o rodapé vêm
 * do layout raiz; aqui só a medida da linha — texto corrido acima de uns 70
 * caracteres por linha fica cansativo de ler.
 *
 * A classe `institucional` é o gancho do CSS: é ela que troca o fundo menta
 * da loja por branco e faz o link dentro do texto parecer link. Está em
 * `estilos/institucional.css`, com o porquê.
 */
export default function LayoutInstitucional({ children }: { children: React.ReactNode }) {
  return (
    <main
      id="conteudo"
      className="institucional mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-14"
    >
      <article>{children}</article>
    </main>
  )
}
