import { createPublicKey, generateKeyPairSync, verify } from "node:crypto"
import { assinarJwt, configuracaoDoGa4, ErroDoGa4, lerCredenciais, respostasDoDia } from "../ga4"

/**
 * A conversa com o Google: a chave da conta de serviço, o JWT que ela
 * assina e o que fica guardado. Sem rede — a chave é gerada aqui, na hora
 * (nenhuma chave de verdade, nem de teste, mora no repositório), e o
 * `fetch` é trocado por um Google de mentira.
 */

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString()
const CHAVE = {
  type: "service_account",
  client_email: "painel@loja-teste.iam.gserviceaccount.com",
  private_key: PEM,
  token_uri: "https://oauth2.googleapis.com/token",
}
const JSON_DA_CHAVE = JSON.stringify(CHAVE, null, 2)

describe("a chave da conta de serviço", () => {
  it("lê o JSON como o Google baixa, ou o mesmo em base64", () => {
    const lida = lerCredenciais(JSON_DA_CHAVE)
    expect(lida?.email).toBe(CHAVE.client_email)
    expect(lida?.chave).toBe(PEM)
    expect(lerCredenciais(Buffer.from(JSON_DA_CHAVE).toString("base64"))?.email).toBe(
      CHAVE.client_email
    )
  })

  it("a quebra de linha que virou “\\n” escrito na colagem volta a ser quebra", () => {
    const colada = JSON_DA_CHAVE.replace(/\\n/g, "\\\\n")
    expect(lerCredenciais(colada)?.chave).toBe(PEM)
  })

  it("o que não é chave não passa", () => {
    expect(lerCredenciais("")).toBeNull()
    expect(lerCredenciais("{ não é json")).toBeNull()
    expect(lerCredenciais(JSON.stringify({ client_email: "x@y.z" }))).toBeNull()
    expect(lerCredenciais("bGl4bw==")).toBeNull()
  })

  it("sem as duas variáveis, desligado; com uma só ou torta, inválida", () => {
    expect(configuracaoDoGa4({})).toBe("desligado")
    expect(configuracaoDoGa4({ GA4_PROPERTY_ID: "123456789" })).toBe("invalida")
    expect(configuracaoDoGa4({ GA4_CREDENCIAIS: JSON_DA_CHAVE })).toBe("invalida")
    expect(
      configuracaoDoGa4({ GA4_PROPERTY_ID: "G-CS3QPK0QHL", GA4_CREDENCIAIS: JSON_DA_CHAVE })
    ).toBe("invalida")
    const ok = configuracaoDoGa4({
      GA4_PROPERTY_ID: "properties/123456789",
      GA4_CREDENCIAIS: JSON_DA_CHAVE,
    })
    expect(ok).toMatchObject({ propriedade: "123456789" })
  })
})

describe("o JWT", () => {
  it("assinado com a chave (RS256), pedindo só leitura, por uma hora", () => {
    const c = lerCredenciais(JSON_DA_CHAVE)!
    const jwt = assinarJwt(c, Date.parse("2026-09-24T15:00:00Z"))
    const [cabeca, corpo, assinatura] = jwt.split(".")
    expect(JSON.parse(Buffer.from(cabeca, "base64url").toString())).toEqual({
      alg: "RS256",
      typ: "JWT",
    })
    const claims = JSON.parse(Buffer.from(corpo, "base64url").toString())
    expect(claims).toMatchObject({
      iss: CHAVE.client_email,
      scope: "https://www.googleapis.com/auth/analytics.readonly",
      aud: "https://oauth2.googleapis.com/token",
    })
    expect(claims.exp - claims.iat).toBe(3600)
    expect(
      verify(
        "RSA-SHA256",
        Buffer.from(`${cabeca}.${corpo}`),
        createPublicKey(privateKey),
        Buffer.from(assinatura, "base64url")
      )
    ).toBe(true)
  })
})

describe("as perguntas ao Google, e o que fica guardado", () => {
  const original = global.fetch
  const chamadas: string[] = []
  let recusarDados = 0

  beforeAll(() => {
    process.env.GA4_API_URL = "https://ga4.falso/v1beta"
    global.fetch = (async (url: string | URL) => {
      const u = String(url)
      chamadas.push(u.replace(/^https:\/\/[^/]+/, ""))
      const json = (status: number, corpo: unknown) =>
        new Response(JSON.stringify(corpo), { status })
      if (u.endsWith("/token")) return json(200, { access_token: "tk", expires_in: 3599 })
      if (recusarDados-- > 0) return json(401, { error: { message: "token vencido" } })
      if (u.endsWith(":batchRunReports")) return json(200, { reports: [{ rows: [] }, {}, {}] })
      if (u.endsWith(":runRealtimeReport")) return json(200, { rows: [] })
      return json(404, {})
    }) as typeof fetch
  })
  afterAll(() => {
    global.fetch = original
    delete process.env.GA4_API_URL
    delete process.env.GA4_CACHE_SEGUNDOS
  })

  const cfg = () => {
    const c = configuracaoDoGa4({ GA4_PROPERTY_ID: "123456789", GA4_CREDENCIAIS: JSON_DA_CHAVE })
    if (typeof c === "string") throw new Error(c)
    return c
  }

  it("um token pra várias perguntas, e as respostas guardadas por uns minutos", async () => {
    process.env.GA4_CACHE_SEGUNDOS = "120"
    const a = await respostasDoDia(cfg())
    const b = await respostasDoDia(cfg())
    expect(b).toBe(a)
    expect(chamadas.filter((c) => c.endsWith("/token"))).toHaveLength(1)
    expect(
      chamadas.filter((c) => c.includes("/properties/123456789:batchRunReports"))
    ).toHaveLength(1)
  })

  it("quem chega junto espera a mesma pergunta", async () => {
    process.env.GA4_CACHE_SEGUNDOS = "0"
    chamadas.length = 0
    const [a, b] = await Promise.all([respostasDoDia(cfg()), respostasDoDia(cfg())])
    expect(b).toBe(a)
    expect(chamadas.filter((c) => c.endsWith(":batchRunReports"))).toHaveLength(1)
  })

  it("o token recusado no meio do caminho: pede outro e pergunta de novo, uma vez só", async () => {
    chamadas.length = 0
    recusarDados = 2
    await respostasDoDia(cfg())
    expect(chamadas.filter((c) => c.endsWith("/token"))).toHaveLength(1)
    expect(chamadas.filter((c) => c.endsWith(":batchRunReports"))).toHaveLength(2)

    chamadas.length = 0
    recusarDados = 4
    await expect(respostasDoDia(cfg())).rejects.toMatchObject({ tipo: "recusado", status: 401 })
    expect(chamadas.filter((c) => c.endsWith("/token"))).toHaveLength(1)
    expect(new ErroDoGa4("fora", "x")).toBeInstanceOf(Error)
  })
})
