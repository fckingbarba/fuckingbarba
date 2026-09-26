"use client"

import Image from "next/image"
import Link from "next/link"
import { useMemo, type MouseEvent } from "react"
import { useFrete } from "@/components/configuracoes/contexto"
import { Mais, Raio } from "@/components/icones"
import { useSacola } from "@/components/sacola/contexto"
import { adicionar } from "@/lib/acoes/carrinho"
import type { SugestaoDaSacola } from "@/lib/carrinho-visivel"
import { faltaPraPromocao } from "@/lib/configuracoes"
import { emReais } from "@/lib/formato"
import { escolherLevaJunto, sacolaDe, type ModeloDeRecomendacao } from "@/lib/recomendacao"

/**
 * O "LEVA JUNTO" DA GAVETA — o cross-sell do protótipo da loja
 * (`ferramentas/porte/prototipo.html`): até três produtos que ainda não estão
 * na sacola, cada um com foto, preço e "+ Adicionar".
 *
 * QUEM ESCOLHE É O MOTOR DE RECOMENDAÇÃO (`escolherLevaJunto`, em
 * `lib/recomendacao.ts`): o que combina com o que já está na sacola — pelos
 * pedidos da loja e pela rotina da PDP —, com peso a mais pra quem sozinho
 * fecha o frete grátis (e a etiqueta no primeiro deles). Nada fixo, e nada
 * pra escolher no admin.
 *
 * A LISTA E O MODELO VÊM PRONTOS DO SERVIDOR (`vitrineDaSacola` e
 * `modeloDeRecomendacao`, no layout raiz): a gaveta só decide, na hora, com
 * o que está na sacola. Abrir a sacola não espera ninguém.
 *
 * "Adicionar" entra na MESMA fila das quantidades (o `adicionar` do
 * contexto): a linha aparece na sacola no clique, o total esmaece até o
 * Medusa responder, e o que volta substitui o da tela inteiro. O produto que
 * entrou sai da lista na hora — ele agora está na sacola. Se não entrar, ele
 * volta pra lista, e o recado sai no pé da gaveta (entrega 0104).
 *
 * Sacola vazia não tem leva junto: ali quem fala é o "Ver produtos".
 */
export function LevaJunto({
  vitrine,
  modelo,
  aoNavegar,
}: {
  vitrine: readonly SugestaoDaSacola[]
  modelo: ModeloDeRecomendacao | null
  /** O mesmo da gaveta: link de dentro dela fecha a gaveta. */
  aoNavegar: (ev: MouseEvent<HTMLAnchorElement>) => void
}) {
  const sacola = useSacola()
  const politica = useFrete()

  const carrinho = sacola?.carrinho
  const escolhidos = useMemo(() => {
    if (!carrinho) return []
    return escolherLevaJunto(
      vitrine,
      sacolaDe(carrinho.itens),
      faltaPraPromocao(politica, carrinho.subtotal),
      modelo
    )
  }, [vitrine, modelo, carrinho, politica])

  if (!sacola || !carrinho || !carrinho.itens.length || !escolhidos.length) return null
  function levar(s: SugestaoDaSacola) {
    void sacola?.adicionar(
      [
        {
          varianteId: s.varianteId,
          nome: s.nome,
          handle: s.handle,
          imagem: s.imagem,
          quantidade: 1,
          precoUnitario: s.preco,
        },
      ],
      () => adicionar(s.varianteId, 1)
    )
  }

  return (
    <section className="sacolinha__leve" aria-labelledby="sugestoes-titulo">
      <h3 className="sacolinha__leve-titulo" id="sugestoes-titulo">
        <Raio />
        Leva junto
      </h3>
      <ul className="sacolinha__leve-lista">
        {escolhidos.map((s) => (
          <li className="sacolinha__leve-item" key={s.varianteId}>
            {s.libera ? (
              <span className="sacolinha__leve-selo">
                <Raio />
                Libera o frete grátis
              </span>
            ) : null}
            {/* A foto leva pro produto, como o nome na lista de cima; fora do
                Tab e do leitor de tela, porque o botão já diz quem é. */}
            <Link
              className="sacolinha__leve-foto"
              href={`/produtos/${s.handle}`}
              onClick={aoNavegar}
              tabIndex={-1}
              aria-hidden="true"
            >
              {s.imagem ? (
                <Image src={s.imagem} alt="" width={148} height={148} sizes="148px" />
              ) : null}
            </Link>
            <div className="sacolinha__leve-corpo">
              <p className="sacolinha__leve-nome">{s.nome}</p>
              <p className="sacolinha__leve-preco">{emReais(s.preco)}</p>
              <button
                type="button"
                className="sacolinha__leve-add"
                onClick={() => levar(s)}
                aria-label={`Adicionar ${s.nome} à sacola${s.libera ? ", libera o frete grátis" : ""}`}
                data-leva-junto={s.varianteId}
              >
                <Mais />
                Adicionar
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
