"use client"

import { useOptimistic, useState, useTransition } from "react"
import { useAvisar } from "@/components/avisos"
import { Icone } from "@/components/icones"
import { decidirCriador, type AcaoDoCriador } from "@/lib/acoes/criadores"
import type { LinhaDoCriador, TelaDosCriadores } from "@/lib/criadores"

/**
 * AS INSCRIÇÕES NA TELA — quem é, como falar, os perfis (é o que se abre pra
 * decidir), o modelo que a pessoa quer e os botões. A inscrição sai da fita
 * na hora do clique (a tela mostra enquanto vai, e volta sozinha se o Medusa
 * recusar).
 *
 * O WhatsApp abre numa aba nova, com a mensagem pronta — quem manda é a
 * pessoa da equipe. Os botões dependem da fita: a nova tem "Aprovar" e
 * "Recusar"; a aprovada pode ser recusada (não fechou); a recusada pode
 * voltar ("Aprovar") ou ser apagada de vez, com confirmação.
 */
export function ListaDosCriadores({ tela }: { tela: TelaDosCriadores }) {
  const avisar = useAvisar()
  const [indo, comecar] = useTransition()
  const [inscricoes, tirar] = useOptimistic(tela.inscricoes, (lista, id: string) =>
    lista.filter((c) => c.id !== id)
  )

  function fazer(c: LinhaDoCriador, acao: AcaoDoCriador) {
    comecar(async () => {
      tirar(c.id)
      avisar(await decidirCriador(c.id, acao))
    })
  }

  if (!inscricoes.length)
    return (
      <p className="vazio vazio--curto">
        {tela.filtro === "novas"
          ? "Nenhuma inscrição esperando. Mande o link da página pra quem você quer chamar."
          : tela.filtro === "aprovadas"
            ? "Nenhuma inscrição aprovada ainda."
            : "Nenhuma inscrição recusada."}
      </p>
    )
  return (
    <div className="linhas" aria-busy={indo || undefined}>
      {inscricoes.map((c) => (
        <Linha key={c.id} c={c} fazer={(acao) => fazer(c, acao)} />
      ))}
    </div>
  )
}

function Linha({ c, fazer }: { c: LinhaDoCriador; fazer: (acao: AcaoDoCriador) => void }) {
  const [confirmando, setConfirmando] = useState(false)
  return (
    <article className="linha criador" data-criador={c.id}>
      <div className="criador__corpo">
        <p className="criador__topo">
          <b>{c.nome}</b>
          <span className="criador__modelo" data-modelo={c.modelo.id}>
            {c.modelo.nome}
          </span>
          {c.parceria ? <span className="criador__parceria">topa anúncio de parceria</span> : null}
        </p>
        <p className="criador__dados">
          {c.barba} · {c.cidade}
          {c.experiencia ? ` · ${c.experiencia}` : ""}
        </p>
        <p className="criador__dados">
          <span className="num">{c.whatsapp.texto}</span> ·{" "}
          <a href={`mailto:${c.email}`}>{c.email}</a>
        </p>
        <p className="criador__redes">
          {c.perfis.map((p) => (
            <a key={p.rede} href={p.link} target="_blank" rel="noopener noreferrer">
              {p.rede} @{p.arroba}
            </a>
          ))}
          {c.seguidores ? <span>{c.seguidores}</span> : null}
          {c.video ? (
            <a href={c.video} target="_blank" rel="noopener noreferrer" data-video={c.id}>
              Ver o vídeo
            </a>
          ) : null}
        </p>
        <p className="linha__txt">
          {c.quando}
          {c.decisao ? ` · ${c.decisao}` : ""}
        </p>
        {confirmando ? (
          <div
            className="confirma"
            role="alertdialog"
            aria-label={`Apagar a inscrição de ${c.nome}`}
          >
            <p>
              <b>Apagar de vez a inscrição de {c.nome}?</b>
            </p>
            <ul>
              <li>É pra quando a pessoa pede pra sair (a LGPD): não tem volta.</li>
              <li>Fica no registro da equipe, com o seu nome — sem os dados dela.</li>
            </ul>
            <div className="confirma__acoes">
              <button
                type="button"
                className="btn btn--perigo btn--menor"
                data-confirmar-apagar={c.id}
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
      <div className="criador__acoes">
        <a
          className="btn btn--menor btn--whatsapp"
          href={c.whatsapp.link}
          target="_blank"
          rel="noopener noreferrer"
          data-whatsapp={c.id}
        >
          <Icone nome="whatsapp" />
          WhatsApp
        </a>
        {c.situacao !== "aprovada" ? (
          <button
            type="button"
            className="btn btn--menor"
            data-aprovar={c.id}
            onClick={() => fazer("aprovar")}
          >
            <Icone nome="check" />
            Aprovar
          </button>
        ) : null}
        {c.situacao !== "recusada" ? (
          <button
            type="button"
            className="btn btn--menor btn--fantasma"
            data-recusar={c.id}
            onClick={() => fazer("recusar")}
          >
            Recusar
          </button>
        ) : confirmando ? null : (
          <button
            type="button"
            className="btn btn--menor btn--fantasma"
            data-apagar={c.id}
            onClick={() => setConfirmando(true)}
          >
            Apagar
          </button>
        )}
      </div>
    </article>
  )
}

/** O link da página de inscrição, pra colar na conversa com quem a loja quer chamar. */
export function CopiarLinkDaPagina({ link }: { link: string }) {
  const avisar = useAvisar()
  async function copiar() {
    try {
      await navigator.clipboard.writeText(link)
      avisar({ ok: true, texto: "Link da página copiado — é só colar na conversa." })
    } catch {
      avisar({ ok: false, texto: "Não consegui copiar. Selecione o link e copie à mão." })
    }
  }
  return (
    <button type="button" className="btn btn--menor" data-copiar-pagina onClick={copiar}>
      <Icone nome="check" />
      Copiar o link da página
    </button>
  )
}
