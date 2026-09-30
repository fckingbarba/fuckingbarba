"use client"

import { Icone } from "@/components/icones"
import type { TelaDoFinanceiro } from "@/lib/financeiro"

/**
 * BAIXAR PRO CONTADOR — o DRE do período numa planilha: uma linha por linha
 * do DRE, uma coluna por mês e o total, com centavos. Separado por ";" e com
 * a vírgula no decimal, como o Excel em português abre; o BOM no começo, pros
 * acentos. Monta no navegador, do que a tela já tem (nada vai ao servidor).
 */

const NUMERO = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: false,
})

/** A célula: texto que começa com `=`, `+`, `-` ou `@` vai com `'` (a planilha não roda como fórmula). */
function celula(v: string) {
  const texto = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
  return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

const BOM = String.fromCharCode(0xfeff)

function baixar(t: TelaDoFinanceiro) {
  const cabeca = ["Linha", ...t.meses.map((m) => `${m.curto}/${m.mes.slice(0, 4)}`), "Total"]
  const linhas = t.linhas.map((l) => [
    l.nome,
    ...t.meses.map((m) => NUMERO.format(m.valores[l.id])),
    NUMERO.format(l.valor),
  ])
  const texto = [cabeca, ...linhas]
    .map((l) => l.map((c) => (/^-?\d+,\d{2}$/.test(c) ? c : celula(c))).join(";"))
    .join("\n")
  const arquivo = new Blob([`${BOM}${texto}\n`], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(arquivo)
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: `dre-fuckingbarba-${t.periodo.de}-a-${t.periodo.ate}.csv`,
  })
  document.body.append(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export function BaixarPlanilha({ t }: { t: TelaDoFinanceiro }) {
  return (
    <button
      type="button"
      className="btn btn--menor btn--contorno"
      data-baixar-dre
      onClick={() => baixar(t)}
    >
      <Icone nome="nota" />
      Baixar pro contador
    </button>
  )
}
