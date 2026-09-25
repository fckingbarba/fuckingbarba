"use client"

import { useEffect } from "react"
import { useSacola } from "./contexto"

/**
 * Manda o cabeçalho reler a sacola. Não desenha nada.
 *
 * Existe por causa de um detalhe do provedor: ele mora no layout raiz, então
 * nunca remonta, e a leitura inicial dele roda UMA VEZ por aba. Quem fechava
 * um pedido continuava vendo o contador marcando os itens que acabara de
 * comprar — pedido fechado, sacola vazia, e o número dizendo o contrário até
 * a pessoa recarregar a página.
 *
 * A tela de obrigado monta isto e o número zera sozinho. O checkout monta com
 * `quando="sair"`: lá a sacola muda por fora dela (a oferta do passo 3, os
 * chips do frete grátis), e quem voltava pra loja via o número de antes.
 *
 * Não é um `<Suspense>` disfarçado nem uma busca: é um recado de uma linha,
 * numa página só, em vez de uma releitura por navegação no site inteiro.
 */
export function RecarregaSacola({ quando = "entrar" }: { quando?: "entrar" | "sair" }) {
  const sacola = useSacola()

  useEffect(() => {
    if (quando === "entrar") sacola?.recarregar()
    return () => {
      if (quando === "sair") sacola?.recarregar()
    }
    // Só na montagem (e na saída): `sacola` muda de identidade a cada
    // leitura, e reagir a ela aqui seria um laço infinito de idas ao servidor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
