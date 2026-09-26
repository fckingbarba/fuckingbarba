/**
 * Confere os SORTEIOS DE DEPOIMENTO — a esteira da home ("Nossos clientes nos
 * amam": até quatro por produto, a lista sem repetidas e as duas fileiras) e
 * os três da página do produto —, sem servidor nenhum.
 *
 *   node ferramentas/conferir-esteira.mjs
 *
 * As avaliações daqui são de mentira, montadas só pro teste ("Teste …"): o
 * que se confere é a conta, não o conteúdo. As sementes são fixas, então o
 * resultado é o mesmo a cada rodada.
 *
 * A parte dos TRECHOS DE ENTREVISTA lê a lista de verdade
 * (`conteudo/depoimentos.ts`): que nenhum trecho carrega nome, nota ou selo,
 * que cada um entra uma vez, no produto dele, e que a home desenha dezenas de
 * cartões com eles, e não mil.
 */

import { AVALIACOES, TRECHOS } from "../src/conteudo/depoimentos.ts"
import {
  MINIMO_NA_FILA,
  NA_PAGINA_DO_PRODUTO,
  POR_PRODUTO_NA_ESTEIRA,
  SEGUNDOS_POR_CARTAO,
  SEGUNDOS_POR_CARTAO_NA_VOLTA,
  emDuasFileiras,
  encherAFila,
  semRepetidas,
  sequencia,
  sortear,
  sortearDaEsteira,
} from "../src/lib/avaliacoes.ts"

let falhas = 0
let testes = 0
const ok = (cond, texto, det = "") => {
  testes++
  if (cond) console.log(`  ✓ ${texto}`)
  else {
    falhas++
    console.log(`  ✗ ${texto}${det ? ` — ${det}` : ""}`)
  }
}
const titulo = (t) => console.log(`\n${t}`)

const cria = (produto, n, prefixo = produto) =>
  Array.from({ length: n }, (_, i) => ({
    nome: `Teste ${prefixo}-${i}`,
    nota: 5,
    texto: `texto ${prefixo} ${i}`,
    ...(produto ? { produtoHandle: produto } : {}),
  }))

// O caso da loja: as do fator repetidas nos kits dele, um produto com muitas,
// um com poucas e algumas sem produto.
const fator = cria("fator", 20)
const kits = ["kit-2", "kit-3", "kit-6", "kit-fator-shampoo"].flatMap((kit) =>
  fator.map((a) => ({ ...a, produtoHandle: kit }))
)
const lista = [
  ...fator,
  ...kits,
  ...cria("shampoo", 20),
  ...cria("balm", 2),
  ...cria(undefined, 3, "solta"),
]
const porProduto = (l) =>
  l.reduce(
    (m, a) => m.set(a.produtoHandle ?? "", (m.get(a.produtoHandle ?? "") ?? 0) + 1),
    new Map()
  )

titulo("Sem repetidas")
const unicas = semRepetidas(lista)
ok(
  unicas.length === 20 + 20 + 2 + 3,
  "a mesma avaliação posta em cinco produtos conta uma vez só",
  String(unicas.length)
)
ok(
  porProduto(unicas).get("fator") === 20 && !unicas.some((a) => a.produtoHandle?.startsWith("kit")),
  "e fica no produto da primeira vez"
)
ok(
  semRepetidas([
    { nome: "Ana B.", nota: 5, texto: "Gostei" },
    { nome: "ana b. ", nota: 5, texto: "  Gostei " },
  ]).length === 1,
  "espaço e maiúscula não fazem outra avaliação"
)
ok(
  semRepetidas([
    { nome: "Ana B.", nota: 5, texto: "Gostei" },
    { nome: "Ana B.", nota: 4, texto: "Gostei muito" },
  ]).length === 2,
  "a mesma pessoa com outro texto é outra avaliação"
)

