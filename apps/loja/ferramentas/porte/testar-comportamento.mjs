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
const ok = (c, m) => console.log((c ? '  OK  ' : '  FALHA ') + m)
;(async () => {
  const nav = await chromium.launch()
  const p = await nav.newPage({ viewport: { width: 390, height: 844 } })
  await p.goto('http://localhost:3100/', { waitUntil: 'networkidle' })

  const hamb = p.locator('button[aria-controls="menu-lateral"]')
  const menu = p.locator('#menu-lateral')

  console.log('— menu fechado —')
  ok(await menu.getAttribute('inert') !== null, 'menu começa com inert')
  ok(await hamb.getAttribute('aria-expanded') === 'false', 'aria-expanded=false')
  ok(!(await p.evaluate(() => document.documentElement.classList.contains('menu-aberto'))), 'sem .menu-aberto no <html>')
  ok((await p.evaluate(() => getComputedStyle(document.querySelector('.menu__veu')).visibility)) === 'hidden', 'véu invisível')

  console.log('— abre —')
  await hamb.click(); await p.waitForTimeout(350)
  ok(await menu.getAttribute('inert') === null, 'inert sai ao abrir')
  ok(await hamb.getAttribute('aria-expanded') === 'true', 'aria-expanded=true')
  ok(await p.evaluate(() => document.documentElement.classList.contains('menu-aberto')), '.menu-aberto no <html>')
  ok(await p.evaluate(() => getComputedStyle(document.documentElement).overflow) === 'hidden', 'rolagem travada')
  ok(await p.evaluate(() => document.activeElement?.getAttribute('aria-label')) === 'Fechar menu', 'foco foi pro botão fechar')

  console.log('— prende o Tab —')
  const focos = []
  for (let i = 0; i < 9; i++) {
    await p.keyboard.press('Tab')
    focos.push(await p.evaluate(() => {
      const a = document.activeElement
      return (a.closest('#menu-lateral') ? 'menu:' : 'FORA:') + (a.textContent || a.getAttribute('aria-label') || a.tagName).trim().slice(0, 14)
    }))
  }
  ok(focos.every(f => f.startsWith('menu:')), 'o foco nunca sai do menu — ' + focos.join(' → '))

  console.log('— Esc —')
  await p.keyboard.press('Escape'); await p.waitForTimeout(350)
  ok(await menu.getAttribute('inert') !== null, 'inert volta')
  ok(await p.evaluate(() => document.activeElement?.getAttribute('aria-label')) === 'Abrir menu', 'foco voltou pro hambúrguer')

  console.log('— véu fecha —')
  await hamb.click(); await p.waitForTimeout(350)
  // clica no véu FORA do menu: no centro ele está coberto pelo próprio menu
  await p.mouse.click(375, 400); await p.waitForTimeout(350)
  ok(!(await p.evaluate(() => document.documentElement.classList.contains('menu-aberto'))), 'clique no véu fecha')

  console.log('— busca —')
  const lupa = p.locator('button[aria-controls="busca"]')
  ok(await p.locator('#busca').isHidden(), 'busca começa escondida')
  await lupa.click(); await p.waitForTimeout(250)
  ok(await p.locator('#busca').isVisible(), 'busca abre')
  ok(await p.evaluate(() => document.activeElement?.getAttribute('name')) === 'q', 'foco foi pro campo')
  await lupa.click(); await p.waitForTimeout(250)
  ok(await p.locator('#busca').isHidden(), 'busca fecha')

  console.log('— sombra ao rolar —')
  ok(!(await p.evaluate(() => document.querySelector('.cabecalho').classList.contains('e-rolado'))), 'sem sombra no topo')
  await p.evaluate(() => window.scrollTo(0, 600)); await p.waitForTimeout(400)
  ok(await p.evaluate(() => document.querySelector('.cabecalho').classList.contains('e-rolado')), 'sombra aparece ao rolar')

  console.log('— esteira pausa fora da tela —')
  ok(await p.evaluate(() => document.querySelector('.anuncio').classList.contains('fora-de-vista')), '.anuncio pausada fora da tela')
  await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(400)
  ok(!(await p.evaluate(() => document.querySelector('.anuncio').classList.contains('fora-de-vista'))), '.anuncio volta a andar')

  await nav.close()
})()
