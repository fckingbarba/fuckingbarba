"use client"

import { useCallback, useEffect, useOptimistic, useRef, useState, useTransition } from "react"
import { useAvisar } from "@/components/avisos"
import { EditorDaHome } from "@/components/home/editor-da-home"
import { Icone } from "@/components/icones"
import { mudarSecaoDaHome } from "@/lib/acoes/home"
import type { MudancaNaOrdem } from "@/lib/acoes/produtos"
import { SECOES_DA_HOME, type IdDaSecaoDaHome, type SecaoDaHome } from "@/lib/home"
import type { NoCatalogo } from "@/lib/produtos"

/**
 * AS SEÇÕES DA HOME — na ordem do rascunho, como no protótipo. As setas e a
 * chave valem na hora, mas NO RASCUNHO: a loja só muda no "Publicar". A tela
 * já mostra a mudança enquanto ela vai (`useOptimistic`); se o Medusa
 * recusar, volta sozinha.
 *
 * O bloco escuro (o título da home pro Google) é fixo e fica no MEIO da
 * página: quem desce da quarta posição passa por cima dele, e ele não sai do
 * lugar — a mesma conta da loja.
 */
export function SecoesDaHome({
  secoes: gravadas,
  catalogo,
}: {
  secoes: SecaoDaHome[]
  catalogo: NoCatalogo[]
}) {
  const avisar = useAvisar()
  const [indo, comecar] = useTransition()
  const [secoes, aplicar] = useOptimistic(gravadas, mover)
  const [editando, setEditando] = useState<IdDaSecaoDaHome | null>(null)
  const fechar = useCallback(() => setEditando(null), [])
  const soltas = secoes.filter((s) => !s.fixa)

  /*
    O foco acompanha a seção que andou (o React tira o item do lugar pra pôr
    no novo, e a seta que chega na ponta desliga). Se a pessoa já está em
    outro lugar da tela, fica onde está.
  */
  const lista = useRef<HTMLUListElement>(null)
  const seta = useRef<{ id: IdDaSecaoDaHome; mudanca: "subir" | "descer" } | null>(null)
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

  function mudar(id: IdDaSecaoDaHome, mudanca: MudancaNaOrdem) {
    seta.current = mudanca === "subir" || mudanca === "descer" ? { id, mudanca } : null
    comecar(async () => {
      aplicar({ id, mudanca })
      avisar(await mudarSecaoDaHome(id, mudanca))
    })
  }

  const aberta = editando ? secoes.find((s) => s.id === editando) : null

  return (
    <>
      <ul className="secoes" aria-busy={indo || undefined} ref={lista}>
        {secoes.map((s) => {
          const def = SECOES_DA_HOME[s.id]
          const j = soltas.indexOf(s)
          return (
            <li key={s.id} className="secao" data-desligada={s.ligada ? undefined : ""}>
              {s.fixa ? (
                <span className="secao__trava" title="Fixa: é o título da home pro Google">
                  <Icone nome="cadeado" />
                </span>
              ) : (
                <span className="secao__ordem">
                  <button
                    type="button"
                    aria-label={`Subir ${def.nome}`}
                    data-secao={s.id}
                    data-mover="subir"
                    disabled={j <= 0}
                    onClick={() => mudar(s.id, "subir")}
                  >
                    <Icone nome="cima" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Descer ${def.nome}`}
                    data-secao={s.id}
                    data-mover="descer"
                    disabled={j === soltas.length - 1}
                    onClick={() => mudar(s.id, "descer")}
                  >
                    <Icone nome="baixo" />
                  </button>
                </span>
              )}
              <span>
                <p className="secao__nome">{def.nome}</p>
                <p className="secao__desc">{def.descricao}</p>
                {s.mudou || s.propria ? (
                  <span className="secao__selos">
                    {s.mudou ? (
                      <span className="selo selo--pendente" data-pendente>
                        não publicado
                      </span>
                    ) : null}
                    {s.propria ? <span className="selo">texto próprio</span> : null}
                  </span>
                ) : null}
              </span>
              <span className="secao__lado">
                <button
                  type="button"
                  className="btn btn--fantasma"
                  data-editar={s.id}
                  onClick={() => setEditando(s.id)}
                >
                  Editar
                </button>
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
                    onClick={() => mudar(s.id, s.ligada ? "desligar" : "ligar")}
                  />
                )}
              </span>
            </li>
          )
        })}
      </ul>
      {aberta ? (
        <EditorDaHome key={aberta.id} secao={aberta} catalogo={catalogo} fechar={fechar} />
      ) : null}
    </>
  )
}

/**
 * A mesma conta do backend (`mudarNaOrdemDaHome`), só pra tela não esperar:
 * as soltas trocam de lugar entre elas, e a fixa fica onde está.
 */
function mover(
  secoes: SecaoDaHome[],
  { id, mudanca }: { id: IdDaSecaoDaHome; mudanca: MudancaNaOrdem }
): SecaoDaHome[] {
  const alvo = secoes.find((s) => s.id === id)
  if (!alvo || alvo.fixa) return secoes
  if (mudanca === "ligar" || mudanca === "desligar")
    return secoes.map((s) => (s.id === id ? { ...s, ligada: mudanca === "ligar" } : s))
  const soltas = secoes.filter((s) => !s.fixa)
  const i = soltas.indexOf(alvo)
  const j = mudanca === "subir" ? i - 1 : i + 1
  if (j < 0 || j >= soltas.length) return secoes
  ;[soltas[i], soltas[j]] = [soltas[j]!, soltas[i]!]
  const nova = [...soltas]
  secoes.forEach((s, k) => {
    if (s.fixa) nova.splice(k, 0, s)
  })
  return nova
}
