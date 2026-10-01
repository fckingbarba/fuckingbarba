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

/** Os três papéis de sempre — os que a loja nasce com. */
export const PAPEIS = ["dono", "operacao", "marketing"] as const
export type PapelFixo = (typeof PAPEIS)[number]

/**
 * O PAPEL QUE O DONO CRIA — "Atendimento", "Financeiro", "Designer" —, com o
 * nome que ele deu e o que ele marcar na tabela. É o id da linha em
 * `equipe_papel` (`papel_01K…`), e é ele que fica no `papel` do membro e na
 * tabela `equipe_acesso`. Nasce abrindo só o Início (`abreNoPadrao`), ou o
 * mesmo que a operação ou o marketing abrem na hora (`areasDoPapelNovo`); o
 * resto, o dono marca.
 */
export type PapelPersonalizado = `papel_${string}`
export type Papel = PapelFixo | PapelPersonalizado
export type Situacao = "convidado" | "ativo" | "removido"

export const NOME_DO_PAPEL: Record<PapelFixo, string> = {
  dono: "Dono",
  operacao: "Operação",
  marketing: "Marketing",
}

export function ehPapelFixo(valor: unknown): valor is PapelFixo {
  return typeof valor === "string" && (PAPEIS as readonly string[]).includes(valor)
}

/** Tem a cara de um papel criado pelo dono — se ele existe mesmo, quem confere é a rota, no banco. */
export function ehPersonalizado(valor: unknown): valor is PapelPersonalizado {
  return typeof valor === "string" && /^papel_[0-9A-Za-z]{10,40}$/.test(valor)
}

export function ehPapel(valor: unknown): valor is Papel {
  return ehPapelFixo(valor) || ehPersonalizado(valor)
}

/**
 * O nome do papel, pra tela e pro e-mail: o dos três de sempre, ou o que o
 * dono deu (`nomes`, lido de `equipe_papel`).
 */
export function nomeDoPapel(papel: Papel, nomes: ReadonlyMap<string, string> = new Map()): string {
  return ehPapelFixo(papel) ? NOME_DO_PAPEL[papel] : (nomes.get(papel) ?? "Papel apagado")
}

/**
 * COMO A LOJA NASCE: as áreas do painel e quem abre cada uma — a matriz da
 * tela "Equipe e acessos" do protótipo. O dono muda as colunas da operação,
 * do marketing e dos papéis que ele cria pelo painel (Configurações →
 * Equipe e acessos); o banco guarda só a DIFERENÇA deste padrão (a tabela
 * `equipe_acesso`), e `matrizCom` junta os dois. A área nova entra aqui
 * ANTES da rota dela existir, já com os papéis que abrem: rota sem linha
 * nesta tabela não abre pra ninguém, e a linha nova vale o padrão até o dono
 * mudar (no papel criado pelo dono, o padrão é fechada).
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
 * pedido, na tela, só pra quem abre os pedidos). Os `criadores` são as
 * inscrições da página escondida `/criadores`, de quem quer gravar vídeo pra
 * loja: do marketing e do dono, que fecham com eles — a operação não vê
 * WhatsApp e e-mail de quem não é cliente. O `whatsapp` são as conversas de
 * quem escreve pro número da loja, com o atendente (a IA) e a equipe: do dono
 * e da operação, que resolvem troca, atraso e reclamação — têm telefone e
 * pedido de cliente, como os contatos. O `marketing` é a área dos
 * números de venda (o Resumo, a meta); mudar a `metaDoMes`, no padrão, é só
 * do dono. O `financeiro` é o DRE da loja, as despesas e o custo de cada
 * produto (o lucro, o pró-labore, o que se paga a cada um): só do dono no
 * padrão — ele libera pra quem cuidar das contas. Os `contatos` também não são tela: são o telefone, o endereço e a
 * cidade dos clientes (em Clientes e nos Carrinhos, com o botão do
 * WhatsApp), os pedidos na ficha de cada um e a lista inteira de clientes,
 * e não só quem aceitou ofertas — nos três de sempre, seguem o papel
 * (`AREAS_DO_PAPEL`).
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
  contatos: ["dono", "operacao"],
  crm: ["dono", "marketing"],
  avaliacoes: ["dono", "operacao", "marketing"],
  criadores: ["dono", "marketing"],
  whatsapp: ["dono", "operacao"],
  home: ["dono", "marketing"],
  marketing: ["dono", "marketing"],
  metaDoMes: ["dono"],
  financeiro: ["dono"],
  observabilidade: ["dono", "operacao"],
  configuracoes: ["dono"],
  equipe: ["dono"],
} as const satisfies Record<string, readonly PapelFixo[]>

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
  contatos: "Telefone e endereço dos clientes",
  crm: "CRM",
  avaliacoes: "Avaliações",
  criadores: "Criadores",
  whatsapp: "WhatsApp",
  home: "Layout da home",
  marketing: "Marketing",
  metaDoMes: "Meta do mês",
  financeiro: "Financeiro",
  observabilidade: "Observabilidade",
  configuracoes: "Configurações",
  equipe: "Equipe e acessos",
}

/**
 * OS PAPÉIS DE SEMPRE QUE O DONO AJUSTA. O dono abre tudo, sempre: nenhum
 * clique na tabela tira do dono uma área da loja, nem deixa a loja sem quem
 * mexa nos acessos. Os papéis que o dono cria também se ajustam, todos.
 */
