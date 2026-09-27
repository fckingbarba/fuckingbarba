import { timingSafeEqual } from "node:crypto"
import { isIPv4, isIPv6 } from "node:net"
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
    return { chave: `loja:${redeDoIp(ip)}`, assinado: true }
  }
  return { chave: `direto:${redeDoIp(req.ip ?? "?")}`, assinado: false }
}

/**
 * A REDE DE QUEM PEDE — o IP como os limites contam. O IPv4 inteiro; o IPv6
 * pelo bloco /64, que é o que o provedor entrega a UMA casa ou a UM
 * servidor: contado o endereço inteiro, a mesma pessoa trocava de endereço a
 * cada pedido sem sair da rede dela, e cada limite por IP virava nenhum
 * (auditoria de 27/09). O IPv4 dentro do IPv6 (`::ffff:1.2.3.4`) vira o
 * IPv4. O que não é IP volta como veio.
 */
export function redeDoIp(ip: string): string {
  const limpo = ip
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .split("%")[0]
  const mapeado = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(limpo)
  if (mapeado && isIPv4(mapeado[1])) return mapeado[1]
  if (!isIPv6(limpo)) return limpo
  const partes = (s: string) => (s ? s.split(":") : [])
  // Um IPv4 no fim (`64:ff9b::1.2.3.4`) ocupa dois grupos.
  const tamanho = (ps: string[]) => ps.reduce((n, p) => n + (p.includes(".") ? 2 : 1), 0)
  let grupos: string[]
  if (limpo.includes("::")) {
    const [esquerda, direita] = limpo.split("::")
    const e = partes(esquerda)
    const d = partes(direita)
    grupos = [...e, ...Array<string>(8 - tamanho(e) - tamanho(d)).fill("0"), ...d]
  } else grupos = partes(limpo)
  const bloco = grupos
    .slice(0, 4)
    .map((g) => (g.includes(".") ? "0" : parseInt(g, 16).toString(16)))
    .join(":")
  return `${bloco}::/64`
}

/**
 * O pedido veio do SERVIDOR DA LOJA — assinado com o `REVALIDAR_SEGREDO`.
 *
 * Pras rotas que só a loja chama (o modelo de recomendação, o registro da
 * oferta do checkout): sem a assinatura, é qualquer um na internet.
 */
export function daLoja(req: MedusaRequest): boolean {
  const segredo = process.env.REVALIDAR_SEGREDO
  const assinatura = req.headers["x-loja-segredo"]
  return Boolean(segredo) && typeof assinatura === "string" && iguais(assinatura, segredo!)
}

function iguais(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido)
  const b = Buffer.from(esperado)
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b)
}
