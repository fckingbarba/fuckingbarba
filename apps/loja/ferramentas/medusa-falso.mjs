import { createServer } from "node:http"
import { crc32, deflateSync } from "node:zlib"

/**
 * UM MEDUSA DE MENTIRA, SÓ DE LEITURA — pro Lighthouse do CI medir a loja
 * COM produto.
 *
 *   node ferramentas/medusa-falso.mjs            (porta 9000)
 *
 * ┌─ POR QUE ELE EXISTE ───────────────────────────────────────────────────┐
 * │ O CI não tem Medusa, e sem Medusa a loja compila com o catálogo vazio: │
 * │ o Lighthouse media o /barba mostrando "esta categoria está sem         │
 * │ produto" — uma tela que o cliente nunca vê —, e o orçamento de         │
 * │ velocidade vigiava a página errada. Foi assim que o LCP do CI apontava │
 * │ pro texto do vazio e o CLS pro rodapé pulando por cima dele.           │
 * │                                                                        │
 * │ Com este falso no ar, o build pré-renderiza a home, as categorias e as │
 * │ páginas de produto com os seis produtos que a loja tem de verdade (os  │
 * │ de `apps/backend/src/scripts/produtos-iniciais.ts`: nome, preço, preço │
 * │ "de" e categoria), e o Lighthouse mede a grade, os cards e as fotos.   │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * AS FOTOS SÃO DESENHADAS AQUI, em PNG — um frasco na cor de cada produto —,
 * e não baixadas: o CI não depende de internet nem do Supabase. Moram em
 * `/static/…` na porta 9000 porque é o endereço que o `next.config.ts` já
 * libera pro Medusa de desenvolvimento; nada de configuração a mais. São
 * mais leves que as fotos de verdade — o LCP medido aqui é um piso, não o
 * número da produção.
 *
 * Só leitura, e só o que a vitrine pede: regiões, categorias, produtos,
 * configurações, a promoção e os preços por quantidade. Nada de carrinho, conta ou pedido — o
 * Lighthouse não compra. Rota que não existe aqui responde 404 e aparece no
 * log com `[medusa falso] sem rota`: se o build falhar por causa dela, é
 * porque alguma tela nova passou a pedir algo que o falso ainda não sabe.
 */

export const PORTA_PADRAO = Number(process.env.PORTA_MEDUSA_FALSO || 9000)

const CATEGORIAS = {
  barba: { id: "pcat_barba", name: "Barba", handle: "barba", description: "" },
  cabelo: { id: "pcat_cabelo", name: "Cabelo", handle: "cabelo", description: "" },
  kits: { id: "pcat_kits", name: "Kits", handle: "kits", description: "" },
}

