import type { ReactNode } from "react"
import { Icone, type NomeDoIcone } from "@/components/icones"
import { iniciais } from "@/lib/equipe"
import type { LinhaDaLista } from "@/lib/pedidos"

/**
 * AS PEÇAS DO PAINEL MAIS VISUAL (entrega 0148) — o que troca frase por
 * desenho: o "?" que guarda a explicação, a sigla da pessoa, as fotos dos
 * produtos, o ícone do Pix e do cartão, o tracinho dos seis passos e as
 * barrinhas da semana. Sem JavaScript no navegador: o "?" é um
 * `<details>`, e o resto é HTML. A 0155 trouxe a faixa com o "?" (o pedido
 * e o produto abertos).
 */

/**
 * O "?" — a explicação que antes ficava escrita na tela, agora a um toque.
 * Abre embaixo do botão; no celular, ocupa a largura.
 */
export function Ajuda({
  children,
  rotulo = "Como funciona",
}: {
  children: ReactNode
  rotulo?: string
}) {
  return (
    <details className="ajuda" data-ajuda>
      <summary aria-label={rotulo} title={rotulo}>
        ?
      </summary>
      <div className="ajuda__texto">{children}</div>
    </details>
  )
}

/** A cor da sigla: a mesma pessoa, sempre a mesma cor (uma das quatro da marca). */
function corDo(nome: string): 1 | 2 | 3 | 4 {
  let h = 0
  for (const c of nome) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return ((h % 4) + 1) as 1 | 2 | 3 | 4
}

/** A sigla da pessoa ("Rafael Souza" → "RS"), no quadradinho chanfrado. */
export function Sigla({ nome }: { nome: string }) {
  return (
    <span className="sigla" data-cor={corDo(nome)} aria-hidden="true">
      {iniciais(nome)}
    </span>
  )
}

/**
 * As fotos dos produtos, uma por cima da outra — até três, e "+N" pro resto.
 * Sem foto nenhuma (produto sem imagem, ou um backend de antes da 0148), o
 * ícone do produto.
 */
export function Fotos({
  fotos = [],
  produtos = fotos.length,
  rotulo,
}: {
  fotos?: string[]
  produtos?: number
  /** O que as fotos mostram, em texto ("2× Óleo · Balm"): pro leitor de tela e o "title". */
  rotulo: string
}) {
  const resto = Math.max(0, produtos - fotos.length)
  return (
    <span className="fotos" title={rotulo} data-fotos={fotos.length}>
      <span className="sr-only">{rotulo}</span>
      {fotos.length ? (
        fotos.map((f) => (
          // eslint-disable-next-line @next/next/no-img-element -- foto do Medusa, de qualquer host
          <img key={f} src={f} alt="" loading="lazy" />
        ))
      ) : (
        <span className="fotos__vazia">
          <Icone nome="produtos" />
        </span>
      )}
      {resto ? <em>+{resto}</em> : null}
    </span>
  )
}

const NOME_DA_FORMA = { pix: "Pix", cartao: "Cartão" } as const

/** Pix ou cartão, pelo ícone (o nome fica pro leitor de tela e o "title"). */
export function Forma({ forma }: { forma: LinhaDaLista["forma"] }) {
  if (!forma) return <span className="forma forma--nenhuma">—</span>
  return (
    <span className="forma" data-forma={forma} title={NOME_DA_FORMA[forma]}>
      <Icone nome={forma} />
      <span className="sr-only">{NOME_DA_FORMA[forma]}</span>
    </span>
  )
}

const NOMES_DOS_PASSOS = ["Pedido feito", "Pagamento", "Nota", "Frenet", "Enviado", "Entregue"]
const COMO = { feito: "feito", agora: "agora", erro: "com problema", "": "falta" } as const

/** O caminho em seis tracinhos: feito (preto), agora (amarelo), com problema (vermelho). */
export function Passos({ passos }: { passos?: LinhaDaLista["passos"] }) {
  if (!passos?.length) return null
  const descricao = passos.map((p, i) => `${NOMES_DOS_PASSOS[i]}: ${COMO[p]}`).join(", ")
  return (
    <span className="passos" role="img" aria-label={descricao} data-passos={passos.join(",")}>
      {passos.map((p, i) => (
        <i key={i} data-estado={p || undefined} />
      ))}
    </span>
  )
}

