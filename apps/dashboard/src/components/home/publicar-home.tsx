"use client"

import { useState, useTransition } from "react"
import { useAvisar } from "@/components/avisos"
import { Icone } from "@/components/icones"
import { desfazerHome, publicarHome } from "@/lib/acoes/home"
import { oQueMudou, quantasMudancas, type PaginaDaHome } from "@/lib/home"

/**
 * O "PUBLICAR" DA HOME — o rascunho vai pro site, e a loja refaz a página em
 * segundos. Sem nada esperando, o botão fica apagado: não há o que mandar.
 */
export function PublicarHome({ mudancas, rotulo }: { mudancas: number; rotulo?: string }) {
  const avisar = useAvisar()
  const [indo, comecar] = useTransition()
  return (
    <button
      type="button"
      className="btn btn--menor"
      data-publicar-home
      disabled={indo || !mudancas}
      aria-busy={indo || undefined}
      title={mudancas ? undefined : "Nada esperando: a home do site já é essa"}
      onClick={() => comecar(async () => avisar(await publicarHome()))}
    >
      <Icone nome="raio" />
      {indo ? "Publicando…" : (rotulo ?? "Publicar")}
    </button>
  )
}

/**
 * A FAIXA DE CIMA — o que está esperando pra ir pro site (e o que é), com o
 * "Publicar agora" e o "Desfazer"; sem nada esperando, o lembrete de que
 * nada vai pro site sem querer, e quando foi o último "Publicar".
 *
 * "Desfazer" joga o rascunho fora — então pergunta antes, com o número do
 * que se perde. O site não muda.
 */
export function FaixaDaHome({
  pendentes,
  publicacao,
}: Pick<PaginaDaHome, "pendentes" | "publicacao">) {
  const avisar = useAvisar()
  const [indo, comecar] = useTransition()
  const [perguntando, setPerguntando] = useState(false)
  const n = quantasMudancas(pendentes)

  const ultima = publicacao
    ? `Publicada por último ${publicacao.quando}${publicacao.quem ? `, por ${publicacao.quem}` : ""}.`
    : "Ainda é a home de fábrica: ninguém publicou nada pelo painel."

  if (!n)
    return (
      <div className="faixa" data-nivel="info" data-faixa-home="em-dia">
        <Icone nome="relogio" />
        <div>
          <p className="faixa__titulo">Nada vai pro site sem querer</p>
          <p>
            Edite à vontade: a home só muda quando alguém aperta “Publicar”. Depois, a loja refaz a
            página em alguns segundos. {ultima}
          </p>
        </div>
      </div>
    )

  return (
    <div className="faixa" data-nivel="atencao" data-faixa-home="esperando">
      <Icone nome="alerta" />
      <div>
        <p className="faixa__titulo">
          {n} {n > 1 ? "mudanças esperando" : "mudança esperando"} pra ir pro site
        </p>
        <p>
          {oQueMudou(pendentes)}. O site só muda quando alguém aperta “Publicar”; até lá, quem entra
          vê a home de antes. {ultima}
        </p>
        <div className="faixa__acoes">
          {perguntando ? (
            <div className="publicar-pergunta" role="group" aria-label="Desfazer o rascunho">
              <p className="pequeno">
                Jogar fora {n > 1 ? `as ${n} mudanças` : "a mudança"}? O site não muda.
              </p>
              <button
                type="button"
                className="btn btn--menor"
                data-desfazer-home
                disabled={indo}
                onClick={() =>
                  comecar(async () => {
                    setPerguntando(false)
                    avisar(await desfazerHome())
                  })
                }
              >
                Desfazer
              </button>
              <button
                type="button"
                className="btn btn--fantasma"
                onClick={() => setPerguntando(false)}
              >
                Agora não
              </button>
            </div>
          ) : (
            <>
              <PublicarHome mudancas={n} rotulo="Publicar agora" />
              <button
                type="button"
                className="link"
                data-pergunta-desfazer
                onClick={() => setPerguntando(true)}
              >
                Desfazer as mudanças
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
