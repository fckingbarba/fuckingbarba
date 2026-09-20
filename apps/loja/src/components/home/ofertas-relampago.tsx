"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Raio } from "@/components/icones"
import { emReais } from "@/lib/formato"
import { FRETE_GRATIS_A_PARTIR_DE } from "@/lib/site"

/** A partir de quanto tempo restante o contador fica amarelo e pulsa. */
const URGENCIA_MS = 60 * 60 * 1000

type Restante = { dias: number; horas: number; minutos: number; segundos: number; ms: number }

function calcular(fim: number): Restante {
  const ms = Math.max(0, fim - Date.now())
  const total = Math.floor(ms / 1000)
  const dias = Math.floor(total / 86400)
  return {
    ms,
    dias,
    // Sem dias, as horas acumulam: 30 horas viram "30", não "06".
    horas: dias > 0 ? Math.floor(total / 3600) % 24 : Math.floor(total / 3600),
    minutos: Math.floor((total % 3600) / 60),
    segundos: total % 60,
  }
}

const doisDigitos = (n: number) => String(n).padStart(2, "0")

/**
 * O contador das ofertas.
 *
 * Três decisões que não são óbvias no código:
 *
 * 1. **Cada tique recalcula a partir da data final**, em vez de subtrair um
 *    segundo do valor anterior. Timer de navegador atrasa (aba em segundo
 *    plano, celular dormindo); somando -1s o relógio derretia devagarinho e
 *    ninguém perceberia. Recalculando, ele volta certo sozinho.
 * 2. **A aba escondida não conta.** Nada muda na tela e, como o item 1 vale,
 *    ao voltar o número já aparece correto sem ter que recuperar nada.
 * 3. **O primeiro desenho é o do servidor: `--`.** O HTML é cacheado e
 *    servido pelo CDN; se ele trouxesse números, viria um tempo congelado no
 *    momento do build. Os números entram na hidratação, que é o único lugar
 *    onde existe "agora".
 */
export function OfertasRelampago({ terminaEm }: { terminaEm: string }) {
  const fim = new Date(terminaEm).getTime()
  const [restante, setRestante] = useState<Restante | null>(null)

  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null

    const tique = () => setRestante(calcular(fim))
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
  }, [fim])

  // Acabou: a seção some inteira, como manda o desconto que já não existe.
  if (restante && restante.ms <= 0) return null

  const urgente = restante !== null && restante.ms <= URGENCIA_MS
  // Caixa que não diz nada sai de cena: "Dias" só entra em promoção longa
  // (senão apareceria "294 HORAS") e "Horas" some na última hora, deixando
  // minutos e segundos sozinhos — que é o que importa ali. No primeiro
  // desenho, antes de existir "agora", "Dias" começa fora, como no protótipo.
  const mostraDias = restante !== null && restante.dias > 0
  const mostraHoras = restante === null || restante.dias > 0 || restante.horas > 0

  const numero = (valor: number | null) => (valor === null ? "--" : doisDigitos(valor))

  return (
    <section className="offers" aria-label="Ofertas relâmpago">
      <div className="offers__box">
        <p className="offers__tag">
          <Raio />
          Ofertas Relâmpago
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
                <div className="offers__unit" hidden={!mostraDias}>
                  {/* A `key` que muda remonta o span, e é isso que faz a
                      animação de virada rodar de novo a cada segundo. */}
                  <span className="offers__num is-tick" key={`d${restante?.dias}`}>
                    {numero(restante?.dias ?? null)}
                  </span>
                  <span className="offers__unit-label">Dias</span>
                </div>
                <div className="offers__unit" hidden={!mostraHoras}>
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
              <p className="sr-only">
                Ofertas válidas até{" "}
                {new Date(terminaEm).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "long",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                .
              </p>
            </div>
          </div>

          <div className="offers__action">
            {/* "Ofertas" aqui é a loja ordenada por maior desconto — que é o
                que a palavra significa pra quem clica. Não existe página de
                ofertas curada porque não existe curadoria: inventar uma seria
                uma segunda lista de produtos pra manter combinando com a
                primeira. */}
            <Link href="/produtos?ordem=desconto" className="btn">
              Aproveitar ofertas
              <Raio className="btn__bolt" />
            </Link>
            <p className="offers__note">
              Frete grátis a partir de {emReais(FRETE_GRATIS_A_PARTIR_DE)}*
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
