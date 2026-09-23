import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import http from "node:http"
import http2 from "node:http2"
import { tmpdir } from "node:os"
import { join } from "node:path"

/**
 * A LOJA LOCAL EM HTTPS E HTTP/2 — pro Lighthouse do CI medir a entrega que
 * o cliente recebe da Vercel, e não a do `next start`.
 *
 *   node ferramentas/https-local.mjs     (https://localhost:3443 → :3100)
 *
 * ┌─ POR QUE ELE EXISTE ───────────────────────────────────────────────────┐
 * │ O `next start` fala HTTP/1.1: no máximo seis conexões por endereço, e  │
 * │ cada arquivo espera uma delas vagar. A Vercel entrega em HTTP/2, tudo  │
 * │ por uma conexão só. A página pede uns quinze arquivos logo de cara     │
 * │ (HTML, CSS, fonte, os pedaços de JS do Next), e o 4G simulado do       │
 * │ Lighthouse cobra essa fila — que em produção não existe.               │
 * │                                                                        │
 * │ Medido no mesmo build, com o Medusa falso: LCP de 2,93s na home e      │
 * │ 2,85s no /barba em HTTP/1.1; 2,41s e 2,41s em HTTP/2. O PageSpeed do   │
 * │ Google, na produção daquele mesmo código, deu 2,2s e 2,5s. O orçamento │
 * │ de LCP do CI só quer dizer alguma coisa medindo do jeito da produção.  │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * O CERTIFICADO É DE MENTIRA, gerado aqui pelo `openssl` e guardado na pasta
 * temporária — e o Chrome do Lighthouse roda com `--ignore-certificate-errors`
 * (lighthouserc.json). Não tem chave nenhuma no repositório.
 *
 * Pra rodar o Lighthouse na sua máquina como o CI: build com o Medusa falso
 * no ar e NEXT_PUBLIC_SITE_URL=https://localhost:3443, este proxy num
 * terminal e `npx lhci autorun` noutro, os dois em apps/loja.
 */

const DESTINO = Number(process.env.DESTINO || 3100)
const PORTA = Number(process.env.PORTA || 3443)

const chave = join(tmpdir(), "https-local.key")
const certificado = join(tmpdir(), "https-local.crt")
if (!existsSync(chave) || !existsSync(certificado)) {
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "30",
      "-subj",
      "/CN=localhost",
      "-keyout",
      chave,
      "-out",
      certificado,
    ],
    { stdio: "ignore" }
  )
}

// Cabeçalhos de uma conexão só: valem entre o proxy e o `next start`, e o
// HTTP/2 recusa a resposta inteira se algum deles vier junto.
const DA_CONEXAO = new Set([
  "connection",
  "keep-alive",
  "proxy-connection",
  "transfer-encoding",
  "upgrade",
  "http2-settings",
])

const servidor = http2.createSecureServer(
  { key: readFileSync(chave), cert: readFileSync(certificado), allowHTTP1: true },
  (req, res) => {
    const cabecalhos = {}
    for (const [nome, valor] of Object.entries(req.headers)) {
      if (!nome.startsWith(":") && !DA_CONEXAO.has(nome)) cabecalhos[nome] = valor
    }
    // O endereço que o navegador pediu, pra redirecionamento e URL absoluta
    // saírem com https://localhost:3443 e não com a porta de dentro.
    cabecalhos.host = req.headers[":authority"] ?? req.headers.host ?? `localhost:${PORTA}`
    cabecalhos["x-forwarded-proto"] = "https"

    const ida = http.request(
      { host: "127.0.0.1", port: DESTINO, path: req.url, method: req.method, headers: cabecalhos },
      (volta) => {
        const deVolta = {}
        for (const [nome, valor] of Object.entries(volta.headers)) {
          if (!DA_CONEXAO.has(nome)) deVolta[nome] = valor
        }
        res.writeHead(volta.statusCode ?? 502, deVolta)
        volta.pipe(res)
      }
    )
    // `next start` ainda subindo: 502, e o Lighthouse só começa depois que
    // ele avisa que está pronto (startServerReadyPattern).
    ida.on("error", () => {
      if (!res.headersSent) res.writeHead(502)
      res.end()
    })
    req.pipe(ida)
  }
)

servidor.listen(PORTA, () => {
  console.log(`[https local] https://localhost:${PORTA} → http://localhost:${DESTINO} (HTTP/2)`)
})
