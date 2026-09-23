/**
 * O QUE O CHECKOUT GRAVA NO PEDIDO, LIDO DO MESMO JEITO POR QUEM PRECISA —
 * a etiqueta (`lib/envios/registro.ts`) e a nota fiscal (`lib/erp/notas.ts`).
 *
 * O endereço mora em dois lugares no pedido, porque é assim que a loja grava
 * (`montarEndereco`, em `apps/loja/src/lib/endereco.ts`): as partes no
 * metadata (rua, número, complemento, bairro, e o CPF/CNPJ no de cobrança)
 * e as linhas montadas ("rua, número" e "complemento — bairro") pra quem não
 * lê o metadata. As partes valem mais; as linhas são o plano B.
 */

export type EnderecoDoMedusa = {
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

export type EnderecoLido = {
  /** Só dígitos. */
  cep: string
  rua: string
  numero: string
  complemento: string | null
  bairro: string
  cidade: string
  /** Maiúscula. */
  uf: string
}

export const digitos = (v: unknown) => (typeof v === "string" ? v.replace(/\D/g, "") : "")
export const linha = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "")

/** "+55 (11) 91234-5678" → "11912345678". Sem DDD, não serve pra transportadora nem pra nota. */
export function telefone(v: unknown): string | null {
  let d = digitos(v)
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2)
  return d.length === 10 || d.length === 11 ? d : null
}

/**
 * O CPF/CNPJ que o checkout grava no endereço de cobrança (`{ tipo, valor }`),
 * sem pontuação e em maiúscula — o CNPJ novo tem letras.
 */
export function documentoDoPedido(
  ...enderecos: (Pick<EnderecoDoMedusa, "metadata"> | null | undefined)[]
): { tipo: "cpf" | "cnpj"; valor: string } | null {
  for (const e of enderecos) {
    const doc = (e?.metadata?.documento as { valor?: unknown } | null | undefined)?.valor
    const limpo = typeof doc === "string" ? doc.replace(/[^0-9A-Za-z]/g, "").toUpperCase() : ""
    if (limpo.length === 11) return { tipo: "cpf", valor: limpo }
    if (limpo.length === 14) return { tipo: "cnpj", valor: limpo }
  }
  return null
}

export function lerEndereco(e: EnderecoDoMedusa): EnderecoLido {
  const meta = e.metadata ?? {}
  const l1 = linha(e.address_1)
  const partesDaL2 = linha(e.address_2).split(" — ").filter(Boolean)
  return {
    cep: digitos(e.postal_code),
    rua: linha(meta.rua) || l1.replace(/,\s*[^,]*$/, "").trim(),
    numero: linha(meta.numero) || (l1.includes(",") ? l1.split(",").pop()!.trim() : "") || "S/N",
    complemento:
      linha(meta.complemento) ||
      (partesDaL2.length > 1 ? partesDaL2.slice(0, -1).join(" — ") : "") ||
      null,
    bairro: linha(meta.bairro) || partesDaL2[partesDaL2.length - 1] || "",
    cidade: linha(e.city),
    uf: linha(e.province).toUpperCase(),
  }
}

/** O que falta no endereço pra etiqueta ou pra nota — vazio quando está completo. */
export function faltaNoEndereco(nome: string, e: EnderecoLido): string[] {
  return [
    !nome && "nome",
    e.cep.length !== 8 && "CEP",
    !e.rua && "rua",
    !e.bairro && "bairro",
    !e.cidade && "cidade",
    !/^[A-Z]{2}$/.test(e.uf) && "UF",
  ].filter((x): x is string => Boolean(x))
}

/** As horas em que o pagamento do pedido foi capturado (mais de uma, se houve mais de um pagamento). */
export const capturasDo = (o: {
  payment_collections?: ({ payments?: ({ captured_at?: unknown } | null)[] | null } | null)[] | null
}) =>
  (o.payment_collections ?? [])
    .flatMap((c) => c?.payments ?? [])
    .map((p) => (p?.captured_at ? new Date(p.captured_at as string) : null))
    .filter((d): d is Date => d !== null && !Number.isNaN(d.getTime()))

export const nomeDoEndereco = (e: EnderecoDoMedusa) =>
  [linha(e.first_name), linha(e.last_name)].filter(Boolean).join(" ")