export const PAPEIS_AJUSTAVEIS = ["operacao", "marketing"] as const
export type PapelAjustavel = (typeof PAPEIS_AJUSTAVEIS)[number]

/** As colunas com caixinha na tabela: a operação, o marketing e os papéis que o dono criou. */
export type PapelDaTabela = PapelAjustavel | PapelPersonalizado

export function ehAjustavel(valor: unknown): valor is PapelAjustavel {
  return typeof valor === "string" && (PAPEIS_AJUSTAVEIS as readonly string[]).includes(valor)
}

/**
 * AS LINHAS QUE NÃO MUDAM. O `inicio` abre pra todo papel: é onde o painel
 * cai depois de entrar. E a `equipe` é só do dono: quem ganhasse ela daria
 * acesso a si mesmo — e convidar, trocar papel e remover já são só do dono
 * (`podeMudar`). Vale pros papéis que o dono cria também.
 */
export const AREAS_FIXAS: readonly Area[] = ["inicio", "equipe"]

/**
 * AS LINHAS QUE SEGUEM O PAPEL NOS TRÊS DE SEMPRE — e que o dono escolhe no
 * papel que ele cria. Os `contatos` são dado pessoal: na operação abrem, no
 * marketing não (ele trabalha com quem aceitou ofertas, e sem telefone nem
 * endereço — LGPD), e a tabela não muda isso. No papel criado pelo dono, é
 * uma caixinha como as outras: é ele quem decide, pessoa por pessoa, quem
 * precisa do telefone do cliente.
 */
export const AREAS_DO_PAPEL: readonly Area[] = ["contatos"]

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
export type Ajuste = { papel: PapelDaTabela; area: Area; abre: boolean }

/** O papel criado pelo dono nasce abrindo só o Início (a linha fixa que abre pra todos). */
const abreNoPadrao = (papel: Papel, area: Area) =>
  ehPersonalizado(papel)
    ? area === "inicio"
    : (ACESSO_PADRAO[area] as readonly Papel[]).includes(papel)

/**
 * Se a caixinha muda: o dono não tem nenhuma; as linhas fixas não mudam pra
 * ninguém; as que seguem o papel, só no papel criado pelo dono.
 */
function mudavel(papel: Papel, area: Area): boolean {
  if (AREAS_FIXAS.includes(area)) return false
  if (ehPersonalizado(papel)) return true
  return ehAjustavel(papel) && !AREAS_DO_PAPEL.includes(area)
}

/** As colunas da matriz: os três de sempre e os papéis criados pelo dono, sem repetir. */
const colunasCom = (personalizados: readonly string[]): Papel[] => [
  ...PAPEIS,
  ...new Set(personalizados.filter(ehPersonalizado)),
]

/** Monta a matriz de "o papel abre a área?", fechando o que mora dentro de área fechada. */
function montar(abre: (papel: Papel, area: Area) => boolean, colunas: readonly Papel[]): Matriz {
  const aberta = (papel: Papel, area: Area): boolean => {
    const fora = DENTRO_DE[area]
    return abre(papel, area) && (!fora || aberta(papel, fora))
  }
  const matriz = {} as Record<Area, Papel[]>
  for (const area of AREAS) matriz[area] = colunas.filter((papel) => aberta(papel, area))
  return matriz
}

/**
 * A MATRIZ DE AGORA — o padrão com os ajustes do dono por cima, com uma
 * coluna pra cada papel criado pelo dono que veio em `personalizados` (os de
 * `equipe_papel`, ou só o de quem pede). Ajuste que não vale mais (área que
 * saiu do código, linha fixa, papel que não se ajusta ou que foi apagado)
 * não conta. E o que mora dentro de outra área fecha com ela, diga o banco o
 * que disser.
 */
export function matrizCom(
  ajustes: readonly { papel: string; area: string; abre: boolean | null }[],
  personalizados: readonly string[] = []
): Matriz {
  const colunas = colunasCom(personalizados)
  const mudou = new Map<string, boolean>()
  for (const a of ajustes)
    if (colunas.includes(a.papel as Papel) && ehArea(a.area) && mudavel(a.papel as Papel, a.area))
      mudou.set(`${a.papel}/${a.area}`, a.abre === true)
  return montar(
    (papel, area) => mudou.get(`${papel}/${area}`) ?? abreNoPadrao(papel, area),
    colunas
  )
}

