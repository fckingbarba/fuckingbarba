"use client"

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react"
import { UmPorVez, useArrastar } from "@/components/arrastar"
import { useAvisar } from "@/components/avisos"
import { Icone } from "@/components/icones"
import { Subindo, useSubirVideo, videoDoProduto } from "@/components/produto/campos-de-midia"
import { mudarGaleria, subirImagem, type PedidoNaGaleria } from "@/lib/acoes/produtos"
import { ACEITA, prepararNoNavegador } from "@/lib/imagem-no-navegador"
import {
  avisosDaFoto,
  avisosDoVideo,
  duracaoCurta,
  LIMITE_DO_TITULO_DO_VIDEO,
  LIMITES_DA_GALERIA,
  MEDIDA_DA_GALERIA,
  MEDIDA_DO_VIDEO_DA_GALERIA,
  medidaEmPx,
  VIDEO,
  type DetalheDoProduto,
  type ItemDaGaleria,
} from "@/lib/produtos"
import { ACEITA_VIDEO } from "@/lib/video-no-navegador"

type Video = Extract<ItemDaGaleria, { tipo: "video" }>

/**
 * AS FOTOS DA GALERIA E OS VÍDEOS DO "VÊ NA PRÁTICA" — duas caixas, porque na
 * loja são duas coisas: a galeria da dobra é só de fotos, e os vídeos ficam
 * numa faixa própria embaixo da caixa de compra (pedido da loja em 24/09).
 *
 * Cada clique vale na hora (sem "Salvar"): subir (escolhendo, ou arrastando
 * o arquivo do computador pro quadro de "+"), andar uma casa, tirar, dar
 * nome ao vídeo. A tela já mostra a mudança enquanto ela vai
 * (`useOptimistic`); se o Medusa recusar, volta sozinha. Foto anda entre
 * fotos, vídeo entre vídeos — a capa é sempre a primeira foto, a que vai pra
 * vitrine, pro Google e pro link no WhatsApp. Quem vê sem editar (a operação)
 * vê as mesmas listas, sem os botões.
 */
