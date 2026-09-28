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
import type { SecaoDaHome } from "./registro"

/**
 * AS SEÇÕES DA HOME, na ordem padrão. O que cada campo quer dizer, e por que
 * a home e a PDP têm cada uma o seu arquivo, está em `registro.ts`.
 */
export const SECOES_DA_HOME: readonly SecaoDaHome[] = [
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
    descricao: "Faixa de produtos que rola de lado, dos mais vendidos pros menos.",
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
    descricao: "Grade com os 8 mais vendidos e o botão pra ver todos.",
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
] as const
