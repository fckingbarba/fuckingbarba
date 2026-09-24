import { documentoDoPedido, lerEndereco, telefone } from "../dados-do-pedido"
import type { Papel } from "../equipe/regras"
import { chaveDoDia, dia, quando, type Data } from "./formato"
import {
  celularLegivel,
  comPontuacao,
  linhaDaLista,
  mascarar,
  nomeDoCliente,
  pagamentoDo,
  totalDo,
  type Contexto,
  type EnvioCru,
  type LinhaDaLista,
  type NotaCrua,
  type PedidoCru,
} from "./pedido"

/**
 * OS CLIENTES DO JEITO DO PAINEL — quem comprou ou tem conta, quanto e
 * quando; e quem aceitou receber ofertas.
 *
 * Código puro: recebe os clientes do Medusa, os pedidos e a newsletter, e
 * devolve o que a tela mostra. Quem lê do banco é `ler.ts`; os testes moram
 * em `__tests__/clientes.unit.spec.ts`.
 *
 * ┌─ UMA PESSOA, UM E-MAIL ────────────────────────────────────────────────┐
 * │ O Medusa guarda a mesma pessoa em até dois clientes com o mesmo        │
 * │ e-mail: o "convidado", que todo checkout sem conta cria, e o da conta. │
 * │ O `vincular-cliente.ts` promove o convidado quando a conta nasce; mas  │
 * │ quem já tinha conta e compra sem entrar ganha outro convidado. Aqui    │
 * │ eles viram uma pessoa só, e os pedidos dos dois somam.                 │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ AS OFERTAS: A CONTA E A NEWSLETTER, JUNTAS ───────────────────────────┐
 * │ O "sim" pra receber ofertas mora em dois lugares: na conta (a caixa de │
 * │ "Meus dados", no `metadata.ofertas` do cliente: e-mail e WhatsApp,     │
 * │ cada um com a data) e na newsletter do rodapé (`newsletter_inscricao`, │
 * │ com a data e a origem). Aqui eles viram uma lista só de                │
 * │ consentimentos da pessoa — é assim que o CRM (o plano "Ciclo da        │
 * │ Barba") vai ler.                                                       │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE O PAPEL NÃO VÊ NÃO SAI DAQUI ───────────────────────────────────┐
 * │ Marketing: só quem aceitou ofertas, e sem cidade, celular, CPF,        │
 * │ endereço ou a lista de pedidos — só quantos e quanto. Operação: tudo,  │
 * │ com o CPF mascarado. Dono: o CPF inteiro.                              │
 * └────────────────────────────────────────────────────────────────────────┘
 */

/* ── o que chega do banco ─────────────────────────────────────────────────── */

export type ClienteCru = {
  id: string
  email?: string | null
  first_name?: string | null
  last_name?: string | null
  phone?: string | null
  has_account?: boolean | null
  created_at: Data
  metadata?: Record<string, unknown> | null
}

export type PedidoDoCliente = PedidoCru & { customer_id?: string | null }

export type InscricaoCrua = {
  id: string
  email: string
  origem?: string | null
  consentido_em: Data
}

