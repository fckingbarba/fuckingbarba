/**
 * Confere a ESTEIRA DE AVALIAÇÕES da home ("Nossos clientes nos amam") — o
 * sorteio de até quatro por produto e a lista sem repetidas —, sem servidor
 * nenhum.
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
  POR_PRODUTO_NA_ESTEIRA,
  SEGUNDOS_POR_CARTAO,
  encherAFila,
  semRepetidas,
  sequencia,
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
const naHome = sortearDaEsteira(TRECHOS, POR_PRODUTO_NA_ESTEIRA, sequencia(1))
const produtosComTrecho = new Set(TRECHOS.map((t) => t.produtoHandle)).size
const contaNaHome = porProduto(naHome)
ok(
  [...contaNaHome.values()].every((n) => n <= POR_PRODUTO_NA_ESTEIRA) &&
    naHome.length === Math.min(TRECHOS.length, POR_PRODUTO_NA_ESTEIRA * produtosComTrecho),
  "a esteira mostra até quatro trechos de cada produto",
  JSON.stringify([...contaNaHome])
)
const cartoes = 2 * encherAFila(naHome, MINIMO_NA_FILA).length
ok(
  cartoes <= 2 * POR_PRODUTO_NA_ESTEIRA * produtosComTrecho,
  "a home desenha dezenas de cartões (a fila e a cópia), e não mil",
  `${cartoes} cartões`
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
