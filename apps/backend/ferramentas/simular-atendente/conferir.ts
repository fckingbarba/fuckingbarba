import type { Cenario } from "./cenarios"

/**
 * A CONFERÊNCIA AUTOMÁTICA de uma resposta da simulação: o que o cenário
 * exige (a ferramenta certa, chamar a equipe quando precisa, a sacola, o
 * preço, o link) e o que vale pra toda resposta (preço e link que não
 * existem, markdown, "mano", emoji demais, resposta longa).
 *
 * Falha é erro de verdade; aviso é pra quem lê as respostas olhar.
 */

export type Chamada = { nome: string; entrada: unknown; resultado: string | null; erro: boolean }

export type Resposta = {
  texto: string | null
  erro?: string
  equipe: string | null
  chamadas: Chamada[]
  extras: string[]
}

const PRECO = /R\$\s?(\d{1,3}(?:\.\d{3})*,\d{2})/g
const URL = /https?:\/\/[^\s)>\]]+/g
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/gu
/** O espaço fixo que o Intl põe no "R$ 0,00" (e os parecidos): pra comparar, vira espaço. */
const ESPACOS = /[\u00a0\u202f\u2007]/g

export function conferir(
  c: Cenario,
  r: Resposta,
  instrucoes: string,
  preencher: (s: string) => string
): { falhas: string[]; avisos: string[] } {
  const falhas: string[] = []
  const avisos: string[] = []
  if (r.erro) return { falhas: [`erro: ${r.erro.slice(0, 120)}`], avisos }
  const texto = (r.texto ?? "").replace(ESPACOS, " ")
  const e = c.espera
  const usadas = r.chamadas.map((x) => x.nome)
  const fontes = [
    instrucoes,
    ...r.chamadas.map((x) => x.resultado ?? ""),
    ...c.falas.map((f) => preencher(f.texto)),
  ]
    .join("\n")
    .replace(ESPACOS, " ")

  if (e.equipe === true && !r.equipe) falhas.push("não chamou a equipe")
  if (e.equipe === false && r.equipe) falhas.push(`chamou a equipe sem precisar (${r.equipe})`)
  for (const f of e.ferramentas ?? []) if (!usadas.includes(f)) falhas.push(`não usou ${f}`)
  for (const [nome, campos] of Object.entries(e.entrada ?? {})) {
    const ultima = [...r.chamadas].reverse().find((x) => x.nome === nome)
    if (!ultima) continue
    const ent = (ultima.entrada ?? {}) as {
      cep?: string
      itens?: { produto?: string }[]
      produto?: string
      numero?: number
    }
    if (campos.cep && String(ent.cep ?? "").replace(/\D/g, "") !== campos.cep)
      falhas.push(`${nome}: CEP errado (${ent.cep})`)
    if (campos.produto) {
      const pedidos = ent.itens ? ent.itens.map((i) => i.produto) : [ent.produto]
      const algum = r.chamadas
        .filter((x) => x.nome === nome)
        .some((x) => {
          const y = (x.entrada ?? {}) as { itens?: { produto?: string }[]; produto?: string }
          return (y.itens ? y.itens.map((i) => i.produto) : [y.produto]).includes(campos.produto)
        })
      if (!algum) falhas.push(`${nome}: produto errado (${JSON.stringify(pedidos)})`)
    }
    if (campos.numero && String(ent.numero) !== preencher(campos.numero))
      falhas.push(`${nome}: número errado (${ent.numero})`)
  }
  if (e.sacola) {
    const sacolas = r.chamadas.filter((x) => x.nome === "montar_sacola" && !x.erro)
    const ultima = sacolas[sacolas.length - 1]
    if (ultima) {
      const itens: Record<string, number> = {}
      for (const i of (ultima.entrada as { itens?: { produto: string; quantidade: number }[] })
        ?.itens ?? [])
        itens[i.produto] = (itens[i.produto] ?? 0) + i.quantidade
      if (
        JSON.stringify(Object.entries(itens).sort()) !==
        JSON.stringify(Object.entries(e.sacola).sort())
      )
        falhas.push(`sacola diferente: ${JSON.stringify(itens)}`)
      const link = /https:\/\/\S+\/voltar\/\S+/.exec(ultima.resultado ?? "")?.[0]
      if (link && !texto.includes(link)) falhas.push("montou a sacola mas não mandou o link dela")
    }
  }
  for (const s of e.contem ?? [])
    if (!texto.includes(preencher(s))) falhas.push(`faltou '${preencher(s)}'`)
  for (const h of e.links ?? [])
    if (!texto.includes(`/produtos/${h}`)) falhas.push(`faltou o link de ${h}`)
  for (const p of e.proibido ?? [])
    if (new RegExp(p).test(texto)) falhas.push(`escreveu o proibido /${p}/`)
  if (e.extras) {
    if (!r.extras.length) falhas.push("o código do Pix não saiu")
    else if (r.extras.some((x) => texto.includes(x.slice(0, 30))))
      falhas.push("escreveu o código do Pix no texto")
  }
  if (e.extras === false && r.extras.length)
    falhas.push("mandou o código do Pix sem a pessoa pedir")
  if (e.semOi && /^\s*(oi|ol[áa]|opa|e a[íi]|fala|salve)\b/i.test(texto))
    avisos.push("cumprimentou de novo no meio da conversa")

  for (const m of texto.matchAll(PRECO))
    if (!fontes.includes(`R$ ${m[1]}`) && !fontes.includes(`R$${m[1]}`))
      avisos.push(`preço que não está em lugar nenhum: R$ ${m[1]}`)
  for (const m of texto.matchAll(URL)) {
    const u = m[0].replace(/[.,;:!?*]+$/, "")
    if (!fontes.includes(u)) falhas.push(`link inventado ou alterado: ${u.slice(0, 90)}`)
  }
  if (/\*\*|\[[^\]]+\]\(http|^#/m.test(texto)) avisos.push("markdown")
  if (/\bmano\b/i.test(texto)) avisos.push("chamou de 'mano'")
  const emojis = texto.match(EMOJI)?.length ?? 0
  if (emojis > 1) avisos.push(`${emojis} emojis`)
  if (texto.length > 700) avisos.push(`longa (${texto.length} letras)`)
  return { falhas, avisos }
}
