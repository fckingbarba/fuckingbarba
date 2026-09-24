"use client"

import { useCallback, useEffect, useOptimistic, useRef, useState, useTransition } from "react"
import { useAvisar } from "@/components/avisos"
import { Icone } from "@/components/icones"
import { EditorDeSecao } from "@/components/produto/editor-de-secao"
import { mudarSecao, type MudancaNaOrdem } from "@/lib/acoes/produtos"
import {
  SECOES,
  type DetalheDoProduto,
  type IdDaSecao,
  type NoCatalogo,
  type SecaoDaPagina,
} from "@/lib/produtos"

/**
 * A PÁGINA DO PRODUTO, SEÇÃO POR SEÇÃO — na ordem do site. As setas e a
 * chave valem na hora (sem "Salvar", como no protótipo): cada clique é UMA
 * mudança, aplicada pelo Medusa sobre a ordem gravada agora. A tela já
 * mostra a mudança enquanto ela vai (`useOptimistic`); se o Medusa recusar,
 * volta sozinha.
 *
 * "Editar" abre a gaveta com o texto e a imagem de fundo da seção, neste
 * produto.
 */
export function SecoesDaPagina({
  produto,
  catalogo,
}: {
  produto: DetalheDoProduto
  catalogo: NoCatalogo[]
}) {
  const avisar = useAvisar()
  const [indo, comecar] = useTransition()
  const [secoes, aplicar] = useOptimistic(produto.secoes, mover)
  const [editando, setEditando] = useState<IdDaSecao | null>(null)
  const fechar = useCallback(() => setEditando(null), [])
  const edita = produto.podeEditar
  const ultima = secoes.length - 1

  /*
    O foco acompanha a seção que andou. O navegador o perde de dois jeitos: o
    React tira o item do lugar pra pôr no novo, ou a seta chega na ponta e
    desliga. Aí ele volta pra seta — ou pra outra, se esta desligou. Se a
    pessoa já está em outro lugar da tela, fica onde está.
  */
  const lista = useRef<HTMLUListElement>(null)
  const seta = useRef<{ id: IdDaSecao; mudanca: "subir" | "descer" } | null>(null)
  useEffect(() => {
    const alvo = seta.current
    if (!alvo || !lista.current) return
    const ativo = document.activeElement as HTMLButtonElement | null
    const perdido =
      !ativo || ativo === document.body || ativo.disabled || ativo.dataset.secao === alvo.id
    if (!perdido) return
    const botao = (m: string) =>
      lista.current!.querySelector<HTMLButtonElement>(
        `[data-secao="${alvo.id}"][data-mover="${m}"]`
      )
    const esta = botao(alvo.mudanca)
    const destino =
      esta && !esta.disabled ? esta : botao(alvo.mudanca === "subir" ? "descer" : "subir")
    if (destino && destino !== ativo) destino.focus()
  }, [secoes])

  function mudar(id: IdDaSecao, mudanca: MudancaNaOrdem) {
    seta.current = mudanca === "subir" || mudanca === "descer" ? { id, mudanca } : null
    comecar(async () => {
      aplicar({ id, mudanca })
      avisar(await mudarSecao(produto.id, id, mudanca))
    })
  }

  const aberta = editando ? secoes.find((s) => s.id === editando) : null

  return (
    <>
      <ul className="secoes" aria-busy={indo || undefined} ref={lista}>
        {secoes.map((s, i) => {
          const def = SECOES[s.id]
          const editavel = edita && def.campos.length > 0
          const desc = s.vazia
            ? s.id === "produto.antes-depois"
              ? "Sem caso neste produto — não aparece no site até alguém cadastrar."
              : "Sem texto neste produto — não aparece no site até alguém escrever."
            : (def.soCom ?? def.descricao)
          const comVideo = Boolean((s.valores as { usoVideo?: unknown } | null)?.usoVideo)
          const casos = ((s.valores as { casos?: unknown[] } | null)?.casos ?? []).length
          return (
            <li key={s.id} className="secao" data-desligada={s.ligada && !s.vazia ? undefined : ""}>
              {s.fixa ? (
                <span className="secao__trava" title="Fixa no topo">
                  <Icone nome="cadeado" />
                </span>
              ) : (
                <span className="secao__ordem">
                  <button
                    type="button"
                    aria-label={`Subir ${def.nome}`}
                    data-secao={s.id}
                    data-mover="subir"
                    disabled={!edita || i <= 1}
                    onClick={() => mudar(s.id, "subir")}
                  >
                    <Icone nome="cima" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Descer ${def.nome}`}
                    data-secao={s.id}
                    data-mover="descer"
                    disabled={!edita || i === ultima}
                    onClick={() => mudar(s.id, "descer")}
                  >
                    <Icone nome="baixo" />
                  </button>
                </span>
              )}
              <span>
                <p className="secao__nome">{def.nome}</p>
                <p className="secao__desc">{desc}</p>
                {s.vazia || s.fundo || comVideo || casos ? (
                  <span className="secao__selos">
                    {s.vazia ? <span className="selo">vazia</span> : null}
                    {s.fundo ? <span className="selo">com imagem</span> : null}
                    {comVideo ? <span className="selo">com vídeo</span> : null}
                    {casos ? (
                      <span className="selo">{casos === 1 ? "1 caso" : `${casos} casos`}</span>
                    ) : null}
                  </span>
                ) : null}
              </span>
              <span className="secao__lado">
                {editavel ? (
                  <button
                    type="button"
                    className="btn btn--fantasma"
                    data-editar={s.id}
                    onClick={() => setEditando(s.id)}
                  >
                    {s.vazia ? "Escrever" : "Editar"}
                  </button>
                ) : null}
                {s.fixa ? (
                  <span className="secao__fixa">Fixa</span>
                ) : (
                  <button
                    type="button"
                    className="chave"
                    role="switch"
                    aria-checked={s.ligada}
                    aria-label={`Mostrar ${def.nome}`}
                    data-secao={s.id}
                    disabled={!edita}
                    onClick={() => mudar(s.id, s.ligada ? "desligar" : "ligar")}
                  />
                )}
              </span>
            </li>
          )
        })}
      </ul>
      {aberta ? (
        <EditorDeSecao
          key={aberta.id}
          produto={produto}
          secao={aberta}
          catalogo={catalogo}
          fechar={fechar}
        />
      ) : null}
    </>
  )
}

/** A mesma conta do backend (`mudarNaOrdem`), só pra tela não esperar. */
function mover(
  secoes: SecaoDaPagina[],
  { id, mudanca }: { id: IdDaSecao; mudanca: MudancaNaOrdem }
): SecaoDaPagina[] {
  const i = secoes.findIndex((s) => s.id === id)
  if (i < 0 || secoes[i].fixa) return secoes
  if (mudanca === "ligar" || mudanca === "desligar")
    return secoes.map((s) => (s.id === id ? { ...s, ligada: mudanca === "ligar" } : s))
  const j = mudanca === "subir" ? i - 1 : i + 1
  if (j < 0 || j >= secoes.length || secoes[j].fixa) return secoes
  const nova = [...secoes]
  ;[nova[i], nova[j]] = [nova[j], nova[i]]
  return nova
}
