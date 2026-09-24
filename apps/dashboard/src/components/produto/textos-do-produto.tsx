"use client"

import { useState, useTransition, type FormEvent } from "react"
import { useAvisar } from "@/components/avisos"
import { salvarTextos } from "@/lib/acoes/produtos"
import type { Categoria, DetalheDoProduto } from "@/lib/produtos"

/** A linha embaixo do nome: curta (o mesmo limite do backend). */
const LIMITE_DO_SUBTITULO = 120

/**
 * OS TEXTOS DO PRODUTO — o nome e a descrição vêm do Bling e só aparecem;
 * daqui são o subtítulo (a linha embaixo do nome, na página e no card) e a
 * categoria (a vitrine em que ele aparece: Barba, Cabelo, Kits).
 */
export function TextosDoProduto({
  produto,
  categorias,
}: {
  produto: DetalheDoProduto
  categorias: Categoria[]
}) {
  const avisar = useAvisar()
  const [salvando, comecar] = useTransition()
  const [subtitulo, setSubtitulo] = useState(produto.subtitulo)
  const [categoriaId, setCategoriaId] = useState(produto.categoriaId ?? "")
  const edita = produto.podeEditar
  const mudou =
    subtitulo.replace(/\s+/g, " ").trim() !== produto.subtitulo ||
    categoriaId !== (produto.categoriaId ?? "")
  const id = `textos-${produto.id}`

  function salvar(ev: FormEvent) {
    ev.preventDefault()
    if (!mudou || salvando) return
    comecar(async () => {
      avisar(await salvarTextos(produto.id, { subtitulo, categoriaId }))
    })
  }

  return (
    <form className="bloco" onSubmit={salvar} data-textos>
      <div className="bloco__cabeca">
        <h2 className="bloco__titulo">Textos</h2>
      </div>
      <div className="campos">
        <div className="campo">
          <label htmlFor={`${id}-nome`}>
            Nome <small>— vem do Bling</small>
          </label>
          <input id={`${id}-nome`} value={produto.nome} readOnly />
        </div>
        <div className="campo">
          <label htmlFor={`${id}-sub`}>
            Subtítulo <small>— a linha embaixo do nome</small>
          </label>
          <input
            id={`${id}-sub`}
            data-subtitulo
            value={subtitulo}
            maxLength={LIMITE_DO_SUBTITULO}
            placeholder="Ex.: Maciez e brilho sem pesar"
            readOnly={!edita}
            onChange={(e) => setSubtitulo(e.target.value)}
          />
        </div>
        <div className="campo campo--3">
          <label htmlFor={`${id}-cat`}>Categoria</label>
          <select
            id={`${id}-cat`}
            data-categoria
            value={categoriaId}
            disabled={!edita}
            onChange={(e) => setCategoriaId(e.target.value)}
          >
            <option value="">Sem categoria</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="campo campo--3">
          <label htmlFor={`${id}-end`}>Endereço no site</label>
          <input id={`${id}-end`} value={`/produtos/${produto.handle}`} readOnly />
        </div>
        <div className="campo">
          <label htmlFor={`${id}-desc`}>
            Descrição <small>— vem do Bling; é o que o Google lê</small>
          </label>
          <textarea id={`${id}-desc`} value={produto.descricao} readOnly rows={4} />
        </div>
      </div>
      {edita ? (
        <div className="form-acoes">
          <span className={`pequeno${mudou ? "" : " suave"}`}>
            {mudou ? (
              <b>Mudou e ainda não salvou.</b>
            ) : (
              "A página do produto atualiza em alguns segundos."
            )}
          </span>
          <button
            type="submit"
            className="btn btn--menor"
            disabled={!mudou || salvando}
            aria-busy={salvando || undefined}
          >
            {salvando ? "Salvando…" : "Salvar"}
          </button>
        </div>
      ) : (
        <p className="pequeno suave" style={{ margin: "14px 0 0" }}>
          A operação vê o produto; quem edita é o marketing ou o dono.
        </p>
      )}
    </form>
  )
}
