"use client"

import type { Route } from "next"
import Link from "next/link"
import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react"
import { useAvisar } from "@/components/avisos"
import { Campos, type ContextoDoFormulario } from "@/components/formulario"
import { Gaveta } from "@/components/gaveta"
import { Icone } from "@/components/icones"
import { FundoDaSecao, type EstadoDoFundo } from "@/components/produto/fundo-da-secao"
import { pedirEnvioDeVideoDaHome, salvarSecaoDaHome, subirImagemDaHome } from "@/lib/acoes/home"
import {
  abrirFormulario,
  abrirOsQueFaltam,
  oQueFalta,
  paraGravar,
  type Valores,
} from "@/lib/formulario"
import {
  CASOS_NA_HOME,
  FUNDOS_DA_HOME,
  SECOES_DA_HOME,
  type ProdutoComCasos,
  type SecaoDaHome,
} from "@/lib/home"
import { VEU, type Fundo, type NoCatalogo } from "@/lib/produtos"

/**
 * A GAVETA DE UMA SEÇÃO DA HOME — o texto dela (e as imagens: as artes do
 * banner, a foto da última chamada; e o vídeo da história da marca) e a
 * foto de fundo, num "Salvar" só, que vai pro RASCUNHO: o site só muda no
 * "Publicar". A da "Prova social" mostra também de onde vêm os casos: das
 * páginas dos produtos.
 *
 * Os campos saem da definição da seção (`SECOES_DA_HOME`, em `lib/home.ts`)
 * e são desenhados pelo formulário comum (`components/formulario.tsx`, o
 * mesmo da página do produto). Quem confere se está completo é o Medusa,
 * que devolve o que falta — e aqui o que falta fica marcado.
 *
 * "Voltar ao texto original" põe no formulário o texto de fábrica (o que a
 * loja tinha quando a home saiu do código); vale depois do "Salvar", como
 * qualquer outra mudança.
 */
