"use client"

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react"
import { useAvisar } from "@/components/avisos"
import { Campos, type ContextoDoFormulario } from "@/components/formulario"
import { Gaveta } from "@/components/gaveta"
import { Icone } from "@/components/icones"
import { FundoDaSecao, type EstadoDoFundo } from "@/components/produto/fundo-da-secao"
import { salvarSecao } from "@/lib/acoes/produtos"
import {
  abrirFormulario,
  abrirOsQueFaltam,
  oQueFalta,
  paraGravar,
  type Valores,
} from "@/lib/formulario"
import {
  SECOES,
  VEU,
  type DetalheDoProduto,
  type Fundo,
  type NoCatalogo,
  type SecaoDaPagina,
} from "@/lib/produtos"

/**
 * A GAVETA DE UMA SEÇÃO — o texto dela e a imagem de fundo, neste produto,
 * num "Salvar" só.
 *
 * Os campos saem da definição da seção (`SECOES`, em `lib/produtos.ts`) e
 * são desenhados pelo formulário comum (`components/formulario.tsx`, o
 * mesmo da home). Nada vai pro site antes do "Salvar"; quem confere se está
 * completo é o Medusa, que devolve o que falta — e aqui o que falta fica
 * marcado, com o nome da tela.
 */

export function EditorDeSecao({
  produto,
  secao,
  catalogo,
  fechar,
}: {
  produto: DetalheDoProduto
  secao: SecaoDaPagina
  catalogo: NoCatalogo[]
  fechar: () => void
}) {
  const def = SECOES[secao.id]
  const avisar = useAvisar()
  const base = useId()
  const formulario = useRef<HTMLFormElement>(null)
  const [valores, setValores] = useState<Valores>(() => abrirFormulario(def.campos, secao.valores))
  const [fundo, setFundo] = useState<EstadoDoFundo>(() => ({
    computador: secao.fundo ? { url: secao.fundo.imagem } : null,
    celular: secao.fundo?.imagemCelular ? { url: secao.fundo.imagemCelular } : null,
    veu: secao.fundo?.veu ?? VEU.padrao,
  }))
  const [subindoFundo, setSubindoFundo] = useState(false)
  const [subindoCampos, setSubindoCampos] = useState(0)
  const subindo = subindoFundo || subindoCampos > 0
  const [faltando, setFaltando] = useState<string[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, comecar] = useTransition()
  const [foco, setFoco] = useState<string | null>(null)

  useEffect(() => {
    if (!foco || !formulario.current) return
    formulario.current.querySelector<HTMLElement>(foco)?.focus()
    setFoco(null)
  }, [foco])

  const comFundo = Boolean(def.fundo && secao.aceitaFundo)
  const temTexto = def.campos.some((c) => c.tipo !== "nota")

  function salvar(ev: FormEvent) {
    ev.preventDefault()
    if (subindo || salvando) return
    comecar(async () => {
      const r = await salvarSecao(
        produto.id,
        secao.id,
        paraGravar(def.campos, valores),
        comFundo ? fundoParaGravar(fundo) : undefined
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
      // O item de grupo que tem campo faltando abre, pra ele aparecer marcado.
      if (falta.length) {
        setValores((v) => abrirOsQueFaltam(def.campos, v, falta))
        setFoco('[aria-invalid="true"], [data-falta]')
      }
    })
  }

  const contexto: ContextoDoFormulario = {
    base,
    faltando: new Set(faltando),
    produto,
    catalogo,
    mudar: setValores,
    focar: setFoco,
    aoSubir: (delta) => setSubindoCampos((n) => Math.max(0, n + delta)),
  }

  return (
    <Gaveta titulo={def.nome} fechar={fechar}>
      <form onSubmit={salvar} noValidate ref={formulario} data-editor={secao.id}>
        <p className="gaveta__produto">
          Neste produto: <b>{produto.nome}</b>
        </p>
        {def.realce ? (
          <p className="dica-realce">
            Pra destacar uma palavra {def.realce}, escreva entre asteriscos: <code>*sua cara*</code>{" "}
            vira <b>sua cara</b>.
          </p>
        ) : null}
        {temTexto ? (
          <div className="campos">
            <Campos campos={def.campos} caminho={[]} valores={valores} ctx={contexto} />
          </div>
        ) : null}
        {comFundo && def.fundo ? (
          <FundoDaSecao
            produtoId={produto.id}
            medida={def.fundo}
            valor={fundo}
            mudar={setFundo}
            aoSubir={setSubindoFundo}
          />
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

/** O fundo que vai pro Medusa: sem a foto do computador, não há fundo (a do celular é extra dela). */
function fundoParaGravar(f: EstadoDoFundo): Fundo | null {
  if (!f.computador) return null
  return {
    imagem: f.computador.url,
    ...(f.celular ? { imagemCelular: f.celular.url } : {}),
    veu: f.veu,
  }
}
