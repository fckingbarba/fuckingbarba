"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { Cronometro, Raio } from "@/components/icones"
import {
  enderecoDoCookie,
  prazoCurto,
  restanteAte,
  situacaoAgora,
  type OfertaDaPagina,
} from "@/lib/ofertas"

/**
 * A OFERTA OCULTA NA PÁGINA DO PRODUTO (entrega 0240, a opção A do desenho
 * aprovado: a faixa no topo). Quem abriu o link de uma oferta tem a marca
 * dela no navegador (`COOKIE_DA_OFERTA`, deixada pela página da oferta); na
 * página de um produto DESSA oferta, ele vê o preço dela — no preço grande,
 * nos cartões de quantidade, no selo da foto e na barra fixa —, a faixa
 * com o contador, e o "Adicionar à sacola" marca a sacola com a oferta.
 *
 * TUDO NO NAVEGADOR, DEPOIS DE ABRIR: a página do produto é a mesma pra todo
 * mundo, guardada e servida do CDN (e é ela que o Google lê, com o preço de
 * sempre). Sem a marca, este provedor não pergunta nada. Com ela, uma ida a
 * `/api/oferta/<endereço>`; o produto fora da oferta, ou a oferta fora do
 * ar, e nada muda. No fim da oferta, com a página aberta, tudo volta ao
 * preço de sempre na hora.
 *
 * O preço que vale é o do carrinho: a tela só mostra o menor entre o "por"
 * e o de hoje (o que a lista da oferta cobra).
 */

export type OfertaNaPdp = {
  endereco: string
  titulo: string
  terminaEm: string
  /** O "por" de uma unidade, como o painel escolheu. */
  por: number
  /** O "-X%" da foto, contra o cheio (ou o preço de hoje, sem ele). */
  desconto: number | null
}

const Contexto = createContext<OfertaNaPdp | null>(null)

/** A oferta deste produto pra quem veio pelo link, ou `null` (a página de sempre). */
export const useOfertaNaPdp = () => useContext(Contexto)

export function ProvedorDaOfertaNaPdp({
  produtoId,
  precos,
  children,
}: {
  produtoId: string
  /** O preço de hoje de uma unidade e o cheio (`precosDe`), pro selo da foto. */
  precos: { atual: number; cheio: number | null } | null
  children: ReactNode
}) {
  const [oferta, setOferta] = useState<OfertaNaPdp | null>(null)
  const atual = precos?.atual ?? null
  const cheio = precos?.cheio ?? null

  useEffect(() => {
    const endereco = enderecoDoCookie(document.cookie)
    if (!endereco) return
    let vale = true
    fetch(`/api/oferta/${endereco}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ oferta?: OfertaDaPagina | null }>) : null))
      .then((corpo) => {
        const o = corpo?.oferta
        const item = o?.produtos.find((p) => p.id === produtoId)
        if (!vale || !o || !item || situacaoAgora(o, Date.now()) !== "no-ar") return
        const paga = atual === null ? item.por : Math.min(item.por, atual)
        const referencia = cheio ?? atual
        setOferta({
          endereco: o.endereco,
          titulo: o.titulo,
          terminaEm: o.terminaEm,
          por: item.por,
          desconto:
            referencia && referencia > paga ? Math.round((1 - paga / referencia) * 100) : null,
        })
      })
      .catch(() => undefined)
    return () => {
      vale = false
    }
  }, [produtoId, atual, cheio])

  // No fim, com a página aberta: volta tudo ao preço de sempre.
  useEffect(() => {
    if (!oferta) return
    const falta = new Date(oferta.terminaEm).getTime() - Date.now()
    const t = setTimeout(() => setOferta(null), Math.max(0, Math.min(falta, 2_147_000_000)))
    return () => clearTimeout(t)
  }, [oferta])

  return <Contexto.Provider value={oferta}>{children}</Contexto.Provider>
}

/** O relógio da tela: o "agora" a cada segundo, parado com a aba escondida. */
function useAgora(ligado: boolean): number | null {
  const [agora, setAgora] = useState<number | null>(null)
  useEffect(() => {
    if (!ligado) return
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
  }, [ligado])
  return agora
}

const dois = (n: number) => String(n).padStart(2, "0")

/**
 * A FAIXA DO ALTO DA PÁGINA — a fita amarela (entrega 0245, a "F2" do
 * desenho, com o relógio que a loja pediu): "Preço do seu link · acaba em",
 * e o relógio num bloco preto, 02d 14h 33m 08s, os segundos em menta. Sem
 * dias, o bloco começa nas horas. O mesmo tamanho da faixa de antes: a loja
 * não quis nada que ocupe mais tela.
 */
export function FaixaDaOferta() {
  const oferta = useOfertaNaPdp()
  const agora = useAgora(Boolean(oferta))
  if (!oferta) return null
  const restante = agora === null ? null : restanteAte(new Date(oferta.terminaEm).getTime(), agora)
  const partes: [string, string][] = restante
    ? [
        ...(restante.dias > 0 ? [[dois(restante.dias), "d"] as [string, string]] : []),
        [dois(restante.horas), "h"],
        [dois(restante.minutos), "m"],
        [dois(restante.segundos), "s"],
      ]
    : [
        ["--", "h"],
        ["--", "m"],
        ["--", "s"],
      ]
  return (
    <div className="faixa-oferta" role="note" data-faixa-oferta>
      <p className="faixa-oferta__nome">
        <span className="faixa-oferta__raio">
          <Raio />
        </span>
        <span className="faixa-oferta__textos">
          <b>Preço do seu link</b>
          <span>acaba em</span>
        </span>
      </p>
      {/* aria-hidden: o número que troca a cada segundo é ruído pra quem ouve. */}
      <p className="faixa-oferta__relogio" aria-hidden="true">
        <Cronometro />
        {partes.map(([numero, unidade]) => (
          <span key={unidade} className="faixa-oferta__parte" data-unidade={unidade}>
            <b>{numero}</b>
            {unidade}
          </span>
        ))}
      </p>
      <span className="sr-only">{restante ? `Acaba em ${prazoCurto(restante)}` : ""}</span>
    </div>
  )
}

/** "Oferta acaba em 2d 14h" — embaixo do preço da barra fixa. */
export function PrazoDaOferta({ terminaEm }: { terminaEm: string }) {
  const agora = useAgora(true)
  if (agora === null) return null
  return (
    <span className="barra-compra__oferta">
      Oferta acaba em {prazoCurto(restanteAte(new Date(terminaEm).getTime(), agora))}
    </span>
  )
}
