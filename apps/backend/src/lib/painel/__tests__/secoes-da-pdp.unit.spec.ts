import { lerPdp, LIMITE_DA_DESCRICAO, PDP_VAZIA, type Pdp } from "../../pdp"
import {
  comOsTextos,
  HANDLES_COM_TEXTO,
  SECOES_ESCRITAS,
  textosDoProduto,
  type FotoDoProduto,
} from "../secoes-da-pdp"

/** Os 15 produtos no ar em 26/09. */
const NO_AR = [
  "balm-para-barba",
  "oleo-para-barba",
  "shampoo-para-barba",
  "kit-completo-para-barba",
  "spray-modelador-matte-100ml-fucking-barba",
  "fator-de-crescimento-para-barba",
  "kit-2-fator-de-crescimento-para-barba",
  "kit-3-fator-de-crescimento-para-barba",
  "kit-6-fator-de-crescimento-para-barba",
  "kit-essencial-fuckingbarba-shampoo-balm",
  "kit-fator-de-crescimento-para-barba-e-shampoo",
  "kit-hidratacao-fuckingbarba-shampoo-oleo",
  "kit-shampoo-para-barba-duplo-fuckingbarba",
  "pasta-modeladora-brilho-80g-fucking-barba",
  "pasta-modeladora-matte-80g-fucking-barba",
]

/** Toda foto existe, com um endereço que diz de quem e qual é. */
const todas: FotoDoProduto = (handle, n) => `https://fotos.exemplo/${handle}/${n}.webp`
const nenhuma: FotoDoProduto = () => null

/** O que a loja lê depois de gravado: a mesma peneira do `mudarPdp`. */
const gravado = (pdp: Pdp) => lerPdp({ fb_pdp: pdp })

describe("os textos do arquivo", () => {
  it("cobrem os 15 produtos do ar, e só eles", () => {
    expect([...HANDLES_COM_TEXTO].sort()).toEqual([...NO_AR].sort())
  })

  it.each(NO_AR)("%s: as sete seções passam na peneira da loja, e a descrição cabe", (handle) => {
    const feito = comOsTextos(PDP_VAZIA, handle, todas)!
    const lido = gravado(feito.pdp)
    for (const chave of SECOES_ESCRITAS) expect(lido.conteudo[chave]).toBeDefined()
    expect(feito.trocadas).toEqual([...SECOES_ESCRITAS])
    expect(lido.seo?.descricao.length).toBeGreaterThan(60)
    expect(lido.seo!.descricao.length).toBeLessThanOrEqual(LIMITE_DA_DESCRICAO)
  })

  it.each(NO_AR)("%s: a rotina não repete o produto e diz o passo dele", (handle) => {
    const { rotina } = gravado(comOsTextos(PDP_VAZIA, handle, todas)!.pdp).conteudo
    expect(rotina!.passoDeste).toBeTruthy()
    expect(rotina!.paraDeste).toBeTruthy()
    for (const item of rotina!.itens) {
      expect(item.handle).not.toBe(handle)
      expect(NO_AR).toContain(item.handle)
    }
  })

  it("o asterisco só aparece onde a loja faz o destaque (senão ele sai na tela)", () => {
    for (const handle of NO_AR) {
      const c = gravado(comOsTextos(PDP_VAZIA, handle, todas)!.pdp).conteudo
      const semRealce = {
        promessa: { ...c.promessa, titulo: "" },
        tempo: c.tempo,
        rotina: c.rotina,
        versus: c.versus,
        quem: c.quem,
        duvidas: c.duvidas,
      }
      expect(JSON.stringify(semRealce)).not.toContain("*")
    }
  })

  it("os kits do Fator são o Fator: as sete seções iguais (muda só a descrição do Google)", () => {
    const { seo: seoDoFator, ...fator } = textosDoProduto("fator-de-crescimento-para-barba")!
    for (const kit of ["kit-2", "kit-3", "kit-6"]) {
      const { seo, ...t } = textosDoProduto(`${kit}-fator-de-crescimento-para-barba`)!
      expect(t).toEqual(fator)
      expect(seo).not.toEqual(seoDoFator)
    }
  })

  it("sem a ressalva dos Benefícios e sem o aviso da Linha do tempo (26/09)", () => {
    for (const handle of NO_AR) {
      const { promessa, tempo } = gravado(comOsTextos(PDP_VAZIA, handle, todas)!.pdp).conteudo
      expect(promessa).not.toHaveProperty("rodape")
      expect(tempo).not.toHaveProperty("aviso")
    }
  })
})

