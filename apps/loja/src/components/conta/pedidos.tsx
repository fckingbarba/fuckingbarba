import Image from "next/image"
import Link from "next/link"
import { redirect } from "next/navigation"
import type { ReactNode } from "react"
import { ComprarDeNovo, MinutosDoPix } from "@/components/conta/pecas"
import { Raio, Sacola } from "@/components/icones"
import { ROTULO_DA_SITUACAO, type SituacaoDoPedido } from "@/lib/conta-visivel"
import { dia, diaEHora, emReais, quando } from "@/lib/formato"
import type { PedidoDaConta } from "@/lib/pedidos-da-conta"

/**
 * AS PEÇAS DAS TELAS DE PEDIDO — o desenho é o de
 * `ferramentas/porte/prototipo-conta.html` (`desenharPainel`,
 * `desenharPedidos` e `desenharDetalhe`), com os dados do Medusa no lugar
 * dos de exemplo.
 */

type Item = PedidoDaConta["itens"][number]

const doPedido = (p: PedidoDaConta) => `/conta/pedidos/${p.id}` as const

/** O selo de onde o pedido está, com a seta do protótipo. */
export function Situacao({ situacao }: { situacao: SituacaoDoPedido }) {
  return (
    <span className="status" data-status={situacao}>
      {ROTULO_DA_SITUACAO[situacao]}
    </span>
  )
}

/** A foto do item, no quadrado chanfrado do resumo do checkout. */
export function FotoDoItem({ item, tamanho, qtd }: { item: Item; tamanho: number; qtd?: number }) {
  return (
    <span className={`item__foto${item.imagem ? "" : " item__foto--vazia"}`}>
      {item.imagem ? (
        <Image src={item.imagem} alt="" width={tamanho} height={tamanho} sizes={`${tamanho}px`} />
      ) : (
        <Sacola aria-hidden="true" />
      )}
      {qtd ? (
        <span className="item__qtd" aria-hidden="true">
          {qtd}
        </span>
      ) : null}
    </span>
  )
}

const unidades = (p: PedidoDaConta) => p.itens.reduce((s, i) => s + i.quantidade, 0)

/** "Hoje, 10:15" — a primeira letra em maiúscula, pro começo de linha. */
const comecoDeLinha = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

/**
 * "Feito hoje, 10:15" / "Feito em 17/09/2026, 14:02". Exportado pro
 * detalhe, que escreve a mesma coisa embaixo do número.
 */
export function feito(p: PedidoDaConta): string {
  const q = quando(p.datas.feito)
  return /^(hoje|ontem)/.test(q) ? `Feito ${q}` : `Feito em ${q}`
}

/** Por que um pedido cancelado foi cancelado — em uma linha, pra lista. */
function porQueCancelou(p: PedidoDaConta): string {
  if (p.estornado) return "Cancelado, com o pagamento estornado."
  if (p.pagamento.forma === "pix") return "O Pix venceu antes do pagamento."
  return "Cancelado antes do pagamento."
}

/* ── a visão geral ────────────────────────────────────────────────────────── */

/**
 * Uma linha do "Em andamento": o que falta, e o botão que resolve. O Pix
 * vem primeiro na lista (é o único que depende da pessoa).
 */
export function LinhaDoAndamento({ p }: { p: PedidoDaConta }) {
  let texto: ReactNode
  let acao = "Ver pedido"
  switch (p.situacao) {
    case "pix":
      texto = (
        <>
          Falta pagar o Pix — vale por mais{" "}
          <b>
            <MinutosDoPix expiraEm={p.pagamento.pix?.expiraEm ?? null} />
          </b>
        </>
      )
      acao = "Pagar o Pix"
      break
    case "analise":
      texto = "Pagamento em análise — costuma levar poucos minutos."
      break
    case "combinar":
      texto = "A gente vai chamar você pra acertar o pagamento."
      break
    case "enviado":
      texto = `A caminho desde ${dia(p.datas.enviado)} — o código de rastreio está no pedido.`
      acao = "Acompanhar"
      break
    default:
      texto = "Separando seu pedido — o rastreio aparece aqui quando ele for postado."
  }
  return (
    <div className="andamento__linha" data-status={p.situacao} data-pedido={p.id}>
      <div>
        <p className="andamento__num">
          Pedido #{p.numero} · {emReais(p.total)}
        </p>
        <p className="andamento__txt">{texto}</p>
      </div>
      <Link className="btn btn--menor" href={doPedido(p)}>
        {acao} <Raio className="btn__bolt" />
      </Link>
    </div>
  )
}

