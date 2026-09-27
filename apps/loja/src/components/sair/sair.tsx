"use client"

import Link from "next/link"
import { useActionState } from "react"
import { sairDaLista } from "@/lib/acoes/sair"
import { SEM_CONEXAO, semQueda } from "@/lib/rede"
import { PERGUNTA, type EstadoDoSair } from "@/lib/sair-visivel"

const sair = () =>
  semQueda(
    () => sairDaLista(),
    (): EstadoDoSair => ({ tipo: "erro", texto: SEM_CONEXAO })
  )

/**
 * A PERGUNTA E O "PRONTO". Um botão só: quem chegou aqui já clicou em "sair"
 * no e-mail. Os e-mails dos pedidos continuam — isso a tela diz antes e
 * depois, que é a dúvida de quem sai.
 */
export function Sair() {
  const [estado, acao, enviando] = useActionState(sair, PERGUNTA)

  if (estado.tipo === "saiu") {
    return (
      <section className="bloco sair__bloco" aria-labelledby="t-sair" data-saiu>
        <h1 id="t-sair" role="status">
          Pronto, você saiu da lista
        </h1>
        <p className="sair__txt">
          Você não recebe mais as ofertas da FuckingBarba por e-mail. Os e-mails dos seus pedidos
          (confirmação, envio e entrega) continuam chegando.
        </p>
        <p className="sair__txt">Mudou de ideia? É só se inscrever de novo no rodapé da loja.</p>
      </section>
    )
  }
  if (estado.tipo === "invalido") return <LinkInvalido />

  return (
    <section className="bloco sair__bloco" aria-labelledby="t-sair">
      <h1 id="t-sair">Sair da lista de ofertas?</h1>
      <p className="sair__txt">
        Você para de receber as ofertas da FuckingBarba por e-mail. Os e-mails dos seus pedidos
        (confirmação, envio e entrega) continuam chegando.
      </p>
      {estado.tipo === "erro" ? (
        <p className="sair__recado" role="alert">
          {estado.texto}
        </p>
      ) : null}
      <form action={acao}>
        <button
          type="submit"
          className="btn btn--bloco"
          disabled={enviando}
          aria-busy={enviando}
          data-sair
        >
          {enviando ? (
            <>
              <span className="giro" aria-hidden="true" /> Saindo…
            </>
          ) : (
            "Sair da lista"
          )}
        </button>
      </form>
    </section>
  )
}

export function LinkInvalido() {
  return (
    <section className="bloco sair__bloco" aria-labelledby="t-sair" data-link-invalido>
      <h1 id="t-sair">Esse link não vale</h1>
      <p className="sair__txt">
        Pra sair da lista, use o link <b>Sair da lista</b> no pé de qualquer e-mail de oferta nosso.
        Se não achar, <Link href="/contato">fala com a gente</Link> que a gente tira na hora.
      </p>
    </section>
  )
}
