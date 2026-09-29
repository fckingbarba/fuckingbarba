import { createHash } from "node:crypto"
import { primeiroNome } from "../emails/boas-vindas"
import type { BlocoDoCrm, EmailDoCrm, ProdutoDoCrm } from "../emails/crm"
import { compras, DIAS_PRA_COMPRAR, primeiraVez, type PedidoDaTela } from "../painel/fluxos"
import { CONTROLE } from "./fluxos"

/**
 * AS CAMPANHAS DO CRM (entrega 0206, a etapa 4 do plano: o calendário de
 * campanhas) — os e-mails de data (Black Friday, Natal, um lançamento): quem
 * cuida do CRM escreve, escolhe o público e a hora, e a rotina
 * `campanhas-do-crm` manda (`lib/crm/enviar-campanhas.ts`).
 *
 * AS REGRAS (escolhas do dono, 29/09):
 *   - SÓ PRA QUEM ACEITA OFERTAS — a newsletter e a caixa da conta da loja
 *     nova (com o sim por padrão de quem compra), e quem aceitou na
 *     Nuvemshop. Fora: quem saiu da lista (sem um sim novo depois), o e-mail
 *     que voltou ou reclamou, a equipe, e quem adormeceu no sunset;
 *   - SEM CUPOM: o preço da loja faz o papel (na Black, o modo Black);
 *   - O TESTE DO ASSUNTO: com o assunto B, metade recebe cada um (um sorteio
 *     fixo por e-mail, `varianteDa`), e a tela mostra qual vendeu mais em 7
 *     dias. Não escolhe sozinho: abertura e clique estão desligados no
 *     Resend;
 *   - O GRUPO DE CONTROLE: 5% não recebe (`noControleDaCampanha`, outro
 *     sorteio a cada campanha) — é por ele que se sabe quanto a campanha
 *     vendeu a mais;
 *   - o teto dos fluxos vale (3 e-mails do CRM em 24 horas, 6 em 7 dias: quem
 *     passou espera), e de madrugada nada sai.
 *
 * O JEITO (entrega 0210, pedido do dono: a oferta caiu em Promoções) — cada
 * campanha escolhe como chega:
 *   - "oferta": o estilo oferta (a cara da loja, o remetente da loja e o
 *     "cancelar inscrição" do Gmail no cabeçalho). Promoções é o lugar dela;
 *   - "recado": o estilo lembrete (a mesma cara da loja, assinado "Matheus,
 *     da FuckingBarba", sem o cabeçalho; o sair da lista fica no pé), e sem
 *     emoji em nada do que se escreve (`temEmoji`). Tenta o Principal — quem
 *     decide é o Gmail. O risco: sem o botão de cancelar do Gmail, quem não
 *     quer mais pode marcar spam; é pra campanha sem preço.
 *
 * As partes puras (o formulário, o sorteio, o e-mail, o resultado) têm testes.
 */

const MINUTO = 60 * 1000
const DIA = 24 * 60 * MINUTO

export const PUBLICOS = ["todos", "clientes", "leads", "em-risco"] as const
export type PublicoDaCampanha = (typeof PUBLICOS)[number]

/** O nome de cada público, na tela. */
export const NOME_DO_PUBLICO: Record<PublicoDaCampanha, string> = {
  todos: "Todos que aceitam ofertas",
  clientes: "Quem já comprou",
  leads: "Quem nunca comprou",
  "em-risco": "Quem está em risco",
}

export type SituacaoDaCampanha = "rascunho" | "agendada" | "enviando" | "enviada" | "parada"

/** Como o e-mail chega (0210): a oferta, ou o recado do Matheus. */
export const JEITOS = ["oferta", "recado"] as const
export type JeitoDaCampanha = (typeof JEITOS)[number]

/** O nome de cada jeito, na tela. */
export const NOME_DO_JEITO: Record<JeitoDaCampanha, string> = {
  oferta: "Oferta",
  recado: "Recado do Matheus",
}