/** Uma pessoa: os clientes do Medusa com o mesmo e-mail, os pedidos de todos e a newsletter. */
export type Pessoa = {
  /** Minúsculo: a chave. */
  email: string
  /** O da conta primeiro, depois o mais antigo. */
  clientes: ClienteCru[]
  /** O mais novo primeiro. */
  pedidos: PedidoDoCliente[]
  inscricao: InscricaoCrua | null
}

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
const texto = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "")
const chave = (email: unknown) => texto(email).toLowerCase()
const tempo = (d: Data) => new Date(d).getTime() || 0
const centavos = (v: number) => Math.round(v * 100) / 100
/** Uma data que é data, em ISO; o resto (o que o cliente gravou no metadata) não vale. */
const iso = (v: unknown): string | null => {
  if (typeof v !== "string" && !(v instanceof Date)) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Junta os clientes pelo e-mail, com os pedidos e a inscrição na newsletter de cada pessoa. */
export function juntarPessoas(
  clientes: ClienteCru[],
  pedidos: PedidoDoCliente[],
  inscricoes: InscricaoCrua[]
): Pessoa[] {
  const porEmail = new Map<string, Pessoa>()
  const doCliente = new Map<string, Pessoa>()
  for (const c of clientes) {
    const email = chave(c.email)
    if (!email) continue
    const p = porEmail.get(email) ?? { email, clientes: [], pedidos: [], inscricao: null }
    porEmail.set(email, p)
    p.clientes.push(c)
    doCliente.set(c.id, p)
  }
  for (const o of pedidos) {
    const p = (o.customer_id && doCliente.get(o.customer_id)) || porEmail.get(chave(o.email))
    if (p) p.pedidos.push(o)
  }
  const inscricao = new Map(inscricoes.map((i) => [chave(i.email), i]))
  for (const p of porEmail.values()) {
    p.clientes.sort(
      (a, b) =>
        Number(Boolean(b.has_account)) - Number(Boolean(a.has_account)) ||
        tempo(a.created_at) - tempo(b.created_at)
    )
    p.pedidos.sort((a, b) => tempo(b.created_at) - tempo(a.created_at))
    p.inscricao = inscricao.get(p.email) ?? null
  }
  return [...porEmail.values()]
}

/* ── as ofertas ───────────────────────────────────────────────────────────── */

export type Canal = "email" | "whatsapp"

export type Consentimento = {
  canal: Canal
  /** Onde a pessoa disse sim: na conta ("Meus dados") ou na newsletter. */
  origem: "conta" | "newsletter"
  /** "na conta", "no rodapé" — pra frase. */
  onde: string
  /** ISO: a data do primeiro "sim". */
  desde: string
}

const ONDE_NA_NEWSLETTER: Record<string, string> = { rodape: "no rodapé" }

export function consentimentosDa(p: Pessoa): Consentimento[] {
  const lista: Consentimento[] = []
  for (const canal of ["email", "whatsapp"] as const) {
    const datas = p.clientes
      .map((c) => iso(obj(obj(c.metadata)?.ofertas)?.[canal]))
      .filter((d): d is string => d !== null)
      .sort()
    if (datas[0]) lista.push({ canal, origem: "conta", onde: "na conta", desde: datas[0] })
  }
  const desde = p.inscricao ? iso(p.inscricao.consentido_em) : null
  if (p.inscricao && desde)
    lista.push({
      canal: "email",
      origem: "newsletter",
      onde: ONDE_NA_NEWSLETTER[p.inscricao.origem ?? ""] ?? "na newsletter",
      desde,
    })
  return lista
}

/** "hoje", "ontem" ou "22/09" — o dia de uma data, perto de agora. */
function diaDe(d: Data, agora: Data): string {
  const c = chaveDoDia(d)
  if (c === chaveDoDia(agora)) return "hoje"
  if (c === chaveDoDia(tempo(agora) - 24 * 60 * 60 * 1000)) return "ontem"
  return dia(d)
}

/** "e-mail · desde 22/09" · "e-mail e WhatsApp · desde hoje" — ou `null`, sem "sim" nenhum. */
export function ofertasEmFrase(consentimentos: Consentimento[], agora: Data): string | null {
  if (!consentimentos.length) return null
  const canais = [
    ...(consentimentos.some((c) => c.canal === "email") ? ["e-mail"] : []),
    ...(consentimentos.some((c) => c.canal === "whatsapp") ? ["WhatsApp"] : []),
  ]
  const primeiro = consentimentos.map((c) => c.desde).sort()[0]!
  return `${canais.join(" e ")} · desde ${diaDe(primeiro, agora)}`
}

/* ── a pessoa, resumida ───────────────────────────────────────────────────── */

const vendido = (o: PedidoCru) => Boolean(pagamentoDo(o).pagoEm) && o.status !== "canceled"

/** O nome: o da conta; sem ele, o do endereço do pedido mais novo. */
function nomeDa(p: Pessoa): string {
  for (const c of p.clientes) {
    const nome = [texto(c.first_name), texto(c.last_name)].filter(Boolean).join(" ")
    if (nome) return nome
  }
  const comNome = p.pedidos.find((o) => texto(o.shipping_address?.first_name))
  return comNome ? nomeDoCliente(comNome) : "Sem nome"
}

/** O pedido mais novo com endereço de entrega: é de lá que vêm a cidade e o endereço. */
const comEndereco = (p: Pessoa) => p.pedidos.find((o) => texto(o.shipping_address?.city))

function resumoDa(p: Pessoa) {
  const vendidos = p.pedidos.filter(vendido)
  return {
    pedidos: p.pedidos.length,
    gastou: centavos(vendidos.reduce((s, o) => s + totalDo(o), 0)),
  }
}

/** O que a pessoa fez por último: o pedido mais novo; sem pedido, o cadastro mais novo. */
const ultimaVez = (p: Pessoa): Data =>
  p.pedidos[0]?.created_at ?? Math.max(...p.clientes.map((c) => tempo(c.created_at)))

/* ── a lista ──────────────────────────────────────────────────────────────── */

export type LinhaDoCliente = {
  /** O cliente do Medusa que abre a ficha: o da conta, se houver. */
  id: string
  nome: string
  email: string
  /** "São Paulo/SP" — `null` pro marketing (e sem endereço nenhum). */
  cidade: string | null
  pedidos: number
  gastou: number
  /** "hoje, 20:52": o último pedido (ou, sem pedido, quando a conta nasceu). */
  ultimo: string
  conta: boolean
  /** "e-mail · desde 22/09" — `null` quando não aceitou. */
  ofertas: string | null
}

export type ListaDeClientes = {
  clientes: LinhaDoCliente[]
  /** Quantas pessoas a loja tem (o marketing vê só as que aceitaram ofertas). */
  total: number
  /** Quantas aceitaram ofertas, por e-mail ou WhatsApp. */
  comOfertas: number
  busca: string
}

const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()

export function listaDeClientes(
  pessoas: Pessoa[],
  papel: Papel,
  agora: Date,
  busca = ""
): ListaDeClientes {
  const termo = semAcento(busca.trim())
  const linhas = pessoas
    .map((p) => {
      const ofertas = ofertasEmFrase(consentimentosDa(p), agora)
      const o = comEndereco(p)
      const cidade = o ? texto(o.shipping_address?.city) : ""
      const uf = o ? texto(o.shipping_address?.province).toUpperCase() : ""
      const linha: LinhaDoCliente = {
        id: p.clientes[0]!.id,
        nome: nomeDa(p),
        email: texto(p.clientes[0]!.email),
        cidade: papel === "marketing" || !cidade ? null : uf ? `${cidade}/${uf}` : cidade,
        ...resumoDa(p),
        ultimo: quando(ultimaVez(p), agora),
        conta: p.clientes.some((c) => c.has_account),
        ofertas,
      }
      return { linha, vez: tempo(ultimaVez(p)) }
    })
    .sort((a, b) => b.vez - a.vez)
    .map(({ linha }) => linha)
  const visiveis = papel === "marketing" ? linhas.filter((l) => l.ofertas) : linhas
  return {
    clientes: termo
      ? visiveis.filter((l) => semAcento(`${l.nome} ${l.email}`).includes(termo))
      : visiveis,
    total: linhas.length,
    comOfertas: linhas.filter((l) => l.ofertas).length,
    busca,
  }
}

/* ── a ficha ──────────────────────────────────────────────────────────────── */

export type FichaDoCliente = {
  id: string
  nome: string
  email: string
  conta: boolean
  /** "12/09": o cadastro mais antigo dessa pessoa na loja. */
  desde: string
  /** Cada "sim" pra receber ofertas, em frase: "E-mail", "no rodapé, desde 22/09". */
  ofertas: { canal: string; onde: string; desde: string }[]
  /** O que só a operação e o dono veem. `null` pro marketing. */
  dados: {
    celular: string | null
    documento: { tipo: "cpf" | "cnpj"; mascarado: string; inteiro: string | null } | null
    /** "Rua Augusta, 1200 — apto 51 — Consolação — São Paulo/SP — 01304-001" */
    endereco: string | null
  } | null
  resumo: { pedidos: number; gastou: number }
  /** Os pedidos, na linha da lista de pedidos. `null` pro marketing: o detalhe é da operação. */
  pedidos: LinhaDaLista[] | null
}

const cep = (v: string) => (v.length === 8 ? `${v.slice(0, 5)}-${v.slice(5)}` : v)

/** O documento: o da conta; sem ele, o do pedido mais novo que tem. */
function documentoDa(p: Pessoa) {
  for (const c of p.clientes) {
    const doc = documentoDoPedido({ metadata: obj(c.metadata) })
    if (doc) return doc
  }
  for (const o of p.pedidos) {
    const doc = documentoDoPedido(o.billing_address, o.shipping_address)
    if (doc) return doc
  }
  return null
}

function enderecoDa(p: Pessoa): string | null {
  const o = comEndereco(p)
  if (!o?.shipping_address) return null
  const e = lerEndereco(o.shipping_address)
  return [
    `${e.rua}, ${e.numero}`,
    e.complemento,
    e.bairro,
    e.uf ? `${e.cidade}/${e.uf}` : e.cidade,
    cep(e.cep),
  ]
    .filter(Boolean)
    .join(" — ")
}

/**
 * A ficha de uma pessoa, pro papel de quem pede. `null` quando o marketing
 * pede quem não aceitou ofertas: pra ele, essa pessoa não existe.
 */
export function fichaDoCliente(
  p: Pessoa,
  papel: Papel,
  ctx: Contexto,
  notas: Map<string, NotaCrua>,
  envios: Map<string, EnvioCru[]>
): FichaDoCliente | null {
  const consentimentos = consentimentosDa(p)
  const marketing = papel === "marketing"
  if (marketing && !consentimentos.length) return null
  const doc = marketing ? null : documentoDa(p)
  const celular =
    p.clientes.map((c) => telefone(c.phone)).find(Boolean) ??
    p.pedidos.map((o) => telefone(o.shipping_address?.phone)).find(Boolean) ??
    null
  const antigo = p.clientes.reduce<Data>(
    (d, c) => (tempo(c.created_at) < tempo(d) ? c.created_at : d),
    p.clientes[0]!.created_at
  )
  return {
    id: p.clientes[0]!.id,
    nome: nomeDa(p),
    email: texto(p.clientes[0]!.email),
    conta: p.clientes.some((c) => c.has_account),
    desde: dia(antigo),
    ofertas: consentimentos.map((c) => ({
      canal: c.canal === "email" ? "E-mail" : "WhatsApp",
      onde: c.onde,
      desde: diaDe(c.desde, ctx.agora),
    })),
    dados: marketing
      ? null
      : {
          celular: celularLegivel(celular),
          documento: doc
            ? {
                tipo: doc.tipo,
                mascarado: mascarar(doc),
                inteiro: papel === "dono" ? comPontuacao(doc) : null,
              }
            : null,
          endereco: enderecoDa(p),
        },
    resumo: resumoDa(p),
    pedidos: marketing
      ? null
      : p.pedidos.map((o) => linhaDaLista(o, notas.get(o.id) ?? null, envios.get(o.id) ?? [], ctx)),
  }
}

/* ── a newsletter ─────────────────────────────────────────────────────────── */

export type Inscrito = {
  email: string
  /** "22/09" — o primeiro "sim" por e-mail. */
  desde: string
  /** ISO, pro CSV e pra ordem. */
  desdeEm: string
  /** "rodapé", "conta" ou "rodapé e conta". */
  origem: string
  /** A ficha, quando o e-mail é de um cliente. */
  clienteId: string | null
}

export type Newsletter = {
  inscritos: Inscrito[]
  numeros: { total: number; semana: number; rodape: number; conta: number }
}

const NOME_DA_ORIGEM: Record<string, string> = { rodape: "rodapé" }
/** A ordem das origens na frase: "rodapé e conta". */
const ORDEM_DAS_ORIGENS = ["rodapé", "newsletter", "conta"]

/**
 * QUEM ACEITOU OFERTAS POR E-MAIL — a newsletter do rodapé e a caixa da
 * conta, numa lista só, sem repetir o e-mail. A ficha do cliente e esta
 * lista leem os mesmos consentimentos (`consentimentosDa`).
 */
export function newsletterDa(
  pessoas: Pessoa[],
  inscricoes: InscricaoCrua[],
  agora: Date
): Newsletter {
  const porEmail = new Map<
    string,
    { email: string; datas: string[]; origens: Set<string>; clienteId: string | null }
  >()
  const juntar = (email: string, desde: string, origem: string, clienteId: string | null) => {
    const k = chave(email)
    const atual = porEmail.get(k) ?? {
      email: texto(email),
      datas: [],
      origens: new Set(),
      clienteId,
    }
    atual.datas.push(desde)
    atual.origens.add(origem)
    atual.clienteId ??= clienteId
    porEmail.set(k, atual)
  }
  const doEmail = new Map(pessoas.map((p) => [p.email, p]))
  for (const i of inscricoes) {
    const desde = iso(i.consentido_em)
    if (!desde) continue
    juntar(
      i.email,
      desde,
      NOME_DA_ORIGEM[i.origem ?? ""] ?? "newsletter",
      doEmail.get(chave(i.email))?.clientes[0]?.id ?? null
    )
  }
  for (const p of pessoas) {
    const c = consentimentosDa(p).find((x) => x.canal === "email" && x.origem === "conta")
    if (c) juntar(texto(p.clientes[0]!.email), c.desde, "conta", p.clientes[0]!.id)
  }

  const semanaAtras = agora.getTime() - 7 * 24 * 60 * 60 * 1000
  const inscritos = [...porEmail.values()]
    .map((x) => {
      const desdeEm = x.datas.sort()[0]!
      return {
        email: x.email,
        desde: diaDe(desdeEm, agora),
        desdeEm,
        origem: [...x.origens]
          .sort((a, b) => ORDEM_DAS_ORIGENS.indexOf(a) - ORDEM_DAS_ORIGENS.indexOf(b))
          .join(" e "),
        clienteId: x.clienteId,
      }
    })
    .sort((a, b) => b.desdeEm.localeCompare(a.desdeEm))
  return {
    inscritos,
    numeros: {
      total: inscritos.length,
      semana: inscritos.filter((i) => tempo(i.desdeEm) >= semanaAtras).length,
      rodape: [...porEmail.values()].filter((x) => x.origens.has("rodapé")).length,
      conta: [...porEmail.values()].filter((x) => x.origens.has("conta")).length,
    },
  }
}

/** "ra•••@example.com" — o e-mail no registro da equipe, sem ser o e-mail. */
export function emailMascarado(email: string): string {
  const [nome = "", dominio = ""] = texto(email).split("@")
  return `${nome.slice(0, 2)}•••@${dominio}`
}
