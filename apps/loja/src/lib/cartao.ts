/**
 * CARTÃO DE CRÉDITO — máscara, bandeira e Luhn.
 *
 * ┌─ O NÚMERO NÃO SAI DO NAVEGADOR ────────────────────────────────────────┐
 * │ Nada aqui manda nada pra lugar nenhum, e os campos do formulário não   │
 * │ têm `name` — o que não tem nome não entra no `FormData`, então não     │
 * │ viaja na server action nem toca no servidor da loja.                   │
 * │                                                                        │
 * │ Isso não é jeitinho de demonstração: é como vai ser com o Pagar.me     │
 * │ também. Quem tokeniza é o navegador, direto com o gateway, e o que     │
 * │ chega ao nosso backend é um token. Número de cartão que passa pelo     │
 * │ servidor da loja é PCI-DSS inteiro no seu colo, e não precisa.        │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * O que este arquivo faz é só o que dá pra fazer sem gateway: dizer na hora
 * que o número está torto, e mostrar a bandeira certa. Os dois evitam a
 * recusa que só apareceria depois de a pessoa clicar em pagar.
 */

export type Bandeira = "visa" | "mastercard" | "elo" | "amex" | "hipercard" | ""

const soDigitos = (v: string) => v.replace(/\D+/g, "")

/**
 * A bandeira pelo começo do número.
 *
 * A ordem importa: Elo e Hipercard têm faixas que começam com 4 ou 6 e
 * cairiam em Visa se a checagem delas viesse depois.
 */
export function bandeiraDe(numero: string): Bandeira {
  const n = soDigitos(numero)
  if (/^(4011|4312|4389|4514|4576|5041|5066|5067|509|6277|6362|6363|650|6516|6550)/.test(n)) {
    return "elo"
  }
  if (/^(606282|3841)/.test(n)) return "hipercard"
  if (/^3[47]/.test(n)) return "amex"
  if (/^(5[1-5]|2[2-7])/.test(n)) return "mastercard"
  if (/^4/.test(n)) return "visa"
  return ""
}

export const NOMES_DAS_BANDEIRAS: Record<Exclude<Bandeira, "">, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  elo: "Elo",
  amex: "Amex",
  hipercard: "Hipercard",
}

/**
 * Luhn — o dígito verificador do cartão.
 *
 * Pega o número digitado errado, que é quase todo caso real. Não diz nada
 * sobre o cartão ter saldo, existir ou estar ativo: isso só o gateway sabe.
 */
export function luhn(numero: string): boolean {
  const n = soDigitos(numero)
  if (n.length < 13) return false

  let soma = 0
  let dobra = false
  for (let i = n.length - 1; i >= 0; i--) {
    let d = Number(n[i])
    if (dobra) {
      d *= 2
      if (d > 9) d -= 9
    }
    soma += d
    dobra = !dobra
  }
  return soma % 10 === 0
}

/** Amex agrupa 4-6-5; o resto, de quatro em quatro. */
export function mascararCartao(valor: string): string {
  const n = soDigitos(valor).slice(0, 16)
  if (bandeiraDe(n) === "amex") {
    return [n.slice(0, 4), n.slice(4, 10), n.slice(10, 15)].filter(Boolean).join(" ")
  }
  return n.replace(/(\d{4})(?=\d)/g, "$1 ")
}

/** MM/AA enquanto digita. */
export function mascararValidade(valor: string): string {
  const n = soDigitos(valor).slice(0, 4)
  return n.length > 2 ? `${n.slice(0, 2)}/${n.slice(2)}` : n
}

/** Mês de 1 a 12 e uma data que ainda não passou. */
export function validadeOk(valor: string): boolean {
  const n = soDigitos(valor)
  if (n.length !== 4) return false

  const mes = Number(n.slice(0, 2))
  const ano = 2000 + Number(n.slice(2))
  if (mes < 1 || mes > 12) return false

  const hoje = new Date()
  return ano > hoje.getFullYear() || (ano === hoje.getFullYear() && mes >= hoje.getMonth() + 1)
}

/** Amex tem 4; o resto, 3. */
export function cvvOk(valor: string, bandeira: Bandeira): boolean {
  const n = soDigitos(valor)
  return bandeira === "amex" ? n.length === 4 : n.length === 3
}
