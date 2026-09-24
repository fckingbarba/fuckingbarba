"use client"

import { useState } from "react"
import { UmPorVez, useArrastar } from "@/components/arrastar"
import { Icone } from "@/components/icones"
import { pedirEnvioDeVideo, subirImagem, type ImagemQueSubiu } from "@/lib/acoes/produtos"
import { ACEITA, prepararNoNavegador } from "@/lib/imagem-no-navegador"
import {
  avisosDaFoto,
  avisosDoVideo,
  duracaoCurta,
  MEDIDA_DO_CASO,
  MEDIDA_DO_VIDEO_DA_GALERIA,
  MEDIDA_DO_VIDEO_DO_USO,
  medidaEmPx,
  tamanhoDoArquivo,
  VIDEO,
  type VideoDaPdp,
} from "@/lib/produtos"
import { ACEITA_VIDEO, enviarVideo, lerVideoNoNavegador } from "@/lib/video-no-navegador"

/**
 * A FOTO E O VÍDEO QUE SOBEM PELO PAINEL — a foto de um caso de antes e
 * depois e o vídeo do modo de uso, na gaveta da seção; o vídeo da história
 * da marca, na gaveta do "Sobre a marca" da home; e o vídeo da galeria
 * (`useSubirVideo`, aqui, que a galeria também usa).
 *
 * Sobem assim que são escolhidos (ou arrastados do computador e soltos em
 * cima do quadro: `components/arrastar.tsx`) — a foto encolhida no navegador
 * e refeita no servidor; o vídeo direto pro Medusa, com o bilhete, e a capa
 * dele (um quadro do começo) como imagem —, mas só vão pra página no
 * "Salvar".
 */

/**
 * Pra onde o vídeo sobe: a capa (uma imagem, `uso: "poster"`) e o bilhete do
 * arquivo, que vai direto do navegador pro Medusa.
 */
export type DestinoDoVideo = {
  subirCapa: (dados: FormData) => Promise<ImagemQueSubiu>
  pedirEnvio: (video: {
    tipo: string
    tamanho: number
  }) => Promise<{ ok: true; url: string } | { ok: false; texto: string }>
}

/** O vídeo de um produto: a capa e o arquivo vão pra ele. */
export const videoDoProduto = (id: string): DestinoDoVideo => ({
  subirCapa: (dados) => subirImagem(id, dados),
  pedirEnvio: (video) => pedirEnvioDeVideo(id, video),
})

/** O vídeo escolhido, até ele estar no armazenamento: o progresso (0 a 1) e o que deu errado. */
export function useSubirVideo(destino: DestinoDoVideo) {
  const [progresso, setProgresso] = useState<number | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function subir(arquivo: File): Promise<(VideoDaPdp & { bytes: number }) | null> {
    setErro(null)
    setProgresso(0)
    try {
      const lido = await lerVideoNoNavegador(arquivo)
      if (!lido.ok) {
        setErro(lido.texto)
        return null
      }
      const dados = new FormData()
      dados.set("uso", "poster")
      dados.set("arquivo", lido.capa, lido.capa.type === "image/webp" ? "capa.webp" : "capa.jpg")
      const capa = await destino.subirCapa(dados)
      if (!capa.ok) {
        setErro(capa.texto)
        return null
      }
      const envio = await destino.pedirEnvio({ tipo: lido.tipo, tamanho: arquivo.size })
      if (!envio.ok) {
        setErro(envio.texto)
        return null
      }
      const r = await enviarVideo(envio.url, arquivo, lido.tipo, setProgresso)
      if (!r.ok) {
        setErro(r.texto)
        return null
      }
      return {
        url: r.url,
        poster: capa.url,
        largura: lido.largura,
        altura: lido.altura,
        duracao: Math.round(lido.duracao * 10) / 10,
        bytes: arquivo.size,
      }
    } catch {
      setErro("Não consegui subir o vídeo. Tente de novo.")
      return null
    } finally {
      setProgresso(null)
    }
  }

  return { subir, progresso, erro }
}

/** A barra de subida do vídeo, com a porcentagem pra quem usa leitor de tela. */
export function Subindo({ progresso }: { progresso: number }) {
  const pct = Math.round(progresso * 100)
  return (
    <p className="subindo" role="status">
      <span>Subindo o vídeo… {pct}%</span>
      <progress max={100} value={pct} aria-label="Subindo o vídeo" />
    </p>
  )
}

