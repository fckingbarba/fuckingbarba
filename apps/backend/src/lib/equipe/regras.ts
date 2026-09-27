import { normalizarEmail } from "../../modules/codigo/regras"

/**
 * AS REGRAS DA EQUIPE DO PAINEL — quem abre o quê, e as mudanças que a loja
 * não deixa fazer. Código puro, testado em `__tests__/regras.unit.spec.ts`.
 *
 * ┌─ A PERMISSÃO VALE AQUI, NO SERVIDOR ───────────────────────────────────┐
 * │ O painel esconde do menu o que o papel não abre, mas quem barra é a    │
 * │ rota: cada uma pergunta à matriz de agora (`exigirArea`, em            │
 * │ `acesso.ts`) antes de responder, e o que o papel não vê nem sai daqui. │
 * │ Esconder botão não é permissão — o endereço digitado na mão, ou a      │
 * │ chamada direta ao Medusa, esbarram nesta tabela do mesmo jeito.        │
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
 * COMO A LOJA NASCE: as áreas do painel e quem abre cada uma — a matriz da
 * tela "Equipe e acessos" do protótipo. O dono muda as colunas da operação
 * e do marketing pelo painel (Configurações → Equipe e acessos); o banco
 * guarda só a DIFERENÇA deste padrão (a tabela `equipe_acesso`), e
 * `matrizCom` junta os dois. A área nova entra aqui ANTES da rota dela
 * existir, já com os papéis que abrem: rota sem linha nesta tabela não abre
 * pra ninguém, e a linha nova vale o padrão até o dono mudar.
 *
 * Nem toda linha é tela: `estornos` é o botão "Tentar o estorno de novo",
 * dentro do pedido — mexe em dinheiro de cliente, então tem linha própria
 * (a operação vê o pedido e a faixa do estorno, mas não aperta). E
 * `editarProdutos` é mexer na página do produto (textos, seções, fundos,
 * caixa de compra, publicar): a operação abre os produtos e só lê. A
 * `newsletter` é a aba de Clientes com quem aceitou ofertas por e-mail: do
 * marketing e do dono, que baixam e tiram da lista — a operação vê os
 * clientes, e não a lista de e-mails. O `crm` é o que a loja anota do que
 * cada pessoa faz, ligado ao e-mail dela: do marketing e do dono, como a
 * newsletter. As `avaliacoes` são as notas que chegam pela página
 * `/avaliar`, pra aprovar ou recusar: dos três — o marketing cuida do que
 * vai pro site, a operação lê a reclamação de quem recebeu (o número do
 * pedido, na tela, só pra quem abre os pedidos). O `marketing` é a área dos
 * números de venda (o Resumo, a meta); mudar a `metaDoMes`, no padrão, é só
 * do dono.
 */
export const ACESSO_PADRAO = {
  inicio: ["dono", "operacao", "marketing"],
  pedidos: ["dono", "operacao"],
  estornos: ["dono"],
  carrinhos: ["dono", "operacao", "marketing"],
  produtos: ["dono", "operacao", "marketing"],
  editarProdutos: ["dono", "marketing"],
  cupons: ["dono", "marketing"],
  clientes: ["dono", "operacao", "marketing"],
  newsletter: ["dono", "marketing"],
  crm: ["dono", "marketing"],
  avaliacoes: ["dono", "operacao", "marketing"],
  home: ["dono", "marketing"],
  marketing: ["dono", "marketing"],
  metaDoMes: ["dono"],
  observabilidade: ["dono", "operacao"],
  configuracoes: ["dono"],
  equipe: ["dono"],
} as const satisfies Record<string, readonly Papel[]>

export type Area = keyof typeof ACESSO_PADRAO

/** As áreas, na ordem do menu (a da tabela acima). */
export const AREAS = Object.keys(ACESSO_PADRAO) as Area[]

