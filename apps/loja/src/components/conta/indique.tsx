"use client"

import { useState, useTransition } from "react"
import { Copiar } from "@/components/conta/pecas"
import { Raio } from "@/components/icones"
import { pegarMeuLink } from "@/lib/acoes/indicacao"
import { dia } from "@/lib/formato"
import type { IndicacaoDaConta } from "@/lib/indicacao"

/**
 * O INDIQUE UM BROTHER da visão geral (entrega 0215): o link da pessoa, o
 * "Copiar" e o "Mandar no WhatsApp", quantos brothers compraram com ele e os
 * cupons que ela ganhou. Sem link ainda, o "Pegar meu link" cria na hora.
 * O brother não aparece: nem o nome, nem o e-mail.
 */
export function IndiqueUmBrother({ inicial }: { inicial: IndicacaoDaConta }) {
  const [i, setI] = useState(inicial)
  const [erro, setErro] = useState<string | null>(null)
  const [pegando, comecar] = useTransition()
  const oQue = (
    <p className="indique__txt">
      <b>Seu brother ganha {i.porcentoDoAmigo}% na primeira compra.</b>
      <br />
      Quando ele comprar com o seu link, você ganha {i.porcentoDoPremio}% na próxima.
    </p>
  )

  if (!i.indique)
    return (
      <div className="indique" data-indique="sem-link">
        {oQue}
        <div className="indique__acao">
          <button
            type="button"
            className="btn btn--menor"
            disabled={pegando}
            data-pegar-meu-link
            onClick={() =>
              comecar(async () => {
                const r = await pegarMeuLink()
                if (r.ok) {
                  setI(r.indicacao)
                  setErro(null)
                } else setErro(r.texto)
              })
            }
          >
            {pegando ? "Criando…" : "Pegar meu link"} <Raio className="btn__bolt" />
          </button>
        </div>
        {erro ? (
          <p className="indique__erro" role="alert">
            {erro}
          </p>
        ) : null}
      </div>
    )

  return (
    <div className="indique" data-indique={i.indique.codigo}>
      {oQue}
      <div className="indique__link">
        <input
          readOnly
          value={i.indique.link}
          aria-label="Seu link"
          data-link-do-indique
          onFocus={(e) => e.currentTarget.select()}
        />
        <Copiar texto={i.indique.link} />
      </div>
      <div className="indique__acao">
        {/* O WhatsApp abre com a mensagem pronta: a pessoa escolhe pra quem mandar. */}
        <a
          className="btn btn--menor"
          href={i.indique.whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          data-whatsapp-do-indique
        >
          Mandar no WhatsApp <Raio className="btn__bolt" />
        </a>
      </div>
      <p className="indique__numeros" data-amigos-do-indique={i.amigos}>
        {i.amigos === 0
          ? "Nenhum brother comprou com o seu link ainda."
          : i.amigos === 1
            ? "1 brother comprou com o seu link."
            : `${i.amigos} brothers compraram com o seu link.`}
      </p>
      {i.cupons.length ? (
        <ul className="indique__cupons" data-cupons-do-indique>
          {i.cupons.map((c) => (
            <li key={c.codigo} data-usado={c.usado ? "" : undefined}>
              <b>{c.codigo}</b> · {i.porcentoDoPremio}% na próxima compra ·{" "}
              {c.usado ? "usado" : `vale até ${dia(c.ate)}`}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