export function CampoDeFoto({
  produtoId,
  chave,
  rotulo,
  meia,
  url,
  falta,
  mudar,
  aoSubir,
}: {
  produtoId: string
  chave: string
  rotulo: string
  meia?: boolean
  url: string
  falta?: boolean
  mudar: (url: string) => void
  aoSubir: (delta: 1 | -1) => void
}) {
  const [erro, setErro] = useState<string | null>(null)
  const [subindo, setSubindo] = useState(false)
  // A foto gravada chega só com o endereço: a medida sai dela, quando carrega.
  const [medida, setMedida] = useState<{ url: string; l: number; a: number } | null>(null)
  const lida = medida?.url === url ? medida : null
  const avisos = lida ? avisosDaFoto("caso", lida.l, lida.a) : []

  async function escolher(arquivo: File | undefined) {
    if (!arquivo) return
    setErro(null)
    setSubindo(true)
    aoSubir(1)
    try {
      const pronta = await prepararNoNavegador(arquivo, "caso")
      if (!pronta.ok) return setErro(pronta.texto)
      const dados = new FormData()
      dados.set("uso", "caso")
      dados.set(
        "arquivo",
        pronta.arquivo,
        pronta.arquivo.type === "image/webp" ? "f.webp" : "f.jpg"
      )
      const r = await subirImagem(produtoId, dados)
      if (!r.ok) return setErro(r.texto)
      setMedida({ url: r.url, l: r.largura, a: r.altura })
      mudar(r.url)
    } catch {
      setErro("Não consegui subir a foto. Tente de novo.")
    } finally {
      setSubindo(false)
      aoSubir(-1)
    }
  }
  const arrastar = useArrastar((arquivo) => void escolher(arquivo), subindo)

  const entrada = (
    <input
      type="file"
      accept={ACEITA}
      data-campo={chave}
      aria-invalid={falta || undefined}
      disabled={subindo}
      onChange={(e) => {
        void escolher(e.target.files?.[0])
        e.target.value = ""
      }}
    />
  )

  return (
    <div className={`campo slot slot--caso${meia ? " campo--3" : ""}`} {...arrastar.alvo}>
      <span className="campo__rot">{rotulo}</span>
      {url ? (
        <>
          <div className="slot__previa">
            {/* eslint-disable-next-line @next/next/no-img-element -- a foto do armazenamento, cortada como a loja corta */}
            <img
              src={url}
              alt=""
              onLoad={(e) =>
                setMedida({
                  url,
                  l: e.currentTarget.naturalWidth,
                  a: e.currentTarget.naturalHeight,
                })
              }
            />
            {arrastar.arrastando ? <span className="slot__soltar">Solte pra trocar</span> : null}
          </div>
          {lida ? <p className="slot__info">{`${lida.l} × ${lida.a} px`}</p> : null}
          {avisos.map((a) => (
            <p className="slot__aviso" key={a}>
              <Icone nome="alerta" />
              {a}
            </p>
          ))}
          <div className="slot__acoes">
            <label className="link pequeno">
              {subindo ? "Subindo…" : "Trocar"}
              {entrada}
            </label>
            <button type="button" className="link pequeno" onClick={() => mudar("")}>
              Tirar
            </button>
          </div>
        </>
      ) : (
        <label className="slot__vazio" data-falta={falta ? "" : undefined}>
          <Icone nome={subindo ? "relogio" : "mais"} />
          <span>{subindo ? "Subindo…" : arrastar.arrastando ? "Solte aqui" : "Escolher"}</span>
          <small>ou arraste pra cá</small>
          <small>JPG, PNG ou WebP</small>
          {entrada}
        </label>
      )}
      <p className="slot__medida">
        Ideal: <b>{medidaEmPx(MEDIDA_DO_CASO)}</b> · em pé
      </p>
      <UmPorVez varios={arrastar.varios} />
      {erro ? (
        <p className="slot__erro" role="alert">
          {erro}
        </p>
      ) : null}
    </div>
  )
}