/** Se o texto tem emoji (o recado não leva: ele empurra pra Promoções). */
export const temEmoji = (texto: string) => /\p{Extended_Pictographic}/u.test(texto)

/** O que se escreve no formulário: o e-mail e o público. */
export type TextoDaCampanha = {
  nome: string
  assunto: string
  /** O assunto B, pro teste; sem ele, todo mundo recebe o A. */
  assuntoB: string | null
  previa: string
  titulo: string
  /** Um ou mais parágrafos, separados por uma linha em branco. */
  texto: string
  /** O botão: o texto e o caminho na loja ("/", "/produtos" ou a página de um produto). */
  botao: { texto: string; caminho: string } | null
  /** Até 3 produtos, pelo endereço. */
  produtos: string[]
  publico: PublicoDaCampanha
  /** Como chega: a oferta (Promoções) ou o recado do Matheus (0210). */
  jeito: JeitoDaCampanha
}

/** A data mais longe que se agenda. */
export const AGENDA_MAXIMA = 120 * DIA
/** A agenda tem que ser pelo menos tanto depois de agora: dá tempo de desmarcar. */
export const AGENDA_MINIMA = 5 * MINUTO
/** Depois de tanto tempo mandando, a campanha acaba: quem ficou (o teto, a madrugada) não recebe mais. */
export const DURACAO_DO_ENVIO = DIA

const LIMITES = {
  nome: 80,
  assunto: 120,
  previa: 150,
  titulo: 80,
  texto: 1500,
  botao: 40,
} as const

const limpo = (v: unknown) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim() : "")
const numaLinha = (v: unknown) => limpo(v).replace(/\s+/g, " ")

/** Os parágrafos do texto: separados por uma linha em branco, cada um numa linha só. */
export const paragrafos = (texto: string) =>
  texto
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean)

/** O caminho do botão vale se for a página inicial, a lista dos produtos ou um produto publicado. */
export function caminhoQueVale(caminho: string, publicados: ReadonlySet<string>): boolean {
  if (caminho === "/" || caminho === "/produtos") return true
  const m = /^\/produtos\/([a-z0-9-]+)$/.exec(caminho)
  return Boolean(m && publicados.has(m[1]))
}

export type ErrosDaCampanha = Partial<Record<keyof TextoDaCampanha | "agenda", string>>

/**
 * O FORMULÁRIO, conferido: o texto da campanha, com o que errou em cada
 * campo. `agendar`: a agenda é obrigatória, entre 5 minutos e 120 dias
 * daqui. Sem o jeito, é oferta (o de antes da 0210); no recado, nenhum
 * campo escrito leva emoji. O que vem do navegador é suspeito: fica só o
 * que a tela manda.
 */
