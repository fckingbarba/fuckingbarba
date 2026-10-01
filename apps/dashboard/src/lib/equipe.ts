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

/** Os três papéis de sempre. */
export type PapelFixo = "dono" | "operacao" | "marketing"
/** Um papel criado pelo dono na tela da equipe ("Atendimento"): o id dele no Medusa. */
export type PapelPersonalizado = `papel_${string}`
export type Papel = PapelFixo | PapelPersonalizado
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
  | "contatos"
  | "crm"
  | "avaliacoes"
  | "criadores"
  | "whatsapp"
  | "home"
  | "marketing"
  | "metaDoMes"
  | "financeiro"
  | "observabilidade"
  | "configuracoes"
  | "equipe"

/** O membro como a API devolve (`membroPublico`, no backend). */
export type Membro = {
  id: string
  nome: string
  email: string
  papel: Papel
  /**
   * O nome do papel, já escrito: o dos três de sempre, ou o que o dono deu.
   * Pode faltar enquanto o Medusa de antes da 0223 ainda responde (o painel
   * sobe antes): aí, `nomeDoPapel`.
   */
  papel_nome?: string
  situacao: Situacao
  convite_vence_em: string | null
  ultimo_acesso: string | null
}

export const PAPEIS: PapelFixo[] = ["dono", "operacao", "marketing"]

/** As colunas de sempre com caixinha na tabela da equipe: o dono abre tudo, sempre. */
export const PAPEIS_AJUSTAVEIS = ["operacao", "marketing"] as const
export type PapelAjustavel = (typeof PAPEIS_AJUSTAVEIS)[number]

/** Toda coluna com caixinha: a operação, o marketing e os papéis que o dono criou. */
export type PapelDaTabela = PapelAjustavel | PapelPersonalizado

/** Um papel que o dono criou, como a `GET /dashboard/equipe` devolve. */
export type PapelCriado = { id: PapelPersonalizado; nome: string; pessoas: number }

export function ehPersonalizado(valor: unknown): valor is PapelPersonalizado {
  return typeof valor === "string" && /^papel_[0-9A-Za-z]{10,40}$/.test(valor)
}

/** Quem abre o quê, como a `GET /dashboard/equipe` devolve: pra cada área, os papéis. */
export type Matriz = Record<Area, Papel[]>

export const NOME_DO_PAPEL: Record<PapelFixo, string> = {
  dono: "Dono",
  operacao: "Operação",
  marketing: "Marketing",
}

/** O nome de um papel: o dos três de sempre, ou o que o dono deu (`criados`). */
export function nomeDoPapel(papel: Papel, criados: readonly { id: string; nome: string }[] = []) {
  if (!ehPersonalizado(papel)) return NOME_DO_PAPEL[papel]
  return criados.find((p) => p.id === papel)?.nome ?? "Papel apagado"
}

/**
 * As linhas da tabela "O que cada papel abre", na ordem do menu. O que mora
 * dentro de outra área leva o nome dela na frente ("Produtos: editar a
 * página"): é um botão ou uma aba de lá. Os contatos não são tela: são o
 * telefone e o endereço dos clientes, em Clientes e nos Carrinhos.
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
  contatos: "Telefone e endereço dos clientes",
  crm: "CRM",
  avaliacoes: "Avaliações",
  criadores: "Criadores",
  whatsapp: "WhatsApp",
  home: "Layout da home",
  marketing: "Marketing",
  metaDoMes: "Marketing: mudar a meta do mês",
  financeiro: "Financeiro",
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
  if (!nomes.length) return "abre só o Início"
  const comContatos = acesso.contatos?.includes(papel)
    ? ", com telefone e endereço dos clientes"
    : ""
  return `abre ${juntar(nomes)}${comContatos}`
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
      { area: "whatsapp", nome: "WhatsApp", href: "/whatsapp", icone: "whatsapp" },
      { area: "crm", nome: "CRM", href: "/crm", icone: "email" },
      { area: "avaliacoes", nome: "Avaliações", href: "/avaliacoes", icone: "estrela" },
      { area: "criadores", nome: "Criadores", href: "/criadores", icone: "play" },
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
      { area: "financeiro", nome: "Financeiro", href: "/financeiro", icone: "dinheiro" },
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
export const ABAS_DO_CELULAR: Record<PapelFixo, Area[]> = {
  dono: ["inicio", "pedidos", "produtos", "clientes"],
  operacao: ["inicio", "pedidos", "produtos", "clientes"],
  marketing: ["inicio", "carrinhos", "cupons", "home"],
}

/**
 * As abas de baixo de quem entra: as do papel, se ele abre — e, no papel
 * criado pelo dono, as quatro primeiras do menu que ele abre.
 */
export function abasDoCelular(papel: Papel, pode: (area: Area) => boolean): Area[] {
  if (!ehPersonalizado(papel)) return ABAS_DO_CELULAR[papel].filter(pode)
  return MENU.flatMap((g) => g.itens)
    .map((i) => i.area)
    .filter(pode)
    .slice(0, 4)
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
  contatos: "Clientes",
  crm: "CRM",
  avaliacoes: "Avaliações",
  criadores: "Criadores",
  whatsapp: "WhatsApp",
  home: "Layout da home",
  marketing: "Marketing",
  metaDoMes: "Marketing",
  financeiro: "Financeiro",
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
