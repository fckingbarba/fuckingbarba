"use client"

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react"
import { useAvisar } from "@/components/avisos"
import { Icone } from "@/components/icones"
import { Subindo, useSubirVideo } from "@/components/produto/campos-de-midia"
import { mudarGaleria, subirImagem, type PedidoNaGaleria } from "@/lib/acoes/produtos"
import { ACEITA, prepararNoNavegador } from "@/lib/imagem-no-navegador"
import {
  avisosDaFoto,
  avisosDoVideo,
  duracaoCurta,
  LIMITES_DA_GALERIA,
  MEDIDA_DA_GALERIA,
  MEDIDA_DO_VIDEO_DA_GALERIA,
  medidaEmPx,
  VIDEO,
  type DetalheDoProduto,
  type ItemDaGaleria,
} from "@/lib/produtos"
import { ACEITA_VIDEO } from "@/lib/video-no-navegador"

/**
 * AS FOTOS E OS VÍDEOS DA DOBRA — na ordem da página, como no protótipo.
 * Cada clique vale na hora (sem "Salvar"): subir, andar uma casa, tirar. A
 * tela já mostra a mudança enquanto ela vai (`useOptimistic`); se o Medusa
 * recusar, volta sozinha.
 *
 * A CAPA É SEMPRE FOTO — a que vai pra vitrine, pro Google e pro link no
 * WhatsApp: a seta que poria um vídeo na frente nem aparece ligada. Quem vê
 * sem editar (a operação) vê a mesma lista, sem os botões.
 */