/** "Comprar de novo" da visão geral: o último pedido que chegou (ou está chegando). */
export function RepetirPedido({ p }: { p: PedidoDaConta }) {
  const chegada =
    p.situacao === "entregue" && p.datas.entregue
      ? `entregue em ${dia(p.datas.entregue)}`
      : `enviado em ${dia(p.datas.enviado)}`
  return (
    <div className="de-novo">
      <ul className="de-novo__fotos">
        {p.itens.slice(0, 3).map((i) => (
          <li key={i.id}>
            <FotoDoItem item={i} tamanho={64} />
          </li>
        ))}
      </ul>
      <p className="de-novo__txt">
        <b>
          {p.itens
            .map((i) => `${i.quantidade > 1 ? `${i.quantidade}× ` : ""}${i.nome}`)
            .join(" + ")}
        </b>
        <br />
        Do pedido #{p.numero}, {chegada}.
      </p>
      <div className="de-novo__acao">
        <ComprarDeNovo pedidoId={p.id} rotulo="Pôr na sacola" />
      </div>
    </div>
  )
}

/** Sem pedido nenhum: o que acontece quando houver, e o caminho pra vitrine. */
export function NenhumPedido({ children }: { children: ReactNode }) {
  return (
    <div className="bloco conta-vazio">
      <Sacola aria-hidden="true" />
      <p className="conta-vazio__titulo">Nenhum pedido ainda</p>
      <p>{children}</p>
      <Link className="btn" href="/">
        Ver produtos <Raio className="btn__bolt" />
      </Link>
    </div>
  )
}

/* ── a lista ──────────────────────────────────────────────────────────────── */

export function CartaoDoPedido({ p }: { p: PedidoDaConta }) {
  const n = unidades(p)
  const ver = (
    <Link className="btn btn--menor" href={doPedido(p)}>
      Ver pedido <Raio className="btn__bolt" />
    </Link>
  )
  let acoes: ReactNode
  if (p.situacao === "pix") {
    acoes = (
      <>
        <Link className="btn btn--menor" href={doPedido(p)}>
          Pagar o Pix <Raio className="btn__bolt" />
        </Link>
        <p className="pedido-card__prazo" data-pix="">
          Vale por mais <MinutosDoPix expiraEm={p.pagamento.pix?.expiraEm ?? null} />
        </p>
      </>
    )
  } else {
    const prazo =
      p.situacao === "entregue" && p.datas.entregue
        ? `Entregue em ${dia(p.datas.entregue)}`
        : p.situacao === "enviado" && p.datas.enviado
          ? `Enviado em ${dia(p.datas.enviado)}`
          : p.situacao === "cancelado"
            ? porQueCancelou(p)
            : null
    acoes = (
      <>
        {ver}
        <ComprarDeNovo pedidoId={p.id} comoLink />
        {prazo ? (
          <p
            className="pedido-card__prazo"
            data-cancelado={p.situacao === "cancelado" ? "" : undefined}
          >
            {prazo}
          </p>
        ) : null}
      </>
    )
  }

  return (
    <article className="bloco pedido-card" data-pedido={p.id}>
      <div className="pedido-card__topo">
        <div>
          <h2 className="pedido-card__num">Pedido #{p.numero}</h2>
          <p className="pedido-card__data">{comecoDeLinha(quando(p.datas.feito))}</p>
        </div>
        <Situacao situacao={p.situacao} />
      </div>
      <div className="pedido-card__meio">
        <ul className="pedido-card__fotos">
          {p.itens.slice(0, 3).map((i) => (
            <li key={i.id}>
              <FotoDoItem item={i} tamanho={48} />
            </li>
          ))}
        </ul>
        <p className="pedido-card__itens">
          {p.itens.map((i) => i.nome).join(", ")}
          <small>{n === 1 ? "1 item" : `${n} itens`}</small>
        </p>
        <p className="pedido-card__total">{emReais(p.total)}</p>
      </div>
      <div className="pedido-card__acoes">{acoes}</div>
    </article>
  )
}

