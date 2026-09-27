import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../lib/equipe/acesso"
import { juntarPessoas, newsletterDa } from "../../../lib/painel/clientes"
import { inscricoesDaNewsletter, lerClientes } from "../../../lib/painel/ler"
import { lerPagina, paginar } from "../../../lib/painel/paginas"

/** A newsletter é uma linha curta por pessoa: 50 por página. */
const POR_PAGINA_DA_NEWSLETTER = 50

/**
 * GET /dashboard/newsletter — quem aceitou receber ofertas por e-mail: a
 * newsletter do rodapé e a caixa da conta, numa lista só (`newsletterDa`),
 * com os números de cima. Cada e-mail que é de cliente leva pra ficha.
 * Marketing e dono.
 *
 * Em páginas de 50 (`?pagina=`); os números contam todos. `?todos=1` manda
 * a lista inteira — é a do CSV que o painel baixa.
 *
 * RESPOSTAS: 200 `{ inscritos, numeros, paginacao }`.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "newsletter")) return

  const q = req.query as { pagina?: unknown; todos?: unknown }
  const [clientes, inscricoes] = await Promise.all([
    lerClientes(req.scope),
    inscricoesDaNewsletter(req.scope),
  ])
  const lista = newsletterDa(juntarPessoas(clientes, [], inscricoes), inscricoes, new Date())
  if (q.todos === "1") return void res.json(lista)
  const { itens, paginacao } = paginar(
    lista.inscritos,
    lerPagina(q.pagina),
    POR_PAGINA_DA_NEWSLETTER
  )
  res.json({ ...lista, inscritos: itens, paginacao })
}