export function GaleriaDoProduto({ produto }: { produto: DetalheDoProduto }) {
  const avisar = useAvisar()
  const [, comecar] = useTransition()
  const [itens, aplicar] = useOptimistic(produto.galeria, mexer)
  const [subindoFoto, setSubindoFoto] = useState(false)
  const [erroDaFoto, setErroDaFoto] = useState<string | null>(null)
  const [avisosDaFotoNova, setAvisosDaFotoNova] = useState<string[]>([])
  const [avisosDoVideoNovo, setAvisosDoVideoNovo] = useState<string[]>([])
  const video = useSubirVideo(videoDoProduto(produto.id))
  const edita = produto.podeEditar
  const fotos = itens.filter((i) => i.tipo === "foto")
  const videos = itens.filter((i): i is Video => i.tipo === "video")

  /*
    O foco acompanha o item que andou (o React tira o item do lugar pra pôr
    no novo, e a seta que chega na ponta desliga); o que foi tirado passa o
    foco pro vizinho. Se a pessoa já está em outro lugar da tela, fica lá.
  */
  const telas = useRef<HTMLDivElement>(null)
  const ultimo = useRef<PedidoNaGaleria | null>(null)
  useEffect(() => {
    const feito = ultimo.current
    if (!feito || feito.acao === "incluir" || feito.acao === "titular" || !telas.current) return
    const ativo = document.activeElement as HTMLButtonElement | null
    const perdido = !ativo || ativo === document.body || ativo.disabled
    if (!perdido && !telas.current.contains(ativo)) return
    const botoes = (url: string) =>
      telas.current!.querySelectorAll<HTMLButtonElement>(
        `li[data-url="${CSS.escape(url)}"] button:not([disabled])`
      )
    if (feito.acao === "mover") {
      const mesmo = telas.current.querySelector<HTMLButtonElement>(
        `li[data-url="${CSS.escape(feito.url)}"] [data-mover-galeria="${feito.para}"]:not([disabled])`
      )
      ;(mesmo ?? botoes(feito.url)[0])?.focus()
    } else if (perdido) {
      telas.current
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

  async function escolherFoto(arquivo: File | undefined) {
    if (!arquivo) return
    setErroDaFoto(null)
    setAvisosDaFotoNova([])
    setSubindoFoto(true)
    try {
      const pronta = await prepararNoNavegador(arquivo, "galeria")
      if (!pronta.ok) return setErroDaFoto(pronta.texto)
      const dados = new FormData()
      dados.set("uso", "galeria")
      dados.set(
        "arquivo",
        pronta.arquivo,
        pronta.arquivo.type === "image/webp" ? "f.webp" : "f.jpg"
      )
      const r = await subirImagem(produto.id, dados)
      if (!r.ok) return setErroDaFoto(r.texto)
      setAvisosDaFotoNova(avisosDaFoto("galeria", r.largura, r.altura))
      mudar({ acao: "incluir", item: { tipo: "foto", url: r.url } })
    } catch {
      setErroDaFoto("Não consegui subir a foto. Tente de novo.")
    } finally {
      setSubindoFoto(false)
    }
  }

  async function escolherVideo(arquivo: File | undefined) {
    if (!arquivo) return
    setAvisosDoVideoNovo([])
    const v = await video.subir(arquivo)
    if (!v) return
    const { bytes, ...resto } = v
    setAvisosDoVideoNovo(avisosDoVideo("galeria", { ...resto, bytes }))
    mudar({ acao: "incluir", item: { tipo: "video", ...resto } })
  }

  const ocupado = subindoFoto || video.progresso !== null
  const arrastarFoto = useArrastar((arquivo) => void escolherFoto(arquivo), ocupado)
  const arrastarVideo = useArrastar((arquivo) => void escolherVideo(arquivo), ocupado)

  /** Os botões de um item: andar uma casa entre os do mesmo tipo, e tirar. */
  const botoes = (lista: readonly ItemDaGaleria[], i: number, nome: string) => (
    <span className="galeria__botoes">
      <button
        type="button"
        aria-label={`Mover ${nome} pra esquerda`}
        data-mover-galeria="antes"
        disabled={i === 0}
        onClick={() => mudar({ acao: "mover", url: lista[i]!.url, para: "antes" })}
      >
        <Icone nome="esquerda" />
      </button>
      <button
        type="button"
        aria-label={`Mover ${nome} pra direita`}
        data-mover-galeria="depois"
        disabled={i === lista.length - 1}
        onClick={() => mudar({ acao: "mover", url: lista[i]!.url, para: "depois" })}
      >
        <Icone nome="seta" />
      </button>
      <button
        type="button"
        aria-label={`Tirar ${nome}`}
        data-tirar-galeria
        onClick={() => mudar({ acao: "tirar", url: lista[i]!.url })}
      >
        <Icone nome="fechar" />
      </button>
    </span>
  )

  return (
    <div ref={telas} style={{ display: "contents" }}>
      <section className="bloco" data-galeria>
        <div className="bloco__cabeca">
          <h2 className="bloco__titulo">Galeria de fotos</h2>
          <span className="selo">a primeira foto é a capa</span>
        </div>
        {fotos.length ? null : (
          <p className="slot__aviso" style={{ margin: "0 0 10px" }}>
            <Icone nome="alerta" />
            Sem foto de capa: a vitrine, o Google e o link no WhatsApp ficam sem imagem.
          </p>
        )}
        <ul className="galeria">
          {fotos.map((item, i) => (
            <li
              className="galeria__item"
              key={item.url}
              data-item-galeria="foto"
              data-url={item.url}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a foto do armazenamento */}
              <img src={item.url} alt="" loading="lazy" />
              {i === 0 ? <span className="galeria__capa">Capa</span> : null}
              {edita ? botoes(fotos, i, i === 0 ? "a capa" : `a foto ${i + 1}`) : null}
            </li>
          ))}
          {edita && fotos.length < LIMITES_DA_GALERIA.fotos ? (
            <li>
              <label
                className="galeria__nova"
                data-ocupado={ocupado ? "" : undefined}
                {...arrastarFoto.alvo}
              >
                <Icone nome={subindoFoto ? "relogio" : "mais"} />
                {subindoFoto ? "Subindo…" : arrastarFoto.arrastando ? "Solte aqui" : "Foto"}
                <small>ou arraste pra cá</small>
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
        </ul>
        <UmPorVez varios={arrastarFoto.varios} />
        {erroDaFoto ? (
          <p className="slot__erro" role="alert">
            {erroDaFoto}
          </p>
        ) : null}
        {avisosDaFotoNova.map((a) => (
          <p className="slot__aviso" key={a}>
            <Icone nome="alerta" />
            {a}
          </p>
        ))}
        <p className="pequeno suave" style={{ margin: "12px 0 0" }}>
          Fotos: JPG, PNG ou WebP, <b>quadradas, {medidaEmPx(MEDIDA_DA_GALERIA)}</b>. Só fotos aqui:
          os vídeos ficam no Vê na prática, logo abaixo.
        </p>
        <p className="pequeno suave" style={{ margin: "8px 0 0" }}>
          {edita
            ? "Cada mudança vale na hora. As fotos que vieram do Bling ficam até alguém mexer aqui; depois, trazer o catálogo de novo não troca mais as fotos deste produto."
            : "A operação vê as fotos e os vídeos; quem mexe é o marketing ou o dono."}
        </p>
      </section>

      <section className="bloco" data-ve-na-pratica>
        <div className="bloco__cabeca">
          <h2 className="bloco__titulo">Vê na prática</h2>
          <span className="selo">vídeos, fora da galeria</span>
        </div>
        <p className="pequeno suave" style={{ margin: "0 0 10px" }}>
          Na página, os vídeos ficam numa faixa própria, embaixo da caixa de compra — fora das
          fotos. Cada um vira um cartão com o nome e a duração, e quem clica abre o vídeo numa
          janela, com som.
        </p>
        {videos.length || edita ? (
          <ul className="galeria galeria--videos">
            {videos.map((item, i) => (
              <li className="galeria__video" key={item.url} data-url={item.url}>
                <div className="galeria__item" data-item-galeria="video">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a capa do armazenamento */}
                  <img src={item.poster} alt="" loading="lazy" />
                  <span className="galeria__tipo">
                    <Icone nome="play" />
                    {duracaoCurta(item.duracao)}
                  </span>
                  {edita ? botoes(videos, i, `o vídeo ${i + 1}`) : null}
                </div>
                {edita ? (
                  <NomeDoVideo
                    key={`${item.url}:${item.titulo ?? ""}`}
                    numero={i + 1}
                    titulo={item.titulo ?? ""}
                    aoSalvar={(titulo) => mudar({ acao: "titular", url: item.url, titulo })}
                  />
                ) : item.titulo ? (
                  <span className="galeria__nome-lido">{item.titulo}</span>
                ) : null}
              </li>
            ))}
            {edita && videos.length < LIMITES_DA_GALERIA.videos ? (
              <li>
                <label
                  className="galeria__nova galeria__nova--video"
                  data-ocupado={ocupado ? "" : undefined}
                  {...arrastarVideo.alvo}
                >
                  <Icone nome={video.progresso !== null ? "relogio" : "play"} />
                  {video.progresso !== null
                    ? "Subindo…"
                    : arrastarVideo.arrastando
                      ? "Solte aqui"
                      : "Vídeo"}
                  <small>ou arraste pra cá</small>
                  <small>MP4 ou WebM</small>
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
          </ul>
        ) : (
          <p className="pequeno suave">Nenhum vídeo ainda.</p>
        )}
        {video.progresso !== null ? <Subindo progresso={video.progresso} /> : null}
        <UmPorVez varios={arrastarVideo.varios} />
        {video.erro ? (
          <p className="slot__erro" role="alert">
            {video.erro}
          </p>
        ) : null}
        {avisosDoVideoNovo.map((a) => (
          <p className="slot__aviso" key={a}>
            <Icone nome="alerta" />
            {a}
          </p>
        ))}
        <p className="pequeno suave" style={{ margin: "12px 0 0" }}>
          Vídeos: MP4 ou WebM, até {VIDEO.maximoMB} MB e {VIDEO.idealSegundos} segundos —{" "}
          <b>em pé, {medidaEmPx(MEDIDA_DO_VIDEO_DA_GALERIA)}</b>, como o vídeo do celular. Até{" "}
          {LIMITES_DA_GALERIA.videos} vídeos. O nome (&ldquo;Como aplicar&rdquo;, &ldquo;A
          textura&rdquo;) aparece no cartão; sem nome, o cartão mostra só a duração.
        </p>
      </section>
    </div>
  )
}

/**
 * O nome do vídeo no cartão da loja. Salva ao sair do campo ou no Enter, e
 * só se mudou. Remonta quando o nome gravado muda (a `key` de quem chama), e
 * aí começa do que o Medusa guardou.
 */
function NomeDoVideo({
  numero,
  titulo,
  aoSalvar,
}: {
  numero: number
  titulo: string
  aoSalvar: (titulo: string) => void
}) {
  const [texto, setTexto] = useState(titulo)
  const salvar = () => {
    const limpo = texto.replace(/\s+/g, " ").trim()
    if (limpo !== titulo) aoSalvar(limpo)
  }
  return (
    <input
      className="galeria__nome"
      type="text"
      value={texto}
      maxLength={LIMITE_DO_TITULO_DO_VIDEO}
      placeholder="Nome (ex.: Como aplicar)"
      aria-label={`Nome do vídeo ${numero} no cartão da loja`}
      data-titulo-video
      onChange={(e) => setTexto(e.target.value)}
      onBlur={salvar}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault()
          salvar()
        }
      }}
    />
  )
}

/** A mesma conta do backend (`mudarGaleria`), só pra tela não esperar. */
function mexer(itens: ItemDaGaleria[], pedido: PedidoNaGaleria): ItemDaGaleria[] {
  if (pedido.acao === "incluir") return itens
  const i = itens.findIndex((x) => x.url === pedido.url)
  if (i < 0) return itens
  if (pedido.acao === "tirar") return itens.filter((_, k) => k !== i)
  if (pedido.acao === "titular") {
    const alvo = itens[i]!
    if (alvo.tipo !== "video") return itens
    const titulo = pedido.titulo.replace(/\s+/g, " ").trim().slice(0, LIMITE_DO_TITULO_DO_VIDEO)
    const { url, poster, largura, altura, duracao } = alvo
    const sem: Video = { tipo: "video", url, poster, largura, altura, duracao }
    return itens.map((x, k) => (k === i ? (titulo ? { ...sem, titulo } : sem) : x))
  }
  // O vizinho do MESMO tipo, na direção pedida.
  const passo = pedido.para === "antes" ? -1 : 1
  let j = i + passo
  while (j >= 0 && j < itens.length && itens[j]!.tipo !== itens[i]!.tipo) j += passo
  if (j < 0 || j >= itens.length) return itens
  const novos = [...itens]
  ;[novos[i], novos[j]] = [novos[j]!, novos[i]!]
  return novos
}
