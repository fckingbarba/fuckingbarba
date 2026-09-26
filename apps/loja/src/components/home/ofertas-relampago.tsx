"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Raio } from "@/components/icones"
import { useFrete } from "@/components/configuracoes/contexto"
import { frasesDoFrete } from "@/lib/configuracoes"

/** A partir de quanto tempo restante o contador fica amarelo e pulsa. */
const URGENCIA_MS = 60 * 60 * 1000

const DIA_MS = 24 * 60 * 60 * 1000
/** Brasília é UTC−3 o ano todo (sem horário de verão desde 2019): a meia-noite de lá é 03:00 UTC. */
const BRASILIA_MS = 3 * 60 * 60 * 1000

/**
 * A próxima meia-noite de Brasília a partir de `agora`. No milésimo exato da
 * virada é o próprio `agora` — o relógio mostra 00:00:00 e só no tique
 * seguinte recomeça em 23:59:59 (e não pula pra 24:00:00).
 */
function proximaMeiaNoite(agora: number): number {
  return Math.ceil((agora - BRASILIA_MS) / DIA_MS) * DIA_MS + BRASILIA_MS
}

/**
 * Até quando o contador conta: a próxima meia-noite — ou o fim da promoção
 * com prazo do admin, se ela acabar antes. O relógio nunca promete mais tempo
 * do que um desconto de verdade tem.
 */
function fimDoContador(agora: number, promocao: number | null): number {
  const meiaNoite = proximaMeiaNoite(agora)
  return promocao !== null && promocao > agora && promocao < meiaNoite ? promocao : meiaNoite
}

type Restante = { horas: number; minutos: number; segundos: number; ms: number }

function calcular(fim: number, agora: number): Restante {
  const ms = Math.max(0, fim - agora)
  const total = Math.floor(ms / 1000)
  return {
    ms,
    horas: Math.floor(total / 3600),
    minutos: Math.floor((total % 3600) / 60),
    segundos: total % 60,
  }
}

const doisDigitos = (n: number) => String(n).padStart(2, "0")

/**
 * O contador das ofertas.
 *
 * Sempre ligado e zerando à meia-noite de Brasília, todo dia (pedido da loja
 * em 24/09 — ver `ofertas.tsx`). Por isso não há mais a caixa de "Dias": o
 * prazo nunca passa de 24 horas.
 *
 * Três decisões que não são óbvias no código:
 *
 * 1. **Cada tique recalcula a partir do relógio**, em vez de subtrair um
 *    segundo do valor anterior. Timer de navegador atrasa (aba em segundo
 *    plano, celular dormindo); somando -1s o relógio derretia devagarinho e
 *    ninguém perceberia. Recalculando, ele volta certo sozinho — e a virada
 *    da meia-noite vem de graça: o tique seguinte já conta até a próxima.
 * 2. **A aba escondida não conta.** Nada muda na tela e, como o item 1 vale,
 *    ao voltar o número já aparece correto sem ter que recuperar nada.
 * 3. **O primeiro desenho é o do servidor: `--`.** O HTML é cacheado e
 *    servido pelo CDN; se ele trouxesse números, viria um tempo congelado no
 *    momento do build. Os números entram na hidratação, que é o único lugar
 *    onde existe "agora".
 */
export function OfertasRelampago({
  promocaoTerminaEm,
  titulo,
}: {
  /** O fim da promoção com prazo que está valendo (ISO), se houver. */
  promocaoTerminaEm: string | null
  titulo: string
}) {
  const frases = frasesDoFrete(useFrete())

  const promocao = promocaoTerminaEm ? new Date(promocaoTerminaEm).getTime() : null
  // O "agora" do navegador: `null` até a hidratação (item 3).
  const [agora, setAgora] = useState<number | null>(null)

  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null

    const tique = () => setAgora(Date.now())
    const comecar = () => {
      if (id) return
      tique()
      id = setInterval(tique, 1000)
    }
    const parar = () => {
      if (id) clearInterval(id)
      id = null
    }
    const aoTrocarDeAba = () => (document.hidden ? parar() : comecar())

    comecar()
    document.addEventListener("visibilitychange", aoTrocarDeAba)
    return () => {
      parar()
      document.removeEventListener("visibilitychange", aoTrocarDeAba)
    }
  }, [])

  const fim = agora === null ? null : fimDoContador(agora, promocao)
  const restante = fim === null || agora === null ? null : calcular(fim, agora)

  const urgente = restante !== null && restante.ms <= URGENCIA_MS
  // "Horas" some na última hora, deixando minutos e segundos sozinhos — que é
  // o que importa ali. No primeiro desenho, antes de existir "agora", ela fica.
  const mostraHoras = restante === null || restante.horas > 0

  const numero = (valor: number | null) => (valor === null ? "--" : doisDigitos(valor))

  return (
    <section className="offers" aria-label={titulo}>
      <div className="offers__box">
        {/* O raio do fundo (só enfeite) — ver .offers__raio em ofertas.css. */}
        <span className="offers__raio" aria-hidden="true" />
        <p className="offers__tag">
          <Raio />
          {titulo}
          <Raio />
        </p>

        <div className="offers__inner">
          <div className="offers__main">
            <div className="offers__copy">
              <Raio className="offers__bolt" />
              <p className="offers__headline">Válidas por tempo limitado</p>
            </div>

            <div>
              {/* aria-hidden: números que trocam a cada segundo são ruído pra
                  quem usa leitor de tela. A frase abaixo diz a mesma coisa
                  uma vez só. */}
              <div className={`offers__timer${urgente ? " is-urgente" : ""}`} aria-hidden="true">
                <div className="offers__unit" hidden={!mostraHoras}>
                  {/* A `key` que muda remonta o span, e é isso que faz a
                      animação de virada rodar de novo a cada segundo. */}
                  <span className="offers__num is-tick" key={`h${restante?.horas}`}>
                    {numero(restante?.horas ?? null)}
                  </span>
                  <span className="offers__unit-label">Horas</span>
                </div>
                <div className="offers__unit">
                  <span className="offers__num is-tick" key={`m${restante?.minutos}`}>
                    {numero(restante?.minutos ?? null)}
                  </span>
                  <span className="offers__unit-label">Minutos</span>
                </div>
                <div className="offers__unit">
                  <span className="offers__num is-tick" key={`s${restante?.segundos}`}>
                    {numero(restante?.segundos ?? null)}
                  </span>
                  <span className="offers__unit-label">Segundos</span>
                </div>
              </div>
              <p className="offers__aviso">
                {restante && restante.ms > 3600000 ? "Últimas horas" : "Últimos minutos"}
              </p>
              {/* Só depois da hidratação: a data depende do "agora" (item 3). */}
              {fim !== null ? (
                <p className="sr-only">
                  Ofertas válidas até{" "}
                  {new Date(fim).toLocaleString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                    day: "2-digit",
                    month: "long",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  .
                </p>
              ) : null}
            </div>
          </div>

          <div className="offers__action">
            {/* Todos os produtos (pedido da loja em 24/09): o contador é da
                loja inteira, não de uma promoção — então o botão abre o
                catálogo todo, na ordem de sempre. */}
            <Link href="/produtos" className="btn">
              Aproveitar ofertas
              <Raio className="btn__bolt" />
            </Link>
            {frases ? <p className="offers__note">{frases.completa}*</p> : null}
          </div>
        </div>
      </div>
    </section>
  )
}
