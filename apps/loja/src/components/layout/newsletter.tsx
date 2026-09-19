"use client"

import Link from "next/link"
import { useState } from "react"
import { Raio } from "@/components/icones"

/**
 * Formulário de novidades do rodapé.
 *
 * AINDA NÃO GUARDA NADA. A tabela existe (`loja.newsletter` na Supabase), mas
 * a função que grava e o disparo do e-mail são da fase 5, junto com o Resend.
 * Enquanto isso o envio é interceptado e a pessoa é avisada — um formulário
 * que parece funcionar e engole o e-mail é pior que um que diz a verdade.
 *
 * Quando ligar: troque o `onSubmit` por uma Server Action que valida, guarda
 * e devolve o estado; o `aria-live` abaixo já está no lugar pra anunciar a
 * resposta a quem usa leitor de tela.
 */
export function Newsletter() {
  const [avisado, setAvisado] = useState(false)

  return (
    <form
      className="rodape__form"
      onSubmit={(evento) => {
        evento.preventDefault()
        setAvisado(true)
      }}
    >
      <div className="rodape__form-linha">
        <label className="sr-only" htmlFor="news-email">
          Seu e-mail
        </label>
        <input
          id="news-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="Seu melhor e-mail"
        />
        <button type="submit" className="btn">
          Inscrever
          <Raio className="btn__bolt" />
        </button>
      </div>
      <p className="rodape__consent" aria-live="polite">
        {avisado ? (
          "A lista de novidades ainda está sendo montada — seu e-mail não foi guardado. Volte quando a loja abrir."
        ) : (
          <>
            Ao se inscrever você concorda em receber e-mails da FuckingBarba e pode sair quando
            quiser. Veja a <Link href="/privacidade">Política de Privacidade</Link>.
          </>
        )}
      </p>
    </form>
  )
}
