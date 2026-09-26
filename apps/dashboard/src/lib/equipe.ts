import type { Route } from "next"
import type { NomeDoIcone } from "@/components/icones"

/**
 * A EQUIPE E O MENU, do lado do painel — nomes, ícones e endereços.
 *
 * QUEM ABRE O QUÊ NÃO MORA AQUI: é o backend que responde
 * (`apps/backend/src/lib/equipe/regras.ts`, pela `GET /dashboard/eu`), e é
 * ele que barra cada rota. O menu só mostra as áreas que vieram na resposta.
 */

export type Papel = "dono" | "operacao" | "marketing"
export type Situacao = "convidado" | "ativo" | "removido"

export type Area =
  | "inicio"
  | "pedidos"
  | "estornos"
  | "carrinhos"
  | "produtos"
  | "editarProdutos"
  | "cupons"
  | "clientes"
  | "newsletter"
  | "home"
  | "marketing"
  | "metaDoMes"
  | "observabilidade"
  | "configuracoes"
  | "equipe"

/** O membro como a API devolve (`membroPublico`, no backend). */
export type Membro = {
  id: string
  nome: string
  email: string
  papel: Papel
  situacao: Situacao
  convite_vence_em: string | null
  ultimo_acesso: string | null
}

export const PAPEIS: Papel[] = ["dono", "operacao", "marketing"]

export const NOME_DO_PAPEL: Record<Papel, string> = {
  dono: "Dono",
  operacao: "Operação",
  marketing: "Marketing",
}

/** O que cada papel faz, numa linha — o convite e a troca de papel mostram. */
export const RESUMO_DO_PAPEL: Record<Papel, string> = {
  dono: "tudo, com a equipe e as configurações",
  operacao: "pedidos, despacho, rastreio e os erros da loja",
  marketing: "os números de venda, home, cupons, carrinhos, newsletter e produtos",
}

type Item = { area: Area; nome: string; href: Route; icone: NomeDoIcone }

export const MENU: { grupo: string | null; itens: Item[] }[] = [
  { grupo: null, itens: [{ area: "inicio", nome: "Início", href: "/", icone: "inicio" }] },
  {
    grupo: "Vendas",
    itens: [
      { area: "pedidos", nome: "Pedidos", href: "/pedidos", icone: "pedidos" },
      { area: "carrinhos", nome: "Carrinhos abandonados", href: "/carrinhos", icone: "carrinho" },
    ],
  },
  {
    grupo: "Catálogo",
    itens: [
      { area: "produtos", nome: "Produtos", href: "/produtos", icone: "produtos" },
      { area: "cupons", nome: "Cupons e descontos", href: "/cupons", icone: "cupons" },
    ],
  },
  {
    grupo: "Pessoas",
    itens: [{ area: "clientes", nome: "Clientes", href: "/clientes", icone: "clientes" }],
  },
  {
    grupo: "Site",
    itens: [{ area: "home", nome: "Layout da home", href: "/home", icone: "home" }],
  },
  {
    grupo: "Análise",
    itens: [
      { area: "marketing", nome: "Marketing", href: "/marketing", icone: "grafico" },
      { area: "observabilidade", nome: "Observabilidade", href: "/observabilidade", icone: "olho" },
    ],
  },
  {
    grupo: null,
    itens: [
      { area: "configuracoes", nome: "Configurações", href: "/configuracoes", icone: "config" },
    ],
  },
]

/** As abas de baixo, no celular — as quatro de mais uso de cada papel, e o "Mais". */
export const ABAS_DO_CELULAR: Record<Papel, Area[]> = {
  dono: ["inicio", "pedidos", "produtos", "clientes"],
  operacao: ["inicio", "pedidos", "produtos", "clientes"],
  marketing: ["inicio", "carrinhos", "cupons", "home"],
}

/** O título curto de cada área, na barra de cima do celular. */
export const TITULO_CURTO: Record<Area, string> = {
  inicio: "Início",
  pedidos: "Pedidos",
  estornos: "Estornos",
  carrinhos: "Carrinhos",
  produtos: "Produtos",
  editarProdutos: "Produtos",
  cupons: "Cupons",
  clientes: "Clientes",
  newsletter: "Newsletter",
  home: "Layout da home",
  marketing: "Marketing",
  metaDoMes: "Marketing",
  observabilidade: "Observabilidade",
  configuracoes: "Configurações",
  equipe: "Equipe",
}

export function itemDa(area: Area): Item | undefined {
  for (const g of MENU) for (const i of g.itens) if (i.area === area) return i
  return undefined
}

/** A área de um endereço do painel — pra o menu saber onde está. */
export function areaDoCaminho(caminho: string): Area {
  const primeiro = caminho.split("/").filter(Boolean)[0] ?? ""
  const achada = MENU.flatMap((g) => g.itens).find((i) => i.href === `/${primeiro}`)
  return achada?.area ?? "inicio"
}

/** "Matheus Santana" → "MS". */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  const duas = partes.length > 1 ? [partes[0], partes[partes.length - 1]] : partes
  return (
    duas
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("")
      .slice(0, 2) || "?"
  )
}

/** Quem pode mexer em quê, em uma frase — pra tela "sem acesso". */
export const DONOS_DA_AREA: Partial<Record<Area, string>> = {
  pedidos: "Pedidos são da operação e do dono.",
  estornos: "Estorno é com o dono.",
  editarProdutos: "Quem edita produto é o marketing ou o dono.",
  cupons: "Cupons são do marketing e do dono.",
  newsletter: "A newsletter é do marketing e do dono.",
  home: "O layout da home é do marketing e do dono.",
  observabilidade: "A observabilidade é da operação e do dono.",
  configuracoes: "Configurações são só do dono.",
  equipe: "A equipe é só do dono.",
}
