import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../../lib/equipe/acesso"
import { anotar } from "../../../../../lib/painel/anotar"
import { gravarPreco } from "../../../../../lib/painel/gravar-preco"
import { lerProduto, precosDos } from "../../../../../lib/painel/ler-produtos"
import { precoDo, type ProdutoCru } from "../../../../../lib/painel/produtos"
import { lerMudancaDePreco } from "../../../../../lib/painel/promocao"

/**
 * POST /dashboard/produtos/:id/preco — os dois campos da lista de Produtos:
 * `{ preco?, promocional? }`, em reais ("59,90"). Campo que não vem não
 * muda; o promocional vazio (ou `null`) tira a promoção. Vale pra todas as
 * variações do produto — que por isso precisam ter o mesmo preço. Dono e
 * marketing; a operação vê a lista, sem os campos.
 *
 * O preço mudado aqui fica com a marca `fb_preco`: a importação do Bling
 * não troca mais. Cada mudança vai pro registro da equipe ("mudou-preco",
 * "mudou-promocao"): o histórico do produto diz quem mudou, de quanto.
 *
 * RESPOSTAS: 200 `{ preco, promocao, lojaAvisada }` (como ficou); 400
 * `{ message, campo }` — `valor_invalido`, `nao_e_desconto`,
 * `desconto_demais`, `mudanca_demais` ou `promocao_acima`; 404
 * `nao_encontrado`; 409 `sem_preco` ou `precos_diferentes`.
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

  const antes = (await precosDos(req.scope, [p])).get(p.id)
  const corpo = (req.body ?? {}) as { preco?: unknown; promocional?: unknown }
  const leitura = lerMudancaDePreco(
    { preco: corpo.preco, promocional: corpo.promocional },
    { preco: de, promocional: antes?.doPainel ?? null }
  )
  if (!leitura.ok) {
    res.status(400).json({ message: leitura.motivo, campo: leitura.campo })
    return
  }

  const mudouPromocional =
    leitura.promocional !== undefined &&
    // Tirar o que não existe, ou pôr o mesmo, não é mudança — a não ser que a promoção de
    // hoje venha de outra lista: aí gravar é o que a passa pro painel (ou a tira).
    (leitura.promocional !== (antes?.doPainel ?? null) || Boolean(antes?.promocao?.deOutraLista))
  const r = await gravarPreco(req.scope, p, {
    preco: leitura.preco,
    promocional: mudouPromocional ? leitura.promocional : undefined,
  })
  if (!r.ok) {
    res.status(409).json({ message: r.motivo })
    return
  }
  if (leitura.preco !== null) await anotar(pedido, "mudou-preco", p.id, { de, para: leitura.preco })
  if (mudouPromocional)
    await anotar(pedido, "mudou-promocao", p.id, {
      de: leitura.preco ?? de,
      por: leitura.promocional ?? null,
      antes: antes?.promocao?.por ?? null,
    })

  // Relido: o preço da variação mudou, e o `p` de cima é o de antes.
  const relido = (await lerProduto(req.scope, p.id)) ?? p
  const depois = (await precosDos(req.scope, [relido])).get(p.id)
  res.json({
    preco: leitura.preco ?? de,
    promocao: depois?.promocao ?? null,
    lojaAvisada: r.lojaAvisada,
  })
}

/** O preço em reais de uma variação (o "de"). */
function precoDaVariacao(v: NonNullable<ProdutoCru["variants"]>[number]): number | null {
  const n = Number(v.prices?.find((x) => x.currency_code?.toLowerCase() === "brl")?.amount)
  return Number.isFinite(n) && n > 0 ? n : null
}
