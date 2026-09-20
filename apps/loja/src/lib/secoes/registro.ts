import type { ComponentType } from "react"
import { AltaPerformance } from "@/components/home/alta-performance"
import { Amam } from "@/components/home/amam"
import { Banner } from "@/components/home/banner"
import { Colecao } from "@/components/home/colecao"
import { Fechamento } from "@/components/home/fechamento"
import { Hero } from "@/components/home/hero"
import { Ofertas } from "@/components/home/ofertas"
import { Provas } from "@/components/home/provas"
import { Sobre } from "@/components/home/sobre"
import { Trustbar } from "@/components/home/trustbar"
import { Vitrine } from "@/components/home/vitrine"
import { Dobra } from "@/components/produto/dobra"

/**
 * O REGISTRO DE SEÇÕES
 *
 * Toda seção de página montável da loja se declara aqui, uma vez, em ordem.
 * A página não escreve mais `<Banner /> <Trustbar /> <Ofertas />` na mão: ela
 * percorre esta lista. É o que permite ligar, desligar e reordenar seção sem
 * tocar em componente — que é o que o painel vai fazer.
 *
 * A ORDEM DESTE ARRAY É A ORDEM PADRÃO DA PÁGINA. Não existe uma segunda
 * lista em lugar nenhum dizendo a ordem, de propósito: duas listas é como
 * uma seção nova acaba existindo no código e sumindo do painel, ou o
 * contrário. O que o banco guarda depois é só a DIFERENÇA em relação a isto
 * aqui (ver `layout.ts`).
 *
 * A ordem também não é aleatória — ela é o argumento da página. Na PDP:
 * promessa, depois prazo, depois prova, depois oferta complementar, depois
 * comparação. Embaralhar continua "funcionando" e vende menos, então o
 * painel que vier deve mostrar qual é a ordem recomendada e ter um "voltar
 * ao padrão" à vista.
 *
 * SOBRE O PAINEL (quando ele existir): ele lê este mesmo registro pra
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
type SecaoDaHome = Comum & { escopo: "home"; componente: ComponentType }
type SecaoDoProduto = Comum & { escopo: "produto"; componente: ComponentType<{ handle: string }> }

export type Secao = SecaoDaHome | SecaoDoProduto

export const SECOES: readonly Secao[] = [
  /* ---------------------------------------------------------------- HOME */
  {
    id: "home.banner",
    escopo: "home",
    nome: "Banner de campanha",
    descricao: "A peça grande do topo, com a campanha da vez.",
    componente: Banner,
  },
  {
    id: "home.trustbar",
    escopo: "home",
    nome: "Barra de vantagens",
    descricao: "Frete, parcelamento e segurança, em uma linha.",
    componente: Trustbar,
  },
  {
    id: "home.ofertas",
    escopo: "home",
    nome: "Ofertas relâmpago",
    descricao: "Só aparece quando existe promoção com data de fim no catálogo.",
    componente: Ofertas,
  },
  {
    id: "home.colecao",
    escopo: "home",
    nome: "Carrossel de coleção",
    descricao: "Faixa de produtos que rola de lado.",
    componente: Colecao,
  },
  {
    id: "home.hero",
    escopo: "home",
    nome: "Bloco escuro de marca",
    descricao: "O título principal da página. Não desliga: é o <h1> da home.",
    fixo: true,
    componente: Hero,
  },
  {
    id: "home.alta-performance",
    escopo: "home",
    nome: "Alta performance",
    descricao: "Palco com um produto por vez e o texto editorial dele.",
    componente: AltaPerformance,
  },
  {
    id: "home.provas",
    escopo: "home",
    nome: "Prova social",
    descricao: "Só aparece quando existe depoimento de cliente cadastrado.",
    componente: Provas,
  },
  {
    id: "home.amam",
    escopo: "home",
    nome: "Esteira de avaliações",
    descricao: "Avaliações passando de lado, em duas faixas.",
    componente: Amam,
  },
  {
    id: "home.vitrine",
    escopo: "home",
    nome: "Vitrine",
    descricao: "Grade com o catálogo inteiro.",
    componente: Vitrine,
  },
  {
    id: "home.sobre",
    escopo: "home",
    nome: "Sobre a marca",
    descricao: "A história, com foto e números.",
    componente: Sobre,
  },
  {
    id: "home.fechamento",
    escopo: "home",
    nome: "Última chamada",
    descricao: "Faixa de foto com a chamada final e as garantias.",
    componente: Fechamento,
  },

  /* ------------------------------------------------------------- PRODUTO */
  {
    id: "produto.dobra",
    escopo: "produto",
    nome: "Foto, preço e compra",
    descricao: "A primeira tela: galeria, preço, quantos frascos e o botão. Não desliga.",
    fixo: true,
    componente: Dobra,
  },

  /*  As outras seções da PDP entram aqui conforme forem portadas do
     protótipo (`ferramentas/porte/prototipo-pdp.html`), nesta ordem:

       produto.promessa ...... o que muda na sua cara
       produto.antes-depois .. os pares de foto
       produto.tempo ......... o calendário de 90 dias
       produto.faixa ......... a faixa de foto
       produto.rotina ........ monte a rotina
       produto.funciona ...... como funciona + modo de uso
       produto.versus ........ o nosso e o genérico
       produto.quem .......... pra quem é / pra quem não é
       produto.duvidas ....... perguntas frequentes
       produto.avaliacoes .... o que dizem de quem usou
       produto.relacionados .. quem leva este, leva junto

     Os preços de kit da dobra (R$ 149,90 por dois, R$ 222,90 por três) são
     produtos de verdade no Medusa desde `backend/src/scripts/kits-de-
     quantidade.ts` — SKU e estoque próprios, amarrados ao avulso por
     metadata. O que a dobra mostra é o que o carrinho cobra, conferido com
     kit de verdade num Medusa local. O preço deixou de ser texto na página.

     O custo dessa escolha está escrito no cabeçalho daquele script e vale
     repetir aqui, porque é ele que vai cobrar: SÃO TRÊS ESTOQUES SEPARADOS
     PARA O MESMO FRASCO. Vender kit não baixa o avulso.
  */
] as const
