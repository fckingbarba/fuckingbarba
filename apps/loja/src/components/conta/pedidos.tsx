import Image from "next/image"
import Link from "next/link"
import { redirect } from "next/navigation"
import type { ReactNode } from "react"
import { AteVencer, ComprarDeNovo, Copiar, MinutosDoPix } from "@/components/conta/pecas"
import { Raio, Sacola } from "@/components/icones"
import {
  FRASE_DO_ALERTA,
  FRASE_DO_ENVIO,
  ROTULO_DA_SITUACAO,
  ROTULO_DO_ALERTA,
  ROTULO_DO_ENVIO,
  ROTULO_DO_EVENTO,
  type SituacaoDoPedido,
} from "@/lib/conta-visivel"
import { dia, diaEHora, emReais, quando } from "@/lib/formato"
import type { EventoDoRastreio, PedidoDaConta, Rastreio } from "@/lib/pedidos-da-conta"

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

/**
 * A FRASE DO PIX VENCIDO, uma só — a lista, a visão geral e a contagem que
 * vira no navegador dizem exatamente a mesma coisa. Quem cancela é a
 * conciliação, nos próximos minutos; a tela não promete hora.
 */
const PIX_VENCEU = "O Pix venceu — o pedido vai ser cancelado."

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
export function LinhaDoAndamento({
  p,
  rastreio = null,
}: {
  p: PedidoDaConta
  /** O pacote, quando o pedido está na rua — pra dizer onde ele está. */
  rastreio?: Rastreio | null
}) {
  let texto: ReactNode
  let acao: ReactNode = "Ver pedido"
  switch (p.situacao) {
    case "pix":
      // Quem já abriu a conta e ficou olhando vê a frase e o botão virarem
      // na hora em que o Pix vence — sem recarregar. Quem chega depois já
      // recebe "vencido" do servidor.
      texto = (
        <AteVencer expiraEm={p.pagamento.pix?.expiraEm ?? null} venceu={PIX_VENCEU}>
          Falta pagar o Pix — vale por mais{" "}
          <b>
            <MinutosDoPix expiraEm={p.pagamento.pix?.expiraEm ?? null} />
          </b>
        </AteVencer>
      )
      acao = (
        <AteVencer expiraEm={p.pagamento.pix?.expiraEm ?? null} venceu="Ver pedido">
          Pagar o Pix
        </AteVencer>
      )
      break
    case "vencido":
      // Nem "Pagar o Pix", nem prazo: o QR não aceita mais nada, e o
      // cancelamento é a conciliação que faz, nos próximos minutos.
      texto = PIX_VENCEU
      break
    case "analise":
      texto = "Pagamento em análise — costuma levar poucos minutos."
      break
    case "combinar":
      texto = "A gente vai chamar você pra acertar o pagamento."
      break
    case "enviado":
      texto =
        ondeEsta(rastreio) ??
        `A caminho desde ${dia(p.datas.enviado)} — o código de rastreio está no pedido.`
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

/**
 * O que a linha do "Em andamento" diz do pacote, quando há novidade além de
 * "a caminho": o alerta, o dia da entrega, a agência, o que deu errado. As
 * frases já dizem o estado — o rótulo junto seria repetir.
 */
function ondeEsta(r: Rastreio | null): string | null {
  if (!r?.situacao) return null
  if (r.alerta) return FRASE_DO_ALERTA[r.alerta]
  switch (r.situacao) {
    case "saiu_para_entrega":
    case "aguardando_retirada":
    case "devolvido":
    case "extraviado":
      return FRASE_DO_ENVIO[r.situacao]
    default:
      return null
  }
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

/**
 * Sem pedido nenhum: o que acontece quando houver, e o caminho pra vitrine.
 * `largo` na visão geral, onde ele divide a grade com os atalhos do pé.
 */
export function NenhumPedido({
  children,
  largo = false,
}: {
  children: ReactNode
  largo?: boolean
}) {
  return (
    <div className={`bloco conta-vazio${largo ? " bloco--largo" : ""}`}>
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
    const expiraEm = p.pagamento.pix?.expiraEm ?? null
    acoes = (
      <>
        <Link className="btn btn--menor" href={doPedido(p)}>
          <AteVencer expiraEm={expiraEm} venceu="Ver pedido">
            Pagar o Pix
          </AteVencer>{" "}
          <Raio className="btn__bolt" />
        </Link>
        <p className="pedido-card__prazo" data-pix="">
          <AteVencer expiraEm={expiraEm} venceu={PIX_VENCEU}>
            Vale por mais <MinutosDoPix expiraEm={expiraEm} />
          </AteVencer>
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
            : p.situacao === "vencido"
              ? PIX_VENCEU
              : null
    acoes = (
      <>
        {ver}
        <ComprarDeNovo pedidoId={p.id} comoLink />
        {prazo ? (
          <p
            className="pedido-card__prazo"
            data-cancelado={p.situacao === "cancelado" || p.situacao === "vencido" ? "" : undefined}
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
      : p.situacao === "vencido"
        ? ["Pagamento", "o Pix venceu"]
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
  const agora = {
    pix: 1,
    vencido: 1,
    analise: 1,
    combinar: 1,
    pago: 2,
    enviado: 3,
    entregue: 4,
    cancelado: 0,
  }[p.situacao]
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

/**
 * O RASTREIO DE UM PACOTE: o código (com copiar e o link da
 * transportadora), onde ele está agora, e o caminho até aqui — os três
 * últimos eventos à vista, o resto dobrado. As palavras são as do núcleo
 * dos envios; o texto miúdo de cada evento é o da transportadora.
 *
 * Nenhum link dentro da lista de eventos: o único `<a>` do bloco é o da
 * transportadora (o conferidor da conta conta com isso).
 */
export function RastreioDoPacote({ r }: { r: Rastreio }) {
  const recentes = r.eventos.slice(0, 3)
  const antigos = r.eventos.slice(3)
  return (
    <div
      className="rastreio"
      data-envio={r.situacao ?? undefined}
      data-alerta={r.alerta ?? undefined}
    >
      <div className="rastreio__topo">
        <div>
          <p className="rastreio__rot">Rastreio{r.quem ? ` · ${r.quem}` : ""}</p>
          <p className="rastreio__codigo" data-rastreio>
            {r.codigo}
          </p>
        </div>
        <div className="rastreio__acoes">
          <Copiar texto={r.codigo} />
          {r.url ? (
            <a className="link" href={r.url} target="_blank" rel="noopener noreferrer">
              Rastrear na transportadora ↗
            </a>
          ) : null}
        </div>
      </div>
      {r.situacao ? (
        <p className="rastreio__agora">
          <b>{r.alerta ? ROTULO_DO_ALERTA[r.alerta] : ROTULO_DO_ENVIO[r.situacao]}</b>
          {r.alerta ? FRASE_DO_ALERTA[r.alerta] : FRASE_DO_ENVIO[r.situacao]}
        </p>
      ) : null}
      {recentes.length ? (
        <ol className="rastreio__eventos">
          {recentes.map((e) => (
            <EventoDoPacote key={`${e.tipo}${e.quando}${e.descricao}`} e={e} />
          ))}
        </ol>
      ) : null}
      {antigos.length ? (
        <details className="rastreio__mais">
          <summary>Ver o caminho todo ({r.eventos.length})</summary>
          <ol className="rastreio__eventos">
            {antigos.map((e) => (
              <EventoDoPacote key={`${e.tipo}${e.quando}${e.descricao}`} e={e} />
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  )
}

const mesmoTexto = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

function EventoDoPacote({ e }: { e: EventoDoRastreio }) {
  const titulo = e.tipo === "informativo" ? e.descricao : ROTULO_DO_EVENTO[e.tipo]
  const detalhe = [
    e.tipo === "informativo" || mesmoTexto(e.descricao, titulo) ? null : e.descricao,
    e.local,
  ]
    .filter(Boolean)
    .join(" · ")
  return (
    <li data-tipo={e.tipo}>
      <span className="rastreio__evento">{titulo}</span>{" "}
      <time dateTime={e.quando}>{quando(e.quando)}</time>
      {detalhe ? <small>{detalhe}</small> : null}
    </li>
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
  if (p.situacao === "vencido") return "Pix — venceu sem pagamento"
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
export function ForaDoAr({ largo = false }: { largo?: boolean }) {
  return (
    <div className={`bloco${largo ? " bloco--largo" : ""}`} role="alert">
      Não consegui buscar seus pedidos agora. Tenta de novo em instantes.
    </div>
  )
}
