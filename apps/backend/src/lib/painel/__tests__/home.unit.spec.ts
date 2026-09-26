import { HOME_VAZIA, lerHome, SEMENTE_DA_HOME, type HomeGuardada } from "../../home"
import {
  anuncioDaHome,
  avisoDoFrete,
  desfazerRascunho,
  mudarNaOrdemDaHome,
  mudarOrdemNaHome,
  ordemDaHome,
  pendentesDaHome,
  provasDaHome,
  publicarHome,
  quantasMudancasNaHome,
  salvarAnuncioDaHome,
  salvarSecaoDaHome,
  secoesDaHome,
  ultimaPublicacao,
} from "../home"

/**
 * A home no painel: a ordem (com o bloco escuro fixo no meio), o rascunho, o
 * que espera o "Publicar" e a barra de avisos do topo.
 */

const feito = (r: { ok: boolean; home?: HomeGuardada }) => {
  if (!r.ok || !r.home) throw new Error("não andou")
  return r.home
}

describe("a ordem da home", () => {
  it("sem nada guardado, a do registro; o bloco escuro na quinta posição", () => {
    const ordem = ordemDaHome({})
    expect(ordem[4]).toBe("home.hero")
    expect(ordem).toHaveLength(11)
  })

  it("a fixa volta pro lugar dela, mesmo que a ordem guardada a cite em outro", () => {
    const ordem = ordemDaHome({ ordem: ["home.hero", "home.sobre", "home.vitrine"] })
    expect(ordem.slice(0, 2)).toEqual(["home.sobre", "home.vitrine"])
    expect(ordem[4]).toBe("home.hero")
  })

  it("descer passa por cima do bloco escuro, que não sai do lugar", () => {
    const layout = mudarNaOrdemDaHome({}, "home.colecao", "descer")
    const ordem = ordemDaHome(layout!)
    expect(ordem.slice(3, 6)).toEqual(["home.alta-performance", "home.hero", "home.colecao"])
  })

  it("não dá: a fixa, subir a primeira, descer a última", () => {
    expect(mudarNaOrdemDaHome({}, "home.hero", "descer")).toBeNull()
    expect(mudarNaOrdemDaHome({}, "home.hero", "desligar")).toBeNull()
    expect(mudarNaOrdemDaHome({}, "home.banner", "subir")).toBeNull()
    expect(mudarNaOrdemDaHome({}, "home.fechamento", "descer")).toBeNull()
  })
})

describe("o rascunho", () => {
  it("toda mudança vai pro rascunho; o publicado fica como estava", () => {
    const h = feito(mudarOrdemNaHome(HOME_VAZIA, "home.amam", "desligar"))
    expect(h.publicado).toEqual(HOME_VAZIA.publicado)
    expect(h.rascunho?.layout.visibilidade).toEqual({ "home.amam": false })
    expect(pendentesDaHome(h)).toEqual({ secoes: ["home.amam"], ordem: false, anuncio: false })
    expect(secoesDaHome(h).find((s) => s.id === "home.amam")).toMatchObject({
      ligada: false,
      mudou: true,
    })
  })

  it("desligou e ligou de novo: não há nada esperando", () => {
    const h = feito(mudarOrdemNaHome(HOME_VAZIA, "home.amam", "desligar"))
    const de_volta = feito(mudarOrdemNaHome(h, "home.amam", "ligar"))
    expect(de_volta.rascunho).toBeNull()
    expect(pendentesDaHome(de_volta)).toEqual({ secoes: [], ordem: false, anuncio: false })
  })

  it("a ordem conta como uma mudança só", () => {
    const h = feito(mudarOrdemNaHome(HOME_VAZIA, "home.vitrine", "subir"))
    expect(pendentesDaHome(h)).toEqual({ secoes: [], ordem: true, anuncio: false })
  })

  it("salvar o texto: pela metade não grava; igual ao de fábrica não guarda a seção", () => {
    expect(salvarSecaoDaHome(HOME_VAZIA, "home.vitrine", { titulo: "" })).toEqual({
      ok: false,
      motivo: "faltando",
      faltando: ["titulo"],
    })
    const h = feito(salvarSecaoDaHome(HOME_VAZIA, "home.vitrine", { titulo: "Os mais pedidos" }))
    expect(h.rascunho?.conteudo.vitrine).toEqual({ titulo: "Os mais pedidos" })
    const secao = secoesDaHome(h).find((s) => s.id === "home.vitrine")!
    expect(secao).toMatchObject({ propria: true, mudou: true, padrao: SEMENTE_DA_HOME.vitrine })
    const de_fabrica = feito(salvarSecaoDaHome(h, "home.vitrine", SEMENTE_DA_HOME.vitrine))
    expect(de_fabrica.rascunho).toBeNull()
  })

  it("publicar leva o rascunho pro site, com quem e quando; sem rascunho, não há o que publicar", () => {
    const h = feito(salvarSecaoDaHome(HOME_VAZIA, "home.vitrine", { titulo: "Novo" }))
    const agora = new Date("2026-09-24T15:00:00.000Z")
    const publicada = feito(publicarHome(h, agora, "Ana"))
    expect(publicada.rascunho).toBeNull()
    expect(publicada.publicado.conteudo.vitrine).toEqual({ titulo: "Novo" })
    expect(publicada.publicadoPor).toBe("Ana")
    expect(ultimaPublicacao(publicada, agora)).toMatchObject({ quem: "Ana" })
    expect(publicarHome(publicada, agora, "Ana")).toEqual({
      ok: false,
      motivo: "nada_pra_publicar",
    })
  })

  it("desfazer joga o rascunho fora", () => {
    const h = feito(salvarSecaoDaHome(HOME_VAZIA, "home.vitrine", { titulo: "Novo" }))
    expect(feito(desfazerRascunho(h)).rascunho).toBeNull()
    expect(desfazerRascunho(HOME_VAZIA)).toEqual({ ok: false, motivo: "nada_pra_desfazer" })
  })

  it("o que foi gravado passa de novo pela peneira e volta igual", () => {
    const h = feito(salvarSecaoDaHome(HOME_VAZIA, "home.vitrine", { titulo: "Novo" }))
    expect(lerHome({ fb_home: JSON.parse(JSON.stringify(h)) })).toEqual(h)
  })
})

