import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { deleteFilesWorkflow } from "@medusajs/medusa/core-flows"
import { Transform, type TransformCallback } from "node:stream"
import { pipeline } from "node:stream/promises"
import {
  gastarEnvio,
  lerEnvio,
  LIMITE_DO_VIDEO_EM_BYTES,
  tipoDoVideo,
  TIPOS_DE_VIDEO,
} from "../../../lib/videos"

/**
 * PUT /painel-envio/:bilhete — o vídeo, direto do navegador do painel pro
 * armazenamento da loja (o porquê está em `lib/videos.ts`). O corpo é o
 * arquivo cru (`bodyParser: false`, em `api/middlewares.ts`), gravado em
 * fluxo: nunca fica inteiro na memória.
 *
 * Quem autoriza é o BILHETE, pedido pelo painel com o papel conferido
 * (`POST /dashboard/produtos/:id/videos/envio`, ou o da home): assinado,
 * vale uma vez, por 15 minutos, pra um destino (um produto, ou a home), um
 * tipo e um tamanho exatos. O tipo sai dos
 * primeiros BYTES — um arquivo que não é MP4 nem WebM para no começo, e o
 * que foi gravado dele é apagado.
 *
 * CORS só pra origem do painel (`DASHBOARD_URL`): a página que manda é
 * dashboard.fuckingbarba.com.br.
 *
 * RESPOSTAS: 200 `{ url }`; 400 `tipo`, `tamanho` ou `nao_e_video` (com
 * `mov` pro vídeo do iPhone); 403 `bilhete_invalido`; 404
 * `nao_encontrado`; 409 `bilhete_usado`; 500 `falhou`.
 */

function cors(req: MedusaRequest, res: MedusaResponse) {
  const painel = (process.env.DASHBOARD_URL ?? "").trim().replace(/\/+$/, "")
  if (painel && req.headers.origin === painel) {
    res.setHeader("Access-Control-Allow-Origin", painel)
    res.setHeader("Access-Control-Allow-Methods", "PUT")
    // Os cabeçalhos que o navegador pediu na pergunta prévia (o padrão do pacote `cors`):
    // quem autoriza aqui é o bilhete no endereço, não um cabeçalho.
    const pedidos = req.headers["access-control-request-headers"]
    res.setHeader(
      "Access-Control-Allow-Headers",
      typeof pedidos === "string" && pedidos ? pedidos : "content-type"
    )
    res.setHeader("Access-Control-Max-Age", "600")
  }
  res.setHeader("Vary", "Origin")
}

export async function OPTIONS(req: MedusaRequest, res: MedusaResponse) {
  cors(req, res)
  res.status(204).end()
}

/** O que passa conta os bytes e confere os primeiros: vídeo de verdade, do tamanho prometido. */
class Porteiro extends Transform {
  bytes = 0
  private inicio = Buffer.alloc(0)
  private conferido = false
  motivo: "nao_e_video" | "mov" | "tamanho" | null = null

  constructor(
    private readonly esperado: string,
    private readonly tamanho: number
  ) {
    super()
  }

  _transform(pedaco: Buffer, _: BufferEncoding, pronto: TransformCallback) {
    this.bytes += pedaco.length
    if (this.bytes > this.tamanho) {
      this.motivo = "tamanho"
      return pronto(new Error("maior que o prometido"))
    }
    if (!this.conferido) {
      this.inicio = Buffer.concat([this.inicio, pedaco])
      if (this.inicio.length >= 12 || this.bytes >= this.tamanho) {
        this.conferido = true
        const tipo = tipoDoVideo(this.inicio)
        if (tipo !== this.esperado) {
          this.motivo = tipo === "mov" ? "mov" : "nao_e_video"
          return pronto(new Error("não é o vídeo prometido"))
        }
      }
    }
    pronto(null, pedaco)
  }

  _flush(pronto: TransformCallback) {
    if (this.bytes !== this.tamanho) {
      this.motivo = "tamanho"
      return pronto(new Error("menor que o prometido"))
    }
    pronto()
  }
}

export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  cors(req, res)
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const envio = lerEnvio(String(req.params.bilhete ?? ""))
  if (!envio) {
    res.status(403).json({ message: "bilhete_invalido" })
    return
  }
  const tipo = String(req.headers["content-type"] ?? "")
    .split(";")[0]!
    .trim()
    .toLowerCase()
  if (tipo !== envio.tipo) {
    res.status(400).json({ message: "tipo" })
    return
  }
  const tamanho = Number(req.headers["content-length"])
  if (tamanho !== envio.tamanho || tamanho > LIMITE_DO_VIDEO_EM_BYTES) {
    res.status(400).json({ message: "tamanho" })
    return
  }
  if (!gastarEnvio(envio.n)) {
    res.status(409).json({ message: "bilhete_usado" })
    return
  }
  // O nome do arquivo diz de onde ele é: o handle do produto, ou "home".
  let nome = "home"
  if (envio.destino !== "home") {
    const [produto] = await req.scope
      .resolve(Modules.PRODUCT)
      .listProducts({ id: envio.destino }, { select: ["id", "handle"], take: 1 })
    if (!produto) {
      res.status(404).json({ message: "nao_encontrado" })
      return
    }
    nome = produto.handle
  }

  const arquivos = req.scope.resolve(Modules.FILE)
  const destino = await arquivos.getUploadStream({
    filename: `${nome}-video.${TIPOS_DE_VIDEO[envio.tipo]}`,
    mimeType: envio.tipo,
    access: "public",
  })
  const porteiro = new Porteiro(envio.tipo, envio.tamanho)
  // Falhando no meio, a promessa do armazenamento também falha: fica tratada aqui.
  destino.promise.catch(() => {})
  const gravado = pipeline(porteiro, destino.writeStream).then(() => destino.promise)
  req.on("error", (e) => porteiro.destroy(e))
  req.pipe(porteiro)
  try {
    await gravado
  } catch (e) {
    req.unpipe(porteiro)
    /* O resto do corpo é lido e jogado fora: sem isso a conexão cai, e o
       navegador fica sem saber por quê. */
    if (!req.readableEnded) {
      req.resume()
      await new Promise((fim) => {
        req.once("end", fim)
        req.once("close", fim)
      })
    }
    // O que chegou a ser gravado sai: vídeo pela metade não fica no armazenamento.
    await deleteFilesWorkflow(req.scope)
      .run({ input: { ids: [destino.fileKey] } })
      .catch(() => {})
    if (porteiro.motivo) {
      res.status(400).json({ message: porteiro.motivo })
      return
    }
    logger.warn(`[painel] o vídeo de ${nome} não subiu: ${e}`)
    res.status(500).json({ message: "falhou" })
    return
  }
  res.json({ url: destino.url })
}
