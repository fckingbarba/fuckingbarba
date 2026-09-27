import { normalizarEmail } from "../../modules/codigo/regras"
import { COMPONENTES, componentesDoItem, type Componente } from "./etiquetas"

/**
 * Põe `item` na lista de `chave` — no MESMO array. Copiar a lista a cada
 * linha (`[...lista, item]`) era quadrático: um arquivo montado com muitos
 * itens do mesmo pedido, ou muitos pedidos do mesmo e-mail, parava o
 * processo por minutos (auditoria de 27/09).
 */
export function juntar<K, V>(mapa: Map<K, V[]>, chave: K, item: V) {
  const lista = mapa.get(chave)
  if (lista) lista.push(item)
  else mapa.set(chave, [item])
}

/**
 * A BASE DA NUVEMSHOP — os três arquivos que a loja antiga exporta
 * (Clientes, Vendas e Carrinhos abandonados), lidos pro CRM.
 *
 * FICA SÓ O QUE O CRM USA. Da pessoa: o e-mail, o primeiro nome, o "sim"
 * pras ofertas (a coluna Marketing), a newsletter, se tinha conta e desde
 * quando é cliente. Do pedido: o número, as datas, o pagamento, o envio,
 * os valores, o cupom e os itens (pelo SKU). Do carrinho: a data, o total e
 * os itens. CPF, telefone, endereço, rastreio e dados do cartão são lidos e
 * jogados fora aqui mesmo — não chegam no banco.
 *
 * O ARQUIVO se reconhece pelo cabeçalho (a ordem das colunas pode mudar), e
 * a letra também: o que a Nuvemshop exporta é Latin-1; se vier em UTF-8
 * (aberto e salvo numa planilha), serve igual. As datas são de Brasília.
 *
 * Código puro, com testes.
 */

/** O maior arquivo aceito — o de vendas de hoje tem 1,8 MB. */
export const TAMANHO_MAXIMO = 8 * 1024 * 1024
const LINHAS_MAXIMAS = 200_000

export type PessoaDaNuvemshop = {
  email: string
  /** O primeiro nome, pro "Oi, Rafael" dos e-mails. */
  nome: string | null
  /** O "Aceita" da coluna Marketing: o sim pras ofertas por e-mail. */
  aceitaOfertas: boolean
  /** Quando a pessoa escolheu (a coluna "Marketing (atualização)"). */
  ofertasEm: Date | null
  /** A inscrição na newsletter da loja antiga, se houve. */
  newsletterEm: Date | null
  /** Tinha conta na loja antiga (a coluna "Cadastrado"). */
  tinhaConta: boolean
  /** Cliente desde (a coluna "Data"). */
  desde: Date | null
}

export type ItemDaNuvemshop = {
  sku: string | null
  nome: string
  quantidade: number
  /** O preço de uma unidade, em reais. */
  valor: number
}

export type PagamentoDaNuvemshop = "confirmado" | "recusado" | "estornado" | "outro"
export type EnvioDaNuvemshop = "entregue" | "enviado" | "nao-enviado" | "outro"
export type MeioDaNuvemshop = "pix" | "cartao" | "boleto" | "combinar"

export type PedidoDaNuvemshop = {
  numero: string
  email: string
  feitoEm: Date
  pagoEm: Date | null
  enviadoEm: Date | null
  pagamento: PagamentoDaNuvemshop
  envio: EnvioDaNuvemshop
  /** Em reais. */
  total: number
  desconto: number
  frete: number
  cupom: string | null
  meio: MeioDaNuvemshop | null
  itens: ItemDaNuvemshop[]
}

export type CarrinhoDaNuvemshop = {
  id: string
  email: string
  criadoEm: Date
  tipo: "antes-do-pagamento" | "pagamento-falhou" | null
  total: number
  itens: ItemDaNuvemshop[]
}

export type ArquivoDaNuvemshop =
  | { tipo: "clientes"; pessoas: PessoaDaNuvemshop[]; ignoradas: number }
  | { tipo: "vendas"; pedidos: PedidoDaNuvemshop[]; ignoradas: number }
  | { tipo: "carrinhos"; carrinhos: CarrinhoDaNuvemshop[]; ignoradas: number }

export type ErroDoArquivo = "vazio" | "grande" | "desconhecido"

/* ── a letra e o CSV ──────────────────────────────────────────────────────── */

