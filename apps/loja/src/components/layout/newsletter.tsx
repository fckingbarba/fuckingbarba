"use client"

import Link from "next/link"
import { useActionState } from "react"
import { Raio } from "@/components/icones"
import { inscreverNaNewsletter } from "@/lib/acoes/newsletter"
import { NEWSLETTER_INICIO } from "@/lib/newsletter-visivel"

/**
 * Formulário de novidades do rodapé.
 *
 * GUARDA DE VERDADE: o e-mail vai pro Medusa (módulo `newsletter`), com a
 * data do consentimento, e aparece no admin em "Newsletter" — de onde se
 * baixa a lista e se remove quem pede pra sair. Até 23/09 o envio era
 * interceptado e a pessoa era avisada de que nada tinha sido guardado.
 *
 * A linha de baixo é a mesma pra tudo: o consentimento antes, a resposta
 * depois. `aria-live` porque ela muda sem a página mudar — quem usa leitor de
 * tela precisa ouvir que deu certo (ou por que não deu).
 */
export function Newsletter() {
  const [estado, enviar, enviando] = useActionState(inscreverNaNewsletter, NEWSLETTER_INICIO)

  return (
    <form className="rodape__form" action={enviar}>
      <div className="rodape__form-linha">
        <label className="sr-only" htmlFor="news-email">
          Seu e-mail
        </label>
        <input
          // A chave troca a cada resposta: com ela o campo nasce de novo com o
          // e-mail que deu erro (pra corrigir, não redigitar) ou vazio depois
          // de dar certo. O React 19 limpa o formulário sozinho ao enviar.
          key={estado.tipo === "erro" ? `erro:${estado.email}` : estado.tipo}
          id="news-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="Seu melhor e-mail"
          defaultValue={estado.tipo === "erro" ? estado.email : ""}
          aria-invalid={estado.tipo === "erro" || undefined}
          aria-describedby="news-resposta"
        />
        <button type="submit" className="btn" disabled={enviando}>
          {enviando ? "Inscrevendo…" : "Inscrever"}
          <Raio className="btn__bolt" />
        </button>
      </div>
      <p className="rodape__consent" id="news-resposta" aria-live="polite">
        {estado.tipo === "ok" ? (
          "Pronto, você está na lista. Dá pra sair quando quiser."
        ) : estado.tipo === "erro" ? (
          estado.texto
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