export function lerCampanha(
  corpo: unknown,
  { publicados, agora, agendar }: { publicados: ReadonlySet<string>; agora: Date; agendar: boolean }
):
  | { ok: true; campanha: TextoDaCampanha; agenda: Date | null }
  | { ok: false; erros: ErrosDaCampanha } {
  const c = (corpo ?? {}) as Record<string, unknown>
  const erros: ErrosDaCampanha = {}
  const nome = numaLinha(c.nome)
  const assunto = numaLinha(c.assunto)
  const assuntoB = numaLinha(c.assuntoB) || null
  const previa = numaLinha(c.previa)
  const titulo = numaLinha(c.titulo)
  const texto = limpo(c.texto)
  if (!nome) erros.nome = "Dê um nome pra campanha (só a equipe vê)."
  else if (nome.length > LIMITES.nome) erros.nome = `O nome vai até ${LIMITES.nome} letras.`
  if (assunto.length < 3) erros.assunto = "Escreva o assunto."
  else if (assunto.length > LIMITES.assunto)
    erros.assunto = `O assunto vai até ${LIMITES.assunto} letras.`
  if (assuntoB !== null) {
    if (assuntoB.length < 3) erros.assuntoB = "Escreva o assunto B, ou tire o teste."
    else if (assuntoB.length > LIMITES.assunto)
      erros.assuntoB = `O assunto vai até ${LIMITES.assunto} letras.`
    else if (assuntoB.toLowerCase() === assunto.toLowerCase())
      erros.assuntoB = "O assunto B tem que ser diferente do A."
  }
  if (previa.length > LIMITES.previa) erros.previa = `A prévia vai até ${LIMITES.previa} letras.`
  if (!titulo) erros.titulo = "Escreva o título."
  else if (titulo.length > LIMITES.titulo)
    erros.titulo = `O título vai até ${LIMITES.titulo} letras.`
  if (!paragrafos(texto).length) erros.texto = "Escreva o texto."
  else if (texto.length > LIMITES.texto) erros.texto = `O texto vai até ${LIMITES.texto} letras.`

  const b = (c.botao ?? null) as { texto?: unknown; caminho?: unknown } | null
  const botaoTexto = numaLinha(b?.texto)
  const botaoCaminho = limpo(b?.caminho)
  let botao: TextoDaCampanha["botao"] = null
  if (botaoTexto || botaoCaminho) {
    if (!botaoTexto) erros.botao = "Escreva o texto do botão."
    else if (botaoTexto.length > LIMITES.botao)
      erros.botao = `O texto do botão vai até ${LIMITES.botao} letras.`
    else if (!caminhoQueVale(botaoCaminho, publicados))
      erros.botao = "Escolha pra onde o botão leva."
    else botao = { texto: botaoTexto, caminho: botaoCaminho }
  }

  const lista = Array.isArray(c.produtos) ? c.produtos : []
  const produtos = [...new Set(lista.filter((h): h is string => typeof h === "string"))]
  if (produtos.length > 3) erros.produtos = "No máximo 3 produtos."
  else if (produtos.some((h) => !publicados.has(h)))
    erros.produtos = "Um dos produtos não está mais na loja."

  const publico = PUBLICOS.find((p) => p === c.publico)
  if (!publico) erros.publico = "Escolha o público."

  const jeito = c.jeito === undefined ? "oferta" : JEITOS.find((j) => j === c.jeito)
  if (!jeito) erros.jeito = "Escolha como o e-mail chega."
  if (jeito === "recado") {
    const semEmoji = "No recado, sem emoji: ele leva o e-mail pra Promoções."
    const escritos = { assunto, assuntoB: assuntoB ?? "", previa, titulo, texto, botao: botaoTexto }
    for (const [campo, valor] of Object.entries(escritos) as [keyof ErrosDaCampanha, string][])
      if (!erros[campo] && temEmoji(valor)) erros[campo] = semEmoji
  }

  let agenda: Date | null = null
  if (agendar) {
    const d = typeof c.agenda === "string" ? new Date(c.agenda) : null
    if (!d || Number.isNaN(d.getTime())) erros.agenda = "Escolha o dia e a hora."
    else if (d.getTime() < agora.getTime() + AGENDA_MINIMA)
      erros.agenda = "Escolha uma hora daqui a pelo menos 5 minutos."
    else if (d.getTime() > agora.getTime() + AGENDA_MAXIMA)
      erros.agenda = "Dá pra agendar até 120 dias pra frente."
    else agenda = d
  }

  if (Object.keys(erros).length) return { ok: false, erros }
  return {
    ok: true,
    campanha: {
      nome,
      assunto,
      assuntoB,
      previa,
      titulo,
      texto,
      botao,
      produtos,
      publico: publico!,
      jeito: jeito!,
    },
    agenda,
  }
}

/** Se a etapa da pessoa (as etiquetas) cabe no público: "em risco" vale também pro sunset. */
export function cabeNoPublico(publico: PublicoDaCampanha, etapa: string): boolean {
  if (publico === "clientes") return etapa !== "lead"
  if (publico === "leads") return etapa === "lead"
  if (publico === "em-risco") return etapa === "em-risco" || etapa === "sunset"
  return true
}