/** UTF-8 se o arquivo for UTF-8 válido; senão, Latin-1 (o da Nuvemshop). Sem o BOM. */
export function decodificar(bytes: Uint8Array): string {
  let texto: string
  try {
    texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    texto = new TextDecoder("latin1").decode(bytes)
  }
  return texto.replace(/^\uFEFF/, "")
}

/** O CSV em linhas e colunas: `;` ou `,` (o que aparece mais no cabeçalho), aspas com `""`. */
export function lerCsv(texto: string): string[][] {
  const fimDoCabecalho = texto.search(/\r?\n/)
  const cabecalho = fimDoCabecalho < 0 ? texto : texto.slice(0, fimDoCabecalho)
  const sep =
    (cabecalho.match(/;/g)?.length ?? 0) >= (cabecalho.match(/,/g)?.length ?? 0) ? ";" : ","
  const linhas: string[][] = []
  let linha: string[] = []
  let campo = ""
  let aspas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (aspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"'
          i++
        } else aspas = false
      } else campo += c
    } else if (c === '"' && campo === "") aspas = true
    else if (c === sep) {
      linha.push(campo)
      campo = ""
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++
      linha.push(campo)
      linhas.push(linha)
      if (linhas.length > LINHAS_MAXIMAS) break
      linha = []
      campo = ""
    } else campo += c
  }
  if (campo !== "" || linha.length) {
    linha.push(campo)
    linhas.push(linha)
  }
  return linhas.filter((l) => l.some((c) => c.trim() !== ""))
}

/* ── os valores ───────────────────────────────────────────────────────────── */

/** "Data de envío" e "Data de envio" são a mesma coluna: sem acento, minúsculo. */
const semAcento = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()

/** "94.58", "R$93,18", "1.189,90" → reais. Nulo pro que não é número. */
export function dinheiro(v: string | undefined): number | null {
  let t = (v ?? "").replace(/R\$\s*/i, "").trim()
  if (!t) return null
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".")
  const n = Number(t)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

/**
 * "27/09/2026 11:00:58", "27/09/2026" ou "16-09-2025", no horário de
 * Brasília (UTC−3, sem horário de verão desde 2019). A data sem hora fica
 * ao meio-dia, pra não virar o dia em fuso nenhum.
 */
