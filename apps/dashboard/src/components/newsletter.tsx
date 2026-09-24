"use client"

import type { Route } from "next"
import Link from "next/link"
import { useState, useTransition } from "react"
import { useAvisar } from "@/components/avisos"
import { Icone } from "@/components/icones"
import { tirarDaNewsletter } from "@/lib/acoes/clientes"
import type { Inscrito } from "@/lib/clientes"

/**
 * QUEM RECEBE OFERTAS POR E-MAIL — a lista da aba Newsletter: o rodapé e a
 * caixa da conta, juntos (o backend junta). Cada e-mail de cliente leva pra
 * ficha dele. "Tirar" pede confirmação e apaga de verdade; "Baixar CSV"
 * monta o arquivo aqui mesmo, com o que está na tela.
 */
export function ListaDaNewsletter({ inscritos }: { inscritos: Inscrito[] }) {
  return (
    <section className="bloco" data-newsletter>
      <div className="bloco__cabeca">
        <h2 className="bloco__titulo">Quem recebe</h2>
        {inscritos.length ? (
          <button
            type="button"
            className="btn btn--menor btn--contorno"
            data-baixar-csv
            onClick={() => baixarCsv(inscritos)}
          >
            <Icone nome="baixo" />
            Baixar CSV
          </button>
        ) : null}
      </div>
      {inscritos.length ? (
        <div className="linhas">
          {inscritos.map((i) => (
            <Inscricao key={i.email} i={i} />
          ))}
        </div>
      ) : (
        <p className="vazio vazio--curto">Ninguém ainda.</p>
      )}
      <p className="pequeno suave" style={{ margin: "12px 0 0" }}>
        Tirar apaga de verdade — é o &ldquo;pode sair quando quiser&rdquo; da Política de
        Privacidade. Se a pessoa quiser de novo, ela se inscreve outra vez.
      </p>
    </section>
  )
}

function Inscricao({ i }: { i: Inscrito }) {
  const avisar = useAvisar()
  const [confirmando, setConfirmando] = useState(false)
  const [ocupado, comecar] = useTransition()

  function tirar() {
    comecar(async () => {
      const r = await tirarDaNewsletter(i.email)
      avisar(r)
      if (!r.ok) setConfirmando(false)
    })
  }

  return (
    <div className="linha" data-inscrito={i.email}>
      <div>
        <p className="linha__titulo">
          {i.clienteId ? (
            <Link className="link" href={`/clientes/${i.clienteId}` as Route}>
              {i.email}
            </Link>
          ) : (
            i.email
          )}
        </p>
        <p className="linha__txt">
          desde {i.desde} · {i.origem}
          {i.clienteId ? " · é cliente" : ""}
        </p>
        {confirmando ? (
          <div className="confirma" role="alertdialog" aria-label={`Tirar ${i.email} da lista`}>
            <p>
              <b>Tirar {i.email} da lista?</b>
            </p>
            <ul>
              <li>A pessoa para de receber ofertas por e-mail. Os e-mails de pedido continuam.</li>
              <li>
                Sai da newsletter e da caixa de ofertas da conta, se tiver — as duas de uma vez.
              </li>
              <li>Fica no registro, com o seu nome.</li>
            </ul>
            <div className="confirma__acoes">
              <button
                type="button"
                className="btn btn--perigo btn--menor"
                disabled={ocupado}
                data-confirmar-tirar
                onClick={tirar}
              >
                {ocupado ? <span className="giro" aria-hidden="true" /> : null}
                Tirar da lista
              </button>
              <button
                type="button"
                className="btn btn--fantasma"
                onClick={() => setConfirmando(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : null}
      </div>
      {confirmando ? null : (
        <button
          type="button"
          className="btn btn--fantasma"
          data-tirar={i.email}
          onClick={() => setConfirmando(true)}
        >
          Tirar
        </button>
      )}
    </div>
  )
}

/** O CSV da lista: e-mail, desde quando (ISO) e de onde. Com BOM, pro Excel abrir os acentos. */
function baixarCsv(inscritos: Inscrito[]) {
  const celula = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const linhas = [
    ["email", "desde", "origem"],
    ...inscritos.map((i) => [i.email, i.desdeEm, i.origem]),
  ].map((l) => l.map(celula).join(","))
  const arquivo = new Blob([`\uFEFF${linhas.join("\n")}\n`], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(arquivo)
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: `newsletter-${new Date().toISOString().slice(0, 10)}.csv`,
  })
  document.body.append(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
