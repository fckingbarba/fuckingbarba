"use client"

import dynamic from "next/dynamic"
import { usePathname } from "next/navigation"
import { useCallback, useEffect, useState } from "react"
import { chaveDeEsconder, COOKIE_BALAO, semBalaoNesta } from "@/lib/pedido-recente"

/**
 * O VIGIA DO BALÃO DO PEDIDO — pequeno de propósito: está em toda página.
 *
 * Lê o cookie curto do pedido (`lib/pedido-recente.ts`) a cada troca de
 * página. Sem ele, não faz nada — nem requisição, nem download: o balão
 * (`./balao`) e o CSS dele só vêm pra quem comprou agora há pouco.
 *
 * O `usePathname` vive dentro de um `<Suspense>` no layout: fora dele, o Next
 * 16 derruba as páginas dinâmicas (ver o vigia da 1ª compra).
 */

const Balao = dynamic(() => import("./balao").then((m) => m.BalaoDoPedido), { ssr: false })

const lerCookie = (nome: string) => {
  const achado = document.cookie.split("; ").find((c) => c.startsWith(`${nome}=`))
  return achado ? decodeURIComponent(achado.slice(nome.length + 1)) : null
}

/**
 * O pedido cujo balão já saiu — pelo X, pelo prazo, pelo "Refazer" ou porque
 * o servidor disse que não é deste navegador. Não volta na página seguinte.
 * Na memória também, pra quando o navegador não deixa guardar.
 */
const saiu = new Set<string>()

const escondido = (pedidoId: string) => {
  if (saiu.has(pedidoId)) return true
  try {
    return localStorage.getItem(chaveDeEsconder(pedidoId)) === "1"
  } catch {
    return false
  }
}

const esconder = (pedidoId: string) => {
  saiu.add(pedidoId)
  try {
    localStorage.setItem(chaveDeEsconder(pedidoId), "1")
  } catch {
    // Sem armazenamento (aba anônima, bloqueio): fica só na memória desta visita.
  }
}

export function VigiaDoPedido({ whatsapp }: { whatsapp: string | null }) {
  const caminho = usePathname()
  const [pedidoId, setPedidoId] = useState<string | null>(null)

  useEffect(() => {
    const id = lerCookie(COOKIE_BALAO)
    const valido = id && /^order_[A-Za-z0-9]+$/.test(id) && !escondido(id) ? id : null
    // O cookie é do navegador: só dá pra ler depois de montar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPedidoId(valido)
  }, [caminho])

  const sumir = useCallback(() => {
    setPedidoId((id) => {
      if (id) esconder(id)
      return null
    })
  }, [])

  if (!pedidoId || semBalaoNesta(caminho)) return null
  return <Balao pedidoId={pedidoId} whatsapp={whatsapp} aoSumir={sumir} />
}
