import type { MedusaRequest } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

/**
 * O CORPO GRANDE, LIDO DEPOIS DA PORTA — pras rotas do painel que recebem
 * arquivo em base64 dentro do JSON (as fotos e a base da Nuvemshop).
 *
 * O Medusa lê e interpreta o corpo de todo pedido ANTES de qualquer
 * middleware de rota. Com um teto grande no leitor dessas rotas, o processo
 * guardava e interpretava o corpo inteiro antes de a porta do painel
 * (`lib/equipe/acesso.ts`) dizer que o pedido nem era do painel (auditoria
 * de 27/09). Então elas sobem com o leitor desligado (`bodyParser: false`,
 * no `api/middlewares.ts`), e a própria rota lê aqui — depois da porta e da
 * área, e só até o teto.
 *
 * O painel manda no máximo uns 5,4 MB: a ação dele aceita 4 MB
 * (`serverActions.bodySizeLimit`), que viram mais um terço em base64.
 */
export const TETO_DO_CORPO_GRANDE = 7 * 1024 * 1024

const grande = () => new MedusaError(MedusaError.Types.INVALID_DATA, "corpo_grande")

export async function lerCorpoGrande(
  req: MedusaRequest,
  teto = TETO_DO_CORPO_GRANDE
): Promise<unknown> {
  const declarado = Number(req.headers["content-length"])
  if (Number.isFinite(declarado) && declarado > teto) throw grande()
  const partes: Buffer[] = []
  let total = 0
  for await (const parte of req as unknown as AsyncIterable<Buffer | string>) {
    const buffer = typeof parte === "string" ? Buffer.from(parte) : parte
    total += buffer.length
    if (total > teto) throw grande()
    partes.push(buffer)
  }
  if (!total) return {}
  try {
    return JSON.parse(Buffer.concat(partes).toString("utf8"))
  } catch {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "corpo_invalido")
  }
}
