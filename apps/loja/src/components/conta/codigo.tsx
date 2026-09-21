"use client"

import Link from "next/link"
import { useActionState, useEffect, useRef, useState, useTransition } from "react"
import { Campo } from "@/components/checkout/campo"
import { Raio } from "@/components/icones"
import { confirmarCodigo, reenviarCodigo } from "@/lib/acoes/conta"
import { CODIGO_INICIAL } from "@/lib/conta-visivel"

/**
 * OS SEIS DÍGITOS — num campo só, e não em seis caixinhas.
 *
 * Colar o código, o "preencher do e-mail" do iPhone
 * (`autocomplete="one-time-code"`) e o leitor de tela funcionam de primeira
 * num campo só. A cara de caixinhas é o espaçamento largo (`conta.css`).
 *
 * ENTRA SOZINHO no sexto dígito; o botão fica pra quem prefere.
 *
 * O "REENVIAR" conta 30 segundos a partir do envio de verdade (a hora mora
 * no cookie, e a página calcula quanto falta) — recarregar a tela não zera a
 * espera.
 */
export function FormCodigo({ email, faltam }: { email: string; faltam: number }) {
  const [estado, acao, conferindo] = useActionState(confirmarCodigo, CODIGO_INICIAL)
  const formulario = useRef<HTMLFormElement>(null)

  return (
    <>
      <p className="entrar__txt">
        Mandamos um código de 6 dígitos pra <b>{email}</b>.{" "}
        <Link className="link" href="/conta/entrar">
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
        {/* Uma resposta, um campo novo: vazio e com o cursor, pronto pra
            digitar de novo. A `key` remonta — mais simples e mais certo que
            limpar à mão depois de cada erro. */}
        <CampoDoCodigo
          key={estado.rodada}
          erro={estado.erro}
          aoCompletar={() => {
            if (!conferindo) formulario.current?.requestSubmit()
          }}
        />
        {estado.perdido ? (
          <Link className="btn btn--bloco" href="/conta/entrar">
            Pedir um código novo <Raio className="btn__bolt" />
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
                Entrar <Raio className="btn__bolt" />
              </>
            )}
          </button>
        )}
      </form>

      {estado.perdido ? null : <Reenviar faltam={faltam} destaque={estado.morto} email={email} />}
    </>
  )
}

/**
 * Só dígito, e sem `maxLength`: colar "123 456" do e-mail tem que dar
 * 123456, e não "123 45".
 */
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

  // Um segundo por vez. O `setRestam` mora no callback do relógio, não no
  // corpo do efeito — é o relógio (sistema de fora) avisando que o tempo passou.
  useEffect(() => {
    if (restam <= 0) return
    const t = setTimeout(() => setRestam((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [restam])

  function reenviar() {
    comecar(async () => {
      const r = await reenviarCodigo()
      setAviso(r.ok ? `Código novo enviado pra ${email}.` : r.erro)
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
