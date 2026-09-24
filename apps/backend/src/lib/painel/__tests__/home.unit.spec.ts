import { HOME_VAZIA, lerHome, SEMENTE_DA_HOME, type HomeGuardada } from "../../home"
import {
  desfazerRascunho,
  mudarNaOrdemDaHome,
  mudarOrdemNaHome,
  ordemDaHome,
  pendentesDaHome,
  publicarHome,
  salvarSecaoDaHome,
  secoesDaHome,
  ultimaPublicacao,
} from "../home"

/**
 * A home no painel: a ordem (com o bloco escuro fixo no meio), o rascunho e
 * o que espera o "Publicar".
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
    expect(pendentesDaHome(h)).toEqual({ secoes: ["home.amam"], ordem: false })
    expect(secoesDaHome(h).find((s) => s.id === "home.amam")).toMatchObject({
      ligada: false,
      mudou: true,
    })
  })

  it("desligou e ligou de novo: não há nada esperando", () => {
    const h = feito(mudarOrdemNaHome(HOME_VAZIA, "home.amam", "desligar"))
    const de_volta = feito(mudarOrdemNaHome(h, "home.amam", "ligar"))
    expect(de_volta.rascunho).toBeNull()
    expect(pendentesDaHome(de_volta)).toEqual({ secoes: [], ordem: false })
  })

  it("a ordem conta como uma mudança só", () => {
    const h = feito(mudarOrdemNaHome(HOME_VAZIA, "home.vitrine", "subir"))
    expect(pendentesDaHome(h)).toEqual({ secoes: [], ordem: true })
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

describe("a foto de fundo, no rascunho", () => {
  const FOTO = "https://ref.supabase.co/storage/v1/object/public/produtos/home-fundo.webp"

  it("salvar com fundo põe no rascunho, e a seção conta como mudada", () => {
    const h = feito(
      salvarSecaoDaHome(HOME_VAZIA, "home.hero", SEMENTE_DA_HOME.hero, { imagem: FOTO, veu: 80 })
    )
    expect(h.rascunho?.fundos["home.hero"]).toEqual({ imagem: FOTO, veu: 80 })
    expect(pendentesDaHome(h)).toEqual({ secoes: ["home.hero"], ordem: false })
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
      salvarSecaoDaHome(HOME_VAZIA, "home.banner", SEMENTE_DA_HOME.banner, { imagem: FOTO })
    )
    expect(banner.rascunho).toBeNull()
    expect(secoesDaHome(HOME_VAZIA).find((s) => s.id === "home.banner")?.aceitaFundo).toBe(false)
  })
})
