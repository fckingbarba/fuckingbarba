import type { ConteudoDaPdp } from "../../src/lib/pdp"
import type { ProdutoDoAtendente } from "../../src/lib/whatsapp/catalogo"

/**
 * O CATÁLOGO DA LOJA NO AR, lido das páginas públicas dos produtos — o que o
 * atendente de verdade tem no banco (`lerCatalogo`), sem precisar do banco:
 * o nome, o preço e o riscado, o esgotado, as categorias, o resumo (a
 * descrição do Google) e as sete seções da página. Só o que a página mostra:
 * seção escondida não aparece nela, nem aqui.
 *
 * O "Leve junto" e as promoções ficam vazios: a página não diz quais são.
 */

const texto = (s: string) =>
  s
    .replace(/<!--.*?-->/gs, "")
    .replace(/<br\s*\/?>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()

const chave = (nome: string) =>
  nome
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")

const reais = (v: string) => Number(v.replace(/\./g, "").replace(",", "."))

function secao(corpo: string, classe: string): string | null {
  const m = new RegExp(`<section class="${classe}[" ][^>]*>(.*?)</section>`, "s").exec(corpo)
  return m ? m[1] : null
}

const itens = (trecho: string | undefined) =>
  [...(trecho ?? "").matchAll(/<li>(.*?)<\/li>/gs)].map((m) => texto(m[1]))

type Lido = ProdutoDoAtendente & { rotinaPorNome: { passo: string; nome: string; para: string }[] }

function lerPagina(handle: string, bruto: string): Lido {
  const corpo = bruto.split("<body")[1].replace(/<script.*?<\/script>/gs, "")
  const nome = texto(/<h1 class="compra__nome"[^>]*>(.*?)<\/h1>/s.exec(corpo)?.[1] ?? handle)
  const descricao = /<meta name="description" content="([^"]*)"/.exec(bruto)?.[1]
  const migalhas = [...corpo.matchAll(/<span itemProp="name">([^<]*)<\/span>/g)]
    .map((m) => texto(m[1]))
    .filter((m) => m !== "Início" && m !== nome)
  const precos = corpo.slice(corpo.indexOf('class="compra__precos"')).slice(0, 2000)
  const por = /compra__por">R\$\s*([\d.,]+)/.exec(precos)?.[1]
  const de = /compra__de">.*?R\$\s*([\d.,]+)/s.exec(precos)?.[1]
  const vende = !/itemProp="availability" href="https:\/\/schema\.org\/OutOfStock"/.test(corpo)

  const conteudo: ConteudoDaPdp = {}
  const promessa = secao(corpo, "promessa")
  if (promessa) conteudo.promessa = { chapeu: "", titulo: "", itens: itens(promessa) }
  const funciona = secao(corpo, "funciona")
  if (funciona) {
    const [como = "", uso = ""] = funciona.split('<div class="funciona__caixa">').slice(1)
    const dica = /funciona__dica">(.*?)<\/p>/s.exec(uso)?.[1]
    conteudo.funciona = {
      comoTitulo: "",
      comoFotoDe: "",
      comoTexto: [...como.matchAll(/<p>(.*?)<\/p>/gs)].map((m) => texto(m[1])),
      usoTitulo: "",
      usoFotoDe: "",
      usoPassos: itens(uso),
      ...(dica ? { dica: texto(dica) } : {}),
    }
  }
  const tempo = secao(corpo, "tempo")
  if (tempo)
    conteudo.tempo = {
      titulo: "",
      passos: [
        ...tempo.matchAll(/tempo__quando">(.*?)<\/p>\s*<dl>\s*<dt>(.*?)<\/dt>\s*<dd>(.*?)<\/dd>/gs),
      ].map((m) => ({ quando: texto(m[1]), titulo: texto(m[2]), texto: texto(m[3]) })),
    } as ConteudoDaPdp["tempo"]
  const quem = secao(corpo, "quem")
  if (quem)
    conteudo.quem = {
      titulo: "",
      sim: itens(/quem__coluna--sim">(.*?)<\/div>/s.exec(quem)?.[1]),
      nao: itens(/quem__coluna--nao">(.*?)<\/div>/s.exec(quem)?.[1]),
    } as ConteudoDaPdp["quem"]
  const rotinaPorNome: Lido["rotinaPorNome"] = []
  const rotina = secao(corpo, "rotina")
  if (rotina)
    for (const m of rotina.matchAll(/<label class="rotina__item([^"]*)">(.*?)<\/label>/gs)) {
      if (m[1].includes("--fixo")) continue
      rotinaPorNome.push({
        passo: texto(/rotina__passo">(.*?)<\/span>/s.exec(m[2])?.[1] ?? ""),
        nome: texto(/rotina__nome">(.*?)<\/span>/s.exec(m[2])?.[1] ?? ""),
        para: texto(/rotina__para">(.*?)<\/span>/s.exec(m[2])?.[1] ?? ""),
      })
    }
  const versus = secao(corpo, "versus")
  if (versus)
    conteudo.versus = {
      nomeDeles: texto(
        /versus__coluna--deles">\s*<p class="versus__cabeca"><span>(.*?)<small>/s.exec(
          versus
        )?.[1] ?? "Genérico"
      ),
      nosso: itens(/versus__coluna--nosso">(.*?)<\/ul>/s.exec(versus)?.[1]),
      deles: itens(/versus__coluna--deles">(.*?)<\/ul>/s.exec(versus)?.[1]),
    } as ConteudoDaPdp["versus"]
  const duvidas = secao(corpo, "duvidas")
  if (duvidas)
    conteudo.duvidas = {
      titulo: "",
      perguntas: [
        ...duvidas.matchAll(
          /<summary>(.*?)<\/summary>\s*<div class="duvidas__resposta">(.*?)<\/div>/gs
        ),
      ].map((m) => ({
        pergunta: texto(m[1].replace(/<span.*?<\/span>/gs, "")),
        resposta: [...m[2].matchAll(/<p>(.*?)<\/p>/gs)].map((p) => texto(p[1])),
      })),
    } as ConteudoDaPdp["duvidas"]

  return {
    nome,
    handle,
    categorias: migalhas.sort(),
    resumo: descricao ? texto(descricao) : null,
    variantes: [
      {
        nome: null,
        preco: por ? reais(por) : null,
        precoCheio: de ? reais(de) : null,
        vende,
      },
    ],
    promocoes: [],
    conteudo,
    levaJunto: [],
    rotinaPorNome,
  }
}

/** Os produtos publicados (pelo sitemap), lidos das páginas. */
export async function lerCatalogoDoSite(loja: string): Promise<ProdutoDoAtendente[]> {
  const sitemap = await (await fetch(`${loja}/sitemap.xml`)).text()
  const handles = [
    ...new Set([...sitemap.matchAll(/<loc>[^<]*\/produtos\/([^<\/]+)<\/loc>/g)].map((m) => m[1])),
  ]
  const lidos: Lido[] = []
  for (const handle of handles) {
    const r = await fetch(`${loja}/produtos/${handle}`, {
      headers: { "user-agent": "simular-atendente (fuckingbarba)" },
    })
    if (r.ok) lidos.push(lerPagina(handle, await r.text()))
  }
  // A rotina da página diz o nome; o atendente guarda o código (o nome sai do catálogo).
  const porNome = new Map(lidos.map((p) => [chave(p.nome), p.handle]))
  const acha = (nome: string) => {
    const k = chave(nome)
    const iguais = [...porNome].filter(([n]) => n === k || n.includes(k) || k.includes(n))
    return iguais.length === 1 ? iguais[0][1] : (porNome.get(k) ?? nome)
  }
  return lidos.map(({ rotinaPorNome, ...p }) => ({
    ...p,
    conteudo: rotinaPorNome.length
      ? {
          ...p.conteudo,
          rotina: {
            titulo: "",
            itens: rotinaPorNome.map((i) => ({
              passo: i.passo,
              handle: acha(i.nome),
              para: i.para,
            })),
          },
        }
      : p.conteudo,
  }))
}
