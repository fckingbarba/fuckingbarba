"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useActionState, useEffect, useId } from "react"
import { Envelope } from "@/components/icones"
import { pedirAviso } from "@/lib/acoes/avise-me"
import { AVISO_INICIO, type EstadoDoAviso } from "@/lib/avise-me-visivel"
import { SEM_CONEXAO, semQueda } from "@/lib/rede"

/** Sem internet, a ação nem volta: o recado fica na caixa, com o e-mail no campo. */
const enviar = (anterior: EstadoDoAviso, fd: FormData) =>
  semQueda(
    () => pedirAviso(anterior, fd),
    (): EstadoDoAviso => ({
      tipo: "erro",
      texto: SEM_CONEXAO,
      email: String(fd.get("email") ?? ""),
    })
  )

/**
 * AVISE-ME QUANDO CHEGAR — no lugar do botão de comprar, na página do
 * produto esgotado.
 *
 * O e-mail vai pro Medusa com o produto (`POST /store/avise-me`), e quando o
 * estoque volta sai UM e-mail, "voltou pro estoque" (o job
 * `avisar-quem-espera`, no backend). É o que a frase de baixo promete: um
 * aviso só, sobre este produto — não é a newsletter, que é outro "sim".
 *
 * A caixa (`caixa`) é o alvo da barra fixa: o "Avise-me" dela rola até aqui
 * e põe o cursor no campo. Ela existe nos três momentos (o campo, o "pronto"
 * e o "voltou"), e a linha de baixo também: é a região viva que anuncia a
 * resposta — a que nasce junto com o texto costuma não ser anunciada.
 *
 * SE O PRODUTO VOLTOU entre a página abrir e o clique (a página estava
 * velha), o Medusa responde que tem estoque e já avisou a loja: a página se
 * refaz sozinha, com o botão de comprar no lugar desta caixa.
 */
export function AviseMe({
  varianteId,
  nome,
  caixa,
}: {
  varianteId: string
  nome: string
  caixa: React.RefObject<HTMLDivElement | null>
}) {
  const [estado, pedir, pedindo] = useActionState(enviar, AVISO_INICIO)
  const router = useRouter()
  const idDoCampo = useId()
  const idDaNota = useId()

  useEffect(() => {
    if (estado.tipo === "voltou") router.refresh()
  }, [estado.tipo, router])

  const respondeu = estado.tipo === "ok" || estado.tipo === "voltou"

  return (
    <div ref={caixa} className="avise" data-avise={estado.tipo}>
      <p className="avise__titulo">
        <Envelope />
        Avise-me quando chegar
      </p>

      {respondeu ? null : (
        <form action={pedir}>
          <p className="avise__texto">
            Deixa seu e-mail: quando ele voltar pro estoque, a gente te avisa.
          </p>
          <input type="hidden" name="variante" value={varianteId} />
          <div className="avise__linha">
            <label className="sr-only" htmlFor={idDoCampo}>
              Seu e-mail
            </label>
            <input
              // A chave troca a cada erro: o campo nasce de novo com o e-mail
              // que deu errado, pra corrigir em vez de redigitar. O React 19
              // limpa o formulário sozinho ao enviar.
              key={estado.tipo === "erro" ? `erro:${estado.email}` : "inicio"}
              id={idDoCampo}
              className="avise__campo"
              name="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              placeholder="Seu e-mail"
              defaultValue={estado.tipo === "erro" ? estado.email : ""}
              aria-invalid={estado.tipo === "erro" || undefined}
              aria-describedby={idDaNota}
            />
            <button type="submit" className="avise__botao" disabled={pedindo}>
              {pedindo ? "Guardando…" : "Me avise"}
            </button>
          </div>
        </form>
      )}

      <p
        className="avise__nota"
        data-nota={estado.tipo === "inicio" ? undefined : estado.tipo}
        id={idDaNota}
        aria-live="polite"
      >
        {estado.tipo === "ok" ? (
          <>
            Pronto. Quando o {nome} voltar, o aviso vai pra <b>{estado.email}</b> — um e-mail só.
          </>
        ) : estado.tipo === "voltou" ? (
          "Boa notícia: ele acabou de voltar pro estoque. A página está se atualizando pra você comprar."
        ) : estado.tipo === "erro" ? (
          estado.texto
        ) : (
          <>
            Um e-mail só, sobre este produto. Veja a{" "}
            <Link href="/privacidade">Política de Privacidade</Link>.
          </>
        )}
      </p>
    </div>
  )
}
