/**
 * DUAS RODADAS DA SIMULAÇÃO NUMA REVISÃO ÀS CEGAS SÓ — o antes e o depois de
 * uma mudança (veja "ANTES x DEPOIS" no `rodar.ts`). Por cenário, as respostas
 * das duas embaralhadas, SEM as ferramentas que cada uma usou: uma ferramenta
 * nova entregaria a versão. O gabarito fica em `chaves-ab.json`.
 *
 *   cd apps/backend
 *   npx ts-node ferramentas/simular-atendente/juntar.ts <resultado A> <resultado B> [pasta]
 *
 * A pasta (padrão: a do resultado B) ganha `revisao-ab.md` e `chaves-ab.json`.
 * Dê as notas sem abrir o gabarito, num `notas.json` na mesma pasta —
 * `{ "<cenário>": [a nota da A, da B, da C…] }`, de 1 a 5 — e depois:
 *
 *   npx ts-node ferramentas/simular-atendente/juntar.ts --notas <pasta>/notas.json
 *
 * dá a média de cada rodada e lista as notas abaixo de 5.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { CENARIOS } from "./cenarios"
import { preencher } from "./ferramentas-de-teste"

type Linha = {
  cenario: string
  rep: number
  texto: string | null
  erro?: string
  equipe: string | null
  extras: string[]
}
type Chave = { rodada: string; rep: number }

const ler = (pasta: string): (Linha & { rodada: string })[] =>
  readFileSync(join(pasta, "respostas.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => ({ ...(JSON.parse(l) as Linha), rodada: pasta }))

function embaralhar<T>(xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[xs[i], xs[j]] = [xs[j], xs[i]]
  }
  return xs
}

function juntar(a: string, b: string, saida: string) {
  const linhas = [...ler(a), ...ler(b)]
  const chaves: Record<string, Chave> = {}
  let md = "# Revisão às cegas: duas rodadas\n"
  for (const c of CENARIOS) {
    const ls = embaralhar(linhas.filter((l) => l.cenario === c.id))
    if (!ls.length) continue
    md += `\n## ${c.id} — ${c.titulo}\n`
    for (const f of c.falas) md += `> [${f.de}] ${preencher(f.texto)}\n`
    md += `\nBOM: ${preencher(c.bom)}\n`
    ls.forEach((l, i) => {
      const letra = String.fromCharCode(65 + i)
      chaves[`${c.id}/${letra}`] = { rodada: l.rodada, rep: l.rep }
      md += `\n### ${letra} | equipe: ${l.equipe ?? "-"} | pix separado: ${l.extras.length > 0}\n${l.texto ?? `[ERRO] ${l.erro}`}\n`
    })
  }
  writeFileSync(join(saida, "revisao-ab.md"), md)
  writeFileSync(join(saida, "chaves-ab.json"), JSON.stringify(chaves, null, 1))
  console.log(`${Object.keys(chaves).length} respostas em ${join(saida, "revisao-ab.md")}`)
}

function medias(arquivo: string) {
  const notas = JSON.parse(readFileSync(arquivo, "utf8")) as Record<string, number[]>
  const chaves = JSON.parse(
    readFileSync(join(dirname(arquivo), "chaves-ab.json"), "utf8")
  ) as Record<string, Chave>
  const por: Record<string, number[]> = {}
  const baixas: string[] = []
  for (const [id, ns] of Object.entries(notas))
    ns.forEach((n, i) => {
      const k = chaves[`${id}/${String.fromCharCode(65 + i)}`]
      ;(por[k.rodada] ??= []).push(n)
      if (n < 5) baixas.push(`${id} r${k.rep}, ${k.rodada}: ${n}`)
    })
  for (const [rodada, ns] of Object.entries(por))
    console.log(
      `${rodada}: média ${(ns.reduce((s, n) => s + n, 0) / ns.length).toFixed(2)} ` +
        `(${ns.length} respostas; ${ns.filter((n) => n <= 2).length} com nota 2 ou menos)`
    )
  for (const b of baixas) console.log(`  ${b}`)
}

const [x, y, z] = process.argv.slice(2)
if (x === "--notas" && y) medias(y)
else if (x && y) juntar(x, y, z ?? y)
else {
  console.error(
    "uso: juntar.ts <resultado A> <resultado B> [pasta] | juntar.ts --notas <pasta>/notas.json"
  )
  process.exit(1)
}
