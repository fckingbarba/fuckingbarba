"use client"

import { useEffect, useRef, useState } from "react"
import { Raio } from "@/components/icones"
import {
  ETAPAS,
  NOMES_DAS_ETAPAS,
  etapaDoCarrinho,
  indiceDaEtapa,
  type CheckoutVisivel,
  type Etapa,
  type EstadoDaEtapa,
  type Oferta,
  type OpcaoDeFrete,
  type ProvedorDePagamento,
} from "@/lib/checkout-visivel"
import { emReais } from "@/lib/formato"
import { Contato } from "./contato"
import { Entrega } from "./entrega"
import { Pagamento } from "./pagamento"
import { Resumo } from "./resumo"

/**
 * O CHECKOUT EM TRÊS PASSOS
 *
 * Um passo visível por vez, na MESMA página: nada recarrega, nada pisca. O
 * passo concluído vira uma linha resumida com "editar" logo acima do passo
 * atual.
 *
 * ┌─ O PASSO ABERTO SAI DO CARRINHO, NÃO DE UM CONTADOR ───────────────────┐
 * │ `etapaDoCarrinho` responde "em que pé isto está?" olhando pro que já   │
 * │ foi gravado: tem e-mail e documento? tem endereço e frete escolhido?   │
 * │ Quem recarrega a página, fecha o navegador e volta no dia seguinte, ou │
 * │ abre o link em outra aba cai exatamente onde parou — porque é a mesma  │
 * │ pergunta feita ao mesmo carrinho, e não um passo guardado em outro     │
 * │ lugar que pode discordar dele.                                        │
 * │                                                                        │
 * │ O único estado de tela aqui é `editando`: quando a pessoa clica em     │
 * │ "editar" num passo já vencido. Ele se apaga sozinho quando aquele      │
 * │ passo é salvo de novo.                                                │
 * └────────────────────────────────────────────────────────────────────────┘
 */

type Props = {
  checkout: CheckoutVisivel
  fretes: OpcaoDeFrete[]
  provedores: ProvedorDePagamento[]
  bump: Oferta | null
  sugestoes: Oferta[]
  falta: number
  piso: number
}

export function Etapas({ checkout, fretes, provedores, bump, sugestoes, falta, piso }: Props) {
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
    <>
      {/* <div>, e não <form>: cada passo tem o SEU formulário lá dentro, e
          form dentro de form é HTML inválido — o navegador desfaz o de dentro
          e o envio do passo vira um GET na página. Aqui isto é só a coluna. */}
      <div className="fluxo">
        <div className="cabeca">
          <h1 className="cabeca__titulo">Finalizar compra</h1>
          <p className="cabeca__sub">Três passos rápidos. Sem cadastro.</p>
        </div>

        <Passos aberta={aberta} sugerida={sugerida} aoAbrir={setEditando} />

        {/* Resumos dos passos já vencidos, acima do passo atual. */}
        {ETAPAS.filter((e) => indiceDaEtapa(e) < indiceDaEtapa(aberta) && e !== "pagamento").map(
          (e) => (
            <FeitoPasso
              key={e}
              etapa={e}
              texto={resumoDoPasso(e, checkout, fretes)}
              aoEditar={() => setEditando(e)}
            />
          )
        )}

        <Contato etapa="contato" checkout={checkout} {...comum} />
        <Entrega
          etapa="entrega"
          checkout={checkout}
          fretes={fretes}
          sugestoes={sugestoes}
          falta={falta}
          piso={piso}
          {...comum}
        />
        <Pagamento
          etapa="pagamento"
          checkout={checkout}
          provedores={provedores}
          bump={bump}
          {...comum}
        />
      </div>

      <Barra checkout={checkout} aberta={aberta} />

      <Resumo checkout={checkout} />
    </>
  )
}

/* ── o stepper ────────────────────────────────────────────────────────────── */

function Passos({
  aberta,
  sugerida,
  aoAbrir,
}: {
  aberta: Etapa
  sugerida: Etapa
  aoAbrir: (e: Etapa) => void
}) {
  return (
    <ol className="passos" aria-label="Etapas do checkout">
      {ETAPAS.map((e) => {
        const vencida = indiceDaEtapa(e) < indiceDaEtapa(sugerida)
        const atual = e === aberta
        return (
          <li
            key={e}
            aria-current={atual ? "step" : undefined}
            data-feito={vencida && !atual ? "" : undefined}
            // Só passo vencido volta. Clicar num passo que ainda não aconteceu
            // levaria a pessoa pra um formulário que ela não consegue enviar.
            {...(vencida && !atual
              ? {
                  tabIndex: 0,
                  role: "button" as const,
                  onClick: () => aoAbrir(e),
                  onKeyDown: (ev: React.KeyboardEvent) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault()
                      aoAbrir(e)
                    }
                  },
                }
              : {})}
          >
            {NOMES_DAS_ETAPAS[e]}
          </li>
        )
      })}
    </ol>
  )
}

