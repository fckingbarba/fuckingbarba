import type {
  Acesso,
  FotoNoErp,
  LeituraDoCatalogo,
  MedidasDaCaixa,
  ProdutoNoErp,
  VariacaoNoErp,
} from "../../lib/erp/contrato"
import { chamarBling, ErroDoBling } from "./api"
import { listarProdutos } from "./produtos"

/**
 * O CATÁLOGO DO BLING, na língua da loja — pra importação dos produtos
 * (`lib/erp/catalogo.ts`).
 *
 * DUAS LEITURAS. A lista (`GET /produtos`) diz QUAIS produtos existem, mas
 * não traz peso, medidas, fotos nem variações: isso vem de um em um
 * (`GET /produtos/{id}`). No ritmo da fila (2,5 chamadas por segundo), trinta
 * produtos levam uns quinze segundos.
 *
 * O QUE ENTRA: ativo (`criterio` 2), produto (tipo P; serviço fica de fora)
 * e que não é variação de outro — a variação vem dentro do produto pai.
 *
 * UNIDADES. O Bling guarda peso em QUILO e medida em metro, centímetro ou
 * milímetro (`unidadeMedida` 0, 1 e 2); a loja, em GRAMA e CENTÍMETRO, na
 * variação (ver `scripts/medidas.ts`). A conversão mora aqui e só aqui. Vale o
 * peso bruto, que é o que a transportadora pesa; o líquido, se o bruto faltar.
 *
 * A DESCRIÇÃO do Bling é HTML (o editor dele). A da loja é texto puro: vai
 * pro Google e pra busca, e a loja não desenha HTML de fora.
 */

/** Uma leitura traz no máximo isto: cada produto é uma chamada. */
export const LIMITE_DE_PRODUTOS = 150
const MAXIMO_DE_FOTOS = 10

type Bruto = Record<string, unknown>

const objeto = (v: unknown): Bruto | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Bruto) : null
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])

function numero(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v.replace(",", ".")) : v
  return typeof n === "number" && Number.isFinite(n) ? n : null
}

const positivo = (v: unknown) => {
  const n = numero(v)
  return n !== null && n > 0 ? Math.round(n * 100) / 100 : null
}

function texto(v: unknown): string | null {
  if (typeof v !== "string") return null
  const t = v.trim()
  return t || null
}

/* ── peso e medidas ───────────────────────────────────────────────────────── */

/** Quilo → grama. Zero ou vazio é "o Bling não tem". */
export function emGramas(kg: unknown): number | null {
  const n = numero(kg)
  return n !== null && n > 0 ? Math.round(n * 1000) : null
}

/** `unidadeMedida` do Bling → quanto multiplica pra dar centímetro. */
const PRA_CENTIMETRO: Record<string, number> = { "0": 100, "1": 1, "2": 0.1 }

/**
 * As medidas da caixa, em centímetro, com uma casa. Comprimento é a
 * `profundidade` do Bling. Faltou uma das três, nenhuma vale: caixa pela
 * metade cota errado do mesmo jeito.
 */
export function medidasDe(dimensoes: unknown): MedidasDaCaixa | null {
  const d = objeto(dimensoes)
  if (!d) return null
  const fator = PRA_CENTIMETRO[String(d.unidadeMedida ?? "1")] ?? 1
  const cm = (v: unknown) => {
    const n = numero(v)
    return n !== null && n > 0 ? Math.round(n * fator * 10) / 10 : null
  }
  const comprimento = cm(d.profundidade)
  const largura = cm(d.largura)
  const altura = cm(d.altura)
  return comprimento && largura && altura ? { comprimento, largura, altura } : null
}

/* ── a descrição ──────────────────────────────────────────────────────────── */

