import {
  lerInscricao,
  LIMITES,
  limparCidade,
  limparNome,
  limparPerfil,
  limparVideo,
  limparWhatsapp,
} from "../regras"

const CERTA = {
  nome: "Rafael Souza",
  whatsapp: "(47) 99999-0000",
  email: "Rafael@Email.com ",
  cidade: "Joinville, SC",
  instagram: "@Rafael.Barba",
  tiktok: "",
  seguidores: "1-10mil",
  barba: "cheia",
  experiencia: "",
  video: "instagram.com/reel/abc123",
  parceria: "on",
  modelo: "fixo",
  aceite: "on",
}

describe("cada campo da inscrição", () => {
  it("o nome precisa de nome e sobrenome, numa linha", () => {
    expect(limparNome("  Rafael   Souza ")).toBe("Rafael Souza")
    expect(limparNome("Rafael")).toBeNull()
    expect(limparNome("Rafael 123")).toBeNull()
    expect(limparNome("Ana\nLi")).toBe("Ana Li")
    expect(limparNome("a b")).toBeNull()
    expect(limparNome(`Rafael ${"a".repeat(LIMITES.nome.max)}`)).toBeNull()
    expect(limparNome(42)).toBeNull()
  })

  it("o WhatsApp vira dígitos com DDD, sem o 55; celular tem o 9", () => {
    expect(limparWhatsapp("(47) 99999-0000")).toBe("47999990000")
    expect(limparWhatsapp("+55 47 99999 0000")).toBe("47999990000")
    expect(limparWhatsapp("5547999990000")).toBe("47999990000")
    expect(limparWhatsapp("(47) 3333-0000")).toBe("4733330000")
    expect(limparWhatsapp("47 8888-7777")).toBe("4788887777")
    expect(limparWhatsapp("(47) 89999-0000")).toBeNull()
    expect(limparWhatsapp("(07) 99999-0000")).toBeNull()
    expect(limparWhatsapp("99999-0000")).toBeNull()
    expect(limparWhatsapp("(47) 1333-0000")).toBeNull()
    expect(limparWhatsapp(47999990000)).toBeNull()
  })

  it("a cidade vai como a pessoa escreveu, numa linha, com alguma letra", () => {
    expect(limparCidade(" Joinville,  SC ")).toBe("Joinville, SC")
    expect(limparCidade("SP")).toBeNull()
    expect(limparCidade("123")).toBeNull()
    expect(limparCidade("x".repeat(LIMITES.cidade.max + 1))).toBeNull()
  })

  it("o perfil sai sem o @ e sem o link, em minúsculas", () => {
    expect(limparPerfil("@Fulano.Barba", 30)).toEqual({ ok: true, perfil: "fulano.barba" })
    expect(limparPerfil("https://www.instagram.com/fulano/?igsh=abc", 30)).toEqual({
      ok: true,
      perfil: "fulano",
    })
    expect(limparPerfil("instagram.com/fulano_", 30)).toEqual({ ok: true, perfil: "fulano_" })
    expect(limparPerfil("https://www.tiktok.com/@fulano?lang=pt", 24)).toEqual({
      ok: true,
      perfil: "fulano",
    })
    expect(limparPerfil("  ", 30)).toEqual({ ok: true, perfil: null })
    expect(limparPerfil(undefined, 30)).toEqual({ ok: true, perfil: null })
  })

  it("perfil com espaço, acento, comprido ou link curto não vale", () => {
    expect(limparPerfil("fulano barba", 30)).toEqual({ ok: false })
    expect(limparPerfil("joão", 30)).toEqual({ ok: false })
    expect(limparPerfil("a".repeat(25), 24)).toEqual({ ok: false })
    expect(limparPerfil("https://vm.tiktok.com/ZMabc/", 24)).toEqual({ ok: false })
    expect(limparPerfil(42, 30)).toEqual({ ok: false })
  })

  it("o vídeo é link http(s) com domínio; sem o protocolo, ganha o https", () => {
    expect(limparVideo("instagram.com/reel/abc123")).toEqual({
      ok: true,
      video: "https://instagram.com/reel/abc123",
    })
    expect(limparVideo("https://www.tiktok.com/@fulano/video/1")).toEqual({
      ok: true,
      video: "https://www.tiktok.com/@fulano/video/1",
    })
    expect(limparVideo("")).toEqual({ ok: true, video: null })
    expect(limparVideo("javascript:alert(1)")).toEqual({ ok: false })
    expect(limparVideo("ftp://arquivos.com/video.mp4")).toEqual({ ok: false })
    expect(limparVideo("meu video")).toEqual({ ok: false })
    expect(limparVideo("localhost")).toEqual({ ok: false })
    expect(limparVideo("https://usuario:senha@site.com/v")).toEqual({ ok: false })
    expect(limparVideo(`https://site.com/${"a".repeat(LIMITES.video)}`)).toEqual({ ok: false })
  })
})

