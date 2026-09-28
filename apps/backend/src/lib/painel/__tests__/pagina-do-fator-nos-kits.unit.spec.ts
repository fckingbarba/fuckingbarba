import TEXTOS from "../../../scripts/dados/secoes-da-pdp.json"
import { lerPdp, PDP_VAZIA, type Pdp, type VideoDaGaleria } from "../../pdp"
import { FATOR, KITS_DO_FATOR, paginaDoFatorNoKit } from "../pagina-do-fator-nos-kits"
import { comOsTextos, type FotoDoProduto } from "../secoes-da-pdp"

const COM_SHAMPOO = "kit-fator-de-crescimento-para-barba-e-shampoo"
const SO_FATOR = KITS_DO_FATOR.filter((k) => k !== COM_SHAMPOO)

const foto: FotoDoProduto = (handle, n) => `https://fotos.exemplo/${handle}/${n}.webp`
/** O que a loja lê depois de gravado: a mesma peneira do `mudarPdp`. */
const gravado = (pdp: unknown) => lerPdp({ fb_pdp: pdp })
/** A página de um produto como a migração da 0105 deixou: as sete seções do arquivo. */
const doArquivo = (handle: string) => comOsTextos(PDP_VAZIA, handle, foto)!.pdp

const video = (n: number, titulo?: string): VideoDaGaleria => ({
  url: `https://arquivos.exemplo/${FATOR}-video-${n}.mp4`,
  poster: `https://arquivos.exemplo/${FATOR}-poster-${n}.webp`,
  largura: 480,
  altura: 854,
  duracao: 20 + n,
  ...(titulo ? { titulo } : {}),
  posicao: n,
})

/** O Fator como o dono deixou no painel: vídeos, antes e depois, Perguntas e Benefícios editados. */
function fatorEditado(): Pdp {
  const base = doArquivo(FATOR)
  return gravado({
    ...base,
    conteudo: {
      ...base.conteudo,
      promessa: {
        ...base.conteudo.promessa!,
        itens: ["Age na pele, onde o fio nasce e desenvolve"],
      },
      antesDepois: {
        casos: [
          {
            nome: "Cliente A",
            tempo: "150 dias",
            antes: "https://arquivos.exemplo/caso-1-antes.webp",
            depois: "https://arquivos.exemplo/caso-1-depois.webp",
            texto: "Encorpou.",
            autorizou: true,
          },
        ],
      },
      duvidas: {
        titulo: "Perguntas que todo mundo faz",
        perguntas: [
          { pergunta: "Tem minoxidil na fórmula?", resposta: ["Não."] },
          ...base.conteudo.duvidas!.perguntas.filter((p) =>
            ["Em quanto tempo vejo resultado?", "Dá pra usar com pele sensível?"].includes(
              p.pergunta
            )
          ),
        ],
      },
    },
    layout: { ordem: ["produto.promessa", "produto.antesDepois", "produto.tempo"] },
    fundos: { "produto.quem": { imagem: "https://arquivos.exemplo/fundo.webp", veu: 70 } },
    combinada: { modo: "unidades", notaDoAvulso: "1 mês de uso" },
    videos: [video(0, "Como aplicar"), video(1), video(2), video(3)],
    seo: { descricao: "A descrição do Fator no Google, que não vai pros kits." },
  })
}

/** Um kit como está no ar: as seções do arquivo, o "Leve junto" e a descrição dele. */
function kitDoAr(handle: string): Pdp {
  return gravado({
    ...doArquivo(handle),
    combinada: { modo: "junto", produtos: ["shampoo-para-barba", "oleo-para-barba"] },
  })
}