titulo("O sorteio")
const sorteio = sortearDaEsteira(unicas, POR_PRODUTO_NA_ESTEIRA, sequencia(1))
const conta = porProduto(sorteio)
ok(
  conta.get("fator") === 4 && conta.get("shampoo") === 4,
  "quatro de cada produto que tem quatro ou mais",
  JSON.stringify([...conta])
)
ok(conta.get("balm") === 2, "o produto com duas mostra as duas")
ok(conta.get("") === 3, "as sem produto fazem um grupo delas")
ok(sorteio.length === 4 + 4 + 2 + 3, "e nada mais", String(sorteio.length))
ok(new Set(sorteio.map((a) => a.nome)).size === sorteio.length, "nenhuma repetida no sorteio")
ok(
  sorteio.every((a) => unicas.includes(a)),
  "todas saem da lista publicada, sem mudar nada nelas"
)
ok(
  JSON.stringify(sortearDaEsteira(unicas, POR_PRODUTO_NA_ESTEIRA, sequencia(1))) ===
    JSON.stringify(sorteio),
  "a mesma semente dá o mesmo sorteio (o servidor e a hidratação desenham igual)"
)
const diferentes = new Set(
  Array.from({ length: 20 }, (_, i) =>
    sortearDaEsteira(unicas, POR_PRODUTO_NA_ESTEIRA, sequencia(1000 + i))
      .map((a) => a.nome)
      .join()
  )
)
ok(diferentes.size >= 15, "sementes diferentes dão sorteios diferentes", `${diferentes.size} em 20`)
const vistas = new Set()
for (let i = 0; i < 200; i++)
  sortearDaEsteira(unicas, POR_PRODUTO_NA_ESTEIRA, sequencia(i)).forEach((a) => vistas.add(a.nome))
ok(
  fator.every((a) => vistas.has(a.nome)),
  "em 200 visitas, as vinte do fator aparecem alguma vez",
  `${fator.filter((a) => vistas.has(a.nome)).length} de 20`
)
const emBloco = Array.from({ length: 50 }, (_, i) =>
  sortearDaEsteira(unicas, POR_PRODUTO_NA_ESTEIRA, sequencia(i))
).filter((l) => new Set(l.slice(0, 4).map((a) => a.produtoHandle)).size === 1).length
ok(emBloco < 10, "a ordem mistura os produtos", `${emBloco} em 50 começaram com um produto só`)

titulo("A fila da esteira")
ok(encherAFila([], MINIMO_NA_FILA).length === 0, "sem avaliação, fila vazia")
const uma = encherAFila(unicas.slice(0, 1), MINIMO_NA_FILA)
ok(uma.length >= MINIMO_NA_FILA, "uma avaliação só se repete até cobrir a tela", String(uma.length))
ok(
  encherAFila(sorteio, MINIMO_NA_FILA).length === sorteio.length,
  "treze sorteadas já passam do mínimo: sem repetir",
  String(encherAFila(sorteio, MINIMO_NA_FILA).length)
)
ok(
  SEGUNDOS_POR_CARTAO * 6 >= 40 && SEGUNDOS_POR_CARTAO * 6 <= 50,
  "o ritmo é o do protótipo (seis cartões em uns 46 s), com qualquer número de avaliações"
)

titulo("As duas fileiras")
// Quantos de cada produto numa lista, pra comparar as duas fileiras.
const deCada = (l) => porProduto(l)
const [ida, volta] = emDuasFileiras(sorteio, sequencia(5))
ok(
  ida.length + volta.length === sorteio.length &&
    new Set([...ida, ...volta]).size === sorteio.length &&
    [...ida, ...volta].every((a) => sorteio.includes(a)),
  "cada cartão do sorteio vai pra uma fileira só, e nenhum fica de fora",
  `${ida.length} + ${volta.length} de ${sorteio.length}`
)
ok(
  Math.abs(ida.length - volta.length) <= 1,
  "as duas fileiras ficam com o mesmo tanto (uma com um a mais, no máximo)",
  `${ida.length} e ${volta.length}`
)
const produtosDoSorteio = [...deCada(sorteio).keys()]
ok(
  produtosDoSorteio.every(
    (p) => Math.abs((deCada(ida).get(p) ?? 0) - (deCada(volta).get(p) ?? 0)) <= 1
  ),
  "cada produto se reparte entre as duas",
  JSON.stringify({ ida: [...deCada(ida)], volta: [...deCada(volta)] })
)
const doisProdutos = emDuasFileiras([cria("shampoo", 1)[0], cria("balm", 1)[0]], sequencia(1))
ok(
  doisProdutos[0].length === 1 && doisProdutos[1].length === 1,
  "com dois cartões, um em cada fileira — mesmo de produtos diferentes"
)
const umSo = emDuasFileiras(cria("balm", 1), sequencia(1))
ok(
  umSo[0].length + umSo[1].length === 1,
  "com um cartão só, uma fileira fica vazia (a esteira desenha só a outra)"
)
ok(
  emDuasFileiras([], sequencia(1)).every((f) => f.length === 0),
  "sem depoimento, as duas vazias"
)
ok(
  JSON.stringify(emDuasFileiras(sorteio, sequencia(5))) === JSON.stringify([ida, volta]),
  "a mesma semente reparte igual"
)
// Repartidos em ordem, os produtos andariam em bloco: A A B B C C… Com oito
// produtos e dezesseis cartões por fileira, em bloco dá oito vizinhos do
// mesmo produto; embaralhada, um em média.
const vizinhosIguais = (l) =>
  l.slice(1).filter((a, i) => a.produtoHandle === l[i].produtoHandle).length
