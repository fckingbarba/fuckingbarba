"use client"

import { useState, useTransition, type ReactNode } from "react"
import { EVENTO_SACOLA } from "@/components/sacola/contexto"
import { adicionar, type Resultado } from "@/lib/acoes/carrinho"
import { SEM_CONEXAO, semQueda } from "@/lib/rede"

/**
 * O "COMPRAR" DA VITRINE — põe uma unidade na sacola e abre a gaveta, sem
 * sair de onde a pessoa está (pedido da loja em 23/09). Antes ele levava pra
 * página do produto, e comprar custava uma página e um clique a mais.
 *
 * O caminho é o da dobra da PDP: a ação devolve o carrinho, o evento
 * `EVENTO_SACOLA` entrega pro provedor, e a gaveta abre com ele — adicionar
 * sem ver a sacola deixa a pessoa sem saber se deu certo.
 *
 * Quem decide se o produto vai direto é o servidor (`varianteDoCard`, em
 * `lib/medusa.ts`). Com mais de uma variação, ou sem estoque, quem chama
 * mostra o link pra página do produto no lugar deste botão.
 */
export function BotaoComprar({
  varianteId,
  nome,
  className,
  rotulo = "Comprar",
  icone,
}: {
  varianteId: string
  /** Pro leitor de tela: "Comprar" doze vezes na grade não diz o quê. */
  nome: string
  className: string
  rotulo?: string
  icone: ReactNode
}) {
  const [indo, comecar] = useTransition()
  const [erro, setErro] = useState("")

  function comprar() {
    setErro("")
    comecar(async () => {
      const r = await semQueda(
        () => adicionar(varianteId, 1),
        (): Resultado => ({ ok: false, erro: SEM_CONEXAO, carrinho: null })
      )
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      window.dispatchEvent(new CustomEvent(EVENTO_SACOLA, { detail: r.carrinho }))
    })
  }

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={comprar}
        disabled={indo}
        aria-busy={indo || undefined}
        data-comprar={varianteId}
      >
        {indo ? "Adicionando…" : rotulo}
        <span className="sr-only"> {nome}</span>
        {icone}
      </button>
      {/* Sempre no HTML, mesmo vazio: região viva que nasce junto com o
          texto costuma não ser anunciada (ver `recados.css`). */}
      <p className="comprar__recado" role="status">
        {erro}
      </p>
    </>
  )
}