export function ehArea(valor: unknown): valor is Area {
  return typeof valor === "string" && (AREAS as readonly string[]).includes(valor)
}

/** Os nomes do menu do painel — os mesmos do protótipo. O convite lista com eles. */
export const NOME_DA_AREA: Record<Area, string> = {
  inicio: "Início",
  pedidos: "Pedidos",
  estornos: "Estornos",
  carrinhos: "Carrinhos abandonados",
  produtos: "Produtos",
  editarProdutos: "Editar produtos",
  cupons: "Cupons e descontos",
  clientes: "Clientes",
  newsletter: "Newsletter",
  crm: "CRM",
  avaliacoes: "Avaliações",
  home: "Layout da home",
  marketing: "Marketing",
  metaDoMes: "Meta do mês",
  observabilidade: "Observabilidade",
  configuracoes: "Configurações",
  equipe: "Equipe e acessos",
}

/**
 * OS PAPÉIS QUE O DONO AJUSTA. O dono abre tudo, sempre: nenhum clique na
 * tabela tira do dono uma área da loja, nem deixa a loja sem quem mexa nos
 * acessos.
 */
export const PAPEIS_AJUSTAVEIS = ["operacao", "marketing"] as const
export type PapelAjustavel = (typeof PAPEIS_AJUSTAVEIS)[number]

export function ehAjustavel(valor: unknown): valor is PapelAjustavel {
  return typeof valor === "string" && (PAPEIS_AJUSTAVEIS as readonly string[]).includes(valor)
}

/**
 * AS LINHAS QUE NÃO MUDAM. O `inicio` abre pra todo papel: é onde o painel
 * cai depois de entrar. E a `equipe` é só do dono: quem ganhasse ela daria
 * acesso a si mesmo — e convidar, trocar papel e remover já são só do dono
 * (`podeMudar`).
 */
export const AREAS_FIXAS: readonly Area[] = ["inicio", "equipe"]

/**
 * O QUE MORA DENTRO DE OUTRA ÁREA — um botão ou uma aba dela. Só abre com a
 * de fora aberta: o estorno é um botão do pedido; editar, dentro dos
 * produtos; a newsletter, uma aba de Clientes; a meta, um botão do
 * Marketing. A tela liga a de fora junto e desliga as de dentro junto; aqui
 * a regra vale na leitura e na gravação.
 */
export const DENTRO_DE: Partial<Record<Area, Area>> = {
  estornos: "pedidos",
  editarProdutos: "produtos",
  newsletter: "clientes",
  metaDoMes: "marketing",
}

/** A matriz de agora: pra cada área, os papéis que abrem. */
export type Matriz = Record<Area, readonly Papel[]>

/** Uma diferença do padrão, como o banco guarda: o papel abre (ou não) a área. */
export type Ajuste = { papel: PapelAjustavel; area: Area; abre: boolean }

const abreNoPadrao = (papel: Papel, area: Area) =>
  (ACESSO_PADRAO[area] as readonly Papel[]).includes(papel)

/** Monta a matriz de "o papel abre a área?", fechando o que mora dentro de área fechada. */
function montar(abre: (papel: Papel, area: Area) => boolean): Matriz {
  const aberta = (papel: Papel, area: Area): boolean => {
    const fora = DENTRO_DE[area]
    return abre(papel, area) && (!fora || aberta(papel, fora))
  }
  const matriz = {} as Record<Area, Papel[]>
  for (const area of AREAS) matriz[area] = PAPEIS.filter((papel) => aberta(papel, area))
  return matriz
}

/**
 * A MATRIZ DE AGORA — o padrão com os ajustes do dono por cima. Ajuste que
 * não vale mais (área que saiu do código, linha fixa, papel que não se
 * ajusta) não conta. E o que mora dentro de outra área fecha com ela, diga
 * o banco o que disser.
 */
