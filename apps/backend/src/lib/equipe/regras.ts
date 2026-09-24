import { normalizarEmail } from "../../modules/codigo/regras"

/**
 * AS REGRAS DA EQUIPE DO PAINEL — quem abre o quê, e as mudanças que a loja
 * não deixa fazer. Código puro, testado em `__tests__/regras.unit.spec.ts`.
 *
 * ┌─ A PERMISSÃO VALE AQUI, NO SERVIDOR ───────────────────────────────────┐
 * │ O painel esconde do menu o que o papel não abre, mas quem barra é a    │
 * │ rota: cada uma pergunta `podeAbrir(papel, area)` antes de responder, e │
 * │ o que o papel não vê nem sai daqui. Esconder botão não é permissão —   │
 * │ o endereço digitado na mão, ou a chamada direta ao Medusa, esbarram    │
 * │ nesta tabela do mesmo jeito.                                           │
 * └────────────────────────────────────────────────────────────────────────┘
 */

export const PAPEIS = ["dono", "operacao", "marketing"] as const
export type Papel = (typeof PAPEIS)[number]
export type Situacao = "convidado" | "ativo" | "removido"

export const NOME_DO_PAPEL: Record<Papel, string> = {
  dono: "Dono",
  operacao: "Operação",
  marketing: "Marketing",
}

export function ehPapel(valor: unknown): valor is Papel {
  return typeof valor === "string" && (PAPEIS as readonly string[]).includes(valor)
}

/**
 * As áreas do painel e quem abre cada uma — a matriz da tela "Equipe e
 * acessos" do protótipo. A área nova entra aqui ANTES da rota dela existir:
 * rota sem linha nesta tabela não abre pra ninguém.
 */
export const ACESSO = {
  inicio: ["dono", "operacao", "marketing"],
  pedidos: ["dono", "operacao"],
  carrinhos: ["dono", "operacao", "marketing"],
  produtos: ["dono", "operacao", "marketing"],
  cupons: ["dono", "marketing"],
  clientes: ["dono", "operacao", "marketing"],
  home: ["dono", "marketing"],
  observabilidade: ["dono", "operacao"],
  configuracoes: ["dono"],
  equipe: ["dono"],
} as const satisfies Record<string, readonly Papel[]>

export type Area = keyof typeof ACESSO

/** Os nomes do menu do painel — os mesmos do protótipo. O convite lista com eles. */
export const NOME_DA_AREA: Record<Area, string> = {
  inicio: "Início",
  pedidos: "Pedidos",
  carrinhos: "Carrinhos abandonados",
  produtos: "Produtos",
  cupons: "Cupons e descontos",
  clientes: "Clientes",
  home: "Layout da home",
  observabilidade: "Observabilidade",
  configuracoes: "Configurações",
  equipe: "Equipe e acessos",
}

export function podeAbrir(papel: Papel, area: Area): boolean {
  return (ACESSO[area] as readonly Papel[]).includes(papel)
}

export function areasDo(papel: Papel): Area[] {
  return (Object.keys(ACESSO) as Area[]).filter((area) => podeAbrir(papel, area))
}

/** O convite vale 7 dias: depois disso o e-mail não recebe código até o dono reenviar. */
export const DIAS_DO_CONVITE = 7
const DIA = 24 * 60 * 60 * 1000

export function conviteVenceEm(convidadoEm: Date | string | null | undefined): Date | null {
  if (!convidadoEm) return null
  const inicio = new Date(convidadoEm).getTime()
  return Number.isFinite(inicio) ? new Date(inicio + DIAS_DO_CONVITE * DIA) : null
}

/**
 * Quem pode receber código pra entrar: o ativo, e o convidado com convite
 * dentro do prazo. Removido, nunca.
 */
export function podeEntrar(
  membro: { situacao: Situacao; convidado_em?: Date | string | null } | null | undefined,
  agora = Date.now()
): boolean {
  if (!membro) return false
  if (membro.situacao === "ativo") return true
  if (membro.situacao !== "convidado") return false
  const vence = conviteVenceEm(membro.convidado_em)
  return Boolean(vence && agora < vence.getTime())
}

/**
 * O e-mail do primeiro dono, do `DASHBOARD_DONO_EMAIL` do Railway — ou null.
 * Ele só vale enquanto a equipe não tem nenhum dono ativo: é a porta de
 * entrada do primeiro acesso, e a de emergência se um dia faltar dono. Com
 * um dono ativo, quem manda na equipe é o painel, e trocar a variável não
 * muda nada.
 */
export function donoDoRailway(): string | null {
  return normalizarEmail(process.env.DASHBOARD_DONO_EMAIL)
}

/**
 * O nome do primeiro dono, que chega só com o e-mail:
 * "matheus.saviczki@gmail.com" → "Matheus Saviczki".
 */
export function nomeDoEmail(email: string): string {
  const local = email.split("@")[0] ?? ""
  const nome = local
    .split(/[._+-]+/)
    .map((parte) => parte.replace(/\d+/g, ""))
    .filter(Boolean)
    .map((parte) => parte[0].toUpperCase() + parte.slice(1))
    .join(" ")
    .slice(0, 80)
  return nome.length >= 2 ? nome : "Dono"
}

