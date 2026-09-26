"use client"

import { useState, useTransition, type ReactNode } from "react"
import { EVENTO_SACOLA, useSacola } from "@/components/sacola/contexto"
import { adicionar, type Resultado } from "@/lib/acoes/carrinho"
import { SEM_CONEXAO, semQueda } from "@/lib/rede"

/**
 * O "COMPRAR" DA VITRINE — põe uma unidade na sacola e abre a gaveta, sem
 * sair de onde a pessoa está (pedido da loja em 23/09). Antes ele levava pra
 * página do produto, e comprar custava uma página e um clique a mais.
 *
 * O caminho é o da dobra da PDP: a gaveta abre NO CLIQUE, com a foto, o
 * nome e o preço que o card já mostra (`previa`), e o total da sacola espera
 * o Medusa (o `adicionar` do contexto, entrega 0104) — adicionar sem ver a
 * sacola deixa a pessoa sem saber se deu certo. Sem a prévia, ou fora do
 * provedor, espera a ação e avisa pelo `EVENTO_SACOLA`, como antes.
 *
 * Quem decide se o produto vai direto é o servidor (`varianteDoCard`, em
 * `lib/medusa.ts`). Com mais de uma variação, ou sem estoque, quem chama
 * mostra o link pra página do produto no lugar deste botão.
 */
export function BotaoComprar({
  varianteId,
  nome,
  previa,
  className,
  rotulo = "Comprar",
  icone,
}: {
  varianteId: string
  /** Pro leitor de tela: "Comprar" doze vezes na grade não diz o quê. */
  nome: string
  /** O que o card mostra, pra linha entrar na sacola no clique. */
  previa?: { handle: string | null; imagem: string | null; preco: number }
  className: string
  rotulo?: string
  icone: ReactNode
}) {
  const [indo, comecar] = useTransition()
  const [erro, setErro] = useState("")
  const sacola = useSacola()

  function comprar() {
    setErro("")
    const chamar = () => adicionar(varianteId, 1)
    // No clique, fora da transição: dentro dela a gaveta só abriria com a
    // resposta (ver a dobra, `compra.tsx`). A transição só espera.
    const feito =
      sacola && previa
        ? sacola.adicionar(
            [
              {
                varianteId,
                nome,
                handle: previa.handle,
                imagem: previa.imagem,
                quantidade: 1,
                precoUnitario: previa.preco,
              },
            ],
            chamar
          )
        : null
    comecar(async () => {
      const r = feito
        ? await feito
        : await semQueda(chamar, (): Resultado => ({
            ok: false,
            erro: SEM_CONEXAO,
            carrinho: null,
          }))
      if (!r.ok) {
        setErro(r.erro)
        return
      }
      if (!feito) window.dispatchEvent(new CustomEvent(EVENTO_SACOLA, { detail: r.carrinho }))
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