describe("a inscrição inteira", () => {
  it("a certa sai limpa, com os opcionais vazios como nada", () => {
    expect(lerInscricao(CERTA)).toEqual({
      ok: true,
      inscricao: {
        nome: "Rafael Souza",
        whatsapp: "47999990000",
        email: "rafael@email.com",
        cidade: "Joinville, SC",
        instagram: "rafael.barba",
        tiktok: null,
        seguidores: "1-10mil",
        barba: "cheia",
        experiencia: null,
        video: "https://instagram.com/reel/abc123",
        parceria: true,
        modelo: "fixo",
      },
    })
  })

  it("o primeiro campo errado, na ordem da página, volta com o nome", () => {
    expect(lerInscricao({ ...CERTA, nome: "Rafael", email: "x" })).toEqual({
      ok: false,
      campo: "nome",
    })
    expect(lerInscricao({ ...CERTA, whatsapp: "123" })).toEqual({ ok: false, campo: "whatsapp" })
    expect(lerInscricao({ ...CERTA, email: "rafael@" })).toEqual({ ok: false, campo: "email" })
    expect(lerInscricao({ ...CERTA, cidade: "" })).toEqual({ ok: false, campo: "cidade" })
    expect(lerInscricao({ ...CERTA, seguidores: "1 milhão" })).toEqual({
      ok: false,
      campo: "seguidores",
    })
    expect(lerInscricao({ ...CERTA, barba: "" })).toEqual({ ok: false, campo: "barba" })
    expect(lerInscricao({ ...CERTA, barba: "bigode" })).toEqual({ ok: false, campo: "barba" })
    expect(lerInscricao({ ...CERTA, experiencia: "muita" })).toEqual({
      ok: false,
      campo: "experiencia",
    })
    expect(lerInscricao({ ...CERTA, video: "javascript:alert(1)" })).toEqual({
      ok: false,
      campo: "video",
    })
    expect(lerInscricao({ ...CERTA, modelo: "misto" })).toEqual({ ok: false, campo: "modelo" })
  })

  it("sem Instagram e sem TikTok não entra; com um errado também não", () => {
    expect(lerInscricao({ ...CERTA, instagram: "", tiktok: "" })).toEqual({
      ok: false,
      campo: "redes",
    })
    expect(lerInscricao({ ...CERTA, tiktok: "perfil com espaço" })).toEqual({
      ok: false,
      campo: "redes",
    })
    const soTiktok = lerInscricao({ ...CERTA, instagram: "", tiktok: "@fulano" })
    expect(soTiktok.ok && soTiktok.inscricao).toMatchObject({ instagram: null, tiktok: "fulano" })
  })

  it("sem a autorização marcada nada entra; a parceria é só a caixa marcada", () => {
    expect(lerInscricao({ ...CERTA, aceite: undefined })).toEqual({ ok: false, campo: "aceite" })
    expect(lerInscricao({ ...CERTA, aceite: "off" })).toEqual({ ok: false, campo: "aceite" })
    const semParceria = lerInscricao({ ...CERTA, parceria: undefined })
    expect(semParceria.ok && semParceria.inscricao.parceria).toBe(false)
    const doJson = lerInscricao({ ...CERTA, parceria: true, aceite: true })
    expect(doJson.ok && doJson.inscricao.parceria).toBe(true)
  })

  it("corpo que não é objeto é o primeiro campo errado", () => {
    expect(lerInscricao(null)).toEqual({ ok: false, campo: "nome" })
    expect(lerInscricao("oi")).toEqual({ ok: false, campo: "nome" })
  })
})
