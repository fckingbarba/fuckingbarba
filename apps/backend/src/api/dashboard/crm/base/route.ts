import { gunzipSync } from "node:zlib"
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import { lerCorpoGrande } from "../../../../lib/corpo-grande"
import { lerAjustesGuardados } from "../../../../lib/crm/ajustes"
import type { PedidoDaPessoa } from "../../../../lib/crm/etiquetas"
import { lerArquivoDaNuvemshop, TAMANHO_MAXIMO } from "../../../../lib/crm/nuvemshop"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import { anotar } from "../../../../lib/painel/anotar"
import { montarTelaDaBase, pedidoDaPessoa } from "../../../../lib/painel/crm"
import { pedidosParaAsEtiquetas } from "../../../../lib/painel/ler"
import { normalizarEmail } from "../../../../modules/codigo/regras"
import { CRM } from "../../../../modules/crm"
import type CrmService from "../../../../modules/crm/service"

/**
 * GET /dashboard/crm/base — a aba da base da Nuvemshop (`montarTelaDaBase`):
 * o que entrou (pessoas, quem aceita ofertas, pedidos, carrinhos) e quem é
 * quem na base inteira, com os pedidos da loja antiga e os da nova.
 *
 * POST /dashboard/crm/base — `{ nome, gzip }`: UM dos três arquivos que a
 * Nuvemshop exporta (Clientes, Vendas ou Carrinhos abandonados), comprimido
 * no navegador e em base64. O arquivo se reconhece pelo cabeçalho; fica só
 * o que o CRM usa (`lib/crm/nuvemshop.ts`), e mandar de novo atualiza. O
 * registro da equipe anota quantos entraram — nenhum dado de ninguém.
 *
 * Quem abre o CRM (no padrão, o dono e o marketing).
 *
 * RESPOSTAS: GET 200 a tela; POST 200 `{ tipo, lidas, novos, atualizados,
 * ignoradas }`, 422 `{ erro: "arquivo_invalido" | "vazio" | "desconhecido" }`,
 * 413 `{ erro: "grande" }`.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  if (!exigirArea(req as PedidoDaEquipe, res, "crm")) return
  const crm = req.scope.resolve<CrmService>(CRM)
  const [resumo, pessoas, pedidos, sinais, daLoja, lojas] = await Promise.all([
    crm.resumoDaBase(),
    crm.pessoasDaBase(),
    crm.pedidosDaBase(),
    crm.sinaisDeTodos(),
    pedidosParaAsEtiquetas(req.scope),
    req.scope.resolve(Modules.STORE).listStores({}, { select: ["metadata"], take: 1 }),
  ])
  const pedidosDaLoja = new Map<string, PedidoDaPessoa[]>()
  for (const o of daLoja) {
    const email = normalizarEmail(o.email)
    if (email) pedidosDaLoja.set(email, [...(pedidosDaLoja.get(email) ?? []), pedidoDaPessoa(o)])
  }
  res.json(
    montarTelaDaBase({
      resumo,
      pessoas,
      pedidos,
      pedidosDaLoja,
      sinais,
      ajustes: lerAjustesGuardados(lojas[0]?.metadata),
    })
  )
}

export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "crm")) return
  const corpo = ((await lerCorpoGrande(req)) ?? {}) as { nome?: unknown; gzip?: unknown }
  if (typeof corpo.gzip !== "string" || !corpo.gzip) {
    res.status(422).json({ erro: "arquivo_invalido" })
    return
  }
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(
      gunzipSync(Buffer.from(corpo.gzip, "base64"), { maxOutputLength: TAMANHO_MAXIMO + 1 })
    )
  } catch (e) {
    // Passou do teto ao abrir: o arquivo é grande demais. O resto: não é um gzip.
    const grande =
      e instanceof RangeError || (e as { code?: string })?.code === "ERR_BUFFER_TOO_LARGE"
    res.status(grande ? 413 : 422).json({ erro: grande ? "grande" : "arquivo_invalido" })
    return
  }
  const arquivo = lerArquivoDaNuvemshop(bytes)
  if ("erro" in arquivo) {
    res.status(arquivo.erro === "grande" ? 413 : 422).json({ erro: arquivo.erro })
    return
  }
  const lidas =
    arquivo.tipo === "clientes"
      ? arquivo.pessoas.length
      : arquivo.tipo === "vendas"
        ? arquivo.pedidos.length
        : arquivo.carrinhos.length
  const { novos, atualizados } = await req.scope
    .resolve<CrmService>(CRM)
    .importarDaNuvemshop(arquivo)
  await anotar(pedido, "importou-base-da-nuvemshop", "crm", {
    tipo: arquivo.tipo,
    lidas,
    novos,
    atualizados,
    ignoradas: arquivo.ignoradas,
  })
  res.json({ tipo: arquivo.tipo, lidas, novos, atualizados, ignoradas: arquivo.ignoradas })
}
