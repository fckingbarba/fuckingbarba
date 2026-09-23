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
 * que o número está torto, e mostrar a bandeira certa (o logo dela, no fim
 * do campo — `components/bandeira.tsx`). Os dois evitam a recusa
 * que só apareceria depois de a pessoa clicar em pagar.
 */

export type Bandeira = "visa" | "mastercard" | "elo" | "amex" | "hipercard" | ""

const soDigitos = (v: string) => v.replace(/\D+/g, "")

/**
 * AS FAIXAS DE CADA BANDEIRA — o começo do número (o BIN), de 1 a 6 dígitos.
 *
 * Uma faixa é `[início, fim]` com o mesmo número de dígitos; o número está
 * nela quando o começo dele, desse tamanho, cai entre os dois. As da Elo são
 * as publicadas por ela, de seis dígitos — e elas moram DENTRO do 4 da Visa e
 * do 65 da Discover, que é por que a checagem por quatro dígitos que existia
 * aqui ("4011" é Elo) chamava de Elo um monte de Visa: de 401100 a 401199,
 * só 401178 e 401179 são Elo.
 *
 * As bandeiras que a loja NÃO aceita também estão aqui. Sem elas, um Discover
 * (65…) apareceria com o logo da Elo, e um Diners (38…), com o da Hipercard
 * — a bandeira errada na tela é pior que nenhuma.
 */
type Faixa = readonly [inicio: string, fim: string]

const faixa = (inicio: string, fim = inicio): Faixa => [inicio, fim]

const FAIXAS: Record<string, readonly Faixa[]> = {
  visa: [faixa("4")],
  mastercard: [
    faixa("51", "55"),
    faixa("2221", "2229"),
    faixa("223", "229"),
    faixa("23", "26"),
    faixa("270", "271"),
    faixa("2720"),
  ],
  amex: [faixa("34"), faixa("37")],
  elo: [
    faixa("401178", "401179"),
    faixa("431274"),
    faixa("438935"),
    faixa("451416"),
    faixa("457393"),
    faixa("457631", "457632"),
    faixa("504175"),
    faixa("506699", "506778"),
    faixa("509000", "509999"),
    faixa("627780"),
    faixa("636297"),
    faixa("636368"),
    faixa("650031", "650033"),
    faixa("650035", "650051"),
    faixa("650405", "650439"),
    faixa("650485", "650538"),
    faixa("650541", "650598"),
    faixa("650700", "650718"),
    faixa("650720", "650727"),
    faixa("650901", "650978"),
    faixa("651652", "651679"),
    faixa("655000", "655019"),
    faixa("655021", "655058"),
  ],
  hipercard: [faixa("606282"), faixa("384100"), faixa("384140"), faixa("384160")],
  diners: [faixa("300", "305"), faixa("36"), faixa("38"), faixa("39")],
  discover: [faixa("6011"), faixa("644", "649"), faixa("65")],
  jcb: [faixa("3528", "3589")],
}

/**
 * A bandeira pelo começo do número — ou `""` enquanto não dá pra ter certeza.
 *
 * A faixa MAIS ESPECÍFICA ganha: 451416 é Elo mesmo começando com o 4 da
 * Visa. E enquanto ainda cabe uma faixa mais específica de outra bandeira,
 * a resposta espera: com "45" digitado, pode ser Visa ou Elo (451416), e
 * mostrar Visa pra depois trocar é mostrar a bandeira errada por três
 * dígitos. Na prática, Visa aparece no segundo ou terceiro dígito, Amex e
 * Mastercard no segundo, e Elo e Hipercard no sexto.
 */
export function bandeiraDe(numero: string): Bandeira {
  const n = soDigitos(numero)
  let certa: { nome: string; digitos: number } | null = null
  const ainda: { nome: string; digitos: number }[] = []

  for (const [nome, faixas] of Object.entries(FAIXAS)) {
    for (const [inicio, fim] of faixas) {
      const digitos = inicio.length
      const k = Math.min(n.length, digitos)
      if (k === 0) continue
      const comeco = n.slice(0, k)
      if (comeco < inicio.slice(0, k) || comeco > fim.slice(0, k)) continue
      if (n.length < digitos) ainda.push({ nome, digitos })
      else if (!certa || digitos > certa.digitos) certa = { nome, digitos }
    }
  }

  const achada = certa
  if (!achada) return ""
  if (ainda.some((a) => a.nome !== achada.nome && a.digitos > achada.digitos)) return ""
  return ACEITAS.has(achada.nome) ? (achada.nome as Bandeira) : ""
}

export const NOMES_DAS_BANDEIRAS: Record<Exclude<Bandeira, "">, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  elo: "Elo",
  amex: "Amex",
  hipercard: "Hipercard",
}

/** As que a loja aceita, na ordem de sempre — a do rodapé e a das Dúvidas. */
export const BANDEIRAS_ACEITAS = Object.keys(NOMES_DAS_BANDEIRAS) as Exclude<Bandeira, "">[]

/** As mesmas, pra `bandeiraDe` separar as aceitas das que só estão lá pra desempatar. */
const ACEITAS = new Set<string>(BANDEIRAS_ACEITAS)

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
