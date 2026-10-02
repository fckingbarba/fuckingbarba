/**
 * "VOCÊ QUIS DIZER …?" — o e-mail com erro de digitação no domínio (entrega
 * 0248). Em 02/10 o Thauan comprou com "hotmail.con": o e-mail do pedido, o
 * do cancelamento e o aviso do Pix voltaram todos, e a loja só soube pelo
 * CRM. A regra de formato (`passos-do-checkout.ts`) não pega isso: ".con" é
 * um e-mail bem escrito, só não existe.
 *
 * É SÓ SUGESTÃO. Quem tem e-mail num domínio parecido com um dos grandes
 * (a empresa "cloud.com", perto do "icloud.com") toca em "Continuar" de novo
 * e segue com o dele. Por isso a régua é curta: uma letra trocada, faltando,
 * sobrando ou fora de ordem no nome do domínio, e outra no final — e nunca
 * nos nomes curtos ("uol", "bol", "ig"), onde uma letra já é outro domínio.
 *
 * Sem `import` nenhum: o `conferir-checkout` lê este arquivo direto no Node.
 */

/** Os domínios de quem compra aqui, os mais comuns primeiro (o empate fica com o de cima). */
const DOMINIOS = [
  "gmail.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "yahoo.com.br",
  "yahoo.com",
  "hotmail.com.br",
  "outlook.com.br",
  "live.com",
  "msn.com",
  "bol.com.br",
  "uol.com.br",
  "terra.com.br",
  "ig.com.br",
  "globo.com",
  "globomail.com",
  "r7.com",
  "me.com",
  "mac.com",
  "ymail.com",
  "rocketmail.com",
  "aol.com",
  "googlemail.com",
  "protonmail.com",
  "proton.me",
  "mail.com",
  "email.com",
  "zipmail.com.br",
  "oi.com.br",
]

/** Os ".com" que não existem — em qualquer domínio, não só nos grandes. */
const COM_ERRADO = new Set([
  "con",
  "cmo",
  "cpm",
  "vom",
  "xom",
  "cim",
  "ocm",
  "coom",
  "comm",
  "conm",
  "comn",
  "clm",
  "c0m",
])

/** Os erros que a distância não alcança: o ".br" que o Gmail e o iCloud não têm. */
const TROCAS: Record<string, string> = {
  "gmail.com.br": "gmail.com",
  "icloud.com.br": "icloud.com",
}

/** Quantas letras trocar, tirar, pôr ou inverter de lugar pra ir de `a` a `b`. */
function distancia(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + custo)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  return d[a.length][b.length]
}

/** "hotmail.con" → "hotmail.com"; "uol.combr" → "uol.com.br". */
function consertarFinal(dominio: string): string {
  const partes = dominio.split(".")
  const ultima = partes[partes.length - 1]
  if (partes.length > 1 && ultima === "combr") partes.splice(-1, 1, "com", "br")
  return partes.map((p, i) => (i > 0 && COM_ERRADO.has(p) ? "com" : p)).join(".")
}

/** O domínio conhecido mais perto: uma letra no nome, uma no final. */
function maisPerto(dominio: string): string | null {
  // Sem o ponto ("gmailcom"): o domínio conhecido sem os pontos.
  const semPonto = DOMINIOS.find((k) => k.replace(/\./g, "") === dominio)
  if (semPonto) return semPonto
  const ponto = dominio.indexOf(".")
  if (ponto < 1) return null
  const nome = dominio.slice(0, ponto)
  const final = dominio.slice(ponto + 1)
  let melhor: { dominio: string; quanto: number } | null = null
  for (const k of DOMINIOS) {
    const p = k.indexOf(".")
    const noNome = distancia(nome, k.slice(0, p))
    const noFinal = distancia(final, k.slice(p + 1))
    // Nome curto ("uol", "bol", "ig", "live"): uma letra já é outro domínio.
    const folga = p >= 5 ? 1 : 0
    if (noNome > folga || noFinal > 1) continue
    const quanto = noNome + noFinal
    if (quanto > 0 && (!melhor || quanto < melhor.quanto)) melhor = { dominio: k, quanto }
  }
  return melhor?.dominio ?? null
}

/**
 * O e-mail consertado, ou `null` quando não há o que sugerir (o domínio é
 * conhecido, ou não lembra nenhum). Minúsculo, como o checkout grava.
 */
export function sugestaoDoEmail(email: string): string | null {
  const e = email.trim().toLowerCase()
  const arroba = e.lastIndexOf("@")
  if (arroba < 1) return null
  const usuario = e.slice(0, arroba)
  const dominio = e.slice(arroba + 1)
  if (!dominio || DOMINIOS.includes(dominio)) return null
  const semCon = consertarFinal(dominio)
  const consertado = TROCAS[semCon] ?? semCon
  const certo = DOMINIOS.includes(consertado) ? consertado : (maisPerto(consertado) ?? consertado)
  return certo !== dominio ? `${usuario}@${certo}` : null
}
