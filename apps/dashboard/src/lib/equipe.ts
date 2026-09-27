import type { Route } from "next"
import type { NomeDoIcone } from "@/components/icones"

/**
 * A EQUIPE E O MENU, do lado do painel — nomes, ícones e endereços.
 *
 * QUEM ABRE O QUÊ NÃO MORA AQUI: é o backend que responde
 * (`apps/backend/src/lib/equipe/regras.ts`, o padrão com o que o dono mudou
 * na tabela da equipe, pela `GET /dashboard/eu`), e é ele que barra cada
 * rota. O menu só mostra as áreas que vieram na resposta.
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
  | "crm"
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

/** As colunas com caixinha na tabela da equipe: o dono abre tudo, sempre. */
export const PAPEIS_AJUSTAVEIS = ["operacao", "marketing"] as const
export type PapelAjustavel = (typeof PAPEIS_AJUSTAVEIS)[number]

/** Quem abre o quê, como a `GET /dashboard/equipe` devolve: pra cada área, os papéis. */
export type Matriz = Record<Area, Papel[]>

export const NOME_DO_PAPEL: Record<Papel, string> = {
  dono: "Dono",
  operacao: "Operação",
  marketing: "Marketing",
}

/**
 * As linhas da tabela "O que cada papel abre", na ordem do menu. O que mora
 * dentro de outra área leva o nome dela na frente ("Produtos: editar a
 * página"): é um botão ou uma aba de lá.
 */
export const NOME_DA_LINHA: Record<Area, string> = {
  inicio: "Início",
  pedidos: "Pedidos",
  estornos: "Pedidos: tentar o estorno de novo",
  carrinhos: "Carrinhos abandonados",
  produtos: "Produtos",
  editarProdutos: "Produtos: editar a página",
  cupons: "Cupons e descontos",
  clientes: "Clientes",
  newsletter: "Clientes: a newsletter",
  crm: "CRM",
  home: "Layout da home",
  marketing: "Marketing",
  metaDoMes: "Marketing: mudar a meta do mês",
  observabilidade: "Observabilidade",
  configuracoes: "Configurações",
  equipe: "Equipe e acessos",
}

/** "a, b e c" */
export function juntar(itens: string[]): string {
  if (itens.length <= 1) return itens.join("")
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`
}

/**
 * O que o papel abre, numa linha, com os nomes do menu — o convite e a
 * troca de papel mostram. Sai da tabela de agora (a que o dono ajusta), e
 * não de uma frase fixa que um dia discordaria dela.
 */
export function resumoDoPapel(acesso: Partial<Record<Area, readonly Papel[]>>, papel: Papel) {
  if (papel === "dono") return "abre tudo, com a equipe e os acessos"
  const nomes = MENU.flatMap((g) => g.itens)
    .filter((i) => i.area !== "inicio" && acesso[i.area]?.includes(papel))
    .map((i) => i.nome)
  return nomes.length ? `abre ${juntar(nomes)}` : "abre só o Início"
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
    itens: [
      { area: "clientes", nome: "Clientes", href: "/clientes", icone: "clientes" },
      { area: "crm", nome: "CRM", href: "/crm", icone: "email" },
    ],
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
      // Direto na primeira aba: o `/configuracoes` só redireciona, e custava uma ida a mais.
      {
        area: "configuracoes",
        nome: "Configurações",
        href: "/configuracoes/empresa",
        icone: "config",
      },
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
  crm: "CRM",
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
  // Pelo primeiro pedaço do endereço do menu: o das Configurações já abre na aba.
  const achada = MENU.flatMap((g) => g.itens).find((i) => i.href.split("/")[1] === primeiro)
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

/**
 * A frase de quem esbarrou numa área que o papel não abre — na tela "sem
 * acesso" e no aviso de um botão que o Medusa recusou. Quem abre o quê é a
 * tabela do dono, que muda: a frase não diz de quem a área é, diz a quem
 * pedir.
 */
export function semAcessoA(area: Area): string {
  return `O dono não liberou “${NOME_DA_LINHA[area]}” pro seu papel. Se você precisa, peça pra ele, em Configurações → Equipe e acessos.`
}
