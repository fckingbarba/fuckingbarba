import type { ComponentType } from "react"

/**
 * O REGISTRO DE SEÇÕES
 *
 * Toda seção de página montável da loja se declara uma vez, em ordem, na
 * lista da página dela: `SECOES_DA_HOME` (`registro-da-home.ts`) e
 * `SECOES_DO_PRODUTO` (`registro-do-produto.ts`). Aqui moram os tipos que as
 * duas seguem. A página não escreve mais `<Banner /> <Trustbar /> <Ofertas />`
 * na mão: ela percorre a lista dela. É o que permite ligar, desligar e
 * reordenar seção sem tocar em componente — que é o que o painel vai fazer.
 *
 * A ORDEM DO ARRAY É A ORDEM PADRÃO DA PÁGINA. Não existe uma segunda
 * lista em lugar nenhum dizendo a ordem, de propósito: duas listas é como
 * uma seção nova acaba existindo no código e sumindo do painel, ou o
 * contrário. O que o banco guarda depois é só a DIFERENÇA em relação à
 * lista (ver `layout.ts`).
 *
 * ┌─ UMA LISTA POR PÁGINA, CADA UMA NO SEU ARQUIVO (entrega 0194) ──────────┐
 * │ Quem importa uma lista importa os componentes dela, e o Next manda pro  │
 * │ navegador o JavaScript de toda peça de cliente que esses componentes    │
 * │ usam — pelo que o módulo importa, não pelo que a página desenha (e o    │
 * │ Turbopack não tira export que ninguém usa). Com as duas listas num      │
 * │ arquivo só, a home baixava a galeria com zoom, a barra de compra, os    │
 * │ kits e a rotina da PDP (~10 KB comprimidos, um degrau inteiro do LCP no │
 * │ Lighthouse do CI), e a PDP, os carrosséis da home. Este arquivo não     │
 * │ importa componente nenhum: seção nova entra na lista da página dela.    │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * A ordem também não é aleatória — ela é o argumento da página. Na PDP:
 * promessa, depois prazo, depois prova, depois oferta complementar, depois
 * comparação. Embaralhar continua "funcionando" e vende menos, então o
 * painel que vier deve mostrar qual é a ordem recomendada e ter um "voltar
 * ao padrão" à vista.
 *
 * SOBRE O PAINEL (quando ele existir): ele lê estes mesmos registros pra
 * desenhar a lista de olhinhos. `nome` e `descricao` existem pra isso — são
 * o que uma pessoa lê, não o `id`. O `id` é chave de banco: uma vez
 * publicado, não muda, senão todo produto que tiver ajuste salvo aponta pra
 * uma seção que não existe mais.
 */

export type Escopo = "home" | "produto"

type Comum = {
  /** Chave estável. É o que vai pro banco — não renomeie depois de publicado. */
  id: string
  /** O nome que a pessoa lê no painel. */
  nome: string
  /** Uma linha de ajuda no painel, pra saber o que a seção é sem abrir o site. */
  descricao: string
  /**
   * Seção que não desliga nem move: foto, título, preço, botão de comprar.
   * Sem esta trava alguém desliga o bloco de compra numa sexta à noite.
   */
  fixo?: boolean
  /** Nasce desligada; só aparece onde alguém ligar de propósito. */
  ocultaPorPadrao?: boolean
}

/**
 * Componente sem props (home) e componente que precisa do produto (PDP) têm
 * assinaturas diferentes, e é por isso que `Secao` é união em vez de um tipo
 * só com `handle?: string`. Com o handle opcional, toda seção de produto
 * precisaria checar se ele existe — um `if` inútil repetido em dez arquivos
 * pra silenciar o compilador.
 */
export type SecaoDaHome = Comum & { escopo: "home"; componente: ComponentType }
export type SecaoDoProduto = Comum & {
  escopo: "produto"
  componente: ComponentType<{ handle: string }>
}

export type Secao = SecaoDaHome | SecaoDoProduto
