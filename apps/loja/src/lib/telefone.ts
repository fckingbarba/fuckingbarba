/**
 * TELEFONE: limpar, mascarar, conferir.
 *
 * Sem import nenhum, como o `cep-formato.ts`: o campo do checkout (cliente) e
 * a ação que grava (servidor) usam a MESMA noção de "telefone limpo" — que é
 * o que impede a máscara de aceitar o que a validação recusa.
 */

/**
 * Os dígitos do número nacional: DDD + número.
 *
 * O que chega colado, ou do preenchimento automático do navegador, pode vir
 * com o país (+55 11 98765-4321) ou com o zero de operadora (011…). Os dois
 * saem aqui — senão o 55 virava DDD e o número inteiro andava duas casas.
 * Zero à esquerda sai sempre (nenhum DDD começa com zero); o 55 só quando
 * sobra dígito, porque 55 também é DDD (Santa Maria, RS).
 *
 * Não corta no 11º dígito: quem corta é a máscara, na tela. Aqui, número
 * comprido demais tem que chegar comprido na validação, e ser recusado.
 */
export function limparTelefone(entrada: string): string {
  const so = entrada.replace(/\D+/g, "").replace(/^0+/, "")
  return so.length > 11 && so.startsWith("55") ? so.slice(2) : so
}

/**
 * (11) 98765-4321 — ou (11) 3456-7890, fixo —, pondo a pontuação enquanto a
 * pessoa digita. Até o 10º dígito o corte é 4-4; no 11º (o 9 do celular) ele
 * vira 5-4 sozinho.
 *
 * Nunca termina num símbolo da máscara ("(11) " ou "9876-"): assim o
 * backspace sempre apaga um dígito, em vez de bater num traço que a máscara
 * põe de volta.
 */
export function mascararTelefone(entrada: string): string {
  const so = limparTelefone(entrada).slice(0, 11)
  if (!so) return ""
  if (so.length <= 2) return `(${so}`

  const ddd = so.slice(0, 2)
  const numero = so.slice(2)
  if (numero.length <= 4) return `(${ddd}) ${numero}`

  const corte = so.length === 11 ? 5 : 4
  return `(${ddd}) ${numero.slice(0, corte)}-${numero.slice(corte)}`
}

/**
 * Telefone brasileiro em 10 ou 11 dígitos, com DDD. O 11º é o 9 do celular.
 * Guardado como +55DDD… porque é o formato que gateway de pagamento e
 * disparador de WhatsApp esperam, e converter na hora de usar é como se
 * esquece de converter em um dos lugares. `null` se não for telefone.
 */
export function conferirTelefone(entrada: string): string | null {
  const so = limparTelefone(entrada)
  if (so.length < 10 || so.length > 11) return null
  if (!/^[1-9]{2}/.test(so)) return null
  return `+55${so}`
}
