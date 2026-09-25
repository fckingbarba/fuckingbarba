import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../../lib/equipe/acesso"
import { anotar } from "../../../../../lib/painel/anotar"
import { gravarPromocao } from "../../../../../lib/painel/gravar-promocao"
import { lerProduto, precosDos } from "../../../../../lib/painel/ler-produtos"
import { precoDo, type ProdutoCru } from "../../../../../lib/painel/produtos"
import { lerPromocao } from "../../../../../lib/painel/promocao"

/**
 * POST /dashboard/produtos/:id/promocao — `{ por }`: o "por" do de/por, em
 * reais ("59,90"); vazio ou `null` tira a promoção. O "de" é o preço do
 * Bling. Vale pra todas as variações do produto — que por isso precisam ter
 * o mesmo preço. Dono e marketing; a operação vê a lista, sem o botão.
 *
 * Fica no registro da equipe ("mudou-promocao", com o de, o por e o de
 * antes): o histórico do produto diz quem mudou o preço.
 *
 * RESPOSTAS: 200 `{ promocao, lojaAvisada }` (a promoção valendo depois de
 * gravar, ou `null`); 400 `valor_invalido`, `nao_e_desconto` ou
 * `desconto_demais`; 404 `nao_encontrado`; 409 `sem_preco` ou
 * `precos_diferentes`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "editarProdutos")) return

  const p = /^prod_[0-9A-Z]{10,40}$/.test(req.params.id)
    ? await lerProduto(req.scope, req.params.id)
    : null
  if (!p) {
    res.status(404).json({ message: "nao_encontrado" })
    return
  }
  const de = precoDo(p)
  if (!de) {
    res.status(409).json({ message: "sem_preco" })
    return
  }
  if (new Set((p.variants ?? []).map(precoDaVariacao)).size > 1) {
    res.status(409).json({ message: "precos_diferentes" })
    return
  }
  const leitura = lerPromocao((req.body as { por?: unknown } | undefined)?.por, de)
  if (!leitura.ok) {
    res.status(400).json({ message: leitura.motivo })
    return
  }

  const antes = (await precosDos(req.scope, [p])).get(p.id)?.promocao?.por ?? null
  const r = await gravarPromocao(req.scope, p, leitura.por)
  if (!r.ok) {
    res.status(409).json({ message: r.motivo })
    return
  }
  await anotar(pedido, "mudou-promocao", p.id, { de, por: leitura.por, antes })
  const depois = (await precosDos(req.scope, [p])).get(p.id)
  res.json({ promocao: depois?.promocao ?? null, lojaAvisada: r.lojaAvisada })
}

/** O preço em reais de uma variação, o do Bling. */
function precoDaVariacao(v: NonNullable<ProdutoCru["variants"]>[number]): number | null {
  const n = Number(v.prices?.find((x) => x.currency_code?.toLowerCase() === "brl")?.amount)
  return Number.isFinite(n) && n > 0 ? n : null
}
