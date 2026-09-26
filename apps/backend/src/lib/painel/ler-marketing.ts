import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { lerConfiguracoes } from "../configuracoes"
import { avisarNoLog, configuracaoDoGa4, ErroDoGa4, relatoriosDoMarketing } from "./ga4"
import {
  carrinhosComPagamento,
  carrinhosDesde,
  numerosDaNewsletter,
  pedidosComPagamento,
  pedidosDesde,
  produtosPublicados,
} from "./ler"
import { estoquesDos, lerProdutos, metadataDos } from "./ler-produtos"
import {
  enderecoDaLoja,
  hostsDaLoja,
  janelasDo,
  lerPedidosDesde,
  somaNa,
  vendasDos,
  type Periodo,
} from "./marketing"
import { juntarAchados, type AchadosDoResumo, type SemGoogleNoResumo } from "./marketing-achados"
import { montarCanais, perguntasDosCanais } from "./marketing-canais"
import { montarClientes } from "./marketing-clientes"
import {
  achadosDoFunil,
  aparelhosDo,
  funilDoCheckout,
  funilDoSite,
  navegadorDoPedido,
  perguntasDoFunil,
  type Aparelho,
  type Passo,
} from "./marketing-funil"
import { caixasDos, montarOfertas } from "./marketing-ofertas"
import { montarPagamento } from "./marketing-pagamento"
import { catalogoDos, montarProdutos, perguntaDosProdutos } from "./marketing-produtos"
import type { RelatorioGa4 } from "./visitas"

/**
 * O QUE CADA ABA DO MARKETING LÊ, e a conta dela. A regra de cada uma está
 * no módulo puro dela, ao lado (`marketing-funil.ts`, `marketing-canais.ts`…);
 * aqui é o banco e o Google. Serve à rota de cada aba e ao "O que os dados
 * dizem" do Resumo (`lerAchadosDoMarketing`), que junta as frases de todas —
 * as mesmas contas, então o Resumo diz o mesmo que as abas.
 *
 * O GOOGLE PODE FALTAR: o que é da loja vem sempre; o que é do Google vem
 * com o `estado` — "ok", ou por que não veio (os mesmos do `/visitas`).
 */

type EstadoDoGoogle = "ok" | "desligado" | "invalida" | "recusado" | "fora"

/** O funil: do site até o pagamento (o Google), da sacola ao pagamento (os carrinhos) e o celular. */
export async function lerFunilDoMarketing(
  container: MedusaContainer,
  periodo: Periodo,
  agora: Date
) {
  const { atual } = janelasDo(periodo, agora)
  const [carrinhos, pedidos] = await Promise.all([
    carrinhosDesde(container, atual.de),
    pedidosDesde(container, atual.de, { comMetadata: true }),
  ])
  const vendas = vendasDos(pedidos)
  const checkout = funilDoCheckout(carrinhos, new Set(vendas.map((v) => v.id)), atual)
  const navegador = new Map(pedidos.map((o) => [o.id, navegadorDoPedido(o.metadata)]))
  const comNavegador = vendas.map((v) => ({
    pagoEm: v.pagoEm,
    navegador: navegador.get(v.id) ?? null,
  }))

  let google:
    | { estado: "ok"; site: Passo[]; aparelhos: Aparelho[] | null }
    | { estado: Exclude<EstadoDoGoogle, "ok"> }
  const cfg = configuracaoDoGa4()
  if (cfg === "desligado" || cfg === "invalida") google = { estado: cfg }
  else
    try {
      const hosts = hostsDaLoja(process.env.LOJA_URL)
      const r = await relatoriosDoMarketing(
        cfg,
        `funil:${periodo}:${hosts.join(",")}`,
        perguntasDoFunil(periodo, hosts),
        agora
      )
      google = {
        estado: "ok",
        site: funilDoSite(r),
        aparelhos: aparelhosDo(r[3], comNavegador, atual),
      }
    } catch (e) {
      const tipo = e instanceof ErroDoGa4 ? e.tipo : "fora"
      avisarNoLog(
        container,
        "o funil do marketing",
        tipo,
        e instanceof Error ? e.message : String(e)
      )
      google = { estado: tipo }
    }

  return {
    periodo,
    checkout,
    ...google,
    achados: google.estado === "ok" ? achadosDoFunil(google.site, google.aparelhos) : [],
  }
}

/**
 * Os canais: vem sempre `pagos` (os pedidos pagos da loja no período), `loja`
 * (o endereço, pro montador de link) e `paginas` (a home, a vitrine e os
 * produtos publicados); os canais, as campanhas e o `semOrigem`, com o Google.
 */
export async function lerCanaisDoMarketing(
  container: MedusaContainer,
  periodo: Periodo,
  agora: Date
) {
  const [pedidos, produtos] = await Promise.all([
    pedidosDesde(container, lerPedidosDesde(periodo, agora)),
    produtosPublicados(container),
  ])
  const pagos = somaNa(vendasDos(pedidos), janelasDo(periodo, agora).atual)
  const base = {
    periodo,
    pagos,
    loja: enderecoDaLoja(process.env.LOJA_URL),
    paginas: [
      { nome: "Home", caminho: "/" },
      { nome: "Todos os produtos", caminho: "/produtos" },
      ...produtos.map((p) => ({ nome: p.nome, caminho: `/produtos/${p.handle}` })),
    ],
  }

  const cfg = configuracaoDoGa4()
  if (cfg === "desligado" || cfg === "invalida") return { ...base, estado: cfg }
  try {
    const hosts = hostsDaLoja(process.env.LOJA_URL)
    const r = await relatoriosDoMarketing(
      cfg,
      `canais:${periodo}:${hosts.join(",")}`,
      perguntasDosCanais(periodo, hosts),
      agora
    )
    return { ...base, estado: "ok" as const, ...montarCanais(r, pagos) }
  } catch (e) {
    const tipo = e instanceof ErroDoGa4 ? e.tipo : "fora"
    avisarNoLog(
      container,
      "os canais do marketing",
      tipo,
      e instanceof Error ? e.message : String(e)
    )
    return { ...base, estado: tipo }
  }
}