export function dataDeBrasilia(v: string | undefined): Date | null {
  const m = /^(\d{2})[/-](\d{2})[/-](\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(
    (v ?? "").trim()
  )
  if (!m) return null
  const [, d, mes, a, h, min, s] = m
  const comHora = h !== undefined
  const data = new Date(
    Date.UTC(
      Number(a),
      Number(mes) - 1,
      Number(d),
      (comHora ? Number(h) : 12) + 3,
      comHora ? Number(min) : 0,
      comHora && s ? Number(s) : 0
    )
  )
  return Number.isFinite(data.getTime()) && data.getUTCDate() >= 1 ? data : null
}

const primeiroNome = (v: string | undefined): string | null => {
  const nome = (v ?? "").trim().split(/\s+/)[0] ?? ""
  if (!nome) return null
  return (nome[0].toUpperCase() + nome.slice(1).toLowerCase()).slice(0, 40)
}

const texto = (v: string | undefined, max: number) => {
  const t = (v ?? "").trim()
  return t ? t.slice(0, max) : null
}

function inteiroPositivo(v: string | undefined): number {
  const n = Number((v ?? "").trim())
  return Number.isInteger(n) && n >= 1 && n <= 999 ? n : 1
}

const PAGAMENTO: Record<string, PagamentoDaNuvemshop> = {
  confirmado: "confirmado",
  recusado: "recusado",
  estorno: "estornado",
  estornado: "estornado",
}
const ENVIO: Record<string, EnvioDaNuvemshop> = {
  entregue: "entregue",
  enviado: "enviado",
  "nao esta embalado": "nao-enviado",
}
const MEIO: Record<string, MeioDaNuvemshop> = {
  pix: "pix",
  "cartao de credito": "cartao",
  boleto: "boleto",
  "a combinar": "combinar",
}

/* ── os três arquivos ─────────────────────────────────────────────────────── */

type Linha = (coluna: string) => string | undefined

/** Cada linha como uma função "a coluna X" — pelo nome do cabeçalho, sem acento. */
function porNome(linhas: string[][]): { tem: (c: string) => boolean; linhas: Linha[] } {
  const indice = new Map(linhas[0].map((c, i) => [semAcento(c), i]))
  return {
    tem: (c) => indice.has(semAcento(c)),
    linhas: linhas.slice(1).map((l) => (c: string) => {
      const i = indice.get(semAcento(c))
      return i === undefined ? undefined : l[i]
    }),
  }
}

function item(l: Linha, colunas: { nome: string; sku: string; quantidade: string; valor: string }) {
  const nome = texto(l(colunas.nome), 160)
  if (!nome) return null
  return {
    sku: texto(l(colunas.sku), 40)?.toUpperCase() ?? null,
    nome,
    quantidade: inteiroPositivo(l(colunas.quantidade)),
    valor: dinheiro(l(colunas.valor)) ?? 0,
  }
}

function lerClientes(t: ReturnType<typeof porNome>): ArquivoDaNuvemshop {
  const pessoas = new Map<string, PessoaDaNuvemshop>()
  let ignoradas = 0
  for (const l of t.linhas) {
    const email = normalizarEmail(l("E-mail"))
    if (!email) {
      ignoradas++
      continue
    }
    pessoas.set(email, {
      email,
      nome: primeiroNome(l("Nome completo")),
      aceitaOfertas: semAcento(l("Marketing") ?? "") === "aceita",
      ofertasEm: dataDeBrasilia(l("Marketing (atualização)")),
      newsletterEm: dataDeBrasilia(l("Inscrição para newsletter")),
      tinhaConta: semAcento(l("Cadastrado") ?? "") === "sim",
      desde: dataDeBrasilia(l("Data")),
    })
  }
  return { tipo: "clientes", pessoas: [...pessoas.values()], ignoradas }
}

function lerVendas(t: ReturnType<typeof porNome>): ArquivoDaNuvemshop {
  const pedidos = new Map<string, PedidoDaNuvemshop>()
  const itensSoltos = new Map<string, ItemDaNuvemshop[]>()
  let ignoradas = 0
  const colunas = {
    nome: "Nome do Produto",
    sku: "SKU",
    quantidade: "Quantidade Comprada",
    valor: "Valor do Produto",
  }
  for (const l of t.linhas) {
    const numero = texto(l("Número do Pedido"), 30)
    if (!numero) {
      ignoradas++
      continue
    }
    const oItem = item(l, colunas)
    const feitoEm = dataDeBrasilia(l("Data"))
    // A linha com a data é a do pedido; as outras, só mais um item dele.
    if (feitoEm) {
      const email = normalizarEmail(l("E-mail"))
      if (!email) {
        ignoradas++
        continue
      }
      pedidos.set(numero, {
        numero,
        email,
        feitoEm,
        pagoEm: dataDeBrasilia(l("Data de pagamento")),
        enviadoEm: dataDeBrasilia(l("Data de envío")),
        pagamento: PAGAMENTO[semAcento(l("Status do Pagamento") ?? "")] ?? "outro",
        envio: ENVIO[semAcento(l("Status do Envio") ?? "")] ?? "outro",
        total: dinheiro(l("Total")) ?? 0,
        desconto: dinheiro(l("Desconto")) ?? 0,
        frete: dinheiro(l("Valor do Frete")) ?? 0,
        cupom: texto(l("Cupom de Desconto"), 60)?.toUpperCase() ?? null,
        meio: MEIO[semAcento(l("Meio de pagamento") ?? "")] ?? null,
        itens: [...(itensSoltos.get(numero) ?? []), ...(oItem ? [oItem] : [])],
      })
      itensSoltos.delete(numero)
    } else if (oItem) {
      const pedido = pedidos.get(numero)
      if (pedido) pedido.itens.push(oItem)
      else juntar(itensSoltos, numero, oItem)
    }
  }
  ignoradas += itensSoltos.size
  return { tipo: "vendas", pedidos: [...pedidos.values()], ignoradas }
}

const TIPO_DO_ABANDONO: Record<string, "antes-do-pagamento" | "pagamento-falhou"> = {
  "abandonou antes do pagamento": "antes-do-pagamento",
  "tentou pagar mas falhou": "pagamento-falhou",
}

function lerCarrinhos(t: ReturnType<typeof porNome>): ArquivoDaNuvemshop {
  const carrinhos = new Map<string, CarrinhoDaNuvemshop>()
  const itensSoltos = new Map<string, ItemDaNuvemshop[]>()
  let ignoradas = 0
  const colunas = {
    nome: "Nome do produto",
    sku: "Variante / SKU",
    quantidade: "Quantidade",
    valor: "Preço unitário",
  }
  for (const l of t.linhas) {
    const id = texto(l("ID do carrinho"), 30)
    const email = normalizarEmail(l("E-mail"))
    if (!id || !email) {
      ignoradas++
      continue
    }
    const oItem = item(l, colunas)
    const criadoEm = dataDeBrasilia(l("Data de criação"))
    if (criadoEm) {
      carrinhos.set(id, {
        id,
        email,
        criadoEm,
        tipo: TIPO_DO_ABANDONO[semAcento(l("Tipo de abandono") ?? "")] ?? null,
        total: dinheiro(l("Total do carrinho")) ?? 0,
        itens: [...(itensSoltos.get(id) ?? []), ...(oItem ? [oItem] : [])],
      })
      itensSoltos.delete(id)
    } else if (oItem) {
      const carrinho = carrinhos.get(id)
      if (carrinho) carrinho.itens.push(oItem)
      else juntar(itensSoltos, id, oItem)
    }
  }
  ignoradas += itensSoltos.size
  return { tipo: "carrinhos", carrinhos: [...carrinhos.values()], ignoradas }
}

/**
 * Um dos três arquivos, pelo cabeçalho: o de vendas tem "Número do
 * Pedido"; o de carrinhos, "ID do carrinho"; o de clientes, "Nome completo"
 * e "Marketing".
 */
export function lerArquivoDaNuvemshop(
  bytes: Uint8Array
): ArquivoDaNuvemshop | { erro: ErroDoArquivo } {
  if (bytes.byteLength > TAMANHO_MAXIMO) return { erro: "grande" }
  const linhas = lerCsv(decodificar(bytes))
  if (linhas.length < 2) return { erro: "vazio" }
  const t = porNome(linhas)
  if (t.tem("Número do Pedido") && t.tem("E-mail") && t.tem("SKU")) return lerVendas(t)
  if (t.tem("ID do carrinho") && t.tem("E-mail")) return lerCarrinhos(t)
  if (t.tem("E-mail") && t.tem("Nome completo") && t.tem("Marketing")) return lerClientes(t)
  return { erro: "desconhecido" }
}

/* ── o que o histórico diz de quanto dura cada produto ────────────────────── */

export type Recompra = { dias: number; recompras: number }

/**
 * QUANTO TEMPO LEVA PRA COMPRAR DE NOVO, pelo histórico: pra cada pessoa
 * com duas compras pagas ou mais, os dias entre uma e a seguinte — quando a
 * seguinte traz o mesmo tipo de produto —, divididos pelas unidades que a
 * primeira levou (3 Fatores duram 3 vezes). A mediana de cada tipo, e de
 * quantas recompras ela saiu. Nulo: nenhuma recompra daquele tipo.
 */
export function recomprasPorTipo(
  pedidos: {
    email: string
    feitoEm: Date
    pago: boolean
    itens: { sku: string | null; quantidade: number }[]
  }[]
): Record<Componente, Recompra | null> {
  const porPessoa = new Map<string, typeof pedidos>()
  for (const p of pedidos) if (p.pago) juntar(porPessoa, p.email, p)
  const intervalos = new Map<Componente, number[]>(COMPONENTES.map((c) => [c, []]))
  const unidadesDe = (p: (typeof pedidos)[number]) => {
    const u = new Map<Componente, number>()
    for (const i of p.itens)
      for (const { componente, unidades } of componentesDoItem({ sku: i.sku }))
        u.set(componente, (u.get(componente) ?? 0) + unidades * i.quantidade)
    return u
  }
  for (const lista of porPessoa.values()) {
    const emOrdem = [...lista].sort((a, b) => a.feitoEm.getTime() - b.feitoEm.getTime())
    for (let i = 0; i + 1 < emOrdem.length; i++) {
      const dias = (emOrdem[i + 1].feitoEm.getTime() - emOrdem[i].feitoEm.getTime()) / 86_400_000
      const seguinte = unidadesDe(emOrdem[i + 1])
      for (const [componente, unidades] of unidadesDe(emOrdem[i]))
        if (seguinte.has(componente) && dias >= 1) intervalos.get(componente)?.push(dias / unidades)
    }
  }
  return Object.fromEntries(
    COMPONENTES.map((c) => {
      const v = [...(intervalos.get(c) ?? [])].sort((a, b) => a - b)
      if (!v.length) return [c, null]
      const meio = Math.floor(v.length / 2)
      const mediana = v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2
      return [c, { dias: Math.round(mediana), recompras: v.length }]
    })
  ) as Record<Componente, Recompra | null>
}