export function EditorDaHome({
  secao,
  catalogo,
  provas,
  fechar,
}: {
  secao: SecaoDaHome
  catalogo: NoCatalogo[]
  provas: ProdutoComCasos[]
  fechar: () => void
}) {
  const def = SECOES_DA_HOME[secao.id]
  const medidaDoFundo = secao.aceitaFundo ? FUNDOS_DA_HOME[secao.id] : undefined
  const avisar = useAvisar()
  const base = useId()
  const formulario = useRef<HTMLFormElement>(null)
  const [valores, setValores] = useState<Valores>(() => abrirFormulario(def.campos, secao.valores))
  const [faltando, setFaltando] = useState<string[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [voltou, setVoltou] = useState(false)
  const [fundo, setFundo] = useState<EstadoDoFundo>(() => ({
    computador: secao.fundo ? { url: secao.fundo.imagem } : null,
    celular: secao.fundo?.imagemCelular ? { url: secao.fundo.imagemCelular } : null,
    veu: secao.fundo?.veu ?? VEU.padrao,
  }))
  const [subindoFundo, setSubindoFundo] = useState(false)
  const [subindoCampos, setSubindoCampos] = useState(0)
  const subindo = subindoFundo || subindoCampos > 0
  const [salvando, comecar] = useTransition()
  const [foco, setFoco] = useState<string | null>(null)

  useEffect(() => {
    if (!foco || !formulario.current) return
    formulario.current.querySelector<HTMLElement>(foco)?.focus()
    setFoco(null)
  }, [foco])

  function salvar(ev: FormEvent) {
    ev.preventDefault()
    if (subindo || salvando) return
    comecar(async () => {
      const r = await salvarSecaoDaHome(
        secao.id,
        paraGravar(def.campos, valores),
        medidaDoFundo ? fundoParaGravar(fundo) : undefined
      )
      if (r.ok) {
        avisar(r)
        fechar()
        return
      }
      const falta = r.faltando ?? []
      setErro(
        falta.length
          ? `Falta preencher: ${[...new Set(falta.map((f) => oQueFalta(def.campos, f)))].join(", ")}.`
          : r.texto
      )
      setFaltando(falta)
      if (falta.length) {
        setValores((v) => abrirOsQueFaltam(def.campos, v, falta))
        setFoco('[aria-invalid="true"], [data-falta]')
      }
    })
  }

  function voltarAoOriginal() {
    setValores(abrirFormulario(def.campos, secao.padrao))
    setFaltando([])
    setErro(null)
    setVoltou(true)
  }

  const contexto: ContextoDoFormulario = {
    base,
    faltando: new Set(faltando),
    catalogo,
    subir: subirImagemDaHome,
    video: { subirCapa: subirImagemDaHome, pedirEnvio: pedirEnvioDeVideoDaHome },
    mudar: setValores,
    focar: setFoco,
    aoSubir: (delta) => setSubindoCampos((n) => Math.max(0, n + delta)),
  }

  return (
    <Gaveta titulo={def.nome} fechar={fechar}>
      <form onSubmit={salvar} noValidate ref={formulario} data-editor={secao.id}>
        <p className="gaveta__produto">
          Vai pro <b>rascunho</b>: o site só muda quando alguém apertar “Publicar”.
        </p>
        <div className="campos">
          <Campos campos={def.campos} caminho={[]} valores={valores} ctx={contexto} />
        </div>
        {secao.id === "home.provas" ? <CasosDosProdutos provas={provas} /> : null}
        {medidaDoFundo ? (
          <FundoDaSecao
            subir={subirImagemDaHome}
            medida={medidaDoFundo}
            valor={fundo}
            mudar={setFundo}
            aoSubir={setSubindoFundo}
          />
        ) : null}
        {secao.propria || voltou ? (
          <p className="pequeno suave" style={{ margin: "14px 0 0" }}>
            {voltou ? (
              <>O formulário voltou ao texto original. Salve pra valer.</>
            ) : (
              <button
                type="button"
                className="link"
                data-voltar-ao-original
                onClick={voltarAoOriginal}
              >
                Voltar ao texto original
              </button>
            )}
          </p>
        ) : null}
        {erro ? (
          <p className="gaveta__erro" role="alert">
            <Icone nome="alerta" />
            {erro}
          </p>
        ) : null}
        <div className="form-acoes">
          <button type="button" className="btn btn--fantasma" onClick={fechar}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn--menor"
            disabled={subindo || salvando}
            aria-busy={salvando || undefined}
          >
            {subindo ? "Esperando subir…" : salvando ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </Gaveta>
  )
}

/**
 * De onde vêm os casos da "Prova social": os produtos no site com caso de
 * antes e depois, cada um com a foto do "depois", o nome e o tempo. O link
 * leva pra página do produto, onde o caso se edita.
 */
function CasosDosProdutos({ provas }: { provas: ProdutoComCasos[] }) {
  const total = provas.reduce((n, p) => n + p.casos.length, 0)
  return (
    <div className="campo casos-da-home" data-casos-da-home>
      <span className="campo__rot">Os casos, hoje</span>
      {provas.length ? (
        <>
          <ul>
            {provas.map((p) => (
              <li key={p.id}>
                <Link className="link" href={`/produtos/${p.id}` as Route}>
                  {p.nome}
                </Link>
                <ul>
                  {p.casos.map((c, i) => (
                    <li key={`${c.foto}-${i}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- a foto do armazenamento */}
                      <img src={c.foto} alt="" loading="lazy" />
                      <span>
                        {c.nome} <small>· {c.tempo}</small>
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {total > CASOS_NA_HOME ? (
            <p className="campo__ajuda">
              São {total}: a home mostra {CASOS_NA_HOME}, alternando os produtos.
            </p>
          ) : null}
        </>
      ) : (
        <p className="campo__ajuda">
          Nenhum ainda — e sem caso a seção não aparece no site. O caso entra pela página do
          produto: Produtos → o produto → Antes e depois.
        </p>
      )}
    </div>
  )
}

/** O fundo que vai pro Medusa: sem a foto do computador, não há fundo (a do celular é extra dela). */
function fundoParaGravar(f: EstadoDoFundo): Fundo | null {
  if (!f.computador) return null
  return {
    imagem: f.computador.url,
    ...(f.celular ? { imagemCelular: f.celular.url } : {}),
    veu: f.veu,
  }
}
