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
import type { SecaoDoProduto } from "./registro"

/**
 * AS SEÇÕES DA PÁGINA DO PRODUTO, na ordem padrão — a ordem é o argumento da
 * página (ver `registro.ts`). O painel tem os gêmeos desta lista (o
 * `SECOES_DA_PAGINA` do backend e o `SECOES` do painel): seção nova entra
 * nos três.
 */
export const SECOES_DO_PRODUTO: readonly SecaoDoProduto[] = [
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
    descricao: "A lista de benefícios.",
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
    descricao: "Avaliações de quem comprou o produto. Só aparece quando existe alguma.",
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
