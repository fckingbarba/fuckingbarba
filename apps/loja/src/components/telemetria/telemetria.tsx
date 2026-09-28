"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { aparelho, guardarMedida, mandar, paginaAgora } from "@/lib/telemetria"

/**
 * A MEDIDA DE CADA VISITA — mora no layout raiz, uma vez por aba (ver
 * `lib/telemetria.ts`). Não desenha nada.
 *
 * As medidas vêm do próprio Next (`useReportWebVitals`, em `./vitais`): o
 * tempo até aparecer o principal da tela (LCP), a demora pra reagir ao toque
 * (INP) e o quanto a tela pulou (CLS). O erro é o que estourou nos scripts da
 * loja — o de extensão do navegador e o de script de fora ("Script error.")
 * não são nossos e ficam de fora.
 *
 * O MEDIDOR SÓ BAIXA DEPOIS DA CARGA DA PÁGINA (entrega 0194). O `web-vitals`
 * do Next pesa uns 3 KB comprimidos, e no JavaScript da primeira tela ele
 * entrava na conta do LCP de toda página no Lighthouse do CI (ver o
 * AGENTS.md). Chegar depois não perde medida: o navegador guarda o LCP, o CLS
 * e o primeiro toque desde o começo, e o medidor lê o que já passou. O
 * ouvinte do erro continua aqui, na hidratação, como sempre esteve.
 */

const MEDIDAS = new Set(["LCP", "INP", "CLS"])
/** Barulho conhecido, sem efeito pra quem compra. */
const IGNORAR = /ResizeObserver loop|^Script error\.?$/

function medir(m: { name: string; value: number }) {
  if (!MEDIDAS.has(m.name)) return
  guardarMedida(m.name, {
    tipo: "vital",
    metrica: m.name,
    valor: m.value,
    aparelho: aparelho(),
    pagina: paginaAgora(),
  })
}

function avisarErro(mensagem: string) {
  if (!mensagem || IGNORAR.test(mensagem)) return
  mandar({ tipo: "erro", pagina: paginaAgora(), mensagem: mensagem.slice(0, 300) })
}

const Vitais = dynamic(() => import("./vitais").then((m) => m.Vitais), { ssr: false })

export function Telemetria() {
  const [medindo, setMedindo] = useState(false)

  // Depois do `load`, e de o navegador acabar o que estava fazendo nele.
  useEffect(() => {
    let relogio: ReturnType<typeof setTimeout> | undefined
    const comecar = () => {
      relogio = setTimeout(() => setMedindo(true), 0)
    }
    if (document.readyState === "complete") comecar()
    else window.addEventListener("load", comecar, { once: true })
    return () => {
      window.removeEventListener("load", comecar)
      clearTimeout(relogio)
    }
  }, [])

  useEffect(() => {
    /*
      NO `window`, E NÃO NO `document`: o Next conta o CLS e o INP finais no
      `visibilitychange` do document, e o evento sobe pro window DEPOIS de
      passar por lá — assim o envio já leva as contas finais. Trocando de
      página, o navegador dispara o `pagehide` ANTES do `visibilitychange`:
      o primeiro envio leva o que já tinha, o segundo, o CLS.
    */
    const aoEsconder = () => {
      if (document.visibilityState === "hidden") mandar()
    }
    const aoSair = () => mandar()
    const aoErro = (ev: ErrorEvent) => {
      // Só o que veio dos scripts da própria loja.
      if (ev.filename && !ev.filename.startsWith(window.location.origin)) return
      avisarErro(String(ev.message ?? ""))
    }
    const aoRecusar = (ev: PromiseRejectionEvent) => {
      const r = ev.reason
      avisarErro(r instanceof Error ? r.message : typeof r === "string" ? r : "")
    }
    window.addEventListener("visibilitychange", aoEsconder)
    window.addEventListener("pagehide", aoSair)
    window.addEventListener("error", aoErro)
    window.addEventListener("unhandledrejection", aoRecusar)
    return () => {
      window.removeEventListener("visibilitychange", aoEsconder)
      window.removeEventListener("pagehide", aoSair)
      window.removeEventListener("error", aoErro)
      window.removeEventListener("unhandledrejection", aoRecusar)
    }
  }, [])

  return medindo ? <Vitais aoMedir={medir} /> : null
}

/** A tela de erro (`app/error.tsx`, `app/global-error.tsx`) conta o que caiu. */
export function avisarTelaDeErro(erro: Error & { digest?: string }) {
  avisarErro(erro.digest ? `a página caiu no servidor (${erro.digest})` : erro.message)
}