/** Os seis de `produtos-iniciais.ts`, com a cor do frasco da foto desenhada. */
const PRODUTOS = [
  [
    "oleo-para-barba",
    "Óleo para Barba FuckingBarba 30ml",
    "Nutrição, brilho e maciez premium",
    "barba",
    54.9,
    79.9,
    [214, 158, 46],
  ],
  [
    "balm-para-barba",
    "Balm Modelador para Barba FuckingBarba 90g",
    "Controle, volume e estilo premium",
    "barba",
    53.9,
    78.9,
    [40, 44, 52],
  ],
  [
    "shampoo-para-barba",
    "Shampoo para Barba FuckingBarba 120ml",
    "Limpeza profunda e hidratação total",
    "barba",
    49.9,
    72.4,
    [79, 228, 182],
  ],
  [
    "fator-de-crescimento-para-barba",
    "Fator de Crescimento para Barba 30ml",
    "Crescimento, densidade e preenchimento",
    "barba",
    79.9,
    133.2,
    [120, 80, 50],
  ],
  [
    "spray-modelador-matte-100ml-fucking-barba",
    "Spray Modelador Matte Dry Touch 100ml",
    "Textura seca, alta fixação, acabamento natural",
    "cabelo",
    49.9,
    119.9,
    [18, 24, 31],
  ],
  [
    "kit-completo-para-barba",
    "Kit Completo FuckingBarba — Shampoo, Balm e Óleo",
    "A rotina inteira numa caixa só",
    "kits",
    99.9,
    189.9,
    [255, 216, 77],
  ],
].map(([handle, title, subtitle, categoria, preco, de, cor], i) => ({
  id: `prod_${handle}`,
  handle,
  title,
  subtitle,
  description: `${subtitle}. ${title}, da FuckingBarba.`,
  thumbnail: `http://localhost:${PORTA_PADRAO}/static/${handle}.png`,
  images: [{ id: `img_${handle}`, url: `http://localhost:${PORTA_PADRAO}/static/${handle}.png` }],
  weight: 150,
  length: 10,
  height: 5,
  width: 8,
  metadata: {},
  // Datas diferentes, pra "Novidades" ter o que ordenar.
  created_at: new Date(Date.UTC(2026, 8, 1 + i)).toISOString(),
  updated_at: new Date(Date.UTC(2026, 8, 19)).toISOString(),
  categories: [CATEGORIAS[categoria]],
  options: [],
  variants: [
    {
      id: `variant_${handle}`,
      title: "Único",
      sku: handle,
      manage_inventory: true,
      inventory_quantity: 20,
      options: [],
      calculated_price: {
        calculated_amount: preco,
        original_amount: de,
        currency_code: "brl",
      },
    },
  ],
  cor,
}))

/*
  O DESCONTO POR QUANTIDADE, imitado: a mesma conta de
  `apps/backend/src/lib/precos-por-quantidade.ts` (4% levando 2, 6% levando 3
  ou mais, pra baixo até o ,90 que divide em centavos). Mudou lá, muda aqui —
  senão o CI mede cartões de "2 unidades" com um preço que a loja não cobra.
*/
const FAIXAS = [
  { unidades: 2, desconto: 4 },
  { unidades: 3, desconto: 6 },
]

function unitarioDaFaixa(preco, unidades, desconto) {
  const cheio = Math.round(preco * 100) * unidades
  const comDesconto = Math.floor((cheio * (100 - desconto)) / 100)
  let reais = Math.floor((comDesconto - 90) / 100)
  while (reais >= 0 && (reais * 100 + 90) % unidades !== 0) reais--
  const total = reais * 100 + 90
  return reais >= 0 && total < cheio ? total / unidades / 100 : null
}

const CONFIGURACOES = {
  frete: { modo: "gratis", piso: 149.9, alvo: "mais-barata", tetoDeCusto: null },
  empresa: { razaoSocial: null, cnpj: null, endereco: null },
  atendimento: { whatsapp: null, email: null, horario: null, prazoDePostagem: null },
  home: { video: null },
}

/* ── as fotos ─────────────────────────────────────────────────────────────── */

/** Um PNG de 800×800: fundo claro e um frasco na cor do produto. */
function foto([r, g, b]) {
  const lado = 800
  const linha = Buffer.alloc(1 + lado * 3)
  const linhas = []
  for (let y = 0; y < lado; y++) {
    linha[0] = 0
    for (let x = 0; x < lado; x++) {
      const tampa = x > 350 && x < 450 && y > 170 && y < 250
      const frasco = x > 290 && x < 510 && y > 240 && y < 660
      const sombra = x > 300 && x < 530 && y > 650 && y < 680
      const [pr, pg, pb] = tampa
        ? [18, 24, 31]
        : frasco
          ? [r, g, b]
          : sombra
            ? [205, 210, 214]
            : [242, 243, 244]
      linha[1 + x * 3] = pr
      linha[2 + x * 3] = pg
      linha[3 + x * 3] = pb
    }
    linhas.push(Buffer.from(linha))
  }
  const pedaco = (tipo, dados) => {
    const t = Buffer.from(tipo, "ascii")
    const tam = Buffer.alloc(4)
    tam.writeUInt32BE(dados.length)
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(Buffer.concat([t, dados])) >>> 0)
    return Buffer.concat([tam, t, dados, crc])
  }
  const cabeca = Buffer.alloc(13)
  cabeca.writeUInt32BE(lado, 0)
  cabeca.writeUInt32BE(lado, 4)
  cabeca[8] = 8 // bits por canal
  cabeca[9] = 2 // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pedaco("IHDR", cabeca),
    pedaco("IDAT", deflateSync(Buffer.concat(linhas))),
    pedaco("IEND", Buffer.alloc(0)),
  ])
}

