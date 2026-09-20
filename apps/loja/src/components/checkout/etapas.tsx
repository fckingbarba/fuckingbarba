"use client"

import { useEffect, useRef, useState } from "react"
import { Raio } from "@/components/icones"
import {
  ETAPAS,
  etapaDoCarrinho,
  indiceDaEtapa,
  type CheckoutVisivel,
  type Etapa,
  type EstadoDaEtapa,
  type OpcaoDeFrete,
  type ProvedorDePagamento,
} from "@/lib/checkout-visivel"
import { Contato } from "./contato"
import { Entrega } from "./entrega"
import { Frete } from "./frete"
import { Pagamento } from "./pagamento"
import { Resumo } from "./resumo"

/**
 * O CHECKOUT EM ETAPAS EMPILHADAS
 *
 * Uma URL só. As quatro etapas ficam na página inteira; a aberta mostra os
 * campos, as vencidas viram uma linha de resumo com um "alterar", e as que
 * ainda não chegaram ficam fechadas.
 *
 * ┌─ A ETAPA ABERTA SAI DO CARRINHO, NÃO DE UM CONTADOR ───────────────────┐
 * │ `etapaDoCarrinho` responde "em que pé isto está?" olhando pro que já   │
 * │ foi gravado: tem e-mail? tem endereço? tem frete escolhido? Quem       │
 * │ recarrega a página, fecha o navegador e volta no dia seguinte, ou abre │
 * │ o link em outra aba cai exatamente onde parou — porque é a mesma       │
 * │ pergunta feita ao mesmo carrinho, e não um passo guardado em outro     │
 * │ lugar que pode discordar dele.                                         │
 * │                                                                        │
 * │ O único estado de tela aqui é `editando`: quando a pessoa clica em     │
 * │ "alterar" numa etapa já vencida. Ele se apaga sozinho quando aquela    │
 * │ etapa é salva de novo.                                                 │
 * └────────────────────────────────────────────────────────────────────────┘
 */

const TITULOS: Record<Etapa, string> = {
  contato: "Seus dados",
  entrega: "Onde entregar",
  frete: "Como entregar",
  pagamento: "Pagamento",
}

type Props = {
  checkout: CheckoutVisivel
  fretes: OpcaoDeFrete[]
  provedores: ProvedorDePagamento[]
}

export function Etapas({ checkout, fretes, provedores }: Props) {
  const sugerida = etapaDoCarrinho(checkout)
  const [editando, setEditando] = useState<Etapa | null>(null)
  const aberta = editando ?? sugerida

  const comum = {
    aberta,
    sugerida,
    aoAbrir: setEditando,
    aoSalvar: () => setEditando(null),
  }

  return (
    <div className="checkout__grade">
      <div className="checkout__etapas">
        <Contato etapa="contato" checkout={checkout} {...comum} />
        <Entrega etapa="entrega" checkout={checkout} {...comum} />
        <Frete etapa="frete" checkout={checkout} fretes={fretes} {...comum} />
        <Pagamento etapa="pagamento" checkout={checkout} provedores={provedores} {...comum} />
      </div>

      <Resumo checkout={checkout} />
    </div>
  )
}

/* ── a casca de cada etapa ────────────────────────────────────────────────── */

export type PropsDaEtapa = {
  etapa: Etapa
  aberta: Etapa
  /** Até onde o carrinho já chegou — o que vem depois ainda não é clicável. */
  sugerida: Etapa
  aoAbrir: (e: Etapa) => void
  aoSalvar: () => void
}

type PropsCasca = PropsDaEtapa & {
  /** Uma linha com o que foi preenchido, pra etapa fechada não virar um vazio. */
  resumo?: React.ReactNode
  children: React.ReactNode
}

export function Casca({ etapa, aberta, sugerida, aoAbrir, resumo, children }: PropsCasca) {
  const numero = indiceDaEtapa(etapa) + 1
  const estaAberta = aberta === etapa
  const vencida = indiceDaEtapa(etapa) < indiceDaEtapa(sugerida)

  return (
    <section
      className={`etapa${estaAberta ? " e-aberta" : ""}${vencida ? " e-vencida" : ""}`}
      aria-current={estaAberta ? "step" : undefined}
    >
      <h2 className="etapa__cabeca">
        <span className="etapa__numero" aria-hidden="true">
          {vencida && !estaAberta ? <Raio /> : numero}
        </span>
        <span className="etapa__titulo">
          <span className="sr-only">{`Etapa ${numero} de ${ETAPAS.length}: `}</span>
          {TITULOS[etapa]}
        </span>
        {vencida && !estaAberta ? (
          <button type="button" className="etapa__alterar" onClick={() => aoAbrir(etapa)}>
            Alterar
            <span className="sr-only">{` ${TITULOS[etapa].toLowerCase()}`}</span>
          </button>
        ) : null}
      </h2>

      {estaAberta ? (
        <div className="etapa__corpo">{children}</div>
      ) : resumo ? (
        <p className="etapa__resumo">{resumo}</p>
      ) : null}
    </section>
  )
}

/* ── o aviso de erro que não é de campo nenhum ────────────────────────────── */

export function Recado({ estado }: { estado: EstadoDaEtapa }) {
  if (!estado.mensagem) return null
  return (
    <p className="etapa__recado" role="alert">
      {estado.mensagem}
    </p>
  )
}

/* ── "salvou, pode fechar" ────────────────────────────────────────────────── */

/**
 * Avisa o pai quando uma etapa foi salva com sucesso, uma vez por resposta.
 *
 * Olha `rodada`, e não `ok`, porque o Next PRESERVA o estado de
 * `useActionState` quando a pessoa navega pra fora e volta: sem o contador,
 * uma etapa reaberta dias depois acharia que acabou de ser salva e se fecharia
 * na cara de quem foi corrigir o endereço.
 */
export function useFechaQuandoSalva(estado: EstadoDaEtapa, aoSalvar: () => void) {
  const ultima = useRef(estado.rodada)
  useEffect(() => {
    if (estado.rodada !== ultima.current) {
      ultima.current = estado.rodada
      if (estado.ok) aoSalvar()
    }
  }, [estado.rodada, estado.ok, aoSalvar])
}