/** A campanha como o banco guarda (`crm_campanha`). */
export type CampanhaDoBanco = {
  id: string
  nome: string
  assunto: string
  assunto_b: string | null
  previa: string
  titulo: string
  texto: string
  botao_texto: string | null
  botao_caminho: string | null
  produtos: unknown
  publico: string
  situacao: string
  agenda: Date | string | null
  comecou_em: Date | string | null
  acabou_em: Date | string | null
  por: string | null
  /** O resultado guardado (`resultadoFechou`), ou nulo. */
  resultado?: unknown
  /** "oferta" ou "recado" (0210); a de antes é oferta. */
  jeito?: string | null
}

/** O texto da campanha, da linha do banco. */
export function textoDoBanco(c: CampanhaDoBanco): TextoDaCampanha {
  return {
    nome: c.nome,
    assunto: c.assunto,
    assuntoB: c.assunto_b,
    previa: c.previa,
    titulo: c.titulo,
    texto: c.texto,
    botao:
      c.botao_texto && c.botao_caminho ? { texto: c.botao_texto, caminho: c.botao_caminho } : null,
    produtos: Array.isArray(c.produtos)
      ? c.produtos.filter((h): h is string => typeof h === "string")
      : [],
    publico: PUBLICOS.find((p) => p === c.publico) ?? "todos",
    jeito: JEITOS.find((j) => j === c.jeito) ?? "oferta",
  }
}

/** A linha do banco, do texto conferido. */
export const bancoDoTexto = (t: TextoDaCampanha) => ({
  nome: t.nome,
  assunto: t.assunto,
  assunto_b: t.assuntoB,
  previa: t.previa,
  titulo: t.titulo,
  texto: t.texto,
  botao_texto: t.botao?.texto ?? null,
  botao_caminho: t.botao?.caminho ?? null,
  produtos: t.produtos,
  publico: t.publico,
  jeito: t.jeito,
})

/* ── o sorteio ────────────────────────────────────────────────────────────── */

const sorteio = (texto: string) => createHash("sha256").update(texto).digest().readUInt32BE(0)

/** O assunto de cada pessoa, no teste: sempre o mesmo pro mesmo e-mail, metade de cada. */
export function varianteDa(email: string, campanha: string): "a" | "b" {
  return sorteio(`${email.trim().toLowerCase()}|${campanha}|ab`) % 2 === 0 ? "a" : "b"
}

/** Se a pessoa cai no grupo de controle DESTA campanha (5%, outro sorteio a cada campanha). */
export function noControleDaCampanha(email: string, campanha: string, porCento = CONTROLE) {
  return sorteio(`${email.trim().toLowerCase()}|${campanha}|controle`) % 100 < porCento
}

/** A chave no registro dos envios (`crm_envio`): a campanha e a pessoa. */
export const chaveDaCampanha = (campanha: string, email: string) => `${campanha}|${email}`

/** O nome da campanha na marca do link (`utm_campaign=crm-campanha-black-friday`). */
export function marcaDaCampanha(nome: string): string {
  const slug = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "")
  return slug ? `campanha-${slug}` : "campanha"
}

/* ── o e-mail ─────────────────────────────────────────────────────────────── */

/**
 * O E-MAIL DA CAMPANHA: o assunto da variante, o texto em parágrafos, o
 * botão e os produtos, no modelo da marca. A oferta vai no estilo oferta (o
 * "cancelar inscrição" no cabeçalho — Promoções é o lugar dela); o recado,
 * no estilo lembrete (assinado pelo Matheus, sem o cabeçalho, o sair da
 * lista no pé).
 */
