import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../lib/equipe/acesso"
import {
  enviosDos,
  lerContexto,
  notasDos,
  pedidoPorNumero,
  pedidosRecentes,
  totaisDos,
} from "../../../lib/painel/ler"
import { lerPagina, paginar } from "../../../lib/painel/paginas"
import {
  ehFiltro,
  FILTROS,
  linhaDaLista,
  passaNaBusca,
  passaNoFiltro,
  totalDo,
  type Filtro,
  type LinhaDaLista,
} from "../../../lib/painel/pedido"

/**
 * GET /dashboard/pedidos?filtro=&busca=&pagina= — a lista de pedidos do
 * painel. Dono e operação (o marketing não vê pedido com nome de cliente).
 *
 * Os últimos `LIMITE` pedidos, com a contagem de cada filtro (as fitas do
 * alto da tela contam sem a busca, como no protótipo). A busca procura
 * número, nome, e-mail e cidade; um número fora da janela vai direto no
 * pedido.
 *
 * EM PÁGINAS (`lib/painel/paginas.ts`): o filtro, a busca e as contagens
 * olham a janela inteira, lida SEM o total (o Medusa calcula o total pedido
 * a pedido — é o que pesa); só os pedidos da página mostrada leem o total
 * (`totaisDos`) e viajam até a tela.
 */
const LIMITE = 300

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "pedidos")) return

  const q = req.query as { filtro?: unknown; busca?: unknown; pagina?: unknown }
  const filtro: Filtro = ehFiltro(q.filtro) ? q.filtro : "todos"
  const busca = typeof q.busca === "string" ? q.busca.slice(0, 80) : ""
  const pagina = lerPagina(q.pagina)

  const agora = new Date()
  const [ctx, pedidos] = await Promise.all([
    lerContexto(req.scope, agora),
    pedidosRecentes(req.scope, { limite: LIMITE, agora, semTotal: true }),
  ])

  // Um número que não está entre os recentes: vai buscar ele.
  const numero = /^#?\d{1,9}$/.test(busca.trim()) ? Number(busca.trim().replace("#", "")) : null
  if (numero !== null && !pedidos.some((o) => o.display_id === numero)) {
    const velho = await pedidoPorNumero(req.scope, numero)
    if (velho) pedidos.push(velho)
  }

  const ids = pedidos.map((o) => o.id)
  const [notas, envios] = await Promise.all([notasDos(req.scope, ids), enviosDos(req.scope, ids)])
  const linhas = pedidos.map((o) => ({
    email: o.email ?? "",
    l: linhaDaLista(o, notas.get(o.id) ?? null, envios.get(o.id) ?? [], ctx),
  }))

  const contagem = Object.fromEntries(
    FILTROS.map((f) => [f, linhas.filter(({ l }) => passaNoFiltro(l, f)).length])
  ) as Record<Filtro, number>
  const lista: LinhaDaLista[] = linhas
    .filter(({ l, email }) => passaNoFiltro(l, filtro) && passaNaBusca(l, email, busca))
    .map(({ l }) => l)

  // Só a página viaja — e só ela lê o total.
  const { itens, paginacao } = paginar(lista, pagina)
  const totais = await totaisDos(
    req.scope,
    itens.map((l) => l.id)
  )
  const daPagina = itens.map((l) => {
    const t = totais.get(l.id)
    return t ? { ...l, total: totalDo(t) } : l
  })

  res.json({ pedidos: daPagina, contagem, filtro, busca, limite: LIMITE, paginacao })
}
