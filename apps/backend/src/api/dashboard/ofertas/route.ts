import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { randomBytes } from "node:crypto"
import { exigirArea, type PedidoDaEquipe } from "../../../lib/equipe/acesso"
import {
  acertarPrecosDasOfertas,
  gravarListaDaOferta,
  produtosComPreco,
  servicoDasOfertas,
  type OfertaGuardada,
} from "../../../lib/ofertas/lista"
import {
  avisarAsPaginas,
  linkDaOferta,
  ofertasNaLista,
  produtosDoFormulario,
} from "../../../lib/ofertas/painel"
import { lerOfertaNova, sugerirEndereco } from "../../../lib/ofertas/regras"
import { anotar } from "../../../lib/painel/anotar"

/**
 * AS OFERTAS OCULTAS NO PAINEL (Cupons e descontos → Ofertas ocultas; a
 * regra em `lib/ofertas/regras.ts`). Marketing e dono, como os cupons.
 *
 * GET: `{ ofertas, produtos, sorteio }` — as ofertas (da mais nova pra mais
 * velha), os produtos publicados com o preço de hoje (o formulário) e quatro
 * letras pro endereço sugerido.
 *
 * POST: cria. A oferta nasce, a lista de preço dela também (com a regra
 * `fb_oferta`), e os preços entram na hora — o link já vende. Se a lista
 * não nascer, a oferta é apagada: oferta sem lista mostraria um preço que o
 * carrinho não cobra.
 *
 * RESPOSTAS: GET 200. POST 200 `{ oferta }`; 422 `{ erros }` (campo → frase).
 */

export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "cupons")) return

  const lidas = (await servicoDasOfertas(req.scope).listOfertas(
    {},
    { take: 200, order: { created_at: "DESC" } }
  )) as unknown as OfertaGuardada[]
  const [ofertas, produtos] = await Promise.all([
    ofertasNaLista(req.scope, lidas),
    produtosDoFormulario(req.scope),
  ])
  res.json({ ofertas, produtos, sorteio: randomBytes(3).toString("hex").slice(0, 4) })
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "cupons")) return

  const agora = new Date()
  const corpo = (req.body ?? {}) as Record<string, unknown>
  const loja = await produtosComPreco(req.scope)
  const precos = new Map([...loja].map(([id, p]) => [id, { nome: p.nome, preco: p.preco }]))
  const lido = lerOfertaNova(
    // Sem endereço, o sugerido: o nome e quatro letras sorteadas.
    {
      ...corpo,
      endereco:
        corpo.endereco || sugerirEndereco(String(corpo.nome ?? ""), randomBytes(3).toString("hex")),
    },
    agora,
    precos
  )
  if (!lido.ok) {
    res.status(422).json({ erros: lido.erros })
    return
  }
  const o = lido.oferta
  const servico = servicoDasOfertas(req.scope)
  const [repetida] = await servico.listOfertas({ slug: o.endereco }, { take: 1 })
  if (repetida) {
    res.status(422).json({ erros: { endereco: "Esse endereço já é de outra oferta." } })
    return
  }

  const criada = (await servico.createOfertas({
    slug: o.endereco,
    nome: o.nome,
    titulo: o.titulo,
    chamada: o.chamada,
    comeca_em: new Date(o.comeca),
    termina_em: new Date(o.termina),
    pausada: false,
    // O `json` do modelo é tipado como objeto; a lista vai como está.
    produtos: o.produtos as unknown as Record<string, unknown>,
    criada_por: pedido.membro.id,
  })) as unknown as OfertaGuardada
  try {
    const lista = await gravarListaDaOferta(req.scope, { ...criada, produtos: o.produtos })
    await acertarPrecosDasOfertas(req.scope, [{ ...criada, produtos: o.produtos, lista_id: lista }])
  } catch (e) {
    await servico.deleteOfertas(criada.id).catch(() => undefined)
    req.scope
      .resolve(ContainerRegistrationKeys.LOGGER)
      .error(`[ofertas] a lista de preço de "${o.endereco}" não nasceu; a oferta saiu: ${e}`)
    throw e
  }
  await anotar(pedido, "criou-oferta", criada.id, {
    nome: o.nome,
    endereco: o.endereco,
    link: linkDaOferta(o.endereco),
  })
  await avisarAsPaginas(req.scope)

  const [oferta] = await ofertasNaLista(req.scope, [{ ...criada, produtos: o.produtos }])
  res.json({ oferta })
}
