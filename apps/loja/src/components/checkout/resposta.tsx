"use client"

import { useEffect, useRef } from "react"
import type { EstadoDaEtapa } from "@/lib/checkout-visivel"

/**
 * O QUE UM FORMULÁRIO FAZ QUANDO A AÇÃO RESPONDE — o giro do botão, o
 * recado que não é de campo nenhum e o "salvou, fecha".
 *
 * Moravam em `etapas.tsx`, e saíram quando a Minha conta passou a usar os
 * mesmos (endereços e dados são o passo 1 e o 2 do checkout, fora do
 * checkout). Importar de `etapas.tsx` puxaria o checkout inteiro — contato,
 * entrega, pagamento, resumo — pro JavaScript da conta. `etapas.tsx`
 * reexporta daqui, e o checkout continua importando de lá.
 */

/**
 * O "trabalhando" dos botões do checkout: um quadrado girando, na cor do
 * texto. Quadrado e não círculo — a marca não tem canto redondo em lugar
 * nenhum, e o do campo de CEP (do protótipo) já é assim.
 */
export function Giro() {
  return <span className="giro" aria-hidden="true" />
}

/**
 * O aviso que não é de campo nenhum: rede fora, Medusa recusando, cartão
 * recusado.
 *
 * VEM PRA VISTA quando chega. No celular o botão que a pessoa tocou é o da
 * barra fixa, lá embaixo, e o aviso nasce no meio do formulário — fora da
 * tela, ou atrás da própria barra. Sem isto, a espera acabava e nada parecia
 * ter acontecido. Só em resposta NOVA (`rodada`): o Next devolve o estado da
 * ação a quem navega pra fora e volta, e o recado velho não pode puxar a
 * página sozinho.
 */
export function Recado({ estado }: { estado: EstadoDaEtapa }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const ultima = useRef(estado.rodada)

  useEffect(() => {
    if (estado.rodada === ultima.current) return
    ultima.current = estado.rodada
    /*
      ERRO DE CAMPO MANDA. Quando a resposta traz os dois — "não consegui
      falar com a loja" em cima e um campo vermelho no meio —, quem tem o
      que corrigir é o campo, e o `useFocaNoErro` já está levando o foco
      pra lá. Duas rolagens suaves disputando a mesma tela terminam em
      lugar nenhum. Este recado não some por isso: ele continua na tela e
      continua sendo anunciado pelo `role="alert"`.
    */
    if (temErroDeCampo(estado)) return
    if (estado.mensagem) trazerPraVista(ref.current)
  }, [estado])

  if (!estado.mensagem) return null
  return (
    <p className="erros-envio" role="alert" ref={ref}>
      {estado.mensagem}
    </p>
  )
}

/** Rola até o elemento, no meio da tela — sem animação pra quem pediu menos movimento. */
export function trazerPraVista(el: HTMLElement | null) {
  if (!el) return
  const calmo = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  el.scrollIntoView({ block: "center", behavior: calmo ? "auto" : "smooth" })
}

const temErroDeCampo = (estado: EstadoDaEtapa) =>
  Object.values(estado.erros).some((m) => Boolean(m))

/**
 * O PRIMEIRO CAMPO ERRADO CHAMA O FOCO PRA ELE.
 *
 * ┌─ O BOTÃO ESTÁ EMBAIXO E O ERRO NASCE EM CIMA ──────────────────────────┐
 * │ No celular quem envia o passo é a barra fixa, colada no rodapé. O erro │
 * │ de um campo nasce embaixo daquele campo — que pode estar três rolagens │
 * │ acima. Sem isto, a espera acabava, o botão voltava ao normal e NADA    │
 * │ parecia ter acontecido: a pessoa tocava de novo, nada de novo          │
 * │ acontecia, e ia embora achando que o site estava quebrado.             │
 * │                                                                        │
 * │ O `Recado` já resolvia isso pro aviso geral, mas erro de campo vem com │
 * │ `mensagem` vazia (ver o `erro()` em `acoes/checkout.ts`) — então não   │
 * │ havia recado nenhum pra trazer pra vista.                              │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * QUEM É O PRIMEIRO, o DOM responde: `aria-invalid="true"` já é escrito pelo
 * `Campo` em cima de cada campo com erro, e `querySelector` devolve o
 * primeiro na ordem do documento — que é a ordem em que a pessoa lê. Assim
 * não existe uma segunda lista de campos aqui pra sair do lugar quando o
 * formulário mudar.
 *
 * ROLA E DEPOIS FOCA, com `preventScroll`: `focus()` sozinho encosta o campo
 * na borda da tela, e no celular a barra fixa fica exatamente por cima dele.
 * O `trazerPraVista` põe no meio; o `preventScroll` impede o navegador de
 * desfazer isso com o pulo dele.
 *
 * O foco abre o teclado no celular, de propósito: o cursor já fica onde tem
 * o que consertar.
 *
 * Só em resposta NOVA (`rodada`), como os outros ganchos deste arquivo: o
 * Next devolve o estado de `useActionState` pra quem navega pra fora e
 * volta, e um erro de ontem não pode roubar o foco de quem acabou de abrir
 * a página.
 */
export function useFocaNoErro(estado: EstadoDaEtapa) {
  const formulario = useRef<HTMLFormElement>(null)
  const ultima = useRef(estado.rodada)

  useEffect(() => {
    if (estado.rodada === ultima.current) return
    ultima.current = estado.rodada
    if (estado.ok || !temErroDeCampo(estado)) return

    const primeiro = formulario.current?.querySelector<HTMLElement>('[aria-invalid="true"]')
    if (!primeiro) return

    trazerPraVista(primeiro)
    primeiro.focus({ preventScroll: true })
  }, [estado])

  return formulario
}

/**
 * Avisa o pai quando um passo foi salvo com sucesso, uma vez por resposta.
 *
 * Olha `rodada`, e não `ok`, porque o Next PRESERVA o estado de
 * `useActionState` quando a pessoa navega pra fora e volta: sem o contador,
 * um passo reaberto dias depois acharia que acabou de ser salvo e se fecharia
 * na cara de quem foi corrigir o endereço.
 */
export function useFechaQuandoSalva<E extends EstadoDaEtapa>(
  estado: E,
  aoSalvar: (estado: E) => void
) {
  const ultima = useRef(estado.rodada)
  useEffect(() => {
    if (estado.rodada !== ultima.current) {
      ultima.current = estado.rodada
      if (estado.ok) aoSalvar(estado)
    }
  }, [estado, aoSalvar])
}
