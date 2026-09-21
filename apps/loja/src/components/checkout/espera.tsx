"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { perguntarPagamento } from "@/lib/acoes/pedido"

/**
 * A TELA QUE MUDA SOZINHA quando o Pix cai.
 *
 * Pergunta a cada 4 segundos se o pedido foi pago (ou cancelado) e, quando
 * muda, pede ao servidor a tela de novo — é o servidor que desenha "pagamento
 * confirmado", lendo o Medusa, e não este componente adivinhando.
 *
 * Não desenha nada. E PARA: 20 minutos depois do vencimento do Pix (ou 15
 * minutos, no cartão em análise). Uma aba esquecida aberta não pode ficar
 * perguntando pra sempre — quem voltar depois recarrega e vê o estado atual.
 *
 * Por que perguntar e não esperar um aviso: aviso do servidor pro navegador
 * pediria uma conexão aberta (WebSocket, SSE) pra um evento que acontece uma
 * vez por pedido. Quatro segundos de atraso numa tela que a pessoa está
 * olhando enquanto abre o app do banco não é perceptível.
 */
const INTERVALO = 4_000

export function EsperaDoPagamento({ pedidoId, ate }: { pedidoId: string; ate: string | null }) {
  const router = useRouter()

  useEffect(() => {
    let vivo = true
    let relogio: ReturnType<typeof setTimeout> | undefined
    const fim = ate && Number.isFinite(Date.parse(ate)) ? Date.parse(ate) : null
    const limite = fim !== null ? fim + 20 * 60_000 : Date.now() + 15 * 60_000

    const perguntar = async () => {
      if (!vivo || Date.now() > limite) return
      const r = await perguntarPagamento(pedidoId).catch(() => null)
      if (!vivo) return
      if (r && (r.pago || r.cancelado)) {
        router.refresh()
        return
      }
      relogio = setTimeout(perguntar, INTERVALO)
    }

    relogio = setTimeout(perguntar, INTERVALO)
    return () => {
      vivo = false
      if (relogio) clearTimeout(relogio)
    }
  }, [pedidoId, ate, router])

  return null
}
