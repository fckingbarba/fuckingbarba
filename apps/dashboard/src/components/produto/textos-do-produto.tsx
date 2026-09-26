"use client"

import { useState, useTransition, type FormEvent } from "react"
import { useAvisar } from "@/components/avisos"
import { salvarTextos } from "@/lib/acoes/produtos"
import type { Categoria, DetalheDoProduto } from "@/lib/produtos"

/** A linha embaixo do nome: curta (o mesmo limite do backend). */
const LIMITE_DO_SUBTITULO = 120
/** A descrição no Google: o mesmo limite do backend (`LIMITE_DA_DESCRICAO`). */
const LIMITE_DA_DESCRICAO = 160
/** A busca mostra mais ou menos até aqui; o resto some em "…". */
const CABE_NO_GOOGLE = 155
/** O nome: o mesmo limite do backend (`LIMITE_DO_NOME`). */
const LIMITE_DO_NOME = 80
/**
 * Até aqui, o nome cabe em 2 linhas no título da página — medido em 25/09 com
 * a fonte da loja, do celular de 360 px ao computador. Depende das palavras:
 * acima disso, a tela avisa, mas deixa salvar.
 */
const CABE_EM_DUAS = 36

const juntar = (s: string) => s.replace(/\s+/g, " ").trim()

/**
 * OS TEXTOS DO PRODUTO — o nome da loja (o título da página e da vitrine), o
 * subtítulo (a linha embaixo do nome, na página e no card) e a categoria (a
 * vitrine em que ele aparece: Barba, Cabelo, Kits) e a descrição no Google
 * (o que aparece embaixo do nome na busca). A descrição vem do Bling e só
 * aparece.
 *
 * O NOME é da loja: mudado aqui, a importação do Bling não troca mais — o
 * Bling segue com o dele (a nota, os marketplaces). "Usar o do Bling" devolve.
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
  const [nome, setNome] = useState(produto.nome)
  const [subtitulo, setSubtitulo] = useState(produto.subtitulo)
  const [categoriaId, setCategoriaId] = useState(produto.categoriaId ?? "")
  const [descricaoGoogle, setDescricaoGoogle] = useState(produto.descricaoGoogle)
  const edita = produto.podeEditar
  const mudou =
    juntar(nome) !== produto.nome ||
    juntar(subtitulo) !== produto.subtitulo ||
    categoriaId !== (produto.categoriaId ?? "") ||
    juntar(descricaoGoogle) !== produto.descricaoGoogle
  const id = `textos-${produto.id}`
  const tamanho = juntar(nome).length
  const doBling = produto.nomeNoBling
  const noGoogle = juntar(descricaoGoogle).length

  function salvar(ev: FormEvent) {
    ev.preventDefault()
    if (!mudou || salvando) return
    comecar(async () => {
      avisar(await salvarTextos(produto.id, { nome, subtitulo, categoriaId, descricaoGoogle }))
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
            Nome na loja <small>— o título da página e da vitrine</small>
          </label>
          <input
            id={`${id}-nome`}
            data-nome
            value={nome}
            maxLength={LIMITE_DO_NOME}
            readOnly={!edita}
            aria-describedby={`${id}-nome-ajuda`}
            onChange={(e) => setNome(e.target.value)}
          />
          <p className="campo__ajuda" id={`${id}-nome-ajuda`} data-nome-ajuda>
            {tamanho} letras —{" "}
            {tamanho > CABE_EM_DUAS ? (
              <b>pode passar de 2 linhas no título da página.</b>
            ) : (
              "cabe em 2 linhas no título da página."
            )}{" "}
            {produto.nomeDaLoja
              ? "O Bling não troca este nome."
              : "Enquanto for o do Bling, ele muda quando o catálogo vem de novo."}
            {doBling && juntar(nome) !== doBling ? (
              <>
                {" "}
                No Bling: “{doBling}”.{" "}
                {edita ? (
                  <button
                    type="button"
                    className="link"
                    data-usar-o-do-bling
                    onClick={() => setNome(doBling)}
                  >
                    Usar o do Bling
                  </button>
                ) : null}
              </>
            ) : null}
          </p>
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
          <label htmlFor={`${id}-google`}>
            Descrição no Google <small>— o que aparece embaixo do nome, na busca</small>
          </label>
          <textarea
            id={`${id}-google`}
            data-descricao-google
            value={descricaoGoogle}
            maxLength={LIMITE_DA_DESCRICAO}
            rows={3}
            readOnly={!edita}
            placeholder="Ex.: Óleo para barba com argan e vitamina E: macia, sem frizz e sem ficar oleosa."
            aria-describedby={`${id}-google-ajuda`}
            onChange={(e) => setDescricaoGoogle(e.target.value)}
          />
          <p className="campo__ajuda" id={`${id}-google-ajuda`}>
            {noGoogle
              ? `${noGoogle} letras — ${noGoogle > CABE_NO_GOOGLE ? "o fim pode sumir em “…” na busca." : "cabe inteira na busca."}`
              : "Em branco, o Google mostra o começo da descrição do Bling."}
          </p>
        </div>
        <div className="campo">
          <label htmlFor={`${id}-desc`}>
            Descrição <small>— vem do Bling</small>
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
