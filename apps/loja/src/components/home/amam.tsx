import type { HttpTypes } from "@medusajs/types"
import Image from "next/image"
import { ForaDaTela } from "@/components/layout/fora-da-tela"
import { Estrelas } from "@/components/estrelas"
import { AVALIACOES, notaMedia, type Avaliacao } from "@/conteudo/depoimentos"
import { listarProdutos, porHandle } from "@/lib/medusa"

/**
 * "Nossos clientes nos amam": a esteira de avaliações.
 *
 * **Não aparece enquanto não houver avaliação de verdade** em
 * `conteudo/depoimentos.ts`. Esse arquivo começa vazio e explica por quê.
 *
 * A nota do topo é a média do que está publicado logo abaixo — e não uma
 * "nota da loja" vinda de lugar nenhum. Assim, quem quiser conferir a conta
 * consegue: as parcelas estão ali na mesma tela.
 *
 * O movimento é o mesmo da faixa de avisos: duas filas idênticas correndo
 * -50%, a cópia com `aria-hidden` pra não ser lida duas vezes, e a esteira
 * para quando sai da tela.
 */
const MINIMO_PRA_ESTEIRA = 3

export async function Amam() {
  if (!AVALIACOES.length) return null

  const media = notaMedia(AVALIACOES)
  const produtos = await listarProdutos({ limite: 48 })
  const catalogo = porHandle(produtos)

  // Fila curta demais deixa buraco visível no loop; repetimos até encher.
  const fila: Avaliacao[] = []
  while (fila.length < MINIMO_PRA_ESTEIRA * AVALIACOES.length) fila.push(...AVALIACOES)

  return (
    <section className="amam" aria-labelledby="amam-titulo">
      <div className="amam__topo">
        <h2 className="amam__titulo" id="amam-titulo">
          Nossos clientes nos amam
        </h2>
        {media !== null ? (
          <p className="amam__nota">
            <Estrelas
              nota={media}
              rotulo={`Nota média ${formatar(media)} de 5, em ${AVALIACOES.length} ${
                AVALIACOES.length === 1 ? "avaliação publicada" : "avaliações publicadas"
              }`}
            />
            <span>
              <b>{formatar(media)}</b> estrelas nas avaliações publicadas aqui
            </span>
          </p>
        ) : null}
      </div>

      <ForaDaTela className="amam__esteiras">
        <div className="amam__esteira">
          <Fila avaliacoes={fila} catalogo={catalogo} />
          <Fila avaliacoes={fila} catalogo={catalogo} oculta />
        </div>
      </ForaDaTela>
    </section>
  )
}

function Fila({
  avaliacoes,
  catalogo,
  oculta = false,
}: {
  avaliacoes: Avaliacao[]
  catalogo: Map<string, HttpTypes.StoreProduct>
  oculta?: boolean
}) {
  return (
    <ul className="amam__fila" aria-hidden={oculta || undefined}>
      {avaliacoes.map((a, i) => (
        <li key={`${a.nome}-${i}`}>
          <Cartao avaliacao={a} produto={a.produtoHandle ? catalogo.get(a.produtoHandle) : undefined} />
        </li>
      ))}
    </ul>
  )
}

function Cartao({
  avaliacao,
  produto,
}: {
  avaliacao: Avaliacao
  produto?: HttpTypes.StoreProduct
}) {
  return (
    <article className="avaliacao">
      {produto?.thumbnail ? (
        <span className="avaliacao__foto">
          <Image
            src={produto.thumbnail}
            alt=""
            width={160}
            height={160}
            loading="lazy"
            sizes="80px"
          />
        </span>
      ) : null}
      <div className="avaliacao__corpo">
        <p className="avaliacao__topo">
          <span className="avaliacao__nome">{avaliacao.nome}</span>
          {avaliacao.compraVerificada ? <SeloVerificado /> : null}
          <Estrelas
            nota={avaliacao.nota}
            rotulo={`Nota ${avaliacao.nota} de 5${
              avaliacao.compraVerificada ? ", compra verificada" : ""
            }`}
          />
        </p>
        <p className="avaliacao__texto">{avaliacao.texto}</p>
      </div>
    </article>
  )
}

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

function formatar(nota: number): string {
  return nota.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}
