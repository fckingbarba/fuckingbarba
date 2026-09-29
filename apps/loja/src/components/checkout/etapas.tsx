"use client"

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type TransitionStartFunction,
} from "react"
import { Raio } from "@/components/icones"
import {
  ETAPAS,
  NOMES_DAS_ETAPAS,
  etapaDoCarrinho,
  indiceDaEtapa,
  type CheckoutVisivel,
  type Etapa,
  type Oferta,
  type OfertaDoBump,
  type OpcaoDeFrete,
  type ProvedorDePagamento,
  type RotaDoPagamento,
} from "@/lib/checkout-visivel"
import type { Configuracoes } from "@/lib/configuracoes"
import { emReais } from "@/lib/formato"
import { abriuOCheckout } from "@/lib/acoes/checkout"
import { comOAdiantado, jaChegou, type Adiantado } from "@/lib/passos-do-checkout"
import { anotarNaLoja, comASacola, rastrear } from "@/lib/rastrear"
import { usePeDaTela } from "@/lib/use-pe-da-tela"
import { Contato } from "./contato"
import { Entrega } from "./entrega"
import { Pagamento } from "./pagamento"
import { Giro } from "./resposta"
import { Resumo } from "./resumo"

// Moram em `resposta.tsx` (a conta usa os mesmos); o checkout segue importando daqui.
export { Giro, Recado, trazerPraVista, useFocaNoErro } from "./resposta"

/**
 * Quanto tempo o passo que acabou de abrir fica surdo a um envio VAZIO — o
 * segundo toque de quem tocou duas vezes em "Continuar" (ver `recemAberto`).
 */
const TOQUE_REPETIDO_MS = 600

/** O que o botão de um passo diz enquanto a ação dele grava — e como os outros sabem disso. */
export const SALVANDO = "Salvando…"

/** Os passos que abrem o seguinte no clique — o pagamento termina na tela de obrigado. */
const ETAPAS_ADIANTAVEIS = ["contato", "entrega"] as const
type EtapaAdiantavel = (typeof ETAPAS_ADIANTAVEIS)[number]
type Adiantados = Partial<Record<EtapaAdiantavel, Adiantado>>

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
 * │ "editar" num passo já vencido. Ele se apaga quando aquele passo é      │
 * │ enviado de novo.                                                       │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O PASSO SEGUINTE ABRE NO CLIQUE (entrega 0201) ───────────────────────┐
 * │ Era "Salvando…" no botão até o Medusa gravar e a página voltar refeita │
 * │ — uma ida e volta aos EUA, mais o Medusa, em cada passo. Agora a tela  │
 * │ confere o formulário ali mesmo, com as regras da ação                  │
 * │ (`lib/passos-do-checkout.ts`), e o que foi enviado entra num carrinho  │
 * │ ADIANTADO (`comOAdiantado`): é dele que sai o passo aberto e a linha   │
 * │ do passo feito, enquanto a ação grava por trás.                        │
 * │                                                                        │
 * │ O ADIANTADO SAI QUANDO O CARRINHO DE VERDADE CHEGA COM ELE             │
 * │ (`jaChegou`), e não quando a ação responde: o Next entrega a resposta  │
 * │ da ação ANTES da página refeita (`server-action-reducer.js`), e soltar │
 * │ o adiantado na resposta mostrava o passo de antes por um instante — o  │
 * │ passo piscava. Se a ação recusa (a sacola expirou, o CEP é de outra    │
 * │ cidade, a rede caiu), o adiantado sai na hora e o passo volta aberto,  │
 * │ com o recado (`aoVoltar`).                                             │
 * │                                                                        │
 * │ E O PAGAR ESPERA. Com um passo de antes ainda gravando (`gravando`), o │
 * │ total pode mudar — o frete entra junto com o endereço —, e o botão de  │
 * │ pagar espera como espera a troca de frete: o dinheiro esmaece e pulsa. │
 * └────────────────────────────────────────────────────────────────────────┘
 */

