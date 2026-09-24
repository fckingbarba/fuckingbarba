"use client"

import Link from "next/link"
import { useActionState, useEffect, useRef, useState, useTransition } from "react"
import { Campo } from "@/components/campo"
import { Icone } from "@/components/icones"
import { confirmarCodigo, pedirCodigo, reenviarCodigo } from "@/lib/acoes/entrar"
import { CODIGO_INICIAL, ENTRAR_INICIAL } from "@/lib/entrar-visivel"

/**
 * OS DOIS FORMULÁRIOS DE ENTRAR — o do e-mail e o dos seis dígitos. O jeito
 * é o da conta da loja (`apps/loja/src/components/conta/`): um campo só pro
 * código (colar e o "preencher do e-mail" do iPhone funcionam de primeira),
 * que entra sozinho no sexto dígito, e o "reenviar" contando 30 segundos
 * desde o envio de verdade.
 */

export function FormEmail({ email }: { email: string }) {
  const [estado, acao, enviando] = useActionState(pedirCodigo, ENTRAR_INICIAL)

  return (
    <form action={acao} onSubmit={(ev) => enviando && ev.preventDefault()} noValidate>
      <Campo
        rotulo="E-mail da equipe"
        nome="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="voce@fuckingbarba.com.br"
        // `key` com a rodada: depois de um erro, o campo volta com o que foi digitado.
        key={estado.rodada}
        defaultValue={estado.email || email}
        erro={estado.erro}
        autoFocus
        required
      />
      <button type="submit" className="btn btn--bloco" disabled={enviando} aria-busy={enviando}>
        {enviando ? (
          <>
            <span className="giro" aria-hidden="true" /> Enviando…
          </>
        ) : (
          <>
            Receber código <Icone nome="raio" />
          </>
        )}
      </button>
    </form>
  )
}

export function FormCodigo({ email, faltam }: { email: string; faltam: number }) {
  const [estado, acao, conferindo] = useActionState(confirmarCodigo, CODIGO_INICIAL)
  const formulario = useRef<HTMLFormElement>(null)

  return (
    <>
      <p className="entrar__txt">
        Se <b>{email}</b> for da equipe, o código de 6 dígitos chega em instantes.{" "}
        <Link className="link" href="/entrar">
          Trocar e-mail
        </Link>
      </p>

      <form
        ref={formulario}
        className="codigo"
        action={acao}
        onSubmit={(ev) => conferindo && ev.preventDefault()}
        noValidate
      >
        {/* Uma resposta, um campo novo: vazio e com o cursor, pronto pra digitar de novo. */}
        <CampoDoCodigo
          key={estado.rodada}
          erro={estado.erro}
          aoCompletar={() => {
            if (!conferindo) formulario.current?.requestSubmit()
          }}
        />
        {estado.perdido ? (
          <Link className="btn btn--bloco" href="/entrar">
            Pedir um código novo <Icone nome="raio" />
          </Link>
        ) : (
          <button
            type="submit"
            className="btn btn--bloco"
            disabled={conferindo}
            aria-busy={conferindo}
          >
            {conferindo ? (
              <>
                <span className="giro" aria-hidden="true" /> Entrando…
              </>
            ) : (
              <>
                Entrar <Icone nome="raio" />
              </>
            )}
          </button>
        )}
      </form>

      {estado.perdido ? null : <Reenviar faltam={faltam} destaque={estado.morto} email={email} />}
    </>
  )
}

/** Só dígito, e sem `maxLength`: colar "123 456" tem que dar 123456. */
function CampoDoCodigo({ erro, aoCompletar }: { erro: string; aoCompletar: () => void }) {
  const [valor, setValor] = useState("")
  return (
    <Campo
      rotulo="Código"
      nome="codigo"
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      placeholder="000000"
      autoFocus
      value={valor}
      onChange={(ev) => {
        const so = ev.target.value.replace(/\D+/g, "").slice(0, 6)
        setValor(so)
        // Depois do render, pra o valor já estar no campo quando o formulário sai.
        if (so.length === 6) requestAnimationFrame(aoCompletar)
      }}
      erro={erro}
      required
    />
  )
}

function Reenviar({
  faltam,
  destaque,
  email,
}: {
  faltam: number
  destaque: boolean
  email: string
}) {
  const [restam, setRestam] = useState(faltam)
  const [aviso, setAviso] = useState("")
  const [enviando, comecar] = useTransition()

  useEffect(() => {
    if (restam <= 0) return
    const t = setTimeout(() => setRestam((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [restam])

  function reenviar() {
    comecar(async () => {
      const r = await reenviarCodigo()
      setAviso(r.ok ? `Se ${email} for da equipe, um código novo está a caminho.` : r.erro)
      setRestam(r.segundos)
    })
  }

  return (
    <>
      <p className="codigo__reenviar" data-destaque={destaque ? "" : undefined}>
        Vale por 10 minutos. Não chegou? Olha no spam, ou{" "}
        <button type="button" className="link" onClick={reenviar} disabled={restam > 0 || enviando}>
          {enviando
            ? "enviando…"
            : restam > 0
              ? `reenvie em 0:${String(restam).padStart(2, "0")}`
              : "reenvie o código"}
        </button>
        .
      </p>
      <p className="codigo__aviso" role="status" aria-live="polite">
        {aviso}
      </p>
    </>
  )
}
