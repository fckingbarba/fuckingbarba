import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { urlDoPainel } from "../../../../../lib/emails/convite"
import { ehDoArmazenamento } from "../../../../../lib/imagens"
import { mudarPdp } from "../../../../../lib/painel/gravar-produto"
import { CHAVE_NO_METADATA, lerPdp, type Pdp } from "../../../../../lib/pdp"

/**
 * GET/POST /admin/produtos/:id/pdp — a página do produto (`fb_pdp`) inteira.
 *
 * Quem edita a página agora é o painel (`/dashboard/produtos/:id/*`, uma
 * mudança de cada vez); o widget do admin só aponta pra lá (o GET devolve o
 * endereço, `painel`). Esta rota fica pros conferidores, que montam a
 * página de um produto de uma vez — e grava do mesmo jeito que o painel:
 * dentro da trava do produto, só a chave `fb_pdp` (`mudarPdp`), e só fundo
 * que está no armazenamento da loja.
 *
 * GRAVA O QUE PASSOU PELA MESMA PENEIRA DA LEITURA. `lerPdp` é reaproveitada
 * inteira: uma seção com campo obrigatório faltando não entra, em vez de
 * entrar pela metade e desenhar um cabeçalho solto no meio da página. Assim
 * o que a loja lê é exatamente o que foi gravado, sem uma segunda validação
 * que pode divergir da primeira.
 *
 * DERRUBA DUAS ETIQUETAS: a do produto (o texto mudou) e a do layout daquele
 * produto (as seções podem ter mudado de ordem). São etiquetas diferentes
 * porque os dois dados têm cadências diferentes, e derrubar só uma deixaria
 * a página com o texto novo na ordem velha.
 */

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const produto = await buscar(req)
  res.json({ pdp: lerPdp(produto.metadata), painel: urlDoPainel() })
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const produto = await buscar(req)

  const pedida: Pdp = lerPdp({ [CHAVE_NO_METADATA]: req.body })
  // O fundo com imagem de fora sai: a loja só mostra o que está no armazenamento dela.
  const fundos = Object.fromEntries(
    Object.entries(pedida.fundos).filter(([, f]) =>
      [f.imagem, f.imagemCelular].every((u) => !u || ehDoArmazenamento(u))
    )
  )
  const r = await mudarPdp(req.scope, produto.id, () => ({
    ok: true,
    pdp: { ...pedida, fundos },
  }))
  if (!r.ok) throw new MedusaError(MedusaError.Types.NOT_FOUND, `Produto ${produto.id} não existe`)

  const secoes = Object.keys(r.pdp.conteudo)
  logger.info(`[pdp] ${produto.handle}: ${secoes.length ? secoes.join(", ") : "sem seções"}`)

  res.json({ pdp: r.pdp, loja_avisada: r.lojaAvisada })
}

async function buscar(req: MedusaRequest) {
  const id = req.params.id
  const service = req.scope.resolve(Modules.PRODUCT)
  const [produto] = await service.listProducts(
    { id },
    { select: ["id", "handle", "title", "metadata"], take: 1 }
  )
  if (!produto) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Produto ${id} não existe`)
  }
  return produto
}