/** A loja sem ajuste nenhum (e sem papel criado pelo dono). */
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
  | {
      ok: false
      motivo: "acessos_invalidos" | "linha_fixa" | "sem_a_area_de_fora" | "papeis_mudaram"
    }

/**
 * O corpo de `POST /dashboard/acessos`:
 * `{ acesso: { operacao: Area[], marketing: Area[], papel_…: Area[] } }` —
 * TUDO o que cada papel com caixinha abre depois de salvar, e não só o que
 * mudou: a tela manda a coluna inteira, e duas abas salvando juntas não se
 * misturam (vale a última, inteira). `personalizados` são os papéis criados
 * pelo dono que existem agora: cada um precisa vir, e nenhum outro — papel
 * criado ou apagado numa outra aba é `papeis_mudaram`. Recusa área que não
 * existe, linha fixa mexida (e, na operação e no marketing, a linha que
 * segue o papel) e o que mora dentro de uma área sem ela.
 */
export function lerAcessos(
  corpo: unknown,
  personalizados: readonly PapelPersonalizado[] = []
): LeituraDosAcessos {
  const acesso = (corpo as { acesso?: unknown } | null | undefined)?.acesso
  if (!acesso || typeof acesso !== "object" || Array.isArray(acesso))
    return { ok: false, motivo: "acessos_invalidos" }
  const colunas = acesso as Record<string, unknown>
  const chaves = Object.keys(colunas)
  if (chaves.some((papel) => !ehAjustavel(papel) && !ehPersonalizado(papel)))
    return { ok: false, motivo: "acessos_invalidos" }

  const abre = {} as Record<PapelDaTabela, Set<Area>>
  const lerColuna = (papel: PapelDaTabela) => {
    const lista = colunas[papel]
    if (!Array.isArray(lista) || lista.length > AREAS.length * 2 || !lista.every(ehArea))
      return false
    abre[papel] = new Set(lista)
    return true
  }
  for (const papel of PAPEIS_AJUSTAVEIS)
    if (!lerColuna(papel)) return { ok: false, motivo: "acessos_invalidos" }
  const vieram = chaves.filter(ehPersonalizado)
  if (
    vieram.length !== personalizados.length ||
    vieram.some((papel) => !personalizados.includes(papel))
  )
    return { ok: false, motivo: "papeis_mudaram" }
  for (const papel of personalizados)
    if (!lerColuna(papel)) return { ok: false, motivo: "acessos_invalidos" }

  const comCaixinha: PapelDaTabela[] = [...PAPEIS_AJUSTAVEIS, ...personalizados]
  for (const papel of comCaixinha) {
    for (const area of AREAS)
      if (!mudavel(papel, area) && abre[papel].has(area) !== abreNoPadrao(papel, area))
        return { ok: false, motivo: "linha_fixa" }
    for (const area of abre[papel]) {
      const fora = DENTRO_DE[area]
      if (fora && !abre[papel].has(fora)) return { ok: false, motivo: "sem_a_area_de_fora" }
    }
  }
  const matriz = montar(
    (papel, area) =>
      (comCaixinha as Papel[]).includes(papel)
        ? abre[papel as PapelDaTabela].has(area)
        : abreNoPadrao(papel, area),
    colunasCom(personalizados)
  )
  return { ok: true, matriz }
}

/** O que o banco guarda de uma matriz: só onde ela difere do padrão. */
export function ajustesDa(
  matriz: Matriz,
  personalizados: readonly PapelPersonalizado[] = []
): Ajuste[] {
  return mudancasEntre(matrizCom([], personalizados), matriz, personalizados)
}

/**
 * O que mudou de uma matriz pra outra, papel por papel, na ordem do menu —
 * pro registro de quem fez o quê e pro aviso da tela.
 */
export function mudancasEntre(
  antes: Matriz,
  depois: Matriz,
  personalizados: readonly PapelPersonalizado[] = []
): Ajuste[] {
  const mudou: Ajuste[] = []
  for (const papel of [...PAPEIS_AJUSTAVEIS, ...personalizados])
    for (const area of AREAS) {
      if (!mudavel(papel, area)) continue
      const fica = depois[area].includes(papel)
      if (antes[area].includes(papel) !== fica) mudou.push({ papel, area, abre: fica })
    }
  return mudou
}

/* ── os papéis que o dono cria ────────────────────────────────────────────── */

/** Quantos papéis o dono cria, no máximo — mais que isso, a tabela não cabe nem na cabeça. */
export const PAPEIS_NOVOS_NO_MAXIMO = 10

const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()

