"use client"

import { useState, useTransition } from "react"
import { useAvisar } from "@/components/avisos"
import { Icone } from "@/components/icones"
import { Faixa, Pilula } from "@/components/visual"
import { desfazerHome, publicarHome } from "@/lib/acoes/home"
import { nomesDasMudancas, quantasMudancas, type PaginaDaHome } from "@/lib/home"

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

  // A última publicação à vista, numa pílula; a frase inteira no "?" (0158).
  const quando = (
    <Pilula icone="relogio" suave>
      {publicacao ? `publicada ${publicacao.quando}` : "a home de fábrica"}
    </Pilula>
  )

  if (!n)
    return (
      <Faixa
        nivel="info"
        icone="check"
        titulo="Nada vai pro site sem querer"
        extra={quando}
        ajuda={`Edite à vontade: a home só muda quando alguém aperta “Publicar”. Depois, a loja refaz a página em alguns segundos. ${ultima}`}
        data-faixa-home="em-dia"
      />
    )

  return (
    <Faixa
      nivel="atencao"
      icone="alerta"
      titulo={`${n} ${n > 1 ? "mudanças esperando" : "mudança esperando"} pra ir pro site`}
      etiquetas={nomesDasMudancas(pendentes)}
      extra={quando}
      ajuda={`O site só muda quando alguém aperta “Publicar”; até lá, quem entra vê a home de antes. ${ultima}`}
      data-faixa-home="esperando"
      acoes={
        perguntando ? (
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
        )
      }
    />
  )
}
