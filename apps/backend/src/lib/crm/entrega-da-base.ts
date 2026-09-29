import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto"
import type { EntregaDaNuvemshop } from "./nuvemshop"

/**
 * A ENTREGA DOS PEDIDOS DA NUVEMSHOP, CIFRADA (entrega 0202). O nome, o
 * celular, o CPF e o endereço de cada pedido da loja antiga só servem pro
 * "Refazer o pedido" da reposição abrir o checkout preenchido
 * (`lib/crm/voltar-ao-checkout.ts`). No banco (`crm_base_pedido.entrega`),
 * ficam em AES-256-GCM, com uma chave que NÃO está no banco: ela sai do
 * `JWT_SECRET`, como a dos links do CRM, com outro rótulo. Quem copiar o
 * banco leva um texto que não serve pra nada.
 *
 * TROCOU O SEGREDO: o que estava guardado deixa de abrir (`abrirEntrega`
 * devolve nulo), e o "Refazer o pedido" volta a abrir só com o e-mail, até
 * o arquivo de vendas ser mandado de novo. Sem o segredo, nada é guardado.
 *
 * O ENDEREÇO DO CARRINHO é o da loja (`montarEndereco`, em
 * `apps/loja/src/lib/endereco.ts`): rua e número em `address_1`, complemento
 * e bairro em `address_2`, os quatro também no `metadata`, e o documento só
 * no de cobrança. Mudou lá, muda aqui.
 *
 * Código puro, com testes.
 */

const VERSAO = "v1"

function chave(): Buffer | null {
  const segredo = process.env.JWT_SECRET
  return segredo ? createHmac("sha256", segredo).update("fb-crm-base-entrega").digest() : null
}

/** A entrega cifrada, pro banco. Nula sem o segredo. */
export function fecharEntrega(e: EntregaDaNuvemshop): string | null {
  const k = chave()
  if (!k) return null
  const iv = randomBytes(12)
  const cifra = createCipheriv("aes-256-gcm", k, iv)
  const corpo = Buffer.concat([cifra.update(JSON.stringify(e), "utf8"), cifra.final()])
  return [VERSAO, iv, cifra.getAuthTag(), corpo]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".")
}

const texto = (v: unknown): v is string => typeof v === "string"

/** A entrega do banco, aberta — ou nula (sem nada, segredo trocado, texto mexido). */
export function abrirEntrega(fechada: string | null | undefined): EntregaDaNuvemshop | null {
  const k = chave()
  const [versao, iv, marca, corpo] = (fechada ?? "").split(".")
  if (!k || versao !== VERSAO || !iv || !marca || !corpo) return null
  try {
    const decifra = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"))
    decifra.setAuthTag(Buffer.from(marca, "base64url"))
    const aberto = Buffer.concat([decifra.update(Buffer.from(corpo, "base64url")), decifra.final()])
    const e = JSON.parse(aberto.toString("utf8")) as Record<string, unknown>
    const campos = [
      "nome",
      "sobrenome",
      "cep",
      "rua",
      "numero",
      "complemento",
      "bairro",
      "cidade",
      "uf",
    ]
    if (!campos.every((c) => texto(e[c]))) return null
    const doc = e.documento as { tipo?: unknown; valor?: unknown } | null
    return {
      nome: e.nome as string,
      sobrenome: e.sobrenome as string,
      telefone: texto(e.telefone) ? e.telefone : null,
      documento:
        doc && (doc.tipo === "cpf" || doc.tipo === "cnpj") && texto(doc.valor)
          ? { tipo: doc.tipo, valor: doc.valor }
          : null,
      cep: e.cep as string,
      rua: e.rua as string,
      numero: e.numero as string,
      complemento: e.complemento as string,
      bairro: e.bairro as string,
      cidade: e.cidade as string,
      uf: e.uf as string,
    }
  } catch {
    return null
  }
}

/** Os dois endereços do carrinho novo, do jeito que o checkout da loja grava e lê. */
export function enderecosDaEntrega(e: EntregaDaNuvemshop) {
  const endereco = {
    first_name: e.nome,
    last_name: e.sobrenome,
    ...(e.telefone ? { phone: e.telefone } : {}),
    address_1: [e.rua, e.numero].filter(Boolean).join(", "),
    address_2: [e.complemento, e.bairro].filter(Boolean).join(" — "),
    city: e.cidade,
    province: e.uf,
    postal_code: e.cep,
    country_code: "br",
  }
  const metadata = { rua: e.rua, numero: e.numero, complemento: e.complemento, bairro: e.bairro }
  return {
    shipping_address: { ...endereco, metadata },
    billing_address: {
      ...endereco,
      metadata: { ...metadata, ...(e.documento ? { documento: e.documento } : {}) },
    },
  }
}