const FOTOS = new Map(PRODUTOS.map((p) => [`/static/${p.handle}.png`, foto(p.cor)]))

/* ── o servidor ───────────────────────────────────────────────────────────── */

/** `handle=a&handle=b`, `category_id[0]=x` — os dois jeitos que o SDK manda lista. */
function valores(url, chave) {
  return [...url.searchParams.entries()]
    .filter(([k]) => k === chave || k.startsWith(`${chave}[`))
    .map(([, v]) => v)
}

function semCor({ cor: _cor, ...produto }) {
  return produto
}

export async function subirMedusaFalso({ porta = PORTA_PADRAO } = {}) {
  const servidor = createServer((req, res) => {
    const url = new URL(req.url, "http://falso")
    const json = (corpo, status = 200) => {
      res.writeHead(status, { "content-type": "application/json" })
      res.end(JSON.stringify(corpo))
    }

    if (req.method !== "GET") return json({ message: "o Medusa falso é só de leitura" }, 405)

    const png = FOTOS.get(url.pathname)
    if (png) {
      res.writeHead(200, {
        "content-type": "image/png",
        "cache-control": "public, max-age=31536000",
      })
      return res.end(png)
    }

    switch (url.pathname) {
      case "/store/regions":
        return json({
          regions: [{ id: "reg_brasil", name: "Brasil", currency_code: "brl" }],
          count: 1,
        })
      case "/store/configuracoes":
        return json({ configuracoes: CONFIGURACOES })
      case "/store/promocao":
        return json({ promocao: null })
      case "/store/precos-por-quantidade": {
        const precos = {}
        for (const id of valores(url, "variante")) {
          const variante = PRODUTOS.flatMap((p) => p.variants).find((v) => v.id === id)
          if (!variante) continue
          const preco = variante.calculated_price.calculated_amount
          precos[id] = { 1: preco }
          for (const f of FAIXAS) {
            const unitario = unitarioDaFaixa(preco, f.unidades, f.desconto)
            if (unitario !== null) precos[id][f.unidades] = unitario
          }
        }
        return json({ precos })
      }
      case "/store/product-categories": {
        const handles = valores(url, "handle")
        const lista = Object.values(CATEGORIAS).filter(
          (c) => !handles.length || handles.includes(c.handle)
        )
        return json({
          product_categories: lista,
          count: lista.length,
          offset: 0,
          limit: lista.length,
        })
      }
      case "/store/products": {
        const handles = valores(url, "handle")
        const categorias = valores(url, "category_id")
        const lista = PRODUTOS.filter(
          (p) =>
            (!handles.length || handles.includes(p.handle)) &&
            (!categorias.length || p.categories.some((c) => categorias.includes(c.id)))
        )
        const offset = Number(url.searchParams.get("offset") ?? 0)
        const limit = Number(url.searchParams.get("limit") ?? 50)
        return json({
          products: lista.slice(offset, offset + limit).map(semCor),
          count: lista.length,
          offset,
          limit,
        })
      }
    }

    console.log(`[medusa falso] sem rota: ${req.method} ${url.pathname}${url.search}`)
    return json({ message: `rota que o Medusa falso não conhece: ${url.pathname}` }, 404)
  })

  // Sem host: escuta em IPv4 e IPv6, porque "localhost" (o das fotos) pode
  // resolver pra qualquer um dos dois.
  await new Promise((pronto) => servidor.listen(porta, pronto))
  return servidor
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await subirMedusaFalso()
  console.log(
    `[medusa falso] no ar em http://localhost:${PORTA_PADRAO} — ${PRODUTOS.length} produtos`
  )
}
