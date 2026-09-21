import { createServer } from "node:http"

/**
 * UM RESEND DE MENTIRA, pros testes.
 *
 * Recebe `POST /emails` no formato da API deles e GUARDA o e-mail em vez de
 * mandar. O conferidor da conta lê o código daqui — é a única forma de um
 * teste entrar na conta sem uma caixa de e-mail de verdade.
 *
 * O backend precisa subir apontando pra cá:
 *   RESEND_URL=http://127.0.0.1:4330 RESEND_API_KEY=re_teste_falsa npm run backend:dev
 *
 * `roteiro.cair = true` faz ele responder 500 — o caminho do "não conseguimos
 * mandar o código agora", que com o Resend de verdade não dá pra encenar.
 *
 * Rodando sozinho (`node ferramentas/resend-falso.mjs`), ele imprime cada
 * e-mail que chega: serve pra entrar na conta à mão no desenvolvimento.
 */

export const PORTA_PADRAO = Number(process.env.PORTA_RESEND || 4330)

export async function subirResendFalso({ porta = PORTA_PADRAO, aoReceber } = {}) {
  const emails = []
  const roteiro = { cair: false }

  const servidor = createServer((req, res) => {
    let corpo = ""
    req.on("data", (c) => (corpo += c))
    req.on("end", () => {
      if (req.method !== "POST" || req.url !== "/emails") {
        res.writeHead(404, { "content-type": "application/json" })
        res.end(JSON.stringify({ message: "rota que o Resend falso não conhece" }))
        return
      }
      if (!String(req.headers.authorization ?? "").startsWith("Bearer re_")) {
        res.writeHead(401, { "content-type": "application/json" })
        res.end(JSON.stringify({ message: "API key is invalid" }))
        return
      }
      if (roteiro.cair) {
        res.writeHead(500, { "content-type": "application/json" })
        res.end(JSON.stringify({ message: "caiu de propósito" }))
        return
      }
      let email
      try {
        email = JSON.parse(corpo)
      } catch {
        res.writeHead(422, { "content-type": "application/json" })
        res.end(JSON.stringify({ message: "corpo não é JSON" }))
        return
      }
      const id = `falso_${emails.length + 1}`
      emails.push({ id, recebido: Date.now(), ...email })
      aoReceber?.(email)
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify({ id }))
    })
  })

  await new Promise((ok, falha) => {
    servidor.once("error", falha)
    servidor.listen(porta, "127.0.0.1", ok)
  })

  return {
    porta,
    emails,
    roteiro,
    /** O último e-mail mandado pra este endereço, ou undefined. */
    ultimoPara: (para) => [...emails].reverse().find((e) => e.to?.includes(para)),
    /** Os seis dígitos do assunto do último e-mail pra este endereço. */
    codigoPara: (para) =>
      [...emails]
        .reverse()
        .find((e) => e.to?.includes(para))
        ?.subject?.match(/\b\d{6}\b/)?.[0],
    fechar: () => new Promise((ok) => servidor.close(ok)),
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const falso = await subirResendFalso({
    aoReceber: (e) => console.log(`→ ${e.to?.join(", ")}: ${e.subject}`),
  })
  console.log(`Resend falso ouvindo em http://127.0.0.1:${falso.porta} — Ctrl+C pra parar`)
}
