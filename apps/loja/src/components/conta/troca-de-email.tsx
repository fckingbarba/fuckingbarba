"use client"

import { useId, useRef, useState, useTransition, type KeyboardEvent } from "react"
import { Campo } from "@/components/checkout/campo"
import { Giro } from "@/components/checkout/resposta"
import { Reenviar } from "@/components/conta/codigo"
import {
  confirmarTrocaDeEmail,
  pedirCodigoDaTroca,
  reenviarCodigoDaTroca,
} from "@/lib/acoes/troca-de-email"

/**
 * O E-MAIL EM "MEUS DADOS", E A TROCA DELE — um passo dentro do campo, com o
 * fio amarelo do lado dizendo que ainda não terminou (o desenho do protótipo
 * da conta):
 *
 *   1. o e-mail novo, e "Enviar código" — o código vai pro endereço NOVO;
 *   2. o código, e "Confirmar" — ou sozinho, no sexto dígito, como no entrar.
 *
 * Até o código voltar certo, nada muda: o e-mail de agora continua valendo,
 * e "Cancelar a troca" só fecha a caixa (o código pendente vence sozinho).
 *
 * SEM `<form>` E SEM `name` NOS CAMPOS: isto mora dentro do formulário de
 * "Meus dados", e formulário não entra em formulário. Os botões chamam as
 * ações direto, e o Enter nos dois campos é tratado aqui — sem o
 * `preventDefault`, ele enviaria o formulário de fora, e "Enviar código"
 * viraria "Salvar".
 */
export function TrocaDeEmail({
  email,
  avisar,
}: {
  email: string
  avisar: (texto: string) => void
}) {
  const id = useId()
  const [aberta, setAberta] = useState(false)
  const [passo, setPasso] = useState<"email" | "codigo">("email")
  const [novo, setNovo] = useState("")
  const [erroDoEmail, setErroDoEmail] = useState("")
  const [enviadoPara, setEnviadoPara] = useState("")
  const [codigo, setCodigo] = useState("")
  const [erroDoCodigo, setErroDoCodigo] = useState("")
  const [morto, setMorto] = useState(false)
  const [faltam, setFaltam] = useState(0)
  // Cada código enviado remonta o "reenviar", com a contagem dele do zero.
  const [envios, setEnvios] = useState(0)
  const [indo, comecar] = useTransition()
  const botaoTrocar = useRef<HTMLButtonElement>(null)

  function abrir() {
    setPasso("email")
    setNovo("")
    setErroDoEmail("")
    setAberta(true)
  }

  function fechar() {
    setAberta(false)
    botaoTrocar.current?.focus()
  }

  function enviar() {
    if (indo) return
    comecar(async () => {
      const r = await pedirCodigoDaTroca(novo)
      if (!r.ok) {
        setErroDoEmail(r.erro)
        return
      }
      setEnviadoPara(r.email)
      setFaltam(r.segundos)
      setEnvios((n) => n + 1)
      setCodigo("")
      setErroDoCodigo("")
      setMorto(false)
      setPasso("codigo")
    })
  }

  function confirmar(digitado: string) {
    if (indo) return
    comecar(async () => {
      const r = await confirmarTrocaDeEmail(digitado)
      if (r.ok) {
        fechar()
        avisar(`E-mail trocado. Os próximos códigos vão pra ${r.email}.`)
        return
      }
      if (r.emUso) {
        // O código era certo, o endereço é que não serve: volta pro e-mail,
        // com o recado embaixo dele.
        setPasso("email")
        setErroDoEmail(r.erro)
        return
      }
      setErroDoCodigo(r.erro)
      setMorto(r.morto)
      setCodigo("")
    })
  }

  return (
    <>
      <div className="email-fixo">
        <span data-email-fixo>{email}</span>{" "}
        <button
          ref={botaoTrocar}
          type="button"
          className="link"
          aria-expanded={aberta}
          aria-controls={id}
          onClick={() => (aberta ? fechar() : abrir())}
          data-trocar-email
        >
          Trocar
        </button>
      </div>

      {aberta ? (
        <div className="troca-email" id={id} data-troca-email>
          {passo === "email" ? (
            <div className="campos">
              <Campo
                rotulo="Novo e-mail"
                nome=""
                largura="campo--4"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="voce@email.com"
                autoFocus
                value={novo}
                onChange={(ev) => {
                  setNovo(ev.target.value)
                  setErroDoEmail("")
                }}
                onKeyDown={(ev) => enter(ev) && enviar()}
                erro={erroDoEmail}
                data-email-novo-campo
              />
              <div className="campo campo--2 troca-email__botao">
                <button
                  type="button"
                  className="btn btn--menor"
                  onClick={enviar}
                  disabled={indo}
                  aria-busy={indo || undefined}
                  data-enviar-codigo-email
                >
                  {indo ? <Giro /> : null}
                  {indo ? "Enviando…" : "Enviar código"}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="troca-email__txt">
                Mandamos um código pra <b data-email-novo>{enviadoPara}</b>. O e-mail de agora
                continua valendo até você confirmar.
              </p>
              <div className="campos">
                {/* Só dígito e sem `maxLength`, como no entrar: colar "123 456"
                    do e-mail tem que dar 123456. */}
                <Campo
                  rotulo="Código"
                  nome=""
                  largura="campo--3 codigo codigo--menor"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  autoFocus
                  value={codigo}
                  onChange={(ev) => {
                    const so = ev.target.value.replace(/\D+/g, "").slice(0, 6)
                    setCodigo(so)
                    if (so.length === 6) confirmar(so)
                  }}
                  onKeyDown={(ev) => enter(ev) && confirmar(codigo)}
                  erro={erroDoCodigo}
                  data-email-codigo
                />
                <div className="campo campo--3 troca-email__botao">
                  <button
                    type="button"
                    className="btn btn--menor"
                    onClick={() => confirmar(codigo)}
                    disabled={indo}
                    aria-busy={indo || undefined}
                    data-confirmar-email
                  >
                    {indo ? <Giro /> : null}
                    {indo ? "Confirmando…" : "Confirmar"}
                  </button>
                </div>
              </div>
              <Reenviar
                key={envios}
                faltam={faltam}
                destaque={morto}
                email={enviadoPara}
                reenviar={() => reenviarCodigoDaTroca(enviadoPara)}
              />
            </div>
          )}
          <button
            type="button"
            className="link troca-email__cancela"
            onClick={fechar}
            data-cancelar-email
          >
            Cancelar a troca
          </button>
        </div>
      ) : null}
    </>
  )
}

/** Foi Enter? Então é daqui — e não do formulário de "Meus dados", em volta. */
function enter(ev: KeyboardEvent<HTMLInputElement>): boolean {
  if (ev.key !== "Enter") return false
  ev.preventDefault()
  return true
}