const oitoProdutos = semRepetidas(
  ["a", "b", "c", "d", "e", "f", "g", "h"].flatMap((p) => cria(p, 20))
)
let emBlocoNaFileira = 0
for (let i = 0; i < 50; i++) {
  const aleatorio = sequencia(300 + i)
  const fileiras = emDuasFileiras(
    sortearDaEsteira(oitoProdutos, POR_PRODUTO_NA_ESTEIRA, aleatorio),
    aleatorio
  )
  emBlocoNaFileira += fileiras.reduce((n, f) => n + vizinhosIguais(f), 0)
}
ok(
  emBlocoNaFileira / 100 <= 3,
  "cada fileira mistura os produtos (não anda em bloco)",
  `${(emBlocoNaFileira / 100).toFixed(2)} vizinhos do mesmo produto por fileira, em média`
)
ok(
  SEGUNDOS_POR_CARTAO_NA_VOLTA * 6 >= 55 &&
    SEGUNDOS_POR_CARTAO_NA_VOLTA * 6 <= 60 &&
    SEGUNDOS_POR_CARTAO_NA_VOLTA > SEGUNDOS_POR_CARTAO,
  "a de baixo tem o ritmo do protótipo (seis cartões em uns 58 s), mais lenta que a de cima"
)

titulo("Os trechos de entrevista")
const semEspaco = (t) => t.replace(/\s+/g, " ").trim().toLowerCase()
ok(TRECHOS.length > 0, "a lista de trechos tem trecho", String(TRECHOS.length))
const camposForaDoLugar = TRECHOS.filter(
  (t) => Object.keys(t).some((k) => k !== "texto" && k !== "produtoHandle") || !t.produtoHandle
)
ok(
  camposForaDoLugar.length === 0,
  "nenhum trecho tem nome, nota ou selo — só o texto e o produto",
  JSON.stringify(camposForaDoLugar[0] ?? "")
)
ok(
  new Set(TRECHOS.map((t) => semEspaco(t.texto))).size === TRECHOS.length,
  "cada trecho entra uma vez",
  `${TRECHOS.length - new Set(TRECHOS.map((t) => semEspaco(t.texto))).size} repetido(s)`
)
const kitsDoFator = [
  "kit-2-fator-de-crescimento-para-barba",
  "kit-3-fator-de-crescimento-para-barba",
  "kit-6-fator-de-crescimento-para-barba",
  "kit-fator-de-crescimento-para-barba-e-shampoo",
]
ok(
  !TRECHOS.some((t) => kitsDoFator.includes(t.produtoHandle)) &&
    TRECHOS.some((t) => t.produtoHandle === "fator-de-crescimento-para-barba"),
  "os do Fator ficam no Fator — nenhuma cópia nos kits dele"
)
const EXEMPLO = "Usei por 1 mês e não vi muita coisa"
ok(
  !TRECHOS.some((t) => t.texto.startsWith(EXEMPLO)) &&
    !AVALIACOES.some((a) => a.texto.startsWith(EXEMPLO)),
  "o exemplo do arquivo (o do André B.) não virou depoimento"
)
ok(
  semRepetidas([
    { texto: "Gostei", produtoHandle: "balm" },
    { texto: " gostei ", produtoHandle: "balm" },
  ]).length === 1,
  "trecho com o mesmo texto conta uma vez"
)
const aleatorioDaHome = sequencia(1)
const naHome = sortearDaEsteira(TRECHOS, POR_PRODUTO_NA_ESTEIRA, aleatorioDaHome)
const produtosComTrecho = new Set(TRECHOS.map((t) => t.produtoHandle)).size
const contaNaHome = porProduto(naHome)
ok(
  [...contaNaHome.values()].every((n) => n <= POR_PRODUTO_NA_ESTEIRA) &&
    naHome.length === Math.min(TRECHOS.length, POR_PRODUTO_NA_ESTEIRA * produtosComTrecho),
  "a esteira mostra até quatro trechos de cada produto",
  JSON.stringify([...contaNaHome])
)
const fileirasDaHome = emDuasFileiras(naHome, aleatorioDaHome)
ok(
  fileirasDaHome.every((f) => f.length >= MINIMO_NA_FILA),
  "com os trechos de hoje, cada fileira cobre a tela sem repetir cartão",
  fileirasDaHome.map((f) => f.length).join(" e ")
)
const cartoes = fileirasDaHome.reduce((n, f) => n + 2 * encherAFila(f, MINIMO_NA_FILA).length, 0)
ok(
  cartoes <= 2 * Math.max(POR_PRODUTO_NA_ESTEIRA * produtosComTrecho, 2 * MINIMO_NA_FILA),
  "a home desenha dezenas de cartões (as duas fileiras e as cópias), e não mil",
  `${cartoes} cartões`
)
const doFator = TRECHOS.filter((t) => t.produtoHandle === "fator-de-crescimento-para-barba")
const naPagina = sortear(doFator, NA_PAGINA_DO_PRODUTO, sequencia(1))
ok(
  naPagina.length === 3 && naPagina.every((t) => doFator.includes(t)),
  "a página do Fator mostra três trechos, e só do Fator",
  `${naPagina.length} de ${doFator.length}`
)