/** Os produtos: o que cada um atrai (o Google), põe na sacola e vende; sem o Google, a lista vem igual. */
export async function lerProdutosDoMarketing(
  container: MedusaContainer,
  periodo: Periodo,
  agora: Date
) {
  const [produtos, pedidos] = await Promise.all([
    lerProdutos(container),
    pedidosDesde(container, lerPedidosDesde(periodo, agora)),
  ])
  const catalogo = catalogoDos(produtos, await estoquesDos(container, produtos))
  const vendas = vendasDos(pedidos)
  const { atual } = janelasDo(periodo, agora)

  let ga: RelatorioGa4 | null = null
  let estado: EstadoDoGoogle = "ok"
  const cfg = configuracaoDoGa4()
  if (cfg === "desligado" || cfg === "invalida") estado = cfg
  else
    try {
      ;[ga] = await relatoriosDoMarketing(
        cfg,
        `produtos:${periodo}`,
        [perguntaDosProdutos(periodo)],
        agora
      )
    } catch (e) {
      estado = e instanceof ErroDoGa4 ? e.tipo : "fora"
      avisarNoLog(
        container,
        "os produtos do marketing",
        estado,
        e instanceof Error ? e.message : String(e)
      )
    }

  return { periodo, estado, ...montarProdutos(catalogo, vendas, atual, ga) }
}

/** As ofertas: a caixa de compra de cada produto, a oferta do checkout e os cupons. Tudo da loja. */
export async function lerOfertasDoMarketing(
  container: MedusaContainer,
  periodo: Periodo,
  agora: Date
) {
  const [produtos, pedidos] = await Promise.all([
    lerProdutos(container),
    pedidosDesde(container, lerPedidosDesde(periodo, agora)),
  ])
  const metadata = await metadataDos(
    container,
    produtos.filter((p) => p.status === "published").map((p) => p.id)
  )
  return {
    periodo,
    ...montarOfertas(
      caixasDos(produtos, metadata),
      vendasDos(pedidos),
      janelasDo(periodo, agora).atual
    ),
  }
}

/** Os clientes: a história inteira da loja nova (a primeira compra pode ser de antes do período). */
export async function lerClientesDoMarketing(
  container: MedusaContainer,
  periodo: Periodo,
  agora: Date
) {
  const [pedidos, newsletter] = await Promise.all([
    pedidosComPagamento(container, null),
    numerosDaNewsletter(container, agora),
  ])
  return {
    periodo,
    newsletter,
    ...montarClientes(pedidos, janelasDo(periodo, agora).atual),
  }
}

/** O pagamento e o frete: o estado que o Pagar.me deixa em cada sessão. Tudo da loja. */
export async function lerPagamentoDoMarketing(
  container: MedusaContainer,
  periodo: Periodo,
  agora: Date
) {
  const { atual } = janelasDo(periodo, agora)
  const [pedidos, carrinhos, lojas] = await Promise.all([
    // Os pedidos com a folga do Resumo: o feito antes e pago dentro conta como pago no período.
    pedidosComPagamento(container, lerPedidosDesde(periodo, agora)),
    carrinhosComPagamento(container, atual.de),
    container.resolve(Modules.STORE).listStores({}, { select: ["metadata"], take: 1 }),
  ])
  const politica = lerConfiguracoes(lojas[0]?.metadata).frete
  return { periodo, ...montarPagamento(pedidos, carrinhos, politica, atual, agora) }
}

/**
 * "O que os dados dizem", no Resumo: as frases de todas as abas, pela regra
 * de `juntarAchados`. As seis contas correm juntas; as perguntas ao Google
 * são as mesmas das abas (e a mesma chave no cache: abrir a aba depois não
 * pergunta de novo).
 */
export async function lerAchadosDoMarketing(
  container: MedusaContainer,
  periodo: Periodo,
  agora: Date
): Promise<{ periodo: Periodo } & AchadosDoResumo> {
  const [funil, canais, produtos, ofertas, clientes, pagamento] = await Promise.all([
    lerFunilDoMarketing(container, periodo, agora),
    lerCanaisDoMarketing(container, periodo, agora),
    lerProdutosDoMarketing(container, periodo, agora),
    lerOfertasDoMarketing(container, periodo, agora),
    lerClientesDoMarketing(container, periodo, agora),
    lerPagamentoDoMarketing(container, periodo, agora),
  ])
  // Sem o Google, faltam as frases das três abas que dependem dele — o estado é um só pra todas.
  const semGoogle: SemGoogleNoResumo | null =
    [funil.estado, canais.estado, produtos.estado].find(
      (e): e is SemGoogleNoResumo => e !== "ok"
    ) ?? null
  return {
    periodo,
    ...juntarAchados(
      {
        funil: funil.achados,
        canais: "achado" in canais && canais.achado ? [canais.achado] : [],
        produtos: produtos.achado ? [produtos.achado] : [],
        ofertas: ofertas.achados,
        clientes: clientes.achados,
        pagamento: pagamento.achados,
      },
      semGoogle
    ),
  }
}
