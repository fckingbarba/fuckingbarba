import type { getImageProps } from "next/image"
import { Estrelas } from "@/components/estrelas"
import type { Depoimento } from "@/conteudo/depoimentos"

/** A caixa da foto no cartão (`.avaliacao__foto`, em `estilos/provas.css`). */
export const FOTO_DO_CARTAO = 54

/** A foto do produto já no tamanho da caixa: `getImageProps(...).props`. */
export type Miniatura = ReturnType<typeof getImageProps>["props"]

/**
 * O CARTÃO DE UM DEPOIMENTO — o mesmo na esteira da home e na página do
 * produto.
 *
 * Avaliação e trecho de entrevista aparecem cada um como é
 * (`conteudo/depoimentos.ts`): a avaliação com nome, estrela e, só com o
 * pedido no sistema, o selo de compra verificada; o trecho com "Entrevista
 * com cliente" no lugar do nome, e nada de estrela nem selo.
 *
 * A foto é um `<img>` simples, no tamanho da caixa (`getImageProps`, só 1x e
 * 2x): com o `<Image>` do Next, cada cartão levava uma lista de 16 tamanhos
 * pra uma caixa de 54 px — ver o topo de `components/home/esteira-de-avaliacoes.tsx`.
 */
export function CartaoDeDepoimento({
  depoimento,
  foto,
}: {
  depoimento: Depoimento
  foto?: Miniatura
}) {
  return (
    <article className="avaliacao">
      {foto ? (
        <span className="avaliacao__foto">
          {/* eslint-disable-next-line @next/next/no-img-element -- getImageProps: a foto já sai otimizada, sem o componente — ver o topo */}
          <img {...foto} alt="" loading="lazy" />
        </span>
      ) : null}
      <div className="avaliacao__corpo">
        {"nota" in depoimento ? (
          <p className="avaliacao__topo">
            <span className="avaliacao__nome">{depoimento.nome}</span>
            {depoimento.compraVerificada ? <SeloVerificado /> : null}
            <Estrelas
              nota={depoimento.nota}
              rotulo={`Nota ${depoimento.nota} de 5${
                depoimento.compraVerificada ? ", compra verificada" : ""
              }`}
            />
          </p>
        ) : (
          <p className="avaliacao__topo">
            <span className="avaliacao__nome">Entrevista com cliente</span>
          </p>
        )}
        {/* O texto do cliente, sem edição. Corrigir a gramática transforma
            depoimento em anúncio com nome de outra pessoa — e o leitor
            percebe. */}
        <p className="avaliacao__texto">{depoimento.texto}</p>
      </div>
    </article>
  )
}

/** Só entra quando existe o pedido no sistema: é afirmação, não enfeite. */
function SeloVerificado() {
  return (
    <svg className="avaliacao__selo" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M8.4 1.8h7.2l5 5v7.2l-5 5H8.4l-5-5V6.8zm-.6 9.9 1.4-1.4h1.2l1.4 1.4 3.4-3.4h1.2l1.4 1.4-6 6z"
      />
    </svg>
  )
}