titulo("Os três da página do produto")
const vinte = cria("oleo", 20)
const tres = sortear(vinte, NA_PAGINA_DO_PRODUTO, sequencia(1))
ok(NA_PAGINA_DO_PRODUTO === 3, "a página mostra três")
ok(
  tres.length === 3 && new Set(tres).size === 3 && tres.every((a) => vinte.includes(a)),
  "três diferentes, todos da lista do produto, sem mudar nada neles"
)
ok(
  JSON.stringify(sortear(vinte, NA_PAGINA_DO_PRODUTO, sequencia(1))) === JSON.stringify(tres),
  "a mesma semente dá os mesmos três (o servidor e a hidratação desenham igual)"
)
ok(sortear(vinte.slice(0, 2), NA_PAGINA_DO_PRODUTO, sequencia(1)).length === 2, "com dois, os dois")
ok(sortear([], NA_PAGINA_DO_PRODUTO, sequencia(1)).length === 0, "sem depoimento, nenhum")
const trios = new Set(
  Array.from({ length: 20 }, (_, i) =>
    sortear(vinte, NA_PAGINA_DO_PRODUTO, sequencia(2000 + i))
      .map((a) => a.nome)
      .join()
  )
)
ok(trios.size >= 15, "visitas diferentes veem três diferentes", `${trios.size} em 20`)
// Sem escolher "os melhores": em 3.000 visitas, cada um dos vinte aparece
// perto de 3/20 delas (450). Fora de 300–600 seria viés, não sorte.
const vezes = new Map(vinte.map((a) => [a.nome, 0]))
for (let i = 0; i < 3000; i++)
  for (const a of sortear(vinte, NA_PAGINA_DO_PRODUTO, sequencia(i)))
    vezes.set(a.nome, vezes.get(a.nome) + 1)
const menos = Math.min(...vezes.values())
const mais = Math.max(...vezes.values())
ok(
  menos >= 300 && mais <= 600,
  "cada um tem a mesma chance de aparecer",
  `de ${menos} a ${mais} vezes em 3.000 visitas`
)

titulo("A sequência")
const proximo = sequencia(7)
const numeros = Array.from({ length: 1000 }, () => proximo())
ok(
  numeros.every((x) => x >= 0 && x < 1),
  "números entre 0 e 1"
)
ok(new Set(numeros).size > 990, "e sem repetir à toa", String(new Set(numeros).size))

console.log(`\n${testes - falhas}/${testes} passaram`)
process.exit(falhas ? 1 : 0)
