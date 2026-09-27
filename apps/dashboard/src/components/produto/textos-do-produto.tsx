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

/** A mesma lista, sem olhar a ordem. */
const mesmas = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))

/**
 * OS TEXTOS DO PRODUTO — o nome da loja (o título da página e da vitrine), o
 * subtítulo (a linha embaixo do nome, na página e no card), as categorias (as
 * vitrines em que ele aparece: Barba, Cabelo, Kits) e a descrição no Google
 * (o que aparece embaixo do nome na busca). A descrição vem do Bling e só
 * aparece.
 *
 * O NOME é da loja: mudado aqui, a importação do Bling não troca mais — o
 * Bling segue com o dele (a nota, os marketplaces). "Usar o do Bling" devolve.
 *
 * AS CATEGORIAS (entrega 0151): a PRINCIPAL é a de sempre — a da trilha no
 * topo da página e a do Google —, e o "Aparece também em" põe o produto na
 * vitrine de outras (o kit de barba em Kits e em Barba). Sem a principal, as
 * outras ficam travadas; a principal nunca aparece entre as outras.
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
  const gravadasTambem = produto.tambemEmIds ?? []
  const [tambemEm, setTambemEm] = useState(gravadasTambem)
  const [descricaoGoogle, setDescricaoGoogle] = useState(produto.descricaoGoogle)
  const edita = produto.podeEditar
  const mudou =
    juntar(nome) !== produto.nome ||
    juntar(subtitulo) !== produto.subtitulo ||
    categoriaId !== (produto.categoriaId ?? "") ||
    !mesmas(tambemEm, gravadasTambem) ||
    juntar(descricaoGoogle) !== produto.descricaoGoogle
  const id = `textos-${produto.id}`
  const tamanho = juntar(nome).length
  const doBling = produto.nomeNoBling
  const noGoogle = juntar(descricaoGoogle).length
  const outras = categorias.filter((c) => c.id !== categoriaId)

  function trocarPrincipal(nova: string) {
    setCategoriaId(nova)
    // A principal não é "também": sai das outras. Sem principal, nenhuma outra.
    setTambemEm((antes) => (nova ? antes.filter((c) => c !== nova) : []))
  }

  function salvar(ev: FormEvent) {
    ev.preventDefault()
    if (!mudou || salvando) return
    comecar(async () => {
      avisar(
        await salvarTextos(produto.id, {
          nome,
          subtitulo,
          categoriaId,
          tambemEm: categoriaId ? tambemEm : [],
          descricaoGoogle,
        })
      )
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
          <label htmlFor={`${id}-cat`}>Categoria principal</label>
          <select
            id={`${id}-cat`}
            data-categoria
            value={categoriaId}
            disabled={!edita}
            onChange={(e) => trocarPrincipal(e.target.value)}
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
        {outras.length ? (
          <fieldset className="campo" data-tambem-em aria-describedby={`${id}-tambem-ajuda`}>
            <legend className="campo__rot">Aparece também em</legend>
            <div className="categorias-tambem" data-travado={!edita || !categoriaId || undefined}>
              {outras.map((c) => (
                <label className="marcar" key={c.id}>
                  <input
                    type="checkbox"
                    data-tambem={c.nome}
                    checked={Boolean(categoriaId) && tambemEm.includes(c.id)}
                    disabled={!edita || !categoriaId}
                    onChange={(e) => {
                      const marcou = e.target.checked
                      setTambemEm((antes) =>
                        marcou ? [...antes, c.id] : antes.filter((x) => x !== c.id)
                      )
                    }}
                  />
                  {c.nome}
                </label>
              ))}
            </div>
            <p className="campo__ajuda" id={`${id}-tambem-ajuda`}>
              {categoriaId
                ? "O produto entra também na aba destas. A principal é a do caminho no topo da página e a do Google."
                : "Escolha a categoria principal primeiro."}
            </p>
          </fieldset>
        ) : null}
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
      ) : null}
    </form>
  )
}
