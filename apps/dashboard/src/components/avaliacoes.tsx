"use client"

import type { Route } from "next"
import Link from "next/link"
import { useOptimistic, useState, useTransition } from "react"
import { useAvisar } from "@/components/avisos"
import { Icone } from "@/components/icones"
import { moderarAvaliacao, type AcaoDaAvaliacao } from "@/lib/acoes/avaliacoes"
import type { LinhaDaAvaliacao, TelaDasAvaliacoes } from "@/lib/avaliacoes"

/**
 * AS AVALIAÇÕES NA TELA — o texto inteiro (é o que se lê pra decidir), as
 * estrelas, o produto e os botões. A avaliação sai da fita na hora do
 * clique (a tela mostra enquanto vai, e volta sozinha se o Medusa recusar).
 *
 * Os botões dependem da fita: a nova tem "Aprovar" e "Recusar"; a que está
 * no site pode sair ("Tirar do site"); a recusada pode voltar ("Aprovar") ou
 * ser apagada de vez — o pedido de exclusão da LGPD —, com confirmação.
 */
export function ListaDasAvaliacoes({ tela }: { tela: TelaDasAvaliacoes }) {
  const avisar = useAvisar()
  const [indo, comecar] = useTransition()
  const [avaliacoes, tirar] = useOptimistic(tela.avaliacoes, (lista, id: string) =>
    lista.filter((a) => a.id !== id)
  )

  function fazer(a: LinhaDaAvaliacao, acao: AcaoDaAvaliacao) {
    comecar(async () => {
      tirar(a.id)
      avisar(await moderarAvaliacao(a.id, acao))
    })
  }

  if (!avaliacoes.length)
    return (
      <p className="vazio vazio--curto">
        {tela.filtro === "novas"
          ? "Nenhuma avaliação esperando. O e-mail pedindo sai um dia depois de cada entrega."
          : tela.filtro === "no-site"
            ? "Nenhuma avaliação no site ainda."
            : "Nenhuma avaliação recusada."}
      </p>
    )
  return (
    <div className="linhas" aria-busy={indo || undefined}>
      {avaliacoes.map((a) => (
        <Linha key={a.id} a={a} fazer={(acao) => fazer(a, acao)} />
      ))}
    </div>
  )
}

function Linha({ a, fazer }: { a: LinhaDaAvaliacao; fazer: (acao: AcaoDaAvaliacao) => void }) {
  const [confirmando, setConfirmando] = useState(false)
  return (
    <article className="linha aval" data-avaliacao={a.id}>
      {a.produto.foto ? (
        // eslint-disable-next-line @next/next/no-img-element -- miniatura de 44px do armazenamento da loja
        <img className="aval__foto" src={a.produto.foto} alt="" width={44} height={44} />
      ) : (
        <span className="aval__foto" aria-hidden="true" />
      )}
      <div className="aval__corpo">
        <p className="aval__topo">
          <Estrelas nota={a.nota} />
          <b>{a.nome}</b>
          <span className="aval__produto">{a.produto.nome}</span>
        </p>
        <p className="aval__texto">{a.texto}</p>
        <p className="linha__txt">
          {a.quando}
          {a.pedido ? (
            <>
              {" · "}
              <Link href={`/pedidos/${a.pedido.id}` as Route}>Pedido #{a.pedido.numero}</Link>
            </>
          ) : null}
          {a.moderacao ? ` · ${a.moderacao}` : ""}
        </p>
        {confirmando ? (
          <div
            className="confirma"
            role="alertdialog"
            aria-label={`Apagar a avaliação de ${a.nome}`}
          >
            <p>
              <b>Apagar de vez a avaliação de {a.nome}?</b>
            </p>
            <ul>
              <li>É pra quando a pessoa pede pra apagar (a LGPD): não tem volta.</li>
              <li>Fica no registro da equipe, com o seu nome.</li>
            </ul>
            <div className="confirma__acoes">
              <button
                type="button"
                className="btn btn--perigo btn--menor"
                data-confirmar-apagar={a.id}
                onClick={() => fazer("apagar")}
              >
                Apagar de vez
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
      <div className="aval__acoes">
        {a.situacao !== "aprovada" ? (
          <button
            type="button"
            className="btn btn--menor"
            data-aprovar={a.id}
            onClick={() => fazer("aprovar")}
          >
            <Icone nome="check" />
            Aprovar
          </button>
        ) : null}
        {a.situacao !== "recusada" ? (
          <button
            type="button"
            className="btn btn--menor btn--fantasma"
            data-recusar={a.id}
            onClick={() => fazer("recusar")}
          >
            {a.situacao === "aprovada" ? "Tirar do site" : "Recusar"}
          </button>
        ) : confirmando ? null : (
          <button
            type="button"
            className="btn btn--menor btn--fantasma"
            data-apagar={a.id}
            onClick={() => setConfirmando(true)}
          >
            Apagar
          </button>
        )}
      </div>
    </article>
  )
}

/** As cinco estrelas, cheias até a nota — e a nota em palavras, pra quem não enxerga. */
function Estrelas({ nota }: { nota: number }) {
  return (
    <span className="aval__estrelas" role="img" aria-label={`Nota ${nota} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} data-cheia={n <= nota || undefined}>
          <Icone nome="estrela" />
        </span>
      ))}
    </span>
  )
}
