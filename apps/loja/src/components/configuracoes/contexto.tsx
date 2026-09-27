"use client"

import { createContext, useContext, type ReactNode } from "react"
import { PADRAO, type PoliticaDeFrete } from "@/lib/configuracoes"

/**
 * A POLÍTICA DE FRETE, PRAS TELAS QUE RODAM NO NAVEGADOR.
 *
 * A gaveta da sacola, a barra de compra da PDP, o cabeçalho e as ofertas
 * relâmpago são componentes de cliente: não podem chamar `configuracoes()`,
 * que é `server-only`. As três alternativas eram passar prop por cinco
 * níveis, buscar de novo no navegador, ou isto.
 *
 * ISTO, porque:
 *
 *   · passar prop atravessaria componentes que não têm nada a ver com frete,
 *     só pra entregar o valor lá embaixo — e cada nível novo é um lugar pra
 *     esquecer de repassar;
 *   · buscar no navegador seria uma requisição por visita pra um dado que o
 *     servidor já tinha na mão, e uma janela em que a tela desenha SEM a
 *     política e depois muda de ideia na cara da pessoa.
 *
 * O valor entra uma vez no layout raiz, já lido do Medusa e já cacheado.
 *
 * O PADRÃO É "SEM PROMOÇÃO", e não é detalhe: se alguém montar um
 * componente fora do provedor, ele deixa de anunciar frete grátis em vez de
 * anunciar um que não existe.
 */

const Contexto = createContext<PoliticaDeFrete>(PADRAO.frete)

export function ProvedorDoFrete({
  politica,
  children,
}: {
  politica: PoliticaDeFrete
  children: ReactNode
}) {
  return <Contexto.Provider value={politica}>{children}</Contexto.Provider>
}

export function useFrete(): PoliticaDeFrete {
  return useContext(Contexto)
}

/**
 * A PARCELA MÍNIMA DO CARTÃO, pelo mesmo caminho (0157): a caixa de compra
 * da PDP, a sacola e o checkout só dizem "3x de R$ X" — e o checkout só
 * oferece a parcela — quando ela passa da mínima das Configurações. O padrão
 * é o piso do banco: fora do provedor, a tela promete o mínimo que o banco
 * aceita, nunca menos.
 */
const Parcela = createContext<number>(PADRAO.pagamento.parcelaMinima)

export function ProvedorDaParcela({ minima, children }: { minima: number; children: ReactNode }) {
  return <Parcela.Provider value={minima}>{children}</Parcela.Provider>
}

export function useParcelaMinima(): number {
  return useContext(Parcela)
}
