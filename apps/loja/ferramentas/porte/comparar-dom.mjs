import { writeFileSync } from 'node:fs'
const RAIZES = (process.env.RAIZES || '.anuncio,.cabecalho,.menu,.rodape').split(',')
// Precisa do Playwright, que não é dependência do projeto de propósito: o CI
// nunca roda este script e o pacote baixa navegador no postinstall. Instale à
// mão quando for usar — `npm i -D playwright` na raiz do monorepo.
let chromium
try {
  ({ chromium } = await import('playwright'))
} catch {
  console.error('Falta o Playwright. Na raiz do monorepo: npm i -D playwright')
  process.exit(2)
}

const COLHE = (raiz) => {
  const topo = document.querySelector(raiz)
  if (!topo) return null
  const base = topo.getBoundingClientRect()
  const saida = []
  const anda = (el, caminho) => {
    const b = el.getBoundingClientRect()
    const e = getComputedStyle(el)
    saida.push({
      caminho,
      tag: el.tagName,
      classe: el.getAttribute('class') || '',
      x: +(b.left - base.left).toFixed(1),
      y: +(b.top - base.top).toFixed(1),
      w: +b.width.toFixed(1),
      h: +b.height.toFixed(1),
      cor: e.color,
      fundo: e.backgroundColor,
      fonte: `${e.fontSize}/${e.lineHeight} ${e.fontWeight}`,
      texto: Array.from(el.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').replace(/\s+/g, ' '),
    })
    Array.from(el.children).forEach((f, i) => anda(f, caminho + '/' + f.tagName + i))
  }
  anda(topo, raiz)
  return saida
}

;(async () => {
  const nav = await chromium.launch()
  const res = {}
  for (const [nome, url] of [['proto','http://localhost:3200/'],['next','http://localhost:3100/']]) {
    for (const [tela, w] of [['desk',1440],['mob',390]]) {
      const p = await nav.newPage({ viewport: { width: w, height: 900 } })
      await p.goto(url, { waitUntil: 'networkidle' })
      // Neutraliza a revelação ao rolar do protótipo: sem isso o rodapé é
      // medido ainda deslocado 20px pra baixo, e a comparação mente.
      await p.evaluate(() => {
        document.documentElement.classList.remove('js-revela')
        document.querySelectorAll('[data-revela]').forEach(e => e.classList.add('e-visivel'))
        // abre o menu nos dois, pra medir o menu de verdade
        document.documentElement.classList.add('menu-aberto')
        const m = document.querySelector('.menu'); if (m) m.removeAttribute('inert')
      })
      await p.addStyleTag({ content: '*,*::before,*::after{animation:none !important;transition:none !important}' })
      await p.waitForTimeout(150)
      res[`${nome}-${tela}`] = {}
      for (const raiz of RAIZES) {
        res[`${nome}-${tela}`][raiz] = await p.evaluate(COLHE, raiz)
      }
      await p.close()
    }
  }
  await nav.close()
  writeFileSync('dom.json', JSON.stringify(res))

  // relatório: nó por nó, o que difere entre protótipo e app
  let falhas = 0
  for (const tela of ['desk', 'mob']) {
    for (const raiz of RAIZES) {
      const a = res[`proto-${tela}`][raiz], b = res[`next-${tela}`][raiz]
      if (!a || !b) { console.log(`?  ${raiz} ${tela}: seção ausente em ${!a ? 'proto' : 'next'}`); continue }
      const difs = []
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        const probs = []
        for (const c of ['tag', 'classe', 'x', 'y', 'w', 'h', 'cor', 'fundo']) {
          const va = a[i][c], vb = b[i][c]
          if (typeof va === 'number') { if (Math.abs(va - vb) > 0.6) probs.push(`${c}: ${va} != ${vb}`) }
          else if (va !== vb && !(c === 'classe' && va.replace(' e-visivel', '') === vb)) probs.push(`${c}: ${va} != ${vb}`)
        }
        if (probs.length) difs.push(`    [${i}] ${a[i].tag}.${a[i].classe.slice(0, 30)} -> ${probs.slice(0, 3).join(' | ')}`)
      }
      const igual = !difs.length && a.length === b.length
      if (!igual) falhas++
      console.log(`${igual ? 'OK' : '>>'} ${raiz} ${tela}: ${a.length} vs ${b.length} nos, ${difs.length} com diferenca`)
      difs.slice(0, 8).forEach(l => console.log(l))
    }
  }
  process.exit(falhas ? 1 : 0)
})()