export function matrizCom(
  ajustes: readonly { papel: string; area: string; abre: boolean | null }[]
): Matriz {
  const mudou = new Map<string, boolean>()
  for (const a of ajustes)
    if (ehAjustavel(a.papel) && ehArea(a.area) && !AREAS_FIXAS.includes(a.area))
      mudou.set(`${a.papel}/${a.area}`, a.abre === true)
  return montar((papel, area) => mudou.get(`${papel}/${area}`) ?? abreNoPadrao(papel, area))
}

/** A loja sem ajuste nenhum. */
export const MATRIZ_PADRAO: Matriz = matrizCom([])

export function podeAbrir(matriz: Matriz, papel: Papel, area: Area): boolean {
  return matriz[area].includes(papel)
}

export function areasDo(matriz: Matriz, papel: Papel): Area[] {
  return AREAS.filter((area) => podeAbrir(matriz, papel, area))
}

/* ── o dono mudando os acessos ────────────────────────────────────────────── */

export type LeituraDosAcessos =
  | { ok: true; matriz: Matriz }
  | { ok: false; motivo: "acessos_invalidos" | "linha_fixa" | "sem_a_area_de_fora" }

/**
 * O corpo de `POST /dashboard/acessos`:
 * `{ acesso: { operacao: Area[], marketing: Area[] } }` — TUDO o que cada
 * papel ajustável abre depois de salvar, e não só o que mudou: a tela manda
 * a coluna inteira, e duas abas salvando juntas não se misturam (vale a
 * última, inteira). Recusa área que não existe, linha fixa mexida e o que
 * mora dentro de uma área sem ela.
 */
export function lerAcessos(corpo: unknown): LeituraDosAcessos {
  const acesso = (corpo as { acesso?: unknown } | null | undefined)?.acesso
  if (!acesso || typeof acesso !== "object" || Array.isArray(acesso))
    return { ok: false, motivo: "acessos_invalidos" }
  const colunas = acesso as Record<string, unknown>
  if (Object.keys(colunas).some((papel) => !ehAjustavel(papel)))
    return { ok: false, motivo: "acessos_invalidos" }

  const abre = {} as Record<PapelAjustavel, Set<Area>>
  for (const papel of PAPEIS_AJUSTAVEIS) {
    const lista = colunas[papel]
    if (!Array.isArray(lista) || lista.length > AREAS.length * 2 || !lista.every(ehArea))
      return { ok: false, motivo: "acessos_invalidos" }
    abre[papel] = new Set(lista)
  }
  for (const papel of PAPEIS_AJUSTAVEIS) {
    for (const area of AREAS_FIXAS)
      if (abre[papel].has(area) !== abreNoPadrao(papel, area))
        return { ok: false, motivo: "linha_fixa" }
    for (const area of abre[papel]) {
      const fora = DENTRO_DE[area]
      if (fora && !abre[papel].has(fora)) return { ok: false, motivo: "sem_a_area_de_fora" }
    }
  }
  const matriz = montar((papel, area) =>
    ehAjustavel(papel) ? abre[papel].has(area) : abreNoPadrao(papel, area)
  )
  return { ok: true, matriz }
}

/** O que o banco guarda de uma matriz: só onde ela difere do padrão. */
export function ajustesDa(matriz: Matriz): Ajuste[] {
  return mudancasEntre(MATRIZ_PADRAO, matriz)
}

/**
 * O que mudou de uma matriz pra outra, papel por papel, na ordem do menu —
 * pro registro de quem fez o quê e pro aviso da tela.
 */
export function mudancasEntre(antes: Matriz, depois: Matriz): Ajuste[] {
  const mudou: Ajuste[] = []
  for (const papel of PAPEIS_AJUSTAVEIS)
    for (const area of AREAS) {
      if (AREAS_FIXAS.includes(area)) continue
      const fica = depois[area].includes(papel)
      if (antes[area].includes(papel) !== fica) mudou.push({ papel, area, abre: fica })
    }
  return mudou
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
