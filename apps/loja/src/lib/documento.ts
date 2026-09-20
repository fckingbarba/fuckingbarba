/**
 * CPF E CNPJ
 *
 * Sem dependência nenhuma de propósito: a máscara roda no navegador enquanto a
 * pessoa digita e a validação roda no servidor antes de gravar. O mesmo código
 * nos dois lados é o que impede a máscara de aceitar o que a validação recusa.
 *
 * VALIDAR NO SERVIDOR NÃO É PARANOIA. Server action é rota POST pública: quem
 * souber o endereço manda o corpo que quiser, sem passar pelo formulário. E
 * mesmo sem má-fé, o dígito verificador existe justamente pra pegar o número
 * digitado errado — e CPF errado é nota fiscal que não sai, descoberta dias
 * depois, com a encomenda já parada.
 *
 * ┌─ CNPJ ALFANUMÉRICO ────────────────────────────────────────────────────┐
 * │ Desde JULHO DE 2026 a Receita emite CNPJ com LETRAS nas 12 primeiras   │
 * │ posições (as duas últimas continuam sendo dígito verificador). Os CNPJ │
 * │ antigos, só numéricos, seguem valendo pra sempre — os dois formatos    │
 * │ convivem.                                                              │
 * │                                                                        │
 * │ Um validador "só números", que era o certo até ano passado, hoje       │
 * │ recusa empresa aberta depois de julho. Por isso o cálculo aqui         │
 * │ converte cada caractere por ASCII − 48 ('0'→0 … '9'→9, 'A'→17 …        │
 * │ 'Z'→42), que é o que a Receita especifica, e que por construção dá o   │
 * │ mesmo resultado de sempre quando o CNPJ é todo numérico.               │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * Fonte: Receita Federal, "CNPJ alfanumérico — perguntas e respostas".
 */

export type TipoDeDocumento = "cpf" | "cnpj"

export type Documento = {
  tipo: TipoDeDocumento
  /** Sem pontuação, maiúsculo. É o que vai pro Medusa. */
  valor: string
}

/* ── limpeza ──────────────────────────────────────────────────────────────── */

/** Tira tudo que não for dígito. */
export function soDigitos(texto: string): string {
  return texto.replace(/\D+/g, "")
}

/**
 * Tira tudo que não for letra ou dígito e sobe pra maiúscula — a forma em que
 * um documento é guardado e comparado.
 */
export function limpar(texto: string): string {
  return texto.toUpperCase().replace(/[^0-9A-Z]+/g, "")
}

/* ── o cálculo ────────────────────────────────────────────────────────────── */

/**
 * O valor numérico de um caractere pelo código ASCII menos 48.
 *
 * É a regra da Receita pro CNPJ alfanumérico, e ela é retrocompatível de
 * graça: '7' é ASCII 55, 55 − 48 = 7. Ou seja, o CNPJ antigo passa pelo mesmo
 * cálculo e dá o mesmo dígito que sempre deu.
 */
function valorDe(caractere: string): number {
  return caractere.charCodeAt(0) - 48
}

/**
 * Dígito verificador por módulo 11 — o mesmo algoritmo do CPF e do CNPJ.
 *
 * Os pesos vêm de fora porque cada documento usa uma sequência diferente, e
 * escrever duas funções quase iguais é como elas acabam divergindo.
 */
function digito(base: string, pesos: number[]): number {
  const soma = pesos.reduce((total, peso, i) => total + valorDe(base[i]) * peso, 0)
  const resto = soma % 11
  return resto < 2 ? 0 : 11 - resto
}

/* ── CPF ──────────────────────────────────────────────────────────────────── */

const PESOS_CPF_1 = [10, 9, 8, 7, 6, 5, 4, 3, 2]
const PESOS_CPF_2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]

export function ehCpf(entrada: string): boolean {
  const cpf = soDigitos(entrada)
  if (cpf.length !== 11) return false

  // 111.111.111-11 e companhia passam no módulo 11 e não existem. A lista de
  // repetidos é curta e é a única exceção que o algoritmo não pega sozinho.
  if (/^(\d)\1{10}$/.test(cpf)) return false

  return digito(cpf, PESOS_CPF_1) === Number(cpf[9]) && digito(cpf, PESOS_CPF_2) === Number(cpf[10])
}

/* ── CNPJ ─────────────────────────────────────────────────────────────────── */

const PESOS_CNPJ_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
const PESOS_CNPJ_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]

export function ehCnpj(entrada: string): boolean {
  const cnpj = limpar(entrada)
  if (cnpj.length !== 14) return false

  // As 12 primeiras aceitam letra; as 2 últimas são dígito verificador e são
  // sempre numéricas, mesmo no formato novo.
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj)) return false
  if (/^(.)\1{13}$/.test(cnpj)) return false

  return (
    digito(cnpj, PESOS_CNPJ_1) === Number(cnpj[12]) &&
    digito(cnpj, PESOS_CNPJ_2) === Number(cnpj[13])
  )
}

/* ── a porta de entrada ───────────────────────────────────────────────────── */

export type Conferido = { ok: true; documento: Documento } | { ok: false; erro: string }

/**
 * Descobre pelo tamanho se é CPF ou CNPJ e confere o dígito.
 *
 * As mensagens dizem O QUE fazer, não o que está errado no jargão: "confere os
 * números" resolve; "dígito verificador inválido" faz a pessoa reler sem saber
 * o que procurar.
 */
export function conferirDocumento(entrada: string): Conferido {
  const limpo = limpar(entrada)

  if (!limpo) return { ok: false, erro: "Preencha o CPF ou CNPJ." }

  if (limpo.length === 11) {
    return ehCpf(limpo)
      ? { ok: true, documento: { tipo: "cpf", valor: limpo } }
      : { ok: false, erro: "Esse CPF não confere. Dá uma olhada nos números." }
  }

  if (limpo.length === 14) {
    return ehCnpj(limpo)
      ? { ok: true, documento: { tipo: "cnpj", valor: limpo } }
      : { ok: false, erro: "Esse CNPJ não confere. Dá uma olhada nos caracteres." }
  }

  return {
    ok: false,
    erro: "CPF tem 11 dígitos e CNPJ tem 14. Confere se não faltou ou sobrou algum.",
  }
}

/* ── como aparece na tela ─────────────────────────────────────────────────── */

/**
 * Põe a pontuação enquanto a pessoa digita, sem nunca apagar o que ela
 * escreveu: o campo aceita letra (CNPJ novo) e decide o formato pelo tamanho.
 *
 * Até 11 caracteres vai de CPF; daí pra frente, de CNPJ. Quem digita CNPJ vê a
 * máscara de CPF nos primeiros caracteres e ela se reorganiza sozinha no 12º —
 * é menos incômodo do que obrigar a escolher o tipo antes de digitar.
 */
export function mascararDocumento(entrada: string): string {
  const v = limpar(entrada).slice(0, 14)

  if (v.length <= 11) {
    return v
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4")
  }

  return v
    .replace(/^(.{2})(.)/, "$1.$2")
    .replace(/^(.{2})\.(.{3})(.)/, "$1.$2.$3")
    .replace(/^(.{2})\.(.{3})\.(.{3})(.)/, "$1.$2.$3/$4")
    .replace(/^(.{2})\.(.{3})\.(.{3})\/(.{4})(.)/, "$1.$2.$3/$4-$5")
}

/** O documento já guardado, pronto pra ler: `11144477735` → `111.444.777-35`. */
export function formatarDocumento(doc: Documento): string {
  return mascararDocumento(doc.valor)
}
