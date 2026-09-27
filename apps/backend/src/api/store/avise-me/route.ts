import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { lerSituacoes } from "../../../lib/avise-me"
import { criarLimite } from "../../../lib/limite"
import { quemPede } from "../../../lib/quem-pede"
import { avisarALoja } from "../../../lib/revalidar"
import { normalizarEmail } from "../../../modules/codigo/regras"
import { pedirAvisoWorkflow } from "../../../workflows/avise-me/pedir"

/**
 * POST /store/avise-me — `{ email, variante }`: "me avisa quando este produto
 * voltar". O e-mail sai uma vez, quando ele volta (o job
 * `avisar-quem-espera`, `lib/avise-me.ts`).
 *
 * SÓ DE PRODUTO NO SITE E ESGOTADO: variante que não existe ou está em
 * rascunho é 400; a que tem estoque é 409 `tem_estoque` — a página que a
 * pessoa via estava velha. A rota avisa a loja ANTES de responder (a
 * página do produto se refaz), e a loja recarrega a página, agora com o
 * botão de comprar, em vez de guardar um aviso que chegaria em cinco
 * minutos.
 *
 * A RESPOSTA É A MESMA pra quem já esperava e pra quem acabou de pedir,
 * como na newsletter: "você já está na lista" diria quem pediu o quê.
 *
 * OS LIMITES são os da newsletter, na memória (ver `store/newsletter`): por
 * quem pede, 10 por hora com a assinatura da loja e 60 sem; da loja toda,
 * 500 por hora. Sem teto, o formulário vira jeito de mandar e-mail da loja
 * pra lista de alguém.
 *
 * RESPOSTAS: 200 `{ ok: true }`; 400 `email_invalido` ou `variante_invalida`;
 * 409 `tem_estoque`; 429 `limite`.
 */

const HORA = 60 * 60 * 1000
const POR_IP_ASSINADO = { limite: 10, ms: HORA }
const POR_IP_SEM_ASSINATURA = { limite: 60, ms: HORA }
const DA_LOJA = { limite: 500, ms: HORA }
const limite = criarLimite()

/*
  O AVISO À LOJA, NO MÁXIMO A CADA 5 MINUTOS (auditoria de 27/09). Pedir
  aviso de um produto que já tem estoque é o sinal de uma página velha
  ("esgotado"), e a loja refaz a página e as listas. Sem freio, cada pedido
  refazia as listas de produtos inteiras de novo — e toda visita esperava a
  página ser montada. Agora a lista (`produtos`) é refeita no máximo a cada
  5 minutos, e cada produto também: a página velha sai do ar do mesmo jeito.
*/
const AVISO_A_CADA_MS = 5 * 60 * 1000
const ultimoAviso = new Map<string, number>()
function podeAvisar(etiqueta: string, agora: number): boolean {
  if (agora - (ultimoAviso.get(etiqueta) ?? 0) < AVISO_A_CADA_MS) return false
  ultimoAviso.set(etiqueta, agora)
  return true
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const corpo = (req.body ?? {}) as { email?: unknown; variante?: unknown }
  const email = normalizarEmail(corpo.email)
  if (!email) {
    res.status(400).json({ message: "email_invalido" })
    return
  }
  const varianteId =
    typeof corpo.variante === "string" && /^variant_[0-9A-Za-z]{10,40}$/.test(corpo.variante)
      ? corpo.variante
      : null
  if (!varianteId) {
    res.status(400).json({ message: "variante_invalida" })
    return
  }

  const quem = quemPede(req)
  const porIp = quem.assinado ? POR_IP_ASSINADO : POR_IP_SEM_ASSINATURA
  if (!limite.cabe(quem.chave, porIp) || !limite.cabe("loja", DA_LOJA)) {
    res.status(429).json({ message: "limite" })
    return
  }
  // Conta ANTES de ler o catálogo: o pedido com variante errada também
  // custa leitura, e sem contar ele seria de graça pra quem insiste.
  limite.contar(quem.chave, porIp)
  limite.contar("loja", DA_LOJA)

  const { data } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "product_variant",
    fields: ["id", "product_id"],
    filters: { id: varianteId },
  })
  const produtoId = (data as { product_id?: string | null }[])[0]?.product_id
  const situacao = produtoId
    ? (await lerSituacoes(req.scope, { produtoId })).get(varianteId)
    : undefined
  if (!situacao?.publicado) {
    res.status(400).json({ message: "variante_invalida" })
    return
  }
  if (situacao.vende) {
    const agora = Date.now()
    const etiquetas = situacao.handle
      ? ["produtos", `produto:${situacao.handle}`].filter((e) => podeAvisar(e, agora))
      : []
    if (etiquetas.length) {
      await avisarALoja(etiquetas, req.scope.resolve(ContainerRegistrationKeys.LOGGER), "agora")
    }
    res.status(409).json({ message: "tem_estoque" })
    return
  }

  await pedirAvisoWorkflow(req.scope).run({
    input: { email, varianteId, produtoId: situacao.produtoId },
  })

  res.json({ ok: true })
}
