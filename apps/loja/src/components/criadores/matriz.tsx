"use client"

import { useState } from "react"

/**
 * OS 25 CRIATIVOS = 5 IDEIAS × 5 GANCHOS — a conta que faz "25 vídeos" caber
 * numa semana: a pessoa grava 5 vídeos e troca só o começo de cada um. Cada
 * quadrinho é um criativo em pé: a faixa de cima é o gancho (muda em cada
 * coluna), o resto é o corpo (igual na linha toda).
 *
 * Escolher uma ideia mostra os 5 ganchos dela, já escritos; tocar num
 * quadrinho marca também o gancho dele.
 */

const TIPOS = ["Pergunta", "Afirmação", "Resultado primeiro", "POV", "Chamada direta"] as const

const IDEIAS = [
  {
    letra: "A",
    nome: "Antes e depois",
    desc: "Barba seca e arrepiada. Óleo, balm e pente, explicando cada passo. Mostra a diferença na mesma luz, sem filtro.",
    ganchos: [
      "Sua barba também acorda assim?",
      "Barba arrepiada tem conserto. Olha.",
      "Essa é a mesma barba de 2 minutos atrás.",
      "POV: você parou de sair de casa com a barba armada.",
      "Se sua barba arrepia, para tudo e olha isso.",
    ],
  },
  {
    letra: "B",
    nome: "Rotina de 1 minuto",
    desc: "Shampoo no banho, toalha, óleo e balm na barba seca, narrando cada passo. Cortes rápidos pra caber em 40 s.",
    ganchos: [
      "Quanto tempo você gasta com a barba? Eu, 1 minuto.",
      "Minha rotina de barba inteira cabe em 1 minuto.",
      "Barba pronta. Agora te mostro como.",
      "POV: você finalmente tem uma rotina de barba.",
      "Se você acha que cuidar da barba dá trabalho, assiste.",
    ],
  },
  {
    letra: "C",
    nome: "3 erros",
    desc: "Os 3 erros que deixam a barba seca, arrepiada ou coçando, e o que você faz no lugar.",
    ganchos: [
      "Você lava a barba com o shampoo do cabelo?",
      "Para de passar balm na barba molhada.",
      "Minha barba parou de coçar quando eu parei com isso.",
      "POV: você descobriu por que sua barba coça.",
      "Se você tem barba, comete pelo menos um desses erros.",
    ],
  },
  {
    letra: "D",
    nome: "Primeira impressão",
    desc: "Abre o kit na câmera e vai falando: cheiro, textura, como espalha. Reação sincera, do jeito que sair.",
    ganchos: [
      "Vale a pena? Abrindo agora pra ver.",
      "Nunca usei FuckingBarba. Bora testar.",
      "Olha como ficou na primeira passada.",
      "POV: o kit chegou e você não aguentou esperar.",
      "Se você está de olho nesse kit, assiste antes de comprar.",
    ],
  },
  {
    letra: "E",
    nome: "Papo reto",
    desc: "Fala pra câmera como se fosse pra um amigo: por que você usa e o que mudou na sua barba.",
    ganchos: [
      "Quer saber o que eu passo na barba?",
      "Vou ser sincero sobre esse óleo.",
      "Olha como minha barba tá hoje.",
      "POV: seu amigo pergunta o que você passa na barba.",
      "Se você tem barba e não passa nada nela, isso é pra você.",
    ],
  },
] as const

export function Matriz() {
  const [ideia, setIdeia] = useState(0)
  const [gancho, setGancho] = useState(-1)
  const atual = IDEIAS[ideia]

  return (
    <div className="criadores__matriz-bloco">
      <div>
        <div className="criadores__matriz" data-matriz>
          <span className="criadores__matriz-cab criadores__matriz-cab--canto">Ideia</span>
          {TIPOS.map((_, g) => (
            <span key={g} className="criadores__matriz-cab">
              G{g + 1}
            </span>
          ))}
          {IDEIAS.map((i, n) => (
            <Linha
              key={i.letra}
              letra={i.letra}
              nome={i.nome}
              ativa={n === ideia}
              gancho={n === ideia ? gancho : -1}
              escolher={(g) => {
                setIdeia(n)
                setGancho(g)
              }}
            />
          ))}
        </div>
        <ul className="criadores__legenda-matriz">
          <li>
            <i data-mini="gancho" aria-hidden="true" />
            Faixa de cima: o gancho, os 3 primeiros segundos. Muda em cada coluna.
          </li>
          <li>
            <i data-mini="corpo" aria-hidden="true" />
            Resto: o corpo do vídeo. Igual na linha toda.
          </li>
        </ul>
      </div>
      <div className="criadores__ideia" aria-live="polite">
        <p className="criadores__rotulo">Ideia {atual.letra}</p>
        <h3 className="criadores__h3">{atual.nome}</h3>
        <p className="criadores__ideia-desc">{atual.desc}</p>
        <ol className="criadores__ganchos">
          {atual.ganchos.map((frase, g) => (
            <li key={g} data-foco={g === gancho || undefined}>
              <small>
                {atual.letra}
                {g + 1} · {TIPOS[g]}
              </small>
              <q>{frase}</q>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

function Linha({
  letra,
  nome,
  ativa,
  gancho,
  escolher,
}: {
  letra: string
  nome: string
  ativa: boolean
  gancho: number
  escolher: (gancho: number) => void
}) {
  return (
    <>
      <button
        type="button"
        className="criadores__matriz-ideia"
        aria-pressed={ativa}
        onClick={() => escolher(-1)}
      >
        <b>{letra}</b>
        <span>{nome}</span>
      </button>
      {TIPOS.map((tipo, g) => (
        <span
          key={g}
          className="criadores__quadro"
          data-g={g}
          data-ativo={ativa || undefined}
          data-foco={g === gancho || undefined}
          aria-hidden="true"
          onClick={() => escolher(g)}
          title={`${letra}${g + 1}: ${tipo}`}
        >
          {letra}
          {g + 1}
        </span>
      ))}
    </>
  )
}