export function emailDaCampanha(
  c: TextoDaCampanha,
  variante: "a" | "b",
  p: {
    para: string
    nome: string | null
    produtos: ProdutoDoCrm[]
    sair: EmailDoCrm["sair"]
    loja: EmailDoCrm["loja"]
  }
): EmailDoCrm {
  const [primeiro = "", ...resto] = paragrafos(c.texto)
  const blocos: BlocoDoCrm[] = [
    ...resto.map((texto): BlocoDoCrm => ({ tipo: "texto", texto })),
    ...(p.produtos.length ? [{ tipo: "produtos" as const, produtos: p.produtos.slice(0, 3) }] : []),
  ]
  return {
    para: p.para,
    nome: primeiroNome(p.nome),
    campanha: marcaDaCampanha(c.nome),
    assunto: variante === "b" && c.assuntoB ? c.assuntoB : c.assunto,
    previa: c.previa,
    titulo: c.titulo,
    texto: primeiro,
    ...(c.botao ? { botao: c.botao } : {}),
    blocos,
    sair: p.sair,
    loja: p.loja,
    estilo: c.jeito === "recado" ? "lembrete" : "oferta",
  }
}

/* ── o resultado ──────────────────────────────────────────────────────────── */

/** Uma linha do registro da campanha: quem, qual assunto (ou o controle) e quando. */
export type RegistroDaCampanha = {
  email: string
  toque: string
  como: string
  em: Date | string
}

export type ResultadoDaCampanha = {
  variantes: {
    variante: "a" | "b"
    assunto: string
    pessoas: number
    compraram: number
    vendido: number
  }[]
  controle: { pessoas: number; compraram: number }
  /** O assunto que vendeu mais (por pessoa), ou nulo: sem teste, empate, ou ninguém comprou. */
  vendeuMais: "a" | "b" | null
}

/**
 * O RESULTADO: por assunto, quem recebeu, quem comprou em até 7 dias e
 * quanto (o primeiro pedido de cada um — a mesma conta da aba Fluxos); e o
 * controle, contado como se tivesse recebido na mesma hora.
 */
export function resultadoDaCampanha(
  c: Pick<TextoDaCampanha, "assunto" | "assuntoB">,
  registros: readonly RegistroDaCampanha[],
  pedidos: readonly PedidoDaTela[]
): ResultadoDaCampanha {
  const doToque = (toque: string, como: string) =>
    registros.filter((r) => r.toque === toque && r.como === como)
  const variantes = (c.assuntoB ? (["a", "b"] as const) : (["a"] as const)).map((v) => {
    const quem = primeiraVez(doToque(v, "enviado"))
    const { pessoas, vendido } = compras(quem, pedidos)
    return {
      variante: v,
      assunto: v === "b" ? c.assuntoB! : c.assunto,
      pessoas: quem.size,
      compraram: pessoas,
      vendido,
    }
  })
  const controle = primeiraVez(doToque("controle", "controle"))
  const taxa = (v: { pessoas: number; compraram: number }) =>
    v.pessoas ? v.compraram / v.pessoas : 0
  const [a, b] = variantes
  const vendeuMais =
    a && b && (a.compraram || b.compraram) && taxa(a) !== taxa(b)
      ? taxa(a) > taxa(b)
        ? "a"
        : "b"
      : null
  return {
    variantes,
    controle: { pessoas: controle.size, compraram: compras(controle, pedidos).pessoas },
    vendeuMais,
  }
}

/**
 * O RESULTADO FECHA 7 dias depois do fim do envio: o último e-mail saiu até
 * o fim, e o "comprou em 7 dias" de todo mundo já passou. Daí ele é guardado
 * na campanha, e a tela não relê mais o registro dela.
 */
export function resultadoFechou(
  c: Pick<CampanhaDoBanco, "situacao" | "acabou_em">,
  agora: Date
): boolean {
  if (c.situacao !== "enviada" && c.situacao !== "parada") return false
  if (!c.acabou_em) return false
  return agora.getTime() - new Date(c.acabou_em).getTime() > DIAS_PRA_COMPRAR * DIA
}

/** O resultado guardado no banco, se tem a forma dele. */
export function resultadoGuardado(v: unknown): ResultadoDaCampanha | null {
  if (!v || typeof v !== "object") return null
  const r = v as Partial<ResultadoDaCampanha>
  return Array.isArray(r.variantes) && r.controle && typeof r.controle === "object"
    ? (r as ResultadoDaCampanha)
    : null
}