describe("a barra de avisos do topo", () => {
  const GRATIS = { modo: "gratis", piso: 139.9, alvo: "mais-barata", tetoDeCusto: null } as const

  it("de fábrica: o frete e a 'Compra 100% segura', sem nada esperando", () => {
    expect(anuncioDaHome(HOME_VAZIA, GRATIS)).toMatchObject({
      id: "anuncio",
      valores: { frete: true, avisos: ["Compra 100% segura"] },
      propria: false,
      mudou: false,
      fundo: null,
      aceitaFundo: false,
    })
    // Não é seção: não entra na lista (nem na ordem) da home.
    expect(secoesDaHome(HOME_VAZIA).map((s) => s.id)).not.toContain("anuncio")
  })

  it("salvar vai pro rascunho e conta como uma mudança; o site segue com a de antes", () => {
    const h = feito(
      salvarAnuncioDaHome(HOME_VAZIA, {
        frete: true,
        avisos: ["  Parcele em até 6x  ", "", "Envio em 24 h"],
      })
    )
    expect(h.rascunho?.conteudo.anuncio).toEqual({
      frete: true,
      avisos: ["Parcele em até 6x", "Envio em 24 h"],
    })
    expect(h.publicado).toEqual(HOME_VAZIA.publicado)
    const pendentes = pendentesDaHome(h)
    expect(pendentes).toEqual({ secoes: [], ordem: false, anuncio: true })
    expect(quantasMudancasNaHome(pendentes)).toBe(1)
    expect(anuncioDaHome(h, GRATIS)).toMatchObject({ propria: true, mudou: true })
    const publicada = feito(publicarHome(h, new Date("2026-09-26T15:00:00.000Z"), "Ana"))
    expect(publicada.publicado.conteudo.anuncio?.avisos).toEqual([
      "Parcele em até 6x",
      "Envio em 24 h",
    ])
    expect(anuncioDaHome(publicada, GRATIS)).toMatchObject({ propria: true, mudou: false })
  })

  it("a caixinha desmarcada não vem (o painel não manda a chave): sem o frete", () => {
    const h = feito(salvarAnuncioDaHome(HOME_VAZIA, { avisos: ["Compra 100% segura"] }))
    expect(h.rascunho?.conteudo.anuncio).toEqual({ frete: false, avisos: ["Compra 100% segura"] })
  })

  it("sem aviso escrito não grava (a esteira nunca fica vazia); até 4", () => {
    expect(salvarAnuncioDaHome(HOME_VAZIA, { frete: true, avisos: ["", "  "] })).toEqual({
      ok: false,
      motivo: "faltando",
      faltando: ["avisos"],
    })
    const h = feito(
      salvarAnuncioDaHome(HOME_VAZIA, { frete: true, avisos: ["a", "b", "c", "d", "e"] })
    )
    expect(h.rascunho?.conteudo.anuncio?.avisos).toEqual(["a", "b", "c", "d"])
  })

  it("igual ao de fábrica, volta a ser o de fábrica (não guarda nada)", () => {
    const h = feito(salvarAnuncioDaHome(HOME_VAZIA, { frete: true, avisos: ["Outro"] }))
    const de_volta = feito(salvarAnuncioDaHome(h, SEMENTE_DA_HOME.anuncio))
    expect(de_volta.rascunho).toBeNull()
    expect(pendentesDaHome(de_volta).anuncio).toBe(false)
  })

  it("junto com uma seção e a ordem: três mudanças", () => {
    const a = feito(salvarAnuncioDaHome(HOME_VAZIA, { avisos: ["Só este"] }))
    const b = feito(salvarSecaoDaHome(a, "home.vitrine", { titulo: "Novo" }))
    const c = feito(mudarOrdemNaHome(b, "home.vitrine", "subir"))
    expect(quantasMudancasNaHome(pendentesDaHome(c))).toBe(3)
    expect(lerHome({ fb_home: JSON.parse(JSON.stringify(c)) })).toEqual(c)
  })

  it("o aviso do frete, como a loja escreve (o espaço depois do R$ é o fixo)", () => {
    expect(avisoDoFrete({ modo: "nenhuma" })).toBeNull()
    expect(avisoDoFrete(GRATIS)).toBe("Frete grátis a partir de R$\u00a0139,90*")
    expect(avisoDoFrete({ ...GRATIS, piso: 0 })).toBe("Frete grátis para todo o Brasil*")
    const fixo = { modo: "fixo", piso: 99.9, preco: 9.9, alvo: "todas", tetoDeCusto: null } as const
    expect(avisoDoFrete(fixo)).toBe("Frete R$\u00a09,90 a partir de R$\u00a099,90*")
    expect(avisoDoFrete({ ...fixo, piso: 0 })).toBe(
      "Frete fixo de R$\u00a09,90 para todo o Brasil*"
    )
    expect(anuncioDaHome(HOME_VAZIA, { modo: "nenhuma" }).avisoDoFrete).toBeNull()
  })
})

