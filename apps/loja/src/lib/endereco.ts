import type { HttpTypes } from "@medusajs/types"
import type { EnderecoVisivel } from "./checkout-visivel"
import type { Documento } from "./documento"

/**
 * O ENDEREÇO BRASILEIRO NO MODELO DO MEDUSA, E DE VOLTA.
 *
 * Morava dentro de `acoes/checkout.ts`, e saiu de lá quando a sacola passou a
 * gravar o CEP no carrinho também: duas cópias da mesma tradução divergem no
 * primeiro campo novo, e aí a sacola grava o número num lugar e o checkout
 * procura em outro. Arquivo com `"use server"` só exporta função assíncrona,
 * então o lugar comum é este — funções puras, sem nada que fale com rede.
 */

/**
 * Monta o endereço do Medusa a partir do que já está gravado mais o que mudou.
 *
 * SEMPRE O ENDEREÇO INTEIRO, nunca um pedaço: o `POST /store/carts/:id`
 * SUBSTITUI o endereço, não mescla. Mandar só o telefone apagaria a rua.
 *
 * O bairro e o número não têm campo no Medusa — o modelo dele é o endereço
 * americano. Então vão duas vezes: escritos dentro de `address_1`/`address_2`,
 * pra etiqueta e lista de separação saírem legíveis sem ninguém remontar a
 * frase; e em `metadata`, em campos separados, que é o que a NF-e e a cotação
 * por CEP vão querer ler depois.
 */
export function montarEndereco(e: EnderecoVisivel, documento?: Documento) {
  const complementoEBairro = [e.complemento, e.bairro].filter(Boolean).join(" — ")

  return {
    first_name: e.nome,
    last_name: e.sobrenome,
    phone: e.telefone,
    address_1: [e.rua, e.numero].filter(Boolean).join(", "),
    address_2: complementoEBairro,
    city: e.cidade,
    province: e.uf,
    postal_code: e.cep,
    country_code: "br",
    metadata: {
      rua: e.rua,
      numero: e.numero,
      complemento: e.complemento,
      bairro: e.bairro,
      ...(documento ? { documento } : {}),
    },
  }
}

/** O endereço gravado, de volta no formato do formulário. */
export function lerEndereco(e: HttpTypes.StoreCartAddress | null | undefined): EnderecoVisivel {
  const meta = (e?.metadata ?? {}) as Record<string, unknown>
  const s = (v: unknown) => (typeof v === "string" ? v : "")

  return {
    nome: e?.first_name ?? "",
    sobrenome: e?.last_name ?? "",
    telefone: e?.phone ?? "",
    cep: e?.postal_code ?? "",
    rua: s(meta.rua) || (e?.address_1 ?? "").replace(/,\s*[^,]*$/, ""),
    numero: s(meta.numero),
    complemento: s(meta.complemento),
    bairro: s(meta.bairro),
    cidade: e?.city ?? "",
    uf: (e?.province ?? "").toUpperCase(),
  }
}