/** As barrinhas da semana, dentro do número: a de hoje em amarelo. */
export function Faisca({ valores }: { valores: { valor: number; hoje: boolean }[] }) {
  const maior = Math.max(...valores.map((v) => v.valor), 1)
  return (
    <span className="faisca" aria-hidden="true">
      {valores.map((v, i) => (
        <i
          key={i}
          data-hoje={v.hoje ? "" : undefined}
          style={{ height: `${Math.max(8, (v.valor / maior) * 100).toFixed(0)}%` }}
        />
      ))}
    </span>
  )
}

const ICONE_DA_FAIXA = { grave: "alerta", atencao: "relogio", info: "check" } as const

/**
 * A faixa do topo (o pedido, o produto): o título e o que dá pra dizer em
 * poucas palavras ficam à vista; a explicação inteira vai no "?"; o botão
 * que resolve fica embaixo. O `.faixa__titulo` é só o título (os
 * conferidores leem ele sozinho).
 */
export function Faixa({
  nivel,
  titulo,
  etiquetas = [],
  extra,
  ajuda,
  acoes,
  icone,
  ...dados
}: {
  nivel: keyof typeof ICONE_DA_FAIXA
  titulo: string
  /** As palavras à vista ("sem CPF/CNPJ", "vale até 14:30"). */
  etiquetas?: string[]
  /** O que vai depois das etiquetas: a pílula de quem é, a do aviso de volta. */
  extra?: ReactNode
  ajuda?: ReactNode
  acoes?: ReactNode
  icone?: NomeDoIcone
} & { [dado: `data-${string}`]: string | undefined }) {
  return (
    <div className="faixa" data-nivel={nivel} {...dados}>
      <Icone nome={icone ?? ICONE_DA_FAIXA[nivel]} />
      <div className="faixa__miolo">
        <div className="faixa__cabeca">
          <p className="faixa__titulo">{titulo}</p>
          {etiquetas.map((e) => (
            <span className="faixa__etiqueta" key={e}>
              {e}
            </span>
          ))}
          {extra}
          {ajuda ? <Ajuda rotulo="Por quê">{ajuda}</Ajuda> : null}
        </div>
        {acoes ? <div className="faixa__acoes">{acoes}</div> : null}
      </div>
    </div>
  )
}

/** A pílula com ícone ("Só pra ver", "Estorno é com o dono."): o desenho diz antes da palavra. */
export function Pilula({
  icone,
  children,
  suave = false,
  ...dados
}: {
  icone: NomeDoIcone
  children: ReactNode
  suave?: boolean
} & { [dado: `data-${string}`]: string | undefined }) {
  return (
    <span className={suave ? "pilula pilula--suave" : "pilula"} {...dados}>
      <Icone nome={icone} />
      {children}
    </span>
  )
}

/** As fichas de uma frase com " · " ("até 30/09 · 100 usos no total" → duas fichas). */
export function Fichas({
  frase,
  ...dados
}: { frase: string } & { [dado: `data-${string}`]: string | undefined }) {
  const partes = frase.split(" · ").filter(Boolean)
  if (!partes.length) return null
  return (
    <span className="fichas-da-frase" {...dados}>
      {partes.map((p) => (
        <span key={p}>{p}</span>
      ))}
    </span>
  )
}

/**
 * A cabeça de um bloco (0158): o título e a explicação no "?"; à direita, o
 * que vier (um botão, um selo, uma pílula). O `.bloco__titulo` é só o título.
 */
export function CabecaDoBloco({
  titulo,
  ajuda,
  lado,
}: {
  titulo: ReactNode
  ajuda?: ReactNode
  lado?: ReactNode
}) {
  return (
    <div className="bloco__cabeca">
      <div className="bloco__titulos">
        <h2 className="bloco__titulo">{titulo}</h2>
        {ajuda ? <Ajuda>{ajuda}</Ajuda> : null}
      </div>
      {lado}
    </div>
  )
}