type Props = {
  checkout: CheckoutVisivel
  fretes: OpcaoDeFrete[]
  provedores: ProvedorDePagamento[]
  /** Por onde cobrar cada forma agora (`rotaDoPagamento`). */
  rota: RotaDoPagamento
  bump: OfertaDoBump | null
  sugestoes: Oferta[]
  falta: number
  piso: number
  /** Do admin: o que o passo 3 e o resumo podem prometer (prazo, WhatsApp). */
  atendimento: Configuracoes["atendimento"]
}

export function Etapas({
  checkout,
  fretes,
  provedores,
  rota,
  bump,
  sugestoes,
  falta,
  piso,
  atendimento,
}: Props) {
  const [editando, setEditando] = useState<Etapa | null>(null)
  const [adiantados, setAdiantados] = useState<Adiantados>({})

  /*
    A PÁGINA REFEITA CHEGOU com o que foi enviado: o adiantado já não diz
    nada, e sai. No render, e não num efeito — é o "ajustar o estado quando a
    prop muda" do React: com efeito, a tela pintaria uma vez o carrinho novo
    ainda por baixo do adiantado. E sai de verdade, não só é ignorado: um
    adiantado velho que voltasse a valer (o CEP trocado depois) reescreveria
    o endereço na tela.
  */
  const [carrinhoVisto, setCarrinhoVisto] = useState(checkout)
  if (checkout !== carrinhoVisto) {
    setCarrinhoVisto(checkout)
    const ficam: Adiantados = {}
    for (const e of ETAPAS_ADIANTAVEIS) {
      const a = adiantados[e]
      if (a && !jaChegou(checkout, a)) ficam[e] = a
    }
    if (Object.keys(ficam).length !== Object.keys(adiantados).length) setAdiantados(ficam)
  }

  // O carrinho como vai ficar — com o que os passos enviaram e ainda não voltou.
  const vista = [adiantados.contato, adiantados.entrega].reduce<CheckoutVisivel>(
    (c, a) => (a ? comOAdiantado(c, a) : c),
    checkout
  )
  const sugerida = etapaDoCarrinho(vista)
  const aberta = editando ?? sugerida

  /*
   * O PASSO QUE ACABOU DE ABRIR. Com o passo seguinte abrindo no clique, o
   * segundo toque de quem tocou duas vezes em "Continuar" (a barra do
   * celular fica no mesmo lugar) cai no passo novo, ainda vazio — e enchia
   * de vermelho os campos que a pessoa nem viu. O passo pergunta aqui antes
   * de conferir um envio vazio.
   */
  const abertaEm = useRef(Number.NEGATIVE_INFINITY)
  const abertaAntes = useRef(aberta)
  useEffect(() => {
    if (abertaAntes.current === aberta) return
    abertaAntes.current = aberta
    abertaEm.current = performance.now()
  }, [aberta])
  const recemAberto = useCallback(
    () => performance.now() - abertaEm.current < TOQUE_REPETIDO_MS,
    []
  )

  // O passo enviou algo que confere: o carrinho adianta, e o passo seguinte abre.
  const adiantar = useCallback((a: Adiantado) => {
    setAdiantados((atual) => ({ ...atual, [a.etapa]: a }))
    setEditando(null)
  }, [])
  // A ação recusou: o adiantado sai, e o passo volta aberto, com o recado.
  const aoVoltar = useCallback((etapa: EtapaAdiantavel) => {
    setAdiantados((atual) => {
      const ficam = { ...atual }
      delete ficam[etapa]
      return ficam
    })
    setEditando(etapa)
  }, [])

  // O começo do checkout (a InitiateCheckout da Meta e do TikTok), uma vez por carrinho — e a
  // marca no carrinho, o "começaram o checkout" do painel (0186), de todo mundo.
  useEffect(() => {
    rastrear("begin_checkout", comASacola(checkout.itens))
    abriuOCheckout().catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkout.id])

  // O e-mail no passo 1: o CRM da loja lê do carrinho e liga o que a pessoa fez a ele.
  // Uma vez por carrinho na visita — voltar pro checkout não conta de novo.
  useEffect(() => {
    if (checkout.email) anotarNaLoja("contato_informado", {}, { umaVez: `contato:${checkout.id}` })
  }, [checkout.id, checkout.email])

  // A entrega escolhida, uma vez por opção: é quando o passo 2 fecha.
  useEffect(() => {
    if (!checkout.freteEscolhido) return
    rastrear("add_shipping_info", {
      ...comASacola(checkout.itens),
      shipping_tier:
        fretes.find((f) => f.id === checkout.freteEscolhido)?.nome ?? checkout.freteEscolhido,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkout.freteEscolhido])

  /*
   * O TOTAL MUDANDO SEM SAIR DO PASSO. Trocar o frete, marcar o bump e pôr
   * um chip reescrevem o carrinho e pedem `refresh()`. Uma transição só pra
   * todos, e é dela que vem a espera que se vê: enquanto corre, o dinheiro
   * do resumo e da barra esmaece e pulsa (o número na tela é o de antes, e
   * vai mudar), e o botão de pagar espera — pagar no meio de uma troca
   * cobraria um total que a pessoa ainda não viu.
   *
   * SER TRANSIÇÃO NÃO É DETALHE. A ação chamada fora de uma suspende a
   * página, e o <Suspense> do checkout trocava TUDO pelo esqueleto até o
   * servidor responder — era o "carregando esquisito" ao trocar o frete.
   * Dentro de uma, o React mantém a tela de antes até a nova estar pronta.
   */
  const [recalculando, recalcular] = useTransition()

  /*
   * O que cada passo está enviando, pro botão da barra do celular. A barra
   * não é dona de formulário nenhum — ela só pede `requestSubmit()` ao passo
   * aberto —, então quem sabe que está ocupado é o passo, e ele avisa.
   */
  const [ocupados, setOcupados] = useState<Partial<Record<Etapa, string>>>({})
  const aoOcupar = useCallback((etapa: Etapa, texto: string | null) => {
    setOcupados((o) => ((o[etapa] ?? null) === texto ? o : { ...o, [etapa]: texto ?? undefined }))
  }, [])

  // Um passo de antes ainda indo e voltando do Medusa, por trás da tela. O
  // da entrega mexe no total (o frete entra junto com o endereço); a busca
  // do CEP, não — ela acontece com o passo 2 aberto.
  const mudandoOTotal = recalculando || ocupados.entrega === SALVANDO
  const gravando = mudandoOTotal || ocupados.contato === SALVANDO

  const comum = {
    aberta,
    sugerida,
    aoAbrir: setEditando,
    adiantar,
    aoVoltar,
    recemAberto,
    recalcular,
    recalculando,
    aoOcupar,
  }

  return (
    <>
      {/* <div>, e não <form>: cada passo tem o SEU formulário lá dentro, e
          form dentro de form é HTML inválido — o navegador desfaz o de dentro
          e o envio do passo vira um GET na página. Aqui isto é só a coluna. */}
      <div className="fluxo">
        <div className="cabeca">
          <h1 className="cabeca__titulo">Finalizar compra</h1>
        </div>

        <Passos aberta={aberta} sugerida={sugerida} aoAbrir={setEditando} />

        {/* Resumos dos passos já vencidos, acima do passo atual. */}
        {ETAPAS.filter((e) => indiceDaEtapa(e) < indiceDaEtapa(aberta) && e !== "pagamento").map(
          (e) => (
            <FeitoPasso
              key={e}
              etapa={e}
              texto={resumoDoPasso(e, vista, fretes)}
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
          rota={rota}
          bump={bump}
          atendimento={atendimento}
          {...comum}
          recalculando={gravando}
        />
      </div>

      <Barra
        checkout={checkout}
        aberta={aberta}
        ocupado={ocupados[aberta] ?? null}
        recalculando={aberta === "pagamento" ? gravando : recalculando}
        mudandoOTotal={mudandoOTotal}
      />

      <Resumo checkout={checkout} recalculando={mudandoOTotal} atendimento={atendimento} />
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
 *
 * E ESPERA JUNTO COM O PASSO. Antes ela não sabia que o passo estava
 * enviando: no celular — onde o botão de dentro do passo nem aparece — o
 * toque em "Fazer o pedido" não mudava nada na tela, e o segundo toque
 * mandava o pedido de novo. Agora o passo avisa (`ocupado`), e ela trava com
 * o mesmo texto do botão de dentro.
 */
function Barra({
  checkout,
  aberta,
  ocupado,
  recalculando,
  mudandoOTotal,
}: {
  checkout: CheckoutVisivel
  aberta: Etapa
  ocupado: string | null
  /** O botão espera: uma troca no total, ou (no pagamento) um passo de antes gravando. */
  recalculando: boolean
  /** O total da barra vai mudar — esmaece, como o do resumo. */
  mudandoOTotal: boolean
}) {
  const textos: Record<Etapa, string> = {
    contato: "Continuar",
    entrega: "Ir pro pagamento",
    pagamento: "Fazer o pedido",
  }
  // No celular a barra ocupa o pé da tela: a faixa de cookies sobe pra cima
  // dela (acima de 900 px ela some, e a medida é zero).
  const barra = useRef<HTMLDivElement>(null)
  usePeDaTela(barra, true)

  return (
    <div ref={barra} className="barra">
      <span className="barra__total" data-recalculando={mudandoOTotal ? "" : undefined}>
        <small>Total</small>
        <b>{emReais(checkout.total)}</b>
      </span>
      <button
        type="button"
        className="btn barra__btn"
        // Com o total mudando, espera: o passo aberto confere de novo no
        // envio, mas travar aqui é o que a pessoa vê.
        disabled={Boolean(ocupado) || recalculando}
        aria-busy={ocupado ? true : undefined}
        onClick={() => {
          const form = document.getElementById(`form-${aberta}`)
          if (form instanceof HTMLFormElement) form.requestSubmit()
        }}
      >
        {ocupado ? (
          <>
            <Giro />
            {ocupado}
          </>
        ) : (
          <>
            {textos[aberta]}
            <Raio className="btn__bolt" />
          </>
        )}
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
  /** O envio conferiu: o passo seguinte abre, e a ação grava por trás. */
  adiantar: (a: Adiantado) => void
  /** A ação recusou o que foi adiantado: o passo volta aberto, com o recado. */
  aoVoltar: (etapa: EtapaAdiantavel) => void
  /** O passo acabou de abrir — um envio vazio agora é o toque repetido. */
  recemAberto: () => boolean
  /** Pra troca que mexe no total sem sair do passo: frete, bump, chip. */
  recalcular: TransitionStartFunction
  /** Alguma dessas trocas ainda está indo e voltando do Medusa. */
  recalculando: boolean
  /** O passo conta o que está enviando (o texto do botão), ou `null`. */
  aoOcupar: (etapa: Etapa, texto: string | null) => void
}

/**
 * O passo avisa a barra do celular que está enviando, e com que texto.
 *
 * Efeito, e não chamada no render: é o pai que guarda o estado, e mexer no
 * estado do pai durante o render do filho é o que o React proíbe.
 */
export function useAvisaOcupado(
  casca: Pick<PropsDaEtapa, "etapa" | "aoOcupar">,
  texto: string | null
) {
  const { etapa, aoOcupar } = casca
  useEffect(() => {
    aoOcupar(etapa, texto)
  }, [aoOcupar, etapa, texto])
}

export function Painel({
  etapa,
  aberta,
  children,
}: {
  etapa: Etapa
  aberta: Etapa
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
        {children}
      </div>
    </section>
  )
}
