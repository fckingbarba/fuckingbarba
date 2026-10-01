import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { CARRINHO, lerCarrinho, marcarCarrinho } from "../../../../lib/ofertas/loja"
import { produtosGuardados, servicoDasOfertas } from "../../../../lib/ofertas/lista"
import { ID_DA_OFERTA, MARCA_DA_OFERTA, situacaoDaOferta } from "../../../../lib/ofertas/regras"
import { daLoja } from "../../../../lib/quem-pede"

/**
 * POST /store/ofertas/conferir — `{ carrinho }`: o checkout abriu com um
 * carrinho da oferta oculta. A linha guarda o preço de quando entrou na
 * sacola — o Medusa não refaz sozinho —, então a oferta que acabou (pelo
 * fim, pausada ou encerrada no painel) seguiria valendo pra quem deixou a
 * sacola cheia. Aqui a marca sai e as linhas voltam pro preço da vitrine,
 * ANTES de a tela do checkout ler o carrinho (`conferirOferta`, na loja).
 *
 * Quem abriu o checkout antes do fim e só clica em "Pagar" depois cai na
 * outra trava: o "Pagar" da loja refaz a conta antes de cobrar (entrega
 * 0136), e a lista que acabou não acha preço — o total muda e nada é
 * cobrado.
 *
 * SÓ A LOJA (`x-loja-segredo`). RESPOSTAS: 200 `{ acabou }` — o título da
 * oferta que acabou (a tela avisa), ou `null`; 400 `dados_invalidos`; 401.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!daLoja(req)) {
    res.status(401).json({ message: "sem_assinatura" })
    return
  }
  const corpo = (req.body ?? {}) as { carrinho?: unknown }
  const id =
    typeof corpo.carrinho === "string" && CARRINHO.test(corpo.carrinho) ? corpo.carrinho : ""
  if (!id) {
    res.status(400).json({ message: "dados_invalidos" })
    return
  }
  const carrinho = await lerCarrinho(req.scope, id)
  const marca = carrinho?.metadata?.[MARCA_DA_OFERTA]
  if (!carrinho || carrinho.completed_at || typeof marca !== "string" || !marca) {
    res.json({ acabou: null })
    return
  }
  const [lida] = ID_DA_OFERTA.test(marca)
    ? await servicoDasOfertas(req.scope).listOfertas({ id: marca }, { take: 1 })
    : []
  const oferta = lida ? { ...lida, produtos: produtosGuardados(lida.produtos) } : null
  if (oferta && situacaoDaOferta(oferta, Date.now()) === "no-ar") {
    res.json({ acabou: null })
    return
  }
  await marcarCarrinho(req.scope, carrinho, null)
  req.scope
    .resolve(ContainerRegistrationKeys.LOGGER)
    .info(`[ofertas] o carrinho ${id} voltou pro preço da vitrine: a oferta ${marca} acabou`)
  res.json({ acabou: oferta?.titulo ?? "A oferta" })
}