/* ── a linha do passo já resolvido ────────────────────────────────────────── */

function FeitoPasso({
  etapa,
  texto,
  aoEditar,
}: {
  etapa: Etapa
  texto: string
  aoEditar: () => void
}) {
  return (
    <div className="feito-passo" data-ativo="">
      <span>
        <span className="feito-passo__rot">{NOMES_DAS_ETAPAS[etapa]}</span>
        <span className="feito-passo__txt">{texto}</span>
      </span>
      <button type="button" onClick={aoEditar}>
        Editar<span className="sr-only"> {NOMES_DAS_ETAPAS[etapa].toLowerCase()}</span>
      </button>
    </div>
  )
}

function resumoDoPasso(e: Etapa, c: CheckoutVisivel, fretes: OpcaoDeFrete[]): string {
  if (e === "contato") {
    return [`${c.entrega.nome} ${c.entrega.sobrenome}`.trim(), c.email].filter(Boolean).join(" · ")
  }
  const escolhido = fretes.find((f) => f.id === c.freteEscolhido)
  const endereco = `${c.entrega.rua}, ${c.entrega.numero}${
    c.entrega.complemento ? ` — ${c.entrega.complemento}` : ""
  } · ${c.entrega.bairro} · ${c.entrega.cidade}/${c.entrega.uf} · ${c.entrega.cep}`
  return escolhido
    ? `${endereco} · ${escolhido.nome}, ${escolhido.preco === 0 ? "grátis" : emReais(escolhido.preco)}`
    : endereco
}

/* ── a barra fixa do celular ──────────────────────────────────────────────── */

/**
 * No celular quem manda é esta barra — o CSS esconde o botão de dentro do
 * passo (`.acoes .btn`) abaixo de 900px.
 *
 * Ela não duplica a lógica de nenhum passo: acha o formulário do passo aberto
 * e pede pra ele se enviar. `requestSubmit()` e não `submit()`, que é a
 * diferença entre passar pela validação do formulário e atropelá-la.
 */
function Barra({ checkout, aberta }: { checkout: CheckoutVisivel; aberta: Etapa }) {
  const textos: Record<Etapa, string> = {
    contato: "Continuar",
    entrega: "Ir pro pagamento",
    pagamento: "Fazer o pedido",
  }

  return (
    <div className="barra">
      <span className="barra__total">
        <small>Total</small>
        <b>{emReais(checkout.total)}</b>
      </span>
      <button
        type="button"
        className="btn barra__btn"
        onClick={() => {
          const form = document.getElementById(`form-${aberta}`)
          if (form instanceof HTMLFormElement) form.requestSubmit()
        }}
      >
        {textos[aberta]}
        <Raio className="btn__bolt" />
      </button>
    </div>
  )
}

/* ── a casca de cada passo ────────────────────────────────────────────────── */

export type PropsDaEtapa = {
  etapa: Etapa
  aberta: Etapa
  sugerida: Etapa
  aoAbrir: (e: Etapa) => void
  aoSalvar: () => void
}

export function Painel({
  etapa,
  aberta,
  dica,
  children,
}: {
  etapa: Etapa
  aberta: Etapa
  dica: string
  children: React.ReactNode
}) {
  const numero = indiceDaEtapa(etapa) + 1
  return (
    <section
      className="painel"
      data-ativo={aberta === etapa ? "" : undefined}
      aria-labelledby={`t-${etapa}`}
    >
      <div className="bloco">
        <div className="bloco__topo">
          <span className="bloco__num" aria-hidden="true">
            {numero}
          </span>
          <h2 className="bloco__titulo" id={`t-${etapa}`}>
            <span className="sr-only">{`Passo ${numero} de ${ETAPAS.length}: `}</span>
            {NOMES_DAS_ETAPAS[etapa]}
          </h2>
        </div>
        <p className="bloco__dica">{dica}</p>
        {children}
      </div>
    </section>
  )
}

/** O aviso que não é de campo nenhum: rede fora, Medusa recusando. */
export function Recado({ estado }: { estado: EstadoDaEtapa }) {
  if (!estado.mensagem) return null
  return (
    <p className="erros-envio" role="alert">
      {estado.mensagem}
    </p>
  )
}

/**
 * Avisa o pai quando um passo foi salvo com sucesso, uma vez por resposta.
 *
 * Olha `rodada`, e não `ok`, porque o Next PRESERVA o estado de
 * `useActionState` quando a pessoa navega pra fora e volta: sem o contador,
 * um passo reaberto dias depois acharia que acabou de ser salvo e se fecharia
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