describe("as fotos de “como funciona” e do modo de uso", () => {
  it("viram o endereço da foto pedida, do produto pedido", () => {
    const { funciona } = comOsTextos(PDP_VAZIA, "fator-de-crescimento-para-barba", todas)!.pdp
      .conteudo
    expect(funciona!.usoFoto).toBe("https://fotos.exemplo/fator-de-crescimento-para-barba/7.webp")
    const kit = comOsTextos(PDP_VAZIA, "kit-fator-de-crescimento-para-barba-e-shampoo", todas)!.pdp
      .conteudo.funciona!
    expect(kit.comoFoto).toBe("https://fotos.exemplo/shampoo-para-barba/2.webp")
    expect(kit.comoFotoDe).toBe("shampoo-para-barba")
  })

  it("sem a foto no banco, a seção entra sem ela (a loja volta pra 2ª foto do produto)", () => {
    const { funciona } = comOsTextos(PDP_VAZIA, "oleo-para-barba", nenhuma)!.pdp.conteudo
    expect(funciona).toBeDefined()
    expect(funciona!.comoFoto).toBeUndefined()
    expect(funciona!.usoFoto).toBeUndefined()
  })
})

describe("o que já estava na página", () => {
  const CASO = {
    nome: "André B.",
    tempo: "90 dias",
    antes: "https://fotos.exemplo/antes.webp",
    depois: "https://fotos.exemplo/depois.webp",
    autorizou: true as const,
  }
  const TESTE = {
    titulo: "Essa é a linha do tempo",
    passos: [
      {
        quando: "Essa é a linha do tempo",
        titulo: "Essa é a linha do tempo",
        texto: "Essa é a linha do tempo",
      },
    ],
  }
  const atual: Pdp = gravado({
    ...PDP_VAZIA,
    conteudo: { tempo: TESTE, antesDepois: { casos: [CASO] } },
    layout: {
      visibilidade: { "produto.duvidas": false, "produto.faixa": false },
      ordem: ["produto.dobra", "produto.duvidas"],
    },
    fundos: { "produto.quem": { imagem: "https://fotos.exemplo/fundo.webp", veu: 70 } },
    combinada: { modo: "junto", produtos: ["oleo-para-barba"] },
  })

  it("troca as sete seções e guarda o que havia nelas pro registro", () => {
    const feito = comOsTextos(atual, "fator-de-crescimento-para-barba", todas)!
    expect(feito.pdp.conteudo.tempo!.titulo).toBe("Quando o resultado aparece")
    expect(feito.antes).toEqual({ tempo: TESTE })
  })

  it("liga as sete que estavam desligadas, e só elas", () => {
    const feito = comOsTextos(atual, "fator-de-crescimento-para-barba", todas)!
    expect(feito.ligadas).toEqual(["duvidas"])
    expect(feito.pdp.layout).toEqual({
      visibilidade: { "produto.faixa": false },
      ordem: ["produto.dobra", "produto.duvidas"],
    })
  })

  it("não mexe no resto: antes e depois, fundos, caixa de compra e vídeos", () => {
    const lido = gravado(comOsTextos(atual, "fator-de-crescimento-para-barba", todas)!.pdp)
    expect(lido.conteudo.antesDepois).toEqual({ casos: [CASO] })
    expect(lido.fundos).toEqual(atual.fundos)
    expect(lido.combinada).toEqual(atual.combinada)
    expect(lido.videos).toEqual([])
  })

  it("rodar de novo não troca nada", () => {
    const uma = gravado(comOsTextos(atual, "balm-para-barba", todas)!.pdp)
    const duas = comOsTextos(uma, "balm-para-barba", todas)!
    expect(duas.trocadas).toEqual([])
    expect(duas.ligadas).toEqual([])
    expect(gravado(duas.pdp)).toEqual(uma)
  })

  it("produto sem texto aqui fica de fora", () => {
    expect(comOsTextos(atual, "produto-que-nao-existe", todas)).toBeNull()
  })
})