/** "  Atendimento   ao cliente " → "Atendimento ao cliente"; null fora de 2 a 30 letras. */
function nomeDePapel(valor: unknown): string | null {
  const nome = typeof valor === "string" ? valor.replace(/\s+/g, " ").trim() : ""
  return nome.length >= 2 && nome.length <= 30 ? nome : null
}

/**
 * Se o nome já é de outro papel — dos três de sempre ou dos criados —, sem
 * olhar maiúscula nem acento: "operacao" e "ATENDIMENTO" repetem.
 */
export function nomeRepetido(nome: string, outros: readonly string[]): boolean {
  const chave = semAcento(nome)
  return [...Object.values(NOME_DO_PAPEL), ...outros].some((o) => semAcento(o) === chave)
}

export type PapelNovo = { nome: string; igualA: PapelAjustavel | null }

/**
 * O corpo de `POST /dashboard/papeis`: `{ nome, igualA? }` — o nome do papel
 * e, se o dono quiser, o papel de sempre de que ele começa copiando as
 * caixinhas (`operacao` ou `marketing`). Sem `igualA`, nasce abrindo só o
 * Início.
 */
export function lerPapelNovo(
  corpo: unknown
): { ok: true; papel: PapelNovo } | { ok: false; motivo: "nome_invalido" | "igual_a_invalido" } {
  const c = (corpo ?? {}) as { nome?: unknown; igualA?: unknown }
  const nome = nomeDePapel(c.nome)
  if (!nome) return { ok: false, motivo: "nome_invalido" }
  if (c.igualA === undefined || c.igualA === null || c.igualA === "")
    return { ok: true, papel: { nome, igualA: null } }
  if (!ehAjustavel(c.igualA)) return { ok: false, motivo: "igual_a_invalido" }
  return { ok: true, papel: { nome, igualA: c.igualA } }
}

/**
 * As áreas do papel novo, quando ele começa igual a um dos de sempre: o que
 * esse papel abre agora, menos as linhas fixas (o Início ele já abre, a
 * Equipe nunca). Sem `igualA`, nada — só o Início.
 */
export function areasDoPapelNovo(matriz: Matriz, igualA: PapelAjustavel | null): Area[] {
  if (!igualA) return []
  return AREAS.filter((area) => !AREAS_FIXAS.includes(area) && podeAbrir(matriz, igualA, area))
}

export type MudancaDoPapel = { tipo: "renomear"; nome: string } | { tipo: "apagar" }

/**
 * O corpo de `POST /dashboard/papeis/:id`: `{ nome }` renomeia, `{ acao:
 * "apagar" }` apaga. Null se não for nenhum dos dois — ou se o nome for
 * curto ou longo demais.
 */
export function lerMudancaDoPapel(corpo: unknown): MudancaDoPapel | null {
  const c = (corpo ?? {}) as { nome?: unknown; acao?: unknown }
  if (c.acao === "apagar" && c.nome === undefined) return { tipo: "apagar" }
  if (c.acao !== undefined) return null
  const nome = nomeDePapel(c.nome)
  return nome ? { tipo: "renomear", nome } : null
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

/** Os três de sempre na ordem deles; os criados pelo dono, depois. */
const ordemDoPapel = (papel: Papel) => (ehPapelFixo(papel) ? PAPEIS.indexOf(papel) : PAPEIS.length)

/** A lista da tela da equipe: quem já entrou primeiro, o dono no alto, e por nome. */
export function emOrdem<T extends { nome: string; papel: Papel; situacao: Situacao }>(
  membros: T[]
): T[] {
  return [...membros].sort(
    (a, b) =>
      ORDEM_DA_SITUACAO[a.situacao] - ORDEM_DA_SITUACAO[b.situacao] ||
      ordemDoPapel(a.papel) - ordemDoPapel(b.papel) ||
      a.nome.localeCompare(b.nome, "pt-BR")
  )
}

/**
 * O que sai da API sobre um membro — sem nada que o painel não mostre. O
 * `papel_nome` é o que a tela escreve: o dos três de sempre, ou o que o
 * dono deu ao papel que criou (`nomes`).
 */
export function membroPublico(
  m: {
    id: string
    nome: string
    email: string
    papel: Papel
    situacao: Situacao
    convidado_em?: Date | string | null
    ultimo_acesso?: Date | string | null
  },
  nomes?: ReadonlyMap<string, string>
) {
  return {
    id: m.id,
    nome: m.nome,
    email: m.email,
    papel: m.papel,
    papel_nome: nomeDoPapel(m.papel, nomes),
    situacao: m.situacao,
    convite_vence_em:
      m.situacao === "convidado" ? (conviteVenceEm(m.convidado_em)?.toISOString() ?? null) : null,
    ultimo_acesso: m.ultimo_acesso ? new Date(m.ultimo_acesso).toISOString() : null,
  }
}
