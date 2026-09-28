"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { COOKIE_CONSENTIMENTO, lerConsentimento } from "@/lib/consentimento"
import {
  avisoValido,
  COOKIE_CONTA_ABERTA,
  ehSorteioDaConta,
  type AvisoDaReposicao,
} from "@/lib/reposicao"

/**
 * O AVISO DA REPOSIÇÃO NA HOME (entrega 0188) — pequeno de propósito: a home
 * é a mesma pra todo mundo, e só quem está com a conta aberta (o `fb_conta`,
 * `lib/reposicao.ts`) pergunta alguma coisa (`/api/reposicao`). Com aviso,
 * baixa o cartão (`./aviso`, com o CSS dele) e mostra num canto, depois de a
 * página assentar, com a faixa de cookies respondida e a sacola fechada. Sem
 * conta aberta, nada: nem pergunta, nem arquivo.
 *
 * Pra quem já comprou, é ele no lugar do pop-up da 1ª compra (que não
 * aparece pra quem está na conta).
 */

const Aviso = dynamic(() => import("./aviso").then((m) => m.AvisoDaReposicaoNaHome), {
  ssr: false,
})

/** A resposta guardada na aba: meia hora, presa ao sorteio do `fb_conta`. */
const DA_ABA = "fb_reposicao"
const MEIA_HORA = 30 * 60 * 1000
/** O "fechar": vale até a próxima reposição (a chave muda). */
const FECHADO = "fb_reposicao_fechada"
/** O tempo de a página assentar antes de o aviso subir. */
const ESPERA_MS = 1500

const lerCookie = (nome: string) => {
  const achado = document.cookie.split("; ").find((c) => c.startsWith(`${nome}=`))
  return achado ? decodeURIComponent(achado.slice(nome.length + 1)) : null
}

function daAba(conta: string): { aviso: AvisoDaReposicao | null } | null {
  try {
    const g = JSON.parse(sessionStorage.getItem(DA_ABA) ?? "null") as {
      conta?: unknown
      em?: unknown
      aviso?: unknown
    } | null
    if (!g || g.conta !== conta || typeof g.em !== "number" || Date.now() - g.em > MEIA_HORA)
      return null
    return { aviso: avisoValido(g.aviso) }
  } catch {
    return null
  }
}

function guardarNaAba(conta: string, aviso: AvisoDaReposicao | null) {
  try {
    sessionStorage.setItem(DA_ABA, JSON.stringify({ conta, em: Date.now(), aviso }))
  } catch {}
}

async function perguntar(conta: string): Promise<AvisoDaReposicao | null> {
  const guardado = daAba(conta)
  if (guardado) return guardado.aviso
  try {
    const r = await fetch("/api/reposicao", { cache: "no-store" })
    const aviso = avisoValido(((await r.json()) as { reposicao?: unknown }).reposicao)
    guardarNaAba(conta, aviso)
    return aviso
  } catch {
    return null
  }
}

const fechado = (chave: string) => {
  try {
    return localStorage.getItem(FECHADO) === chave
  } catch {
    return false
  }
}

export function ReposicaoNaHome() {
  const [aviso, setAviso] = useState<AvisoDaReposicao | null>(null)

  useEffect(() => {
    const conta = lerCookie(COOKIE_CONTA_ABERTA)
    if (!ehSorteioDaConta(conta)) return
    let vivo = true
    let relogio: ReturnType<typeof setTimeout> | undefined
    // A pergunta sai no relógio, e não aqui: no modo dev o React monta duas vezes, e o
    // primeiro relógio morre antes de perguntar — uma pergunta só, como no ar.
    let achado: Promise<AvisoDaReposicao | null> | null = null
    const tentar = async () => {
      const a = await (achado ??= perguntar(conta))
      if (!vivo || !a || fechado(a.chave)) return
      // A faixa de cookies na tela, ou a sacola aberta: tenta de novo depois.
      const livre =
        lerConsentimento(lerCookie(COOKIE_CONSENTIMENTO)) &&
        !document.documentElement.classList.contains("carrinho-aberto")
      if (livre) setAviso(a)
      else relogio = setTimeout(tentar, 3000)
    }
    relogio = setTimeout(tentar, ESPERA_MS)
    return () => {
      vivo = false
      clearTimeout(relogio)
    }
  }, [])

  if (!aviso) return null
  return (
    <Aviso
      aviso={aviso}
      aoFechar={() => {
        try {
          localStorage.setItem(FECHADO, aviso.chave)
        } catch {}
        setAviso(null)
      }}
      // Depois de refazer (e talvez comprar), a próxima visita pergunta de novo.
      aoRefazer={() => {
        try {
          sessionStorage.removeItem(DA_ABA)
        } catch {}
      }}
    />
  )
}
