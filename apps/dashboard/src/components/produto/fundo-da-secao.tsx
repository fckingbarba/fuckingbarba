"use client"

import {
  useEffect,
  useId,
  useState,
  useTransition,
  type CSSProperties,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react"
import { UmPorVez, useArrastar } from "@/components/arrastar"
import { Icone } from "@/components/icones"
import type { ImagemQueSubiu } from "@/lib/acoes/produtos"
import { ACEITA, prepararNoNavegador } from "@/lib/imagem-no-navegador"
import {
  avisosDaImagem,
  medidaEmPx,
  RGB_DO_VEU,
  tamanhoDoArquivo,
  VEU,
  type ImagemDoFundo,
  type Lado,
  type MedidaDoFundo,
} from "@/lib/produtos"

/**
 * A IMAGEM DE FUNDO DE UMA SEÇÃO — a do computador, a do celular e o véu.
 *
 * Cada quadro tem a PROPORÇÃO DA SEÇÃO NA LOJA (a medida de `SECOES`, em
 * `lib/produtos.ts`) e corta a foto como a loja corta (`cover`, foco a 40%
 * do topo), com o véu da cor da seção por cima: o que aparece no quadro é o
 * que aparece no site. Em cima de cada quadro, a medida ideal em px.
 *
 * A foto sobe assim que é escolhida — ou arrastada do computador e solta em
 * cima do quadro (`components/arrastar.tsx`) — encolhida no navegador, e de
 * novo no servidor, mas só vai pra página no "Salvar" da gaveta. Pra onde
 * ela sobe é de quem chama (`subir`): a página do produto, ou a home.
 *
 * Sem véu (`comVeu: false`) serve pra imagem que não é fundo com a cor da
 * seção por cima: a arte de um slide do banner, a foto da última chamada.
 */

/** Sobe a imagem já preparada no navegador (`uso` e `arquivo` no FormData). */
export type SubirImagem = (dados: FormData) => Promise<ImagemQueSubiu>

export type EstadoDoFundo = {
  computador: ImagemDoFundo | null
  celular: ImagemDoFundo | null
  veu: number
}

const ROTULO: Record<Lado, string> = { computador: "Computador", celular: "Celular" }

export function FundoDaSecao({
  subir,
  medida,
  valor,
  mudar,
  aoSubir,
  comVeu = true,
  legenda = "Imagem de fundo (opcional)",
  ajuda = "A foto fica atrás da seção, com a cor dela por cima. Cada quadro tem o formato da seção no site: o que fica fora dele não aparece.",
  rodape = "JPG, PNG ou WebP. A loja guarda em WebP, no tamanho certo pra cada tela. Sem a do celular, ele usa a do computador, cortada no meio. Com mais texto na seção, ela cresce e o corte muda um pouco.",
}: {
  subir: SubirImagem
  medida: MedidaDoFundo
  valor: EstadoDoFundo
  mudar: Dispatch<SetStateAction<EstadoDoFundo>>
  aoSubir: (subindo: boolean) => void
  comVeu?: boolean
  legenda?: string
  ajuda?: ReactNode
  rodape?: ReactNode
}) {
  const id = useId()
  const [subindo, setSubindo] = useState<Record<Lado, boolean>>({
    computador: false,
    celular: false,
  })
  useEffect(() => aoSubir(subindo.computador || subindo.celular), [subindo, aoSubir])

  const estilo = {
    "--rgb": RGB_DO_VEU[medida.cor],
    "--veu": comVeu && valor.computador ? valor.veu : 0,
  } as CSSProperties

  return (
    <fieldset
      className="campo fundo-form"
      data-cor={medida.cor}
      data-sem-veu={comVeu ? undefined : ""}
      data-mostra={medida.mostra}
      style={estilo}
    >
      <legend className="campo__rot">{legenda}</legend>
      <p className="campo__ajuda fundo-form__ajuda">{ajuda}</p>
      <div className="fundo-form__lados">
        {(["computador", "celular"] as const).map((lado) => (
          <UmLado
            key={lado}
            lado={lado}
            subir={subir}
            comAmostra={comVeu}
            medida={medida}
            imagem={valor[lado]}
            desligado={lado === "celular" && !valor.computador}
            subindo={subindo[lado]}
            aoSubir={(s) => setSubindo((a) => ({ ...a, [lado]: s }))}
            trocar={(img) => mudar((f) => ({ ...f, [lado]: img }))}
            tirar={() =>
              // Sem a do computador não há fundo: a do celular sai junto.
              mudar((f) =>
                lado === "computador"
                  ? { ...f, computador: null, celular: null }
                  : { ...f, celular: null }
              )
            }
          />
        ))}
      </div>
      {comVeu && valor.computador ? (
        <>
          <label className="veu" htmlFor={`${id}-veu`}>
            Véu <b>{valor.veu}%</b>{" "}
            <small>— quanto maior, mais a cor da seção cobre a foto e melhor se lê o texto</small>
          </label>
          <input
            type="range"
            id={`${id}-veu`}
            data-campo="veu"
            min={VEU.minimo}
            max={VEU.maximo}
            step={VEU.passo}
            value={valor.veu}
            onChange={(e) => {
              const veu = Number(e.target.value)
              mudar((f) => ({ ...f, veu }))
            }}
          />
        </>
      ) : null}
      <p className="campo__ajuda">{rodape}</p>
    </fieldset>
  )
}

function UmLado({
  lado,
  subir,
  comAmostra,
  medida,
  imagem,
  desligado,
  subindo,
  aoSubir,
  trocar,
  tirar,
}: {
  lado: Lado
  subir: SubirImagem
  comAmostra: boolean
  medida: MedidaDoFundo
  imagem: ImagemDoFundo | null
  desligado: boolean
  subindo: boolean
  aoSubir: (subindo: boolean) => void
  trocar: (img: ImagemDoFundo) => void
  tirar: () => void
}) {
  const [erro, setErro] = useState<string | null>(null)
  const [, comecar] = useTransition()
  // A foto gravada chega só com o endereço: a medida sai dela, quando carrega.
  const [medidaLida, setMedidaLida] = useState<{ url: string; l: number; a: number } | null>(null)
  const [l, a] = medida[lado]
  const proporcao = `${l} / ${a}`
  const largura = imagem?.largura ?? (medidaLida?.url === imagem?.url ? medidaLida?.l : undefined)
  const altura = imagem?.altura ?? (medidaLida?.url === imagem?.url ? medidaLida?.a : undefined)
  const avisos = largura && altura ? avisosDaImagem(lado, medida, largura, altura) : []

  function escolher(arquivo: File | undefined) {
    if (!arquivo) return
    setErro(null)
    aoSubir(true)
    comecar(async () => {
      try {
        const pronta = await prepararNoNavegador(arquivo, lado)
        if (!pronta.ok) return setErro(pronta.texto)
        const dados = new FormData()
        dados.set("uso", lado)
        dados.set(
          "arquivo",
          pronta.arquivo,
          pronta.arquivo.type === "image/webp" ? "f.webp" : "f.jpg"
        )
        const r = await subir(dados)
        if (!r.ok) return setErro(r.texto)
        trocar({ url: r.url, largura: r.largura, altura: r.altura, bytes: r.bytes })
      } catch {
        setErro("Não consegui subir a foto. Tenta de novo.")
      } finally {
        aoSubir(false)
      }
    })
  }
  const arrastar = useArrastar(escolher, subindo || desligado)

  const entrada = (
    <input
      type="file"
      accept={ACEITA}
      data-subir={lado}
      disabled={subindo || desligado}
      onChange={(e) => {
        escolher(e.target.files?.[0])
        e.target.value = ""
      }}
    />
  )

  return (
    <div className={`slot slot--${lado}`} data-lado={lado} {...arrastar.alvo}>
      <p className="slot__rot">
        <Icone nome={lado === "computador" ? "tela" : "celular"} />
        {ROTULO[lado]}
        {lado === "celular" ? <span className="slot__opcional">opcional</span> : null}
        <small>
          Ideal: <b data-ideal={lado}>{medidaEmPx(medida[lado])}</b> ·{" "}
          {lado === "computador" ? "deitada" : "em pé"}
        </small>
      </p>
      <div className="slot__corpo">
        {imagem ? (
          <div className="slot__previa" style={{ aspectRatio: proporcao }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a foto do armazenamento, do jeito que a loja corta */}
            <img
              src={imagem.url}
              alt=""
              onLoad={(e) =>
                setMedidaLida({
                  url: imagem.url,
                  l: e.currentTarget.naturalWidth,
                  a: e.currentTarget.naturalHeight,
                })
              }
            />
            {comAmostra ? (
              <span className="slot__amostra" aria-hidden="true">
                Aa
              </span>
            ) : null}
            {arrastar.arrastando ? <span className="slot__soltar">Solte pra trocar</span> : null}
          </div>
        ) : (
          <label
            className="slot__vazio"
            style={{ aspectRatio: proporcao }}
            data-desligado={desligado ? "" : undefined}
          >
            <Icone nome={subindo ? "relogio" : "mais"} />
            <span>
              {subindo
                ? "Subindo…"
                : desligado
                  ? "Primeiro a do computador"
                  : arrastar.arrastando
                    ? "Solte aqui"
                    : "Escolher"}
            </span>
            {desligado ? null : (
              <>
                <small>ou arraste pra cá</small>
                <small>JPG, PNG ou WebP</small>
              </>
            )}
            {entrada}
          </label>
        )}
        <div className="slot__lado">
          {imagem ? (
            <>
              <p className="slot__info">
                {largura && altura ? `${largura} × ${altura} px` : "Carregando…"}
                {imagem.bytes ? ` · ${tamanhoDoArquivo(imagem.bytes)}` : ""}
              </p>
              {subindo ? <p className="slot__info">Subindo a nova…</p> : null}
              {avisos.map((aviso) => (
                <p className="slot__aviso" key={aviso}>
                  <Icone nome="alerta" />
                  {aviso}
                </p>
              ))}
              <div className="slot__acoes">
                <label className="link pequeno">
                  Trocar
                  {entrada}
                </label>
                <button
                  type="button"
                  className="link pequeno"
                  data-tirar-fundo={lado}
                  onClick={tirar}
                >
                  Tirar
                </button>
              </div>
            </>
          ) : null}
          <UmPorVez varios={arrastar.varios} />
          {erro ? (
            <p className="slot__erro" role="alert">
              {erro}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