describe("a foto de fundo, no rascunho", () => {
  const FOTO = "https://ref.supabase.co/storage/v1/object/public/produtos/home-fundo.webp"

  it("salvar com fundo põe no rascunho, e a seção conta como mudada", () => {
    const h = feito(
      salvarSecaoDaHome(HOME_VAZIA, "home.hero", SEMENTE_DA_HOME.hero, { imagem: FOTO, veu: 80 })
    )
    expect(h.rascunho?.fundos["home.hero"]).toEqual({ imagem: FOTO, veu: 80 })
    expect(pendentesDaHome(h)).toEqual({ secoes: ["home.hero"], ordem: false, anuncio: false })
    expect(secoesDaHome(h).find((s) => s.id === "home.hero")).toMatchObject({
      fundo: { imagem: FOTO, veu: 80 },
      aceitaFundo: true,
      mudou: true,
    })
  })

  it("tirar o fundo (null) volta ao publicado; fundo ausente não mexe; seção sem véu não leva", () => {
    const h = feito(
      salvarSecaoDaHome(HOME_VAZIA, "home.hero", SEMENTE_DA_HOME.hero, { imagem: FOTO })
    )
    expect(feito(salvarSecaoDaHome(h, "home.hero", SEMENTE_DA_HOME.hero)).rascunho?.fundos).toEqual(
      { "home.hero": { imagem: FOTO } }
    )
    expect(feito(salvarSecaoDaHome(h, "home.hero", SEMENTE_DA_HOME.hero, null)).rascunho).toBeNull()
    const banner = feito(
      salvarSecaoDaHome(
        HOME_VAZIA,
        "home.banner",
        { slides: [{ titulo: "Arte", imagem: FOTO }], tempo: 7 },
        { imagem: FOTO }
      )
    )
    expect(banner.rascunho?.fundos).toEqual({})
    expect(secoesDaHome(HOME_VAZIA).find((s) => s.id === "home.banner")?.aceitaFundo).toBe(false)
  })
})

describe("a prova social: os casos dos produtos", () => {
  const FOTO = "http://localhost:9000/static/1-caso.webp"
  const caso = (nome: string, extra: Record<string, unknown> = {}) => ({
    nome,
    tempo: "90 dias",
    antes: FOTO,
    depois: `${FOTO}?depois`,
    autorizou: true,
    ...extra,
  })
  const comCasos = (casos: unknown[]) => ({
    fb_pdp: { conteudo: { antesDepois: { casos } } },
  })

  it("só os produtos com caso autorizado, com o nome, o tempo e a foto do depois", () => {
    const provas = provasDaHome([
      { id: "prod_1", nome: "Óleo", metadata: comCasos([caso("André"), caso("Bruno")]) },
      { id: "prod_2", nome: "Balm", metadata: comCasos([caso("Caio", { autorizou: false })]) },
      { id: "prod_3", nome: "Pomada", metadata: null },
    ])
    expect(provas).toEqual([
      {
        id: "prod_1",
        nome: "Óleo",
        casos: [
          { nome: "André", tempo: "90 dias", foto: `${FOTO}?depois` },
          { nome: "Bruno", tempo: "90 dias", foto: `${FOTO}?depois` },
        ],
      },
    ])
  })
})
