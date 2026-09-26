"use client"

import { getImageProps } from "next/image"
import { useMemo } from "react"
import { CartaoDeDepoimento, FOTO_DO_CARTAO } from "@/components/depoimento"
import type { Depoimento } from "@/conteudo/depoimentos"
import { NA_PAGINA_DO_PRODUTO, sequencia, sortear } from "@/lib/avaliacoes"
import { useSementeDaVisita } from "@/lib/use-semente-da-visita"

/**
 * Os TRÊS depoimentos da página do produto, sorteados a cada visita
 * (`NA_PAGINA_DO_PRODUTO`, em `lib/avaliacoes.ts`) — da lista inteira do
 * produto, que chega do servidor (`avaliacoes.tsx`).
 *
 * O sorteio é no navegador, com a semente da visita
 * (`lib/use-semente-da-visita.ts`), pelo mesmo motivo da esteira da home: a
 * página do produto é estática. O HTML sai com os três da semente fixa — é o
 * que lê quem abre sem JavaScript, e o Google —, e logo depois da hidratação
 * entram os três da visita. A seção fica perto do fim da página: a troca
 * acontece antes de a pessoa chegar nela.
 *
 * De `conteudo/depoimentos`, aqui só entra TIPO: a lista vem pela prop.
 */
export function DepoimentosSorteados({
  depoimentos,
  foto,
}: {
  depoimentos: Depoimento[]
  /** A foto do produto (o endereço), pra miniatura de todo cartão. */
  foto: string | null
}) {
  const s = useSementeDaVisita()
  const miniatura = useMemo(
    () =>
      foto
        ? getImageProps({ src: foto, alt: "", width: FOTO_DO_CARTAO, height: FOTO_DO_CARTAO }).props
        : undefined,
    [foto]
  )
  const vez = useMemo(
    () => sortear(depoimentos, NA_PAGINA_DO_PRODUTO, sequencia(s)),
    [depoimentos, s]
  )

  return (
    <ul className="avaliacoes__grade">
      {vez.map((d, i) => (
        <li key={`${"nome" in d ? d.nome : "trecho"}-${i}`}>
          <CartaoDeDepoimento depoimento={d} foto={miniatura} />
        </li>
      ))}
    </ul>
  )
}
