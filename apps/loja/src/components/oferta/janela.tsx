"use client"

import Link from "next/link"
import { useEffect, useState, type ReactNode } from "react"
import { Raio } from "@/components/icones"
import {
  cookieDaOferta,
  quandoAcaba,
  restanteAte,
  situacaoAgora,
  type OfertaDaPagina,
} from "@/lib/ofertas"

/** Na última hora o contador fica amarelo e pulsa, como o das ofertas relâmpago. */
const URGENCIA_MS = 60 * 60 * 1000

const doisDigitos = (n: number) => String(n).padStart(2, "0")

/**
 * A PÁGINA DA OFERTA OCULTA, do lado do navegador: o contador até o fim e o
 * que aparece embaixo dele — os produtos (`children`, os cards do servidor),
 * ou o recado de que a oferta ainda não começou ou já acabou.
 *
 * QUEM DECIDE É O RELÓGIO DAQUI: a página fica guardada por horas, e o
 * começo e o fim passam sem ninguém avisar. O primeiro desenho é o do
 * servidor (a situação de quando a página foi feita, e o contador em
 * `--`); na hidratação entra o "agora", e a cada segundo a conta é refeita
 * — virou o fim, os produtos saem na hora. A pausa e o "encerrar" do painel
 * refazem a página (vem `pausada`/`encerrada`). O preço quem garante é o
 * carrinho: a marca de oferta que acabou não acha preço nenhum.
 *
 * A aba escondida não conta (como o contador da home): ao voltar, a conta
 * sai certa do relógio.
 *
 * A MARCA NO NAVEGADOR (entrega 0240): no ar, a página deixa o cookie da
 * oferta (`cookieDaOferta`, até o fim dela). É por ele que a página de cada
 * produto da oferta mostra o preço dela pra quem veio pelo link.
 */
export function JanelaDaOferta({
  oferta,
  children,
}: {
  oferta: Pick<
    OfertaDaPagina,
    "endereco" | "titulo" | "chamada" | "comecaEm" | "terminaEm" | "situacao"
  >
  children: ReactNode
}) {
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

  const situacao = agora === null ? oferta.situacao : situacaoAgora(oferta, agora)
  const fim = new Date(oferta.terminaEm).getTime()
  const restante = agora === null ? null : restanteAte(fim, agora)

  // A marca no navegador, uma vez, com a oferta no ar (ver lá em cima).
  const noAr = situacao === "no-ar"
  useEffect(() => {
    if (!noAr) return
    document.cookie = cookieDaOferta(
      oferta.endereco,
      oferta.terminaEm,
      Date.now(),
      location.protocol === "https:"
    )
  }, [noAr, oferta.endereco, oferta.terminaEm])
  const urgente = restante !== null && restante.ms <= URGENCIA_MS
  const numero = (v: number | undefined) => (v === undefined ? "--" : doisDigitos(v))

  return (
    <>
      <section className="offers oferta__topo" aria-labelledby="oferta-titulo">
        <div className="offers__box">
          <span className="offers__raio" aria-hidden="true" />
          <p className="offers__tag">
            <Raio />
            Oferta só pra quem tem o link
            <Raio />
          </p>
          <div className="oferta__cabeca">
            <h1 className="oferta__titulo" id="oferta-titulo">
              {oferta.titulo}
            </h1>
            {oferta.chamada ? <p className="oferta__chamada">{oferta.chamada}</p> : null}
          </div>
          {situacao === "no-ar" ? (
            <div className="oferta__prazo" data-prazo-oferta>
              <p className="oferta__rotulo">Acaba em</p>
              <div className={`offers__timer${urgente ? " is-urgente" : ""}`} aria-hidden="true">
                {restante === null || restante.dias > 0 ? (
                  <div className="offers__unit">
                    <span className="offers__num">{numero(restante?.dias)}</span>
                    <span className="offers__unit-label">
                      {restante?.dias === 1 ? "Dia" : "Dias"}
                    </span>
                  </div>
                ) : null}
                <div className="offers__unit">
                  <span className="offers__num">{numero(restante?.horas)}</span>
                  <span className="offers__unit-label">Horas</span>
                </div>
                <div className="offers__unit">
                  <span className="offers__num">{numero(restante?.minutos)}</span>
                  <span className="offers__unit-label">Min</span>
                </div>
                <div className="offers__unit">
                  <span className="offers__num is-tick" key={`s${restante?.segundos}`}>
                    {numero(restante?.segundos)}
                  </span>
                  <span className="offers__unit-label">Seg</span>
                </div>
              </div>
              <p className="oferta__ate" data-ate-oferta>
                Até {quandoAcaba(oferta.terminaEm)}
              </p>
            </div>
          ) : null}
        </div>
      </section>

      {situacao === "no-ar" ? (
        children
      ) : (
        <section className="oferta__recado" data-oferta-situacao={situacao}>
          {situacao === "agendada" ? (
            <>
              <h2 className="oferta__recado-titulo">Essa oferta ainda não começou</h2>
              <p>Ela abre {quandoAcaba(oferta.comecaEm)}. Guarde o link e volte na hora.</p>
            </>
          ) : (
            <>
              <h2 className="oferta__recado-titulo">Essa oferta acabou</h2>
              <p>Os produtos seguem na loja, pelo preço de sempre.</p>
            </>
          )}
          <Link href="/produtos" className="btn">
            Ver a loja
            <Raio className="btn__bolt" />
          </Link>
        </section>
      )}
    </>
  )
}