/* ── o convite ────────────────────────────────────────────────────────────── */

export type Convite = { nome: string; email: string; papel: Papel }

export type LeituraDoConvite =
  | { ok: true; convite: Convite }
  | { ok: false; motivo: "nome_invalido" | "email_invalido" | "papel_invalido" }

export function lerConvite(corpo: unknown): LeituraDoConvite {
  const c = (corpo ?? {}) as { nome?: unknown; email?: unknown; papel?: unknown }
  const nome = typeof c.nome === "string" ? c.nome.replace(/\s+/g, " ").trim() : ""
  if (nome.length < 2 || nome.length > 80) return { ok: false, motivo: "nome_invalido" }
  const email = normalizarEmail(c.email)
  if (!email) return { ok: false, motivo: "email_invalido" }
  if (!ehPapel(c.papel)) return { ok: false, motivo: "papel_invalido" }
  return { ok: true, convite: { nome, email, papel: c.papel } }
}

/* ── as mudanças que a loja não deixa fazer ───────────────────────────────── */

export type Mudanca = { tipo: "papel"; papel: Papel } | { tipo: "remover" } | { tipo: "reenviar" }

/** O corpo de `POST /dashboard/equipe/:id`: `{ papel }` ou `{ acao }`. Null se não for nenhum dos dois. */
export function lerMudanca(corpo: unknown): Mudanca | null {
  const c = (corpo ?? {}) as { papel?: unknown; acao?: unknown }
  if (c.acao === "remover") return { tipo: "remover" }
  if (c.acao === "reenviar") return { tipo: "reenviar" }
  if (c.acao === undefined && ehPapel(c.papel)) return { tipo: "papel", papel: c.papel }
  return null
}

export type PodeMudar =
  | { ok: true }
  | { ok: false; motivo: "nao_e_dono" | "a_si_mesmo" | "ultimo_dono" | "ja_removido" | "ja_entrou" }

/**
 * `donosAtivos` conta os donos com situação `ativo`, incluindo o alvo se ele
 * for um. As regras, na ordem em que são conferidas:
 *   - só o dono mexe na equipe;
 *   - ninguém muda o próprio papel nem se remove — outro dono faz. É o que
 *     impede alguém de se trancar do lado de fora sem querer;
 *   - a loja nunca fica sem dono ativo: o último não perde o papel nem sai;
 *   - reenviar convite é só pra quem ainda não entrou.
 */
export function podeMudar({
  quem,
  alvo,
  mudanca,
  donosAtivos,
}: {
  quem: { id: string; papel: Papel }
  alvo: { id: string; papel: Papel; situacao: Situacao }
  mudanca: Mudanca
  donosAtivos: number
}): PodeMudar {
  if (quem.papel !== "dono") return { ok: false, motivo: "nao_e_dono" }
  if (alvo.situacao === "removido") return { ok: false, motivo: "ja_removido" }
  if (mudanca.tipo === "reenviar")
    return alvo.situacao === "convidado" ? { ok: true } : { ok: false, motivo: "ja_entrou" }
  if (quem.id === alvo.id) return { ok: false, motivo: "a_si_mesmo" }
  const deixaDeSerDono =
    alvo.papel === "dono" && (mudanca.tipo === "remover" || mudanca.papel !== "dono")
  if (deixaDeSerDono && alvo.situacao === "ativo" && donosAtivos <= 1)
    return { ok: false, motivo: "ultimo_dono" }
  return { ok: true }
}

const ORDEM_DA_SITUACAO: Record<Situacao, number> = { ativo: 0, convidado: 1, removido: 2 }

/** A lista da tela da equipe: quem já entrou primeiro, o dono no alto, e por nome. */
export function emOrdem<T extends { nome: string; papel: Papel; situacao: Situacao }>(
  membros: T[]
): T[] {
  return [...membros].sort(
    (a, b) =>
      ORDEM_DA_SITUACAO[a.situacao] - ORDEM_DA_SITUACAO[b.situacao] ||
      PAPEIS.indexOf(a.papel) - PAPEIS.indexOf(b.papel) ||
      a.nome.localeCompare(b.nome, "pt-BR")
  )
}

/** O que sai da API sobre um membro — sem nada que o painel não mostre. */
export function membroPublico(m: {
  id: string
  nome: string
  email: string
  papel: Papel
  situacao: Situacao
  convidado_em?: Date | string | null
  ultimo_acesso?: Date | string | null
}) {
  return {
    id: m.id,
    nome: m.nome,
    email: m.email,
    papel: m.papel,
    situacao: m.situacao,
    convite_vence_em:
      m.situacao === "convidado" ? (conviteVenceEm(m.convidado_em)?.toISOString() ?? null) : null,
    ultimo_acesso: m.ultimo_acesso ? new Date(m.ultimo_acesso).toISOString() : null,
  }
}