describe("a página do Fator nos kits dele", () => {
  it("os kits são os que trazem o Fator — os mesmos que copiam o Fator no arquivo das seções", () => {
    const doArquivoDasSecoes = Object.entries(TEXTOS as Record<string, { copiaDe?: string }>)
      .filter(([, t]) => t.copiaDe === FATOR)
      .map(([handle]) => handle)
    expect([...KITS_DO_FATOR].sort()).toEqual(doArquivoDasSecoes.sort())
    expect(KITS_DO_FATOR).not.toContain("kit-completo-para-barba")
  })

  it.each(SO_FATOR)(
    "%s: vira a página do Fator — seções, antes e depois, ordem, fundos e vídeos",
    (handle) => {
      const fator = fatorEditado()
      const r = paginaDoFatorNoKit(fator, kitDoAr(handle), handle)!
      expect(r.pdp.conteudo).toEqual(fator.conteudo)
      expect(r.pdp.layout).toEqual(fator.layout)
      expect(r.pdp.fundos).toEqual(fator.fundos)
      expect(r.pdp.videos).toEqual(fator.videos)
    }
  )

  it.each(KITS_DO_FATOR)(
    "%s: a caixa de compra e a descrição do Google ficam as do kit",
    (handle) => {
      const kit = kitDoAr(handle)
      const r = paginaDoFatorNoKit(fatorEditado(), kit, handle)!
      expect(r.pdp.combinada).toEqual({
        modo: "junto",
        produtos: ["shampoo-para-barba", "oleo-para-barba"],
      })
      expect(r.pdp.seo).toEqual(kit.seo)
      expect(r.pdp.seo!.descricao).not.toContain("Fator no Google")
    }
  )

  it("os vídeos são os mesmos arquivos, na ordem do Fator e com o nome de cada um", () => {
    const r = paginaDoFatorNoKit(fatorEditado(), kitDoAr(SO_FATOR[0]), SO_FATOR[0])!
    expect(r.pdp.videos.map((v) => [v.url, v.poster, v.posicao, v.titulo])).toEqual([
      [video(0).url, video(0).poster, 0, "Como aplicar"],
      [video(1).url, video(1).poster, 1, undefined],
      [video(2).url, video(2).poster, 2, undefined],
      [video(3).url, video(3).poster, 3, undefined],
    ])
  })

  it("o kit sem descrição do Google continua sem (a loja usa a do Bling), e não pega a do Fator", () => {
    const { seo: _seo, ...semSeo } = kitDoAr(SO_FATOR[0])
    const r = paginaDoFatorNoKit(fatorEditado(), semSeo, SO_FATOR[0])!
    expect(r.pdp.seo).toBeUndefined()
  })

  it("seção que o kit tinha e o Fator não tem sai do kit: a página é a do Fator", () => {
    const kit = gravado({
      ...kitDoAr(SO_FATOR[1]),
      conteudo: {
        ...kitDoAr(SO_FATOR[1]).conteudo,
        faixa: {
          chapeu: "Quer ir além?",
          titulo: "O óleo",
          texto: "Fecha o ciclo.",
          chamada: "Ver o óleo",
          fotoDe: "oleo-para-barba",
        },
      },
    })
    const r = paginaDoFatorNoKit(fatorEditado(), kit, SO_FATOR[1])!
    expect(r.pdp.conteudo.faixa).toBeUndefined()
    expect(r.mudou).toContain("faixa")
  })

  describe("o Kit Fator + Shampoo", () => {
    it("guarda a rotina e o modo de uso dele, que falam do shampoo; o resto é do Fator", () => {
      const fator = fatorEditado()
      const kit = kitDoAr(COM_SHAMPOO)
      const { conteudo } = paginaDoFatorNoKit(fator, kit, COM_SHAMPOO)!.pdp
      expect(conteudo.rotina).toEqual(kit.conteudo.rotina)
      expect(conteudo.funciona).toEqual(kit.conteudo.funciona)
      expect(conteudo.funciona!.usoPassos.join(" ")).toMatch(/Shampoo/)
      for (const s of ["promessa", "antesDepois", "tempo", "versus", "quem"] as const)
        expect(conteudo[s]).toEqual(fator.conteudo[s])
    })

    it("nas Perguntas: as do Fator, na ordem dele, e no fim as do kit sobre o shampoo", () => {
      const { duvidas } = paginaDoFatorNoKit(fatorEditado(), kitDoAr(COM_SHAMPOO), COM_SHAMPOO)!.pdp
        .conteudo
      expect(duvidas!.perguntas.map((p) => p.pergunta)).toEqual([
        "Tem minoxidil na fórmula?",
        "Em quanto tempo vejo resultado?",
        "Dá pra usar com pele sensível?",
        "Pra que serve o shampoo no tratamento?",
        "Posso lavar a barba com o shampoo todo dia?",
      ])
    })

    it("a pergunta que os dois respondem fica com a resposta do kit (a pele sensível fala dos dois)", () => {
      const { duvidas } = paginaDoFatorNoKit(fatorEditado(), kitDoAr(COM_SHAMPOO), COM_SHAMPOO)!.pdp
        .conteudo
      const pele = duvidas!.perguntas.find((p) => p.pergunta === "Dá pra usar com pele sensível?")!
      expect(pele.resposta[0]).toMatch(/^São cosméticos/)
    })

    it("a pergunta do kit que o Fator tirou não volta (a do minoxidil, que o dono trocou no Fator)", () => {
      const kit = kitDoAr(COM_SHAMPOO)
      expect(kit.conteudo.duvidas!.perguntas.map((p) => p.pergunta)).toContain(
        "Posso usar junto com minoxidil?"
      )
      const { duvidas } = paginaDoFatorNoKit(fatorEditado(), kit, COM_SHAMPOO)!.pdp.conteudo
      expect(duvidas!.perguntas.map((p) => p.pergunta)).not.toContain(
        "Posso usar junto com minoxidil?"
      )
    })

    it("o vídeo do modo de uso do Fator entra no do kit que não tem o dele; o do kit fica", () => {
      const fator = gravado({
        ...fatorEditado(),
        conteudo: {
          ...fatorEditado().conteudo,
          funciona: { ...fatorEditado().conteudo.funciona!, usoVideo: video(7) },
        },
      })
      const semVideo = paginaDoFatorNoKit(fator, kitDoAr(COM_SHAMPOO), COM_SHAMPOO)!.pdp
      expect(semVideo.conteudo.funciona!.usoVideo!.url).toBe(video(7).url)
      expect(semVideo.conteudo.funciona!.usoPassos).toEqual(
        kitDoAr(COM_SHAMPOO).conteudo.funciona!.usoPassos
      )

      const doKit = { ...video(8), url: "https://arquivos.exemplo/kit-video.mp4" }
      const kitComVideo = gravado({
        ...kitDoAr(COM_SHAMPOO),
        conteudo: {
          ...kitDoAr(COM_SHAMPOO).conteudo,
          funciona: { ...kitDoAr(COM_SHAMPOO).conteudo.funciona!, usoVideo: doKit },
        },
      })
      const comVideo = paginaDoFatorNoKit(fator, kitComVideo, COM_SHAMPOO)!.pdp
      expect(comVideo.conteudo.funciona!.usoVideo!.url).toBe(doKit.url)
    })

    it("nos kits só de Fator, o modo de uso é o do Fator inteiro, com o vídeo dele", () => {
      const fator = gravado({
        ...fatorEditado(),
        conteudo: {
          ...fatorEditado().conteudo,
          funciona: { ...fatorEditado().conteudo.funciona!, usoVideo: video(7) },
        },
      })
      const r = paginaDoFatorNoKit(fator, kitDoAr(SO_FATOR[2]), SO_FATOR[2])!
      expect(r.pdp.conteudo.funciona).toEqual(fator.conteudo.funciona)
    })
  })

  it("página do Fator sem seção nenhuma: não mexe no kit (copiar esvaziaria a página)", () => {
    const vazia = gravado({ ...fatorEditado(), conteudo: {} })
    for (const handle of KITS_DO_FATOR)
      expect(paginaDoFatorNoKit(vazia, kitDoAr(handle), handle)).toBeNull()
  })

  it.each(KITS_DO_FATOR)("%s: rodar de novo não troca nada", (handle) => {
    const fator = fatorEditado()
    const primeira = paginaDoFatorNoKit(fator, kitDoAr(handle), handle)!
    expect(primeira.mudou.length).toBeGreaterThan(0)
    const segunda = paginaDoFatorNoKit(fator, gravado(primeira.pdp), handle)!
    expect(segunda.mudou).toEqual([])
    expect(segunda.pdp).toEqual(primeira.pdp)
  })

  it.each(KITS_DO_FATOR)("%s: o que sai passa na peneira da loja sem perder nada", (handle) => {
    const r = paginaDoFatorNoKit(fatorEditado(), kitDoAr(handle), handle)!
    expect(gravado(r.pdp)).toEqual(r.pdp)
  })

  it("diz o que mudou: as seções editadas, o antes e depois, a ordem, os fundos e os vídeos", () => {
    const r = paginaDoFatorNoKit(fatorEditado(), kitDoAr(SO_FATOR[0]), SO_FATOR[0])!
    expect(r.mudou).toEqual(["promessa", "duvidas", "antesDepois", "layout", "fundos", "videos"])
  })
})
