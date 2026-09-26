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
import { AntesDepois } from "@/components/produto/antes-depois"
import { Avaliacoes } from "@/components/produto/avaliacoes"
import { Dobra } from "@/components/produto/dobra"
import { Duvidas } from "@/components/produto/duvidas"
import { Faixa } from "@/components/produto/faixa"
import { Funciona } from "@/components/produto/funciona"
import { Promessa } from "@/components/produto/promessa"
import { Quem } from "@/components/produto/quem"
import { Relacionados } from "@/components/produto/relacionados"
import { Rotina } from "@/components/produto/rotina"
import { Tempo } from "@/components/produto/tempo"
import { Versus } from "@/components/produto/versus"

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
    descricao: "Contador que zera todo dia à meia-noite (horário de Brasília).",
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
    descricao:
      "Avaliações e trechos de entrevistas com clientes passando de lado — até quatro de cada produto por visita.",
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
    nome: "Topo: fotos, preço e compra",
    descricao: "A primeira tela: galeria, preço, quantos frascos e o botão. Não desliga.",
    fixo: true,
    componente: Dobra,
  },

  {
    id: "produto.promessa",
    escopo: "produto",
    nome: "Benefícios",
    descricao: "A lista de benefícios, com a ressalva de que o resultado varia.",
    componente: Promessa,
  },
  {
    id: "produto.antes-depois",
    escopo: "produto",
    nome: "Antes e depois",
    descricao: "Só aparece quando existe caso com as duas fotos e autorização cadastrado.",
    componente: AntesDepois,
  },
  {
    id: "produto.tempo",
    escopo: "produto",
    nome: "Linha do tempo",
    descricao: "O calendário do tratamento, das duas semanas aos seis meses.",
    componente: Tempo,
  },
  {
    id: "produto.faixa",
    escopo: "produto",
    nome: "Faixa com foto",
    descricao: "A faixa larga com foto de fundo e a chamada pra voltar ao topo.",
    componente: Faixa,
  },
  {
    id: "produto.rotina",
    escopo: "produto",
    nome: "Rotina com outros produtos",
    descricao: "Limpa, trata e hidrata — com as caixinhas que levam tudo de uma vez.",
    componente: Rotina,
  },
  {
    id: "produto.funciona",
    escopo: "produto",
    nome: "Como funciona e modo de uso",
    descricao: "As duas caixas lado a lado: o que o produto faz e o que a pessoa faz.",
    componente: Funciona,
  },
  {
    id: "produto.versus",
    escopo: "produto",
    nome: "Comparação",
    descricao: "A comparação lado a lado — contra um frasco sem marca, nunca contra concorrente.",
    componente: Versus,
  },
  {
    id: "produto.quem",
    escopo: "produto",
    nome: "Pra quem é",
    descricao: "As duas colunas. A do 'não é' é a que mais vende — e a que evita reembolso.",
    componente: Quem,
  },
  {
    id: "produto.duvidas",
    escopo: "produto",
    nome: "Perguntas frequentes",
    descricao: "O acordeão, e o FAQ que o Google lê — os dois saem da mesma lista.",
    componente: Duvidas,
  },
  {
    id: "produto.avaliacoes",
    escopo: "produto",
    nome: "Avaliações",
    descricao:
      "Avaliações e trechos de entrevistas com clientes do produto. Só aparece quando existe um dos dois.",
    componente: Avaliacoes,
  },
  {
    id: "produto.relacionados",
    escopo: "produto",
    nome: "Produtos relacionados",
    descricao: "Carrossel com o resto do catálogo, começando pela mesma categoria.",
    componente: Relacionados,
  },
] as const