export function GaleriaDoProduto({ produto }: { produto: DetalheDoProduto }) {
  const avisar = useAvisar()
  const [, comecar] = useTransition()
  const [itens, aplicar] = useOptimistic(produto.galeria, mexer)
  const [subindoFoto, setSubindoFoto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [avisos, setAvisos] = useState<string[]>([])
  const video = useSubirVideo(produto.id)
  const edita = produto.podeEditar
  const fotos = itens.filter((i) => i.tipo === "foto").length
  const videos = itens.length - fotos

  /*
    O foco acompanha o item que andou (o React tira o item do lugar pra pôr
    no novo, e a seta que chega na ponta desliga); o que foi tirado passa o
    foco pro vizinho. Se a pessoa já está em outro lugar da tela, fica lá.
  */
  const lista = useRef<HTMLUListElement>(null)
  const ultimo = useRef<PedidoNaGaleria | null>(null)
  useEffect(() => {
    const feito = ultimo.current
    if (!feito || feito.acao === "incluir" || !lista.current) return
    const ativo = document.activeElement as HTMLButtonElement | null
    const perdido = !ativo || ativo === document.body || ativo.disabled
    if (!perdido && !lista.current.contains(ativo)) return
    const botoes = (url: string) =>
      lista.current!.querySelectorAll<HTMLButtonElement>(
        `li[data-url="${CSS.escape(url)}"] button:not([disabled])`
      )
    if (feito.acao === "mover") {
      const mesmo = lista.current.querySelector<HTMLButtonElement>(
        `li[data-url="${CSS.escape(feito.url)}"] [data-mover-galeria="${feito.para}"]:not([disabled])`
      )
      ;(mesmo ?? botoes(feito.url)[0])?.focus()
    } else if (perdido) {
      lista.current
        .querySelector<HTMLElement>("button:not([disabled]), input:not([disabled])")
        ?.focus()
    }
  }, [itens])

  const mudar = (pedido: PedidoNaGaleria) => {
    ultimo.current = pedido
    comecar(async () => {
      if (pedido.acao !== "incluir") aplicar(pedido)
      avisar(await mudarGaleria(produto.id, pedido))
    })
  }

  /** Andar uma casa não pode deixar vídeo na frente da primeira foto. */
  const podeMover = (i: number, para: "antes" | "depois") => {
    const j = para === "antes" ? i - 1 : i + 1
    if (j < 0 || j >= itens.length) return false
    const novos = [...itens]
    ;[novos[i], novos[j]] = [novos[j]!, novos[i]!]
    return !(novos[0]!.tipo === "video" && fotos > 0)
  }

  async function escolherFoto(arquivo: File | undefined) {
    if (!arquivo) return
    setErro(null)
    setAvisos([])
    setSubindoFoto(true)
    try {
      const pronta = await prepararNoNavegador(arquivo, "galeria")
      if (!pronta.ok) return setErro(pronta.texto)
      const dados = new FormData()
      dados.set("uso", "galeria")
      dados.set(
        "arquivo",
        pronta.arquivo,
        pronta.arquivo.type === "image/webp" ? "f.webp" : "f.jpg"
      )
      const r = await subirImagem(produto.id, dados)
      if (!r.ok) return setErro(r.texto)
      setAvisos(avisosDaFoto("galeria", r.largura, r.altura))
      mudar({ acao: "incluir", item: { tipo: "foto", url: r.url } })
    } catch {
      setErro("Não consegui subir a foto. Tente de novo.")
    } finally {
      setSubindoFoto(false)
    }
  }

  async function escolherVideo(arquivo: File | undefined) {
    if (!arquivo) return
    setErro(null)
    setAvisos([])
    const v = await video.subir(arquivo)
    if (!v) return
    const { bytes, codec, ...resto } = v
    setAvisos(avisosDoVideo("galeria", { ...resto, bytes, codec }))
    mudar({ acao: "incluir", item: { tipo: "video", ...resto } })
  }

  const ocupado = subindoFoto || video.progresso !== null

  return (
    <section className="bloco" data-galeria>
      <div className="bloco__cabeca">
        <h2 className="bloco__titulo">Fotos e vídeos</h2>
        <span className="selo">a primeira foto é a capa</span>
      </div>
      {fotos ? null : (
        <p className="slot__aviso" style={{ margin: "0 0 10px" }}>
          <Icone nome="alerta" />
          Sem foto de capa: a vitrine, o Google e o link no WhatsApp ficam sem imagem.
        </p>
      )}
      <ul className="galeria" ref={lista}>
        {itens.map((item, i) => (
          <li
            className="galeria__item"
            key={item.url}
            data-item-galeria={item.tipo}
            data-url={item.url}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- a foto do armazenamento */}
            <img src={item.tipo === "foto" ? item.url : item.poster} alt="" loading="lazy" />
            {item.tipo === "video" ? (
              <span className="galeria__tipo">
                <Icone nome="play" />
                {duracaoCurta(item.duracao)}
              </span>
            ) : null}
            {i === 0 && item.tipo === "foto" ? <span className="galeria__capa">Capa</span> : null}
            {edita ? (
              <span className="galeria__botoes">
                <button
                  type="button"
                  aria-label={`Mover ${nomeDo(item, i)} pra esquerda`}
                  data-mover-galeria="antes"
                  disabled={!podeMover(i, "antes")}
                  onClick={() => mudar({ acao: "mover", url: item.url, para: "antes" })}
                >
                  <Icone nome="esquerda" />
                </button>
                <button
                  type="button"
                  aria-label={`Mover ${nomeDo(item, i)} pra direita`}
                  data-mover-galeria="depois"
                  disabled={!podeMover(i, "depois")}
                  onClick={() => mudar({ acao: "mover", url: item.url, para: "depois" })}
                >
                  <Icone nome="seta" />
                </button>
                <button
                  type="button"
                  aria-label={`Tirar ${nomeDo(item, i)}`}
                  data-tirar-galeria
                  onClick={() => mudar({ acao: "tirar", url: item.url })}
                >
                  <Icone nome="fechar" />
                </button>
              </span>
            ) : null}
          </li>
        ))}
        {edita ? (
          <>
            {fotos < LIMITES_DA_GALERIA.fotos ? (
              <li>
                <label className="galeria__nova" data-ocupado={ocupado ? "" : undefined}>
                  <Icone nome={subindoFoto ? "relogio" : "mais"} />
                  {subindoFoto ? "Subindo…" : "Foto"}
                  <small>JPG, PNG ou WebP</small>
                  <input
                    type="file"
                    accept={ACEITA}
                    data-subir-galeria="foto"
                    disabled={ocupado}
                    onChange={(e) => {
                      void escolherFoto(e.target.files?.[0])
                      e.target.value = ""
                    }}
                  />
                </label>
              </li>
            ) : null}
            {videos < LIMITES_DA_GALERIA.videos ? (
              <li>
                <label className="galeria__nova" data-ocupado={ocupado ? "" : undefined}>
                  <Icone nome={video.progresso !== null ? "relogio" : "play"} />
                  {video.progresso !== null ? "Subindo…" : "Vídeo"}
                  <small>MP4, MOV ou WebM</small>
                  <input
                    type="file"
                    accept={ACEITA_VIDEO}
                    data-subir-galeria="video"
                    disabled={ocupado}
                    onChange={(e) => {
                      void escolherVideo(e.target.files?.[0])
                      e.target.value = ""
                    }}
                  />
                </label>
              </li>
            ) : null}
          </>
        ) : null}
      </ul>
      {video.progresso !== null ? <Subindo progresso={video.progresso} /> : null}
      {erro || video.erro ? (
        <p className="slot__erro" role="alert">
          {erro ?? video.erro}
        </p>
      ) : null}
      {avisos.map((a) => (
        <p className="slot__aviso" key={a}>
          <Icone nome="alerta" />
          {a}
        </p>
      ))}
      <p className="pequeno suave" style={{ margin: "12px 0 0" }}>
        Fotos: JPG, PNG ou WebP, <b>quadradas, {medidaEmPx(MEDIDA_DA_GALERIA)}</b>. Vídeos: MP4, MOV
        ou WebM, até {VIDEO.maximoMB} MB e {VIDEO.idealSegundos} segundos —{" "}
        <b>quadrado, {medidaEmPx(MEDIDA_DO_VIDEO_DA_GALERIA)}</b>, ocupa o quadro inteiro; em pé
        também serve, com faixa escura dos lados. Na página, o vídeo toca sem som, em loop, e só
        baixa quando alguém escolhe.
      </p>
      <p className="pequeno suave" style={{ margin: "8px 0 0" }}>
        {edita
          ? "Cada mudança vale na hora. As fotos que vieram do Bling ficam até alguém mexer aqui; depois, trazer o catálogo de novo não troca mais as fotos deste produto."
          : "A operação vê as fotos; quem mexe é o marketing ou o dono."}
      </p>
    </section>
  )
}

const nomeDo = (item: ItemDaGaleria, i: number) =>
  item.tipo === "video" ? `o vídeo ${i + 1}` : i === 0 ? "a capa" : `a foto ${i + 1}`

/** A mesma conta do backend (`mudarGaleria`), só pra tela não esperar. */
function mexer(itens: ItemDaGaleria[], pedido: PedidoNaGaleria): ItemDaGaleria[] {
  if (pedido.acao === "incluir") return itens
  const i = itens.findIndex((x) => x.url === pedido.url)
  if (i < 0) return itens
  if (pedido.acao === "tirar") {
    const sem = itens.filter((_, k) => k !== i)
    const foto = sem.findIndex((x) => x.tipo === "foto")
    return foto > 0 ? [sem[foto]!, ...sem.filter((_, k) => k !== foto)] : sem
  }
  const j = pedido.para === "antes" ? i - 1 : i + 1
  if (j < 0 || j >= itens.length) return itens
  const novos = [...itens]
  ;[novos[i], novos[j]] = [novos[j]!, novos[i]!]
  return novos
}
