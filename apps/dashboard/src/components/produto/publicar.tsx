"use client"

import { useState, useTransition } from "react"
import { useAvisar } from "@/components/avisos"
import { Icone } from "@/components/icones"
import { publicar } from "@/lib/acoes/produtos"
import type { DetalheDoProduto } from "@/lib/produtos"

/**
 * "PUBLICAR NO SITE" — o rascunho vai pra loja. Todo SKU novo chega do Bling
 * assim, pra alguém revisar antes. Sem preço o Medusa não deixa; sem foto ou
 * sem categoria deixa, mas a tela pergunta antes: a vitrine, o Google e o
 * link no WhatsApp ficariam sem imagem, e o produto fora das categorias.
 */
export function Publicar({ produto }: { produto: DetalheDoProduto }) {
  const avisar = useAvisar()
  const [indo, comecar] = useTransition()
  const [perguntando, setPerguntando] = useState(false)
  const faltam = [
    ...(produto.fotos.length ? [] : ["foto"]),
    ...(produto.categoriaId ? [] : ["categoria"]),
  ]

  const ir = () =>
    comecar(async () => {
      setPerguntando(false)
      avisar(await publicar(produto.id))
    })

  if (perguntando)
    return (
      <div className="publicar-pergunta" role="group" aria-label="Publicar sem tudo">
        <p className="pequeno">Está sem {faltam.join(" e sem ")}. Publicar mesmo assim?</p>
        <button type="button" className="btn btn--menor" onClick={ir} disabled={indo}>
          Publicar mesmo assim
        </button>
        <button type="button" className="btn btn--fantasma" onClick={() => setPerguntando(false)}>
          Agora não
        </button>
      </div>
    )

  return (
    <button
      type="button"
      className="btn btn--menor"
      data-publicar
      disabled={indo || !produto.preco}
      aria-busy={indo || undefined}
      title={produto.preco ? undefined : "Sem preço no Bling"}
      onClick={() => (faltam.length ? setPerguntando(true) : ir())}
    >
      <Icone nome="raio" />
      {indo ? "Publicando…" : "Publicar no site"}
    </button>
  )
}