const ENTIDADES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  aacute: "á",
  Aacute: "Á",
  agrave: "à",
  Agrave: "À",
  acirc: "â",
  Acirc: "Â",
  atilde: "ã",
  Atilde: "Ã",
  eacute: "é",
  Eacute: "É",
  ecirc: "ê",
  Ecirc: "Ê",
  iacute: "í",
  Iacute: "Í",
  oacute: "ó",
  Oacute: "Ó",
  ocirc: "ô",
  Ocirc: "Ô",
  otilde: "õ",
  Otilde: "Õ",
  uacute: "ú",
  Uacute: "Ú",
  uuml: "ü",
  Uuml: "Ü",
  ccedil: "ç",
  Ccedil: "Ç",
  ordf: "ª",
  ordm: "º",
  deg: "°",
  reg: "®",
  trade: "™",
  copy: "©",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  bull: "•",
  middot: "·",
  times: "×",
}

function decodificar(t: string): string {
  return t.replace(/&(#\d+|#x[0-9a-f]+|[a-z0-9]+);/gi, (inteira, e: string) => {
    if (e[0] === "#") {
      const n = /^#x/i.test(e) ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : inteira
    }
    return ENTIDADES[e] ?? inteira
  })
}

/**
 * HTML do editor do Bling → texto, com os parágrafos separados por linha em
 * branco e os itens de lista com "•". As entidades são decodificadas DEPOIS
 * de tirar as tags: "&lt;b&gt;" escrito no texto continua texto.
 */
