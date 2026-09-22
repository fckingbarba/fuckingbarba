import type { HttpTypes } from "@medusajs/types"
import type { EnderecoVisivel } from "./checkout-visivel"
import type { EnderecoDaConta } from "./conta-visivel"
import type { Documento } from "./documento"

/**
 * O ENDEREÇO BRASILEIRO NO MODELO DO MEDUSA, E DE VOLTA.
 *
 * Morava dentro de `acoes/checkout.ts`, e saiu de lá quando a sacola passou a
 * gravar o CEP no carrinho também: duas cópias da mesma tradução divergem no
 * primeiro campo novo, e aí a sacola grava o número num lugar e o checkout
 * procura em outro. Arquivo com `"use server"` só exporta função assíncrona,
 * então o lugar comum é este — funções puras, sem nada que fale com rede.
 *
 * A CONTA USA A MESMA TRADUÇÃO. O endereço que a pessoa guarda em "Meus
 * endereços" é o que o checkout abre preenchido, e o da compra feita com a
 * conta aberta é o que vai pra lista: se cada lado lesse o número de um
 * lugar, o principal chegaria no checkout sem número.
 */

/** As 27 unidades da federação — o `<select>` do endereço e a conferência no servidor. */
export const UFS = [
  "AC",
  "AL",
  "AM",
  "AP",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MG",
  "MS",
  "MT",
  "PA",
  "PB",
  "PE",
  "PI",
  "PR",
  "RJ",
  "RN",
  "RO",
  "RR",
  "RS",
  "SC",
  "SE",
  "SP",
  "TO",
] as const

export const ehUf = (v: string): boolean => (UFS as readonly string[]).includes(v)

/**
 * Os campos de endereço que os três modelos do Medusa têm em comum — o do
 * carrinho, o do cliente e o do pedido.
 */
type EnderecoDoMedusa =
  | {
      first_name?: string | null
      last_name?: string | null
      phone?: string | null
      address_1?: string | null
      address_2?: string | null
      city?: string | null
      province?: string | null
      postal_code?: string | null
      metadata?: Record<string, unknown> | null
    }
  | null
  | undefined

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
export function lerEndereco(e: EnderecoDoMedusa): EnderecoVisivel {
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

/* ── os endereços da conta ────────────────────────────────────────────────── */

/** Só o lugar: o que um endereço da conta guarda, sem id, apelido nem nome. */
export type Lugar = Pick<
  EnderecoVisivel,
  "cep" | "rua" | "numero" | "complemento" | "bairro" | "cidade" | "uf"
>

/** Um endereço guardado na conta, do Medusa pro formato da tela. */
export function lerEnderecoDaConta(a: HttpTypes.StoreCustomerAddress): EnderecoDaConta {
  const e = lerEndereco(a)
  return {
    id: a.id,
    apelido: a.address_name?.trim() ?? "",
    principal: Boolean(a.is_default_shipping),
    cep: e.cep.replace(/\D+/g, ""),
    rua: e.rua,
    numero: e.numero,
    complemento: e.complemento,
    bairro: e.bairro,
    cidade: e.cidade,
    uf: e.uf,
  }
}

/**
 * Um endereço da conta no formato que o Medusa grava — a mesma tradução do
 * checkout, SEM nome nem telefone: quem recebe é o dono da conta, com o nome
 * que estiver em "Meus dados" no dia da compra (é assim que o checkout abre
 * preenchido). Nome gravado no endereço envelheceria no dia em que a pessoa
 * corrigisse o dela.
 */
export function lugarParaMedusa(l: Lugar) {
  const m = montarEndereco({ ...l, nome: "", sobrenome: "", telefone: "" })
  return {
    address_1: m.address_1,
    address_2: m.address_2,
    city: m.city,
    province: m.province,
    postal_code: m.postal_code,
    country_code: m.country_code,
    metadata: m.metadata,
  }
}

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^0-9a-z]+/gi, " ")
    .trim()
    .toLowerCase()

/**
 * O mesmo lugar? CEP, rua, número e complemento, sem ligar pra acento,
 * caixa ou pontuação ("Apto 12" é "apto. 12").
 *
 * A RUA ENTRA porque CEP não é rua: cidade pequena tem CEP único, e ali a
 * Rua das Flores, 10 e a Rua dos Ipês, 10 dividem o mesmo CEP e o mesmo
 * número. Bairro, cidade e estado não entram — o CEP já diz.
 */
export function mesmoLugar(a: Lugar, b: Lugar): boolean {
  return (
    a.cep.replace(/\D+/g, "") === b.cep.replace(/\D+/g, "") &&
    normalizar(a.rua) === normalizar(b.rua) &&
    normalizar(a.numero) === normalizar(b.numero) &&
    normalizar(a.complemento) === normalizar(b.complemento)
  )
}
