"use client"

import { useSyncExternalStore } from "react"

/**
 * A SEMENTE DA VISITA — o número que decide os sorteios de depoimento: a
 * esteira da home (`components/home/esteira-de-avaliacoes.tsx`) e os três da
 * página do produto (`components/produto/depoimentos-sorteados.tsx`). A conta
 * do sorteio é `lib/avaliacoes.ts`; daqui sai só a semente.
 *
 * O SORTEIO É NO NAVEGADOR. A home e as páginas de produto são estáticas —
 * saem prontas do build, pela CDN —, e sortear no servidor a cada visita
 * faria delas páginas dinâmicas: uma função rodando em toda entrada na loja,
 * por causa de uma seção lá embaixo. A semente entra por
 * `useSyncExternalStore`, como o CEP guardado da calculadora da PDP: o
 * servidor e a hidratação desenham com a fixa (`SEMENTE_DO_SERVIDOR`, e a
 * hidratação bate), e logo depois o React desenha de novo com a da visita —
 * sem `setState` dentro de efeito.
 *
 * Uma por carregamento da página: quem vai pra outra tela e volta vê o mesmo
 * sorteio.
 */
export const SEMENTE_DO_SERVIDOR = 1

let sementeDaVisita: number | null = null
function semente(): number {
  if (sementeDaVisita === null) sementeDaVisita = Math.floor(Math.random() * 0x100000000)
  return sementeDaVisita
}
const semAssinatura = () => () => {}

export function useSementeDaVisita(): number {
  return useSyncExternalStore(semAssinatura, semente, () => SEMENTE_DO_SERVIDOR)
}