export function textoDaDescricao(html: unknown): string | null {
  if (typeof html !== "string") return null
  const semTags = html
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<\/(p|div|h[1-6]|ul|ol|table|tr|blockquote)\s*>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
  const limpo = decodificar(semTags)
    .replace(/\r/g, "")
    .replace(/[ \t\u00a0]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  return limpo || null
}

/* ── as fotos ─────────────────────────────────────────────────────────────── */

const semConsulta = (url: string) => url.replace(/[?#].*$/, "")

/**
 * As internas (as que subiram pro Bling) na ordem dele, depois as externas
 * (link cadastrado). A interna vem com link que VENCE — a chave é o id do
 * anexo, que não muda; a externa é o próprio link.
 */
export function fotosDe(dados: unknown): FotoNoErp[] {
  const d = objeto(dados) ?? {}
  const imagens = objeto(objeto(d.midia)?.imagens)
  const fotos: FotoNoErp[] = []
  const vistas = new Set<string>()
  const guardar = (url: unknown, chave: (u: string) => string) => {
    const u = texto(url)
    if (!u || !/^https?:\/\//i.test(u)) return
    const k = chave(u)
    if (vistas.has(k)) return
    vistas.add(k)
    fotos.push({ url: u, chave: k })
  }

  const internas = lista(imagens?.internas)
    .map((i) => objeto(i))
    .filter((i): i is Bruto => Boolean(i))
    .sort((a, b) => (numero(a.ordem) ?? 0) - (numero(b.ordem) ?? 0))
  for (const i of internas) {
    const anexo = numero(objeto(i.anexo)?.id)
    guardar(i.link, (u) => (anexo ? `bling:anexo:${anexo}` : `bling:${semConsulta(u)}`))
  }
  for (const e of lista(imagens?.externas)) guardar(objeto(e)?.link, (u) => `url:${u}`)
  if (!fotos.length) guardar(d.imagemURL, (u) => `bling:${semConsulta(u)}`)
  return fotos.slice(0, MAXIMO_DE_FOTOS)
}

/* ── as variações ─────────────────────────────────────────────────────────── */

/**
 * "Tamanho:G;Cor:Verde" → { Tamanho: "G", Cor: "Verde" }. Pedaço sem nome de
 * atributo vira "Opção".
 */
export function opcoesDaVariacao(nome: unknown): Record<string, string> {
  const opcoes: Record<string, string> = {}
  for (const parte of (texto(nome) ?? "").split(";")) {
    const i = parte.indexOf(":")
    const chave = i > 0 ? parte.slice(0, i).trim() : ""
    const valor = (i > 0 ? parte.slice(i + 1) : parte).trim()
    if (valor) opcoes[chave || "Opção"] = valor
  }
  return opcoes
}

function lerVariacao(bruto: unknown, nomeDoPai: string): VariacaoNoErp | null {
  const v = objeto(bruto)
  const id = numero(v?.id)
  if (!v || !id) return null
  if (v.situacao !== undefined && v.situacao !== "A") return null
  // O nome da variação é o do pai + os atributos; `variacao.nome` traz só os atributos.
  const atributos =
    texto(objeto(v.variacao)?.nome) ??
    (texto(v.nome)?.startsWith(nomeDoPai) ? texto(v.nome)!.slice(nomeDoPai.length) : texto(v.nome))
  return {
    id: String(id),
    sku: texto(v.codigo),
    opcoes: opcoesDaVariacao(atributos),
    preco: positivo(v.preco),
    pesoGramas: emGramas(v.pesoBruto) ?? emGramas(v.pesoLiquido),
    medidas: medidasDe(v.dimensoes),
  }
}

/* ── o produto ────────────────────────────────────────────────────────────── */

/**
 * `GET /produtos/{id}` → o produto na língua da loja. `null` quando não é
 * produto de vender: serviço, inativo, ou a própria variação de outro.
 */
export function lerProdutoDoBling(corpo: unknown): ProdutoNoErp | null {
  const d = objeto(objeto(corpo)?.data)
  const id = numero(d?.id)
  const nome = texto(d?.nome)
  if (!d || !id || !nome) return null
  if (d.tipo !== undefined && d.tipo !== "P") return null
  if (d.situacao !== undefined && d.situacao !== "A") return null
  if (numero(objeto(objeto(d.variacao)?.produtoPai)?.id)) return null

  return {
    id: String(id),
    nome,
    sku: texto(d.codigo),
    descricao: textoDaDescricao(d.descricaoCurta) ?? textoDaDescricao(d.descricaoComplementar),
    preco: positivo(d.preco),
    pesoGramas: emGramas(d.pesoBruto) ?? emGramas(d.pesoLiquido),
    medidas: medidasDe(d.dimensoes),
    fotos: fotosDe(d),
    composicao: d.formato === "E",
    variacoes:
      d.formato === "V" ? lista(d.variacoes).flatMap((v) => lerVariacao(v, nome) ?? []) : [],
  }
}

/** A linha da lista (`GET /produtos`) → o id, se for produto de vender e não variação. */
export function idsDaLista(itens: readonly unknown[]): string[] {
  return itens.flatMap((bruto) => {
    const p = objeto(bruto)
    const id = numero(p?.id)
    if (!p || !id) return []
    if (p.tipo !== undefined && p.tipo !== "P") return []
    if (p.situacao !== undefined && p.situacao !== "A") return []
    if (numero(p.idProdutoPai)) return []
    return [String(id)]
  })
}

const porNome = (a: ProdutoNoErp, b: ProdutoNoErp) => a.nome.localeCompare(b.nome, "pt-BR")

export async function lerCatalogo(acesso: Acesso, ids?: string[]): Promise<LeituraDoCatalogo> {
  try {
    const alvo = ids
      ? [...new Set(ids)]
      : idsDaLista(await listarProdutos(acesso, { criterio: 2 }, { paginas: 50 }))
    const produtos: ProdutoNoErp[] = []
    const naoAchados: string[] = []
    for (const id of alvo.slice(0, LIMITE_DE_PRODUTOS)) {
      if (!/^\d+$/.test(id)) {
        naoAchados.push(id)
        continue
      }
      try {
        const r = await chamarBling(acesso, "GET", `/produtos/${id}`)
        const produto = lerProdutoDoBling(r.corpo)
        if (produto) produtos.push(produto)
        else naoAchados.push(id)
      } catch (e) {
        // Apagado no Bling entre a prévia e a importação: não é o catálogo que falhou.
        if (e instanceof ErroDoBling && e.status === 404) naoAchados.push(id)
        else throw e
      }
    }
    return {
      ok: true,
      produtos: produtos.sort(porNome),
      naoAchados,
      restantes: Math.max(0, alvo.length - LIMITE_DE_PRODUTOS),
    }
  } catch (e) {
    return { ok: false, motivo: e instanceof ErroDoBling ? e.message : String(e) }
  }
}