/* ── o detalhe ────────────────────────────────────────────────────────────── */

/**
 * A LINHA DO TEMPO: losango cheio pro que já foi, amarelo pro de agora,
 * vazado pro que falta — o losango do rádio do checkout.
 */
export function Trilha({ p }: { p: PedidoDaConta }) {
  const pagamento: [string, string] =
    p.situacao === "pix"
      ? ["Pagamento", "esperando o Pix"]
      : p.situacao === "analise"
        ? ["Pagamento", "em análise"]
        : p.situacao === "combinar"
          ? ["Pagamento", "a combinar"]
          : ["Pagamento aprovado", diaEHora(p.datas.pago)]
  const passos: [string, string][] = [
    ["Pedido feito", diaEHora(p.datas.feito)],
    pagamento,
    ["Enviado", diaEHora(p.datas.enviado)],
    ["Entregue", diaEHora(p.datas.entregue)],
  ]
  const agora = { pix: 1, analise: 1, combinar: 1, pago: 2, enviado: 3, entregue: 4, cancelado: 0 }[
    p.situacao
  ]
  return (
    <ol className="linha-do-tempo">
      {passos.map(([rotulo, data], i) => (
        <li
          key={rotulo}
          data-feito={i < agora ? "" : undefined}
          data-agora={i === agora ? "" : undefined}
          aria-current={i === agora ? "step" : undefined}
        >
          {rotulo}
          {data ? <small>{data}</small> : null}
        </li>
      ))}
    </ol>
  )
}

/** Como foi pago, numa linha. As parcelas com o valor, como o checkout mostra. */
export function textoDoPagamento(p: PedidoDaConta): string {
  const { forma, cartao } = p.pagamento
  let base: string
  if (forma === "cartao") {
    base = cartao
      ? `Cartão ${cartao.bandeira} final ${cartao.final}`.replace(/\s+/g, " ")
      : "Cartão de crédito"
    if (cartao && cartao.parcelas > 1) {
      base += ` · ${cartao.parcelas}x de ${emReais(p.total / cartao.parcelas)} sem juros`
    }
  } else if (forma === "pix") {
    base = "Pix"
  } else {
    base = "A combinar com a loja"
  }
  if (p.situacao !== "cancelado") return base
  if (p.estornado) return `${base} — estornado`
  return forma === "pix" ? "Pix — venceu sem pagamento" : `${base} — não aprovado`
}

/** A frase do pedido cancelado — a do obrigado, quando é o caso dela. */
export function fraseDoCancelado(p: PedidoDaConta): string {
  if (p.estornado) return "O pedido foi cancelado e o valor pago foi estornado."
  if (p.pagamento.forma === "cartao")
    return "O pagamento não foi aprovado, e o pedido foi cancelado."
  return "O pagamento não foi confirmado a tempo, e o pedido foi cancelado — os produtos voltaram pro estoque."
}

/* ── quando não dá pra mostrar ────────────────────────────────────────────── */

/**
 * Sessão que acabou no meio do caminho: sem cookie, pro "entrar"; token
 * recusado, pro `/conta/sair` (que apaga o cookie — página não pode — e
 * manda pro "entrar" com o recado). Sem apagar, o proxy veria o cookie e
 * mandaria de volta pra cá, num vai e volta sem fim.
 */
export function seSessaoAcabou(estado: string): void {
  if (estado === "sem-sessao") redirect("/conta/entrar")
  if (estado === "expirou") redirect("/conta/sair?motivo=expirou")
}

/** O Medusa não respondeu. Não é motivo pra tirar ninguém da conta. */
export function ForaDoAr() {
  return (
    <div className="bloco" role="alert">
      Não consegui buscar seus pedidos agora. Tenta de novo em instantes.
    </div>
  )
}
