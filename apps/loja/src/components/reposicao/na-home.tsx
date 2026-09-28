"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { lerCookie, useFicha } from "@/components/ficha/usar-ficha"
import { COOKIE_CONSENTIMENTO, lerConsentimento } from "@/lib/consentimento"

/**
 * O AVISO DA REPOSIÇÃO NA HOME (entregas 0188 e 0190) — pequeno de propósito:
 * a home é a mesma pra todo mundo, e só quem está com a conta aberta pergunta
 * alguma coisa (a ficha do site, `components/ficha/usar-ficha.ts`). Com aviso,
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

/** O "fechar": vale até a próxima reposição (a chave muda). */
const FECHADO = "fb_reposicao_fechada"
/** O tempo de a página assentar antes de o aviso subir. */
const ESPERA_MS = 1500

const fechado = (chave: string) => {
  try {
    return localStorage.getItem(FECHADO) === chave
  } catch {
    return false
  }
}

export function ReposicaoNaHome() {
  const aviso = useFicha()?.reposicao ?? null
  /** A chave do aviso na tela; nula enquanto ele espera a vez, e depois do X. */
  const [naTela, setNaTela] = useState<string | null>(null)

  useEffect(() => {
    if (!aviso || fechado(aviso.chave)) return
    let relogio: ReturnType<typeof setTimeout> | undefined
    const tentar = () => {
      // A faixa de cookies na tela, ou a sacola aberta: tenta de novo depois.
      const livre =
        lerConsentimento(lerCookie(COOKIE_CONSENTIMENTO)) &&
        !document.documentElement.classList.contains("carrinho-aberto")
      if (livre) setNaTela(aviso.chave)
      else relogio = setTimeout(tentar, 3000)
    }
    relogio = setTimeout(tentar, ESPERA_MS)
    return () => clearTimeout(relogio)
  }, [aviso])

  if (!aviso || naTela !== aviso.chave) return null
  return (
    <Aviso
      aviso={aviso}
      aoFechar={() => {
        try {
          localStorage.setItem(FECHADO, aviso.chave)
        } catch {}
        setNaTela(null)
      }}
    />
  )
}
