import { createHash, timingSafeEqual } from "node:crypto"
import type { BigNumberInput } from "@medusajs/framework/types"
import { BigNumber } from "@medusajs/framework/utils"

/**
 * O QUE TODO PARCEIRO DE PAGAMENTO USA IGUAL — dinheiro em centavos, a
 * comparação de segredo e de que instalação da loja uma cobrança saiu.
 * Moravam no cliente do Pagar.me (`modules/pagarme/client.ts`, que continua
 * exportando os quatro); saíram de lá quando o Mercado Pago chegou (0140).
 */

/**
 * Reais (como o Medusa guarda) pra centavos (como os parceiros conferem).
 *
 * O Medusa entrega valor em QUATRO formatos, conforme o caminho: número,
 * texto, o `BigNumber` dele, e o valor cru `{ value: "123.5", precision }`
 * — que é o que chega no estorno (`refund.raw_amount`). Uma versão anterior
 * desta função só conhecia os três primeiros; o estorno chegava como `NaN`,
 * o cancelamento de pedido pago seguia em frente sem devolver o dinheiro, e
 * o conferidor pegou. Quem entende os quatro é o próprio `BigNumber` do
 * Medusa, então é ele que lê.
 *
 * `Math.round` e não `Math.floor`, porque 89.9 * 100 é 8990.000000000001 e
 * 0.29 * 100 é 28.999999999999996.
 */
export function emCentavos(valor: unknown): number {
  let numero: number
  try {
    numero = new BigNumber(valor as BigNumberInput).numeric
  } catch {
    return Number.NaN
  }
  if (!Number.isFinite(numero)) return Number.NaN
  return Math.round(numero * 100)
}

/** Centavos de volta pra reais — é o que o Medusa espera no webhook. */
export function emReais(centavos: number): number {
  return Math.round(centavos) / 100
}

/**
 * DE QUE INSTALAÇÃO DA LOJA a cobrança saiu — vai no `metadata.origem` de
 * toda cobrança criada, no Pagar.me e no Mercado Pago, e a conciliação só
 * mexe em cobrança órfã com a MESMA origem.
 *
 * Por quê: a conciliação procura no parceiro cobranças cuja sessão sumiu do
 * Medusa, e estorna o que achar pago. Se duas instalações dividirem a mesma
 * conta — o Railway e uma máquina de desenvolvimento, as duas com a chave de
 * teste —, cada uma veria as cobranças da outra como órfãs e estornaria. No
 * Mercado Pago é mais que isso: a conta é a mesma das vendas do Mercado
 * Livre, e só a origem (com o código da sessão) separa o que é da loja.
 *
 * Sai do BANCO — usuário, host, porta e nome, NUNCA a senha —, passado por
 * hash: é o que o server e o worker do Railway têm igual, sem configuração
 * nenhuma, e o que muda de uma instalação pra outra. O usuário entra porque,
 * no pooler do Supabase, o host é o mesmo pra todo projeto da região
 * (`aws-0-sa-east-1.pooler.supabase.com`) e o banco se chama `postgres` em
 * todos: quem diz QUAL projeto é o usuário, `postgres.<ref>`.
 *
 * Se o server e o worker tiverem URLs diferentes (um pelo pooler, outro
 * direto), a origem não bate e a conciliação simplesmente não mexe em órfão
 * nenhum — erra pro lado seguro. Por isso os dois leem a MESMA variável.
 */
export function origemDestaLoja(databaseUrl = process.env.DATABASE_URL ?? ""): string {
  let base = "sem-banco"
  try {
    const u = new URL(databaseUrl)
    base = `${decodeURIComponent(u.username)}@${u.hostname}:${u.port || "5432"}${u.pathname}`
  } catch {
    // URL torta: todos os processos da instalação erram igual, e a origem
    // continua sendo a mesma entre eles.
  }
  return createHash("sha256").update(base).digest("hex").slice(0, 16)
}

/** Comparação de segredo que não vaza, pelo tempo de resposta, quantas letras bateram. */
export function segredosIguais(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido)
  const b = Buffer.from(esperado)
  if (a.length !== b.length || !a.length) return false
  return timingSafeEqual(a, b)
}