/**
 * O vídeo de uma seção. `uso` diz onde ele entra: no modo de uso do produto
 * (a caixa é deitada, 16:9) ou na história da marca, na home (em pé ou
 * deitado: a seção se ajeita ao vídeo).
 */
export function CampoDeVideo({
  destino,
  uso,
  chave,
  rotulo,
  ajuda,
  video,
  mudar,
  aoSubir,
}: {
  destino: DestinoDoVideo
  uso: "uso" | "historia"
  chave: string
  rotulo: string
  ajuda?: string
  video: VideoDaPdp | null
  mudar: (video: VideoDaPdp | null) => void
  aoSubir: (delta: 1 | -1) => void
}) {
  const { subir, progresso, erro } = useSubirVideo(destino)
  const [bytes, setBytes] = useState<{ url: string; n: number } | null>(null)
  const avisos = video
    ? avisosDoVideo(uso, { ...video, bytes: bytes?.url === video.url ? bytes.n : undefined })
    : []

  async function escolher(arquivo: File | undefined) {
    if (!arquivo) return
    aoSubir(1)
    try {
      const v = await subir(arquivo)
      if (!v) return
      const { bytes: n, ...resto } = v
      setBytes({ url: resto.url, n })
      mudar(resto)
    } finally {
      aoSubir(-1)
    }
  }
  const arrastar = useArrastar((arquivo) => void escolher(arquivo), progresso !== null)

  const entrada = (
    <input
      type="file"
      accept={ACEITA_VIDEO}
      data-campo={chave}
      disabled={progresso !== null}
      onChange={(e) => {
        void escolher(e.target.files?.[0])
        e.target.value = ""
      }}
    />
  )

  return (
    <div className="campo slot slot--uso" data-video={uso} {...arrastar.alvo}>
      <span className="campo__rot">{rotulo}</span>
      {video ? (
        <div className="video-form">
          <div className="slot__previa">
            <video src={video.url} poster={video.poster} muted loop playsInline autoPlay />
            {arrastar.arrastando ? <span className="slot__soltar">Solte pra trocar</span> : null}
          </div>
          <div>
            <p className="slot__info">
              {video.largura} × {video.altura} px · {duracaoCurta(video.duracao)}
              {bytes?.url === video.url ? ` · ${tamanhoDoArquivo(bytes.n)}` : ""}
            </p>
            {avisos.map((a) => (
              <p className="slot__aviso" key={a}>
                <Icone nome="alerta" />
                {a}
              </p>
            ))}
            <div className="slot__acoes">
              <label className="link pequeno">
                Trocar
                {entrada}
              </label>
              <button type="button" className="link pequeno" onClick={() => mudar(null)}>
                Tirar
              </button>
            </div>
          </div>
        </div>
      ) : (
        <label className="slot__vazio slot__vazio--video">
          <Icone nome={progresso !== null ? "relogio" : "play"} />
          <span>
            {progresso !== null
              ? "Subindo…"
              : arrastar.arrastando
                ? "Solte aqui"
                : "Escolher vídeo"}
          </span>
          <small>ou arraste pra cá</small>
          <small>
            MP4 ou WebM · {uso === "uso" ? "deitado, " : ""}até {VIDEO.maximoMB} MB
          </small>
          {entrada}
        </label>
      )}
      {progresso !== null ? <Subindo progresso={progresso} /> : null}
      {uso === "uso" ? (
        <p className="slot__medida">
          Ideal: <b>{medidaEmPx(MEDIDA_DO_VIDEO_DO_USO)}</b> · deitado (16:9), até{" "}
          {VIDEO.idealSegundos} segundos
        </p>
      ) : (
        <p className="slot__medida">
          Ideal: <b>{medidaEmPx(MEDIDA_DO_VIDEO_DA_GALERIA)}</b> em pé, ou{" "}
          <b>{medidaEmPx(MEDIDA_DO_VIDEO_DO_USO)}</b> deitado, até {VIDEO.idealSegundos} segundos
        </p>
      )}
      {ajuda ? <p className="campo__ajuda">{ajuda}</p> : null}
      <UmPorVez varios={arrastar.varios} />
      {erro ? (
        <p className="slot__erro" role="alert">
          {erro}
        </p>
      ) : null}
    </div>
  )
}
