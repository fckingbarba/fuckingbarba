import { timingSafeEqual } from "node:crypto"
import type { MedusaRequest } from "@medusajs/framework/http"

/**
 * DE ONDE VEIO O PEDIDO — pra contar por endereço de IP.
 *
 * Quem chama o Medusa não é o navegador: é o SERVIDOR da loja, na Vercel.
 * O IP que chega aqui é o da Vercel, o mesmo pra muita gente — e limitar por
 * ele seria limitar a loja inteira junto. Então a loja manda o IP de quem
 * está do outro lado em `x-cliente-ip`, e ASSINA o recado com o
 * `REVALIDAR_SEGREDO`, o segredo que os dois lados já dividem (é o mesmo que
 * o Medusa usa pra avisar a loja que o cache mudou).
 *
 * Sem a assinatura, o cabeçalho é ignorado — senão bastaria mandar um IP
 * diferente a cada pedido pra nunca bater no limite — e conta o IP de quem
 * conectou. `assinado` diz qual dos dois foi, porque os limites são
 * diferentes: ver `api/store/conta/codigo/route.ts`.
 */
export function quemPede(req: MedusaRequest): { chave: string; assinado: boolean } {
  const segredo = process.env.REVALIDAR_SEGREDO
  const assinatura = req.headers["x-loja-segredo"]
  const ip = req.headers["x-cliente-ip"]

  if (
    segredo &&
    typeof assinatura === "string" &&
    iguais(assinatura, segredo) &&
    typeof ip === "string" &&
    ip.length > 0 &&
    ip.length <= 64
  ) {
    return { chave: `loja:${ip}`, assinado: true }
  }
  return { chave: `direto:${req.ip ?? "?"}`, assinado: false }
}

function iguais(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido)
  const b = Buffer.from(esperado)
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b)
}
