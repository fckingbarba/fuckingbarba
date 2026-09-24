"use client"

import { useTransition } from "react"
import { useAvisar } from "@/components/avisos"
import { Icone } from "@/components/icones"
import { emitirNota, tentarEstorno } from "@/lib/acoes/pedidos"
import type { AcaoDoPedido } from "@/lib/pedidos"

const ROTULO: Record<AcaoDoPedido, { normal: string; fazendo: string }> = {
  nota: { normal: "Emitir a nota agora", fazendo: "Emitindo a nota…" },
  estorno: { normal: "Tentar o estorno de novo", fazendo: "Pedindo ao Pagar.me…" },
}

/**
 * UM BOTÃO DO PEDIDO — a nota ou o estorno. Só aparece quando o backend
 * disse que o papel pode e o pedido está no estado certo (`acoes` e o
 * `botao` da faixa); ainda assim, quem decide de novo é a rota, na hora do
 * clique. Enquanto a loja fala com o Bling ou o Pagar.me, ele fica
 * apertado — um clique, uma tentativa.
 */
export function BotaoDoPedido({
  id,
  acao,
  rotulo,
  estilo = "",
}: {
  id: string
  acao: AcaoDoPedido
  rotulo?: string
  estilo?: string
}) {
  const [fazendo, comecar] = useTransition()
  const avisar = useAvisar()

  return (
    <button
      type="button"
      className={`btn btn--menor ${estilo}`.trim()}
      disabled={fazendo}
      aria-busy={fazendo || undefined}
      data-acao={acao}
      onClick={() =>
        comecar(async () => {
          avisar(await (acao === "nota" ? emitirNota(id) : tentarEstorno(id)))
        })
      }
    >
      {acao === "nota" ? <Icone nome="nota" /> : null}
      {fazendo ? ROTULO[acao].fazendo : (rotulo ?? ROTULO[acao].normal)}
    </button>
  )
}
