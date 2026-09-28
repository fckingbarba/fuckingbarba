import type { Area, Papel } from "../equipe/regras"
import { lerRegistros as lerEstornos } from "../estornos"
import { lerRegistroNoPedido } from "../envios/registro"
import {
  chaveDoDia,
  dia,
  diaDaSemana,
  duracao,
  emFrase,
  hora,
  minutosEntre,
  reais,
} from "./formato"
import {
  canceladoNaFrenet,
  linhaDaLista,
  motivoCurto,
  nomeCurto,
  notaPassouDosTresDias,
  notaTravada,
  pagamentoDo,
  situacaoDo,
  type Contexto,
  type EnvioCru,
  type LinhaDaLista,
  type NotaCrua,
  type PedidoCru,
} from "./pedido"

export { motivoCurto }

/**
 * O INÍCIO — o que precisa de alguém hoje, as vendas e os pedidos do dia.
 *
 * Código puro, como o `pedido.ts`: recebe os pedidos recentes (com as notas
 * e os envios) e devolve a tela pronta, conforme o papel e o que ele abre
 * (a matriz de agora, com o que o dono mudou). O que a pessoa não abre não
 * entra na resposta: a fila dos pedidos e os pedidos de hoje (com o nome do
 * cliente) só pra quem abre os Pedidos — no padrão, o dono e a operação; o
 * estorno que falhou, só pra quem abre os Estornos — no padrão, o dono. O
 * marketing tem a fila dele (rascunhos e newsletter, se abre cada um); quem
 * abre as Avaliações vê as que esperam aprovação; todo mundo recebe os
 * números e os mais vendidos, sem nome de cliente.
 *
 * "VENDA" É PEDIDO PAGO: Pix esperando e cartão em análise ficam de fora das
 * vendas (eles têm o número deles, "Esperando pagamento"), e pedido pago
 * depois cancelado também — o dinheiro voltou.
 */

/**
 * Um item do "Precisa de você". Desde a 0148 a fila JUNTA o que é igual — sete
 * "a nota do #N não sai sozinha" viram um item só, com o número de pedidos,
 * as etiquetas curtas e os pedidos um por um — e a frase longa (`texto`) é a
 * explicação, que o painel guarda no "?".
 */
export type ItemDaFila = {
  /** O que o item é, estável: a chave da lista no painel. */
  chave: string
  nivel: "grave" | "atencao" | "" | "ok"
  icone: "caminhao" | "nota" | "pix" | "cartao" | "alerta" | "email" | "produtos" | "estrela"
  titulo: string
  /** A explicação (o "?" do painel); uma linha por pedido quando os motivos são diferentes. */
  texto: string
  href: string
  /** Quantos pedidos (ou produtos) o item junta — o número do selo. */
  quantos?: number
  /** Curtas: o motivo ("sem CPF/CNPJ"), o valor, a idade ("há 1 h"), o que falta ("3 esperam a nota"). */
  etiquetas?: string[]
  /** Os pedidos do item, pra abrir um por um — do mais antigo pro mais novo. */
  pedidos?: { numero: number; href: string }[]
}

export type DiaDoGrafico = { rotulo: string; valor: number; pedidos: number; hoje: boolean }

export type Inicio = {
  numeros: {
    vendasHoje: { valor: number; pedidos: number }
    esperando: { valor: number; pix: number; analise: number }
    semana: { valor: number; pedidos: number; ticket: number }
  }
  grafico: DiaDoGrafico[]
  fila: ItemDaFila[]
  /** Quem abre os Pedidos: os pedidos feitos hoje. */
  pedidosDeHoje: LinhaDaLista[] | null
  /** Os mais vendidos da semana, em unidades. */
  maisVendidos: { nome: string; unidades: number; imagem: string | null }[]
}

export type DadosDoInicio = {
  pedidos: PedidoCru[]
  notas: Map<string, NotaCrua>
  envios: Map<string, EnvioCru[]>
  /** Marketing: quantos entraram na newsletter nos últimos 7 dias, e o total. */
  newsletter?: { semana: number; total: number }
  /** Marketing: produtos em rascunho (os novos do Bling). */
  rascunhos?: number
  /** Quem abre as Avaliações: quantas chegaram e esperam o painel. */
  avaliacoes?: number
}

/** Quem pede o Início: o papel dele e as áreas que abre agora (`PedidoDaEquipe.areas`). */
export type QuemVeOInicio = { papel: Papel; areas: readonly Area[] }

const DIA_MS = 24 * 60 * 60 * 1000

/**
 * QUAIS PEDIDOS PRECISAM DO TOTAL — o Início lê 45 dias SEM o total (o
 * Medusa calcula o total pedido a pedido: é o que mais pesa na leitura) e
 * pede o total só destes: os que entram num número em reais — as vendas de
 * hoje e da semana (pagos nos últimos 8 dias, com folga pro fuso), o que
 * espera pagamento e os pedidos de hoje. A fila (a nota, a Frenet, o
 * estorno) não usa o total.
 */
export const JANELA_DO_TOTAL_MS = 8 * DIA_MS

export function precisamDoTotal(pedidos: PedidoCru[], agora: Date): string[] {
  const desde = agora.getTime() - JANELA_DO_TOTAL_MS
  return pedidos
    .filter((o) => {
      const p = pagamentoDo(o)
      const s = situacaoDo(o, p, agora)
      return (
        new Date(o.created_at).getTime() >= desde ||
        (p.pagoEm !== null && p.pagoEm.getTime() >= desde) ||
        s === "pix" ||
        s === "analise"
      )
    })
    .map((o) => o.id)
}

export function montarInicio(quem: QuemVeOInicio, dados: DadosDoInicio, ctx: Contexto): Inicio {
  const abre = (area: Area) => quem.areas.includes(area)
  const hoje = chaveDoDia(ctx.agora)
  const dias = Array.from({ length: 7 }, (_, i) => new Date(ctx.agora.getTime() - (6 - i) * DIA_MS))
  const chaves = dias.map(chaveDoDia)

  const linhas = dados.pedidos.map((o) => ({
    o,
    l: linhaDaLista(o, dados.notas.get(o.id) ?? null, dados.envios.get(o.id) ?? [], ctx),
    p: pagamentoDo(o),
  }))

  /* ── os números ── */
  const vendidos = linhas.filter(({ o, p }) => p.pagoEm && o.status !== "canceled")
  const porDia = new Map<string, { valor: number; pedidos: number }>()
  for (const { l, p } of vendidos) {
    const chave = chaveDoDia(p.pagoEm!)
    const atual = porDia.get(chave) ?? { valor: 0, pedidos: 0 }
    porDia.set(chave, { valor: centavos(atual.valor + l.total), pedidos: atual.pedidos + 1 })
  }
  const deHoje = porDia.get(hoje) ?? { valor: 0, pedidos: 0 }
  const semana = chaves.reduce(
    (s, c) => {
      const d = porDia.get(c)
      return d ? { valor: centavos(s.valor + d.valor), pedidos: s.pedidos + d.pedidos } : s
    },
    { valor: 0, pedidos: 0 }
  )
  const esperando = linhas.filter(({ l }) => l.situacao === "pix" || l.situacao === "analise")

  /* ── os mais vendidos ── */
  const unidades = new Map<string, { nome: string; unidades: number; imagem: string | null }>()
  for (const { o, p } of vendidos) {
    if (!chaves.includes(chaveDoDia(p.pagoEm!))) continue
    for (const i of o.items ?? []) {
      const chave = i.product_id ?? i.product_title ?? i.title ?? i.id
      const atual = unidades.get(chave) ?? {
        nome: nomeCurto(i.product_title ?? i.title ?? "Produto"),
        unidades: 0,
        imagem: i.thumbnail ?? null,
      }
      atual.unidades += Number(i.quantity ?? 0)
      unidades.set(chave, atual)
    }
  }

  return {
    numeros: {
      vendasHoje: deHoje,
      esperando: {
        valor: centavos(esperando.reduce((s, { l }) => s + l.total, 0)),
        pix: esperando.filter(({ l }) => l.situacao === "pix").length,
        analise: esperando.filter(({ l }) => l.situacao === "analise").length,
      },
      semana: { ...semana, ticket: semana.pedidos ? centavos(semana.valor / semana.pedidos) : 0 },
    },
    grafico: dias.map((d, i) => {
      const valor = porDia.get(chaves[i]) ?? { valor: 0, pedidos: 0 }
      return {
        rotulo: `${diaDaSemana(d)} ${dia(d).slice(0, 2)}`,
        ...valor,
        hoje: chaves[i] === hoje,
      }
    }),
    fila: [
      ...(abre("pedidos")
        ? filaDosPedidos(
            linhas.map(({ o, l }) => ({ o, l, nota: dados.notas.get(o.id) ?? null })),
            abre("estornos"),
            ctx
          )
        : []),
      ...(quem.papel === "marketing" ? filaDoMarketing(dados) : []),
      ...(abre("avaliacoes") && dados.avaliacoes ? [itemDasAvaliacoes(dados.avaliacoes)] : []),
    ].sort((a, b) => ORDEM[a.nivel] - ORDEM[b.nivel]),
    pedidosDeHoje: !abre("pedidos")
      ? null
      : linhas
          .filter(({ o }) => chaveDoDia(o.created_at) === hoje)
          .map(({ l }) => l)
          .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)),
    maisVendidos: [...unidades.values()].sort((a, b) => b.unidades - a.unidades).slice(0, 5),
  }
}

/**
 * Por que um pedido pago ainda não saiu — e como dizer isso de um pedido só
 * ("#6 espera a nota") ou de vários ("3 esperam a nota"). A ordem é a do que
 * mais precisa de alguém.
 */
const MOTIVOS = [
  { chave: "nota", um: "travado pela nota", varios: "travados pela nota" },
  { chave: "frenet", um: "recusado pela Frenet", varios: "recusados pela Frenet" },
  { chave: "etiqueta", um: "pronto pra etiqueta", varios: "prontos pra etiqueta" },
  { chave: "sefaz", um: "com a nota na SEFAZ", varios: "com a nota na SEFAZ" },
  { chave: "espera", um: "espera a nota", varios: "esperam a nota" },
] as const

function porQueNaoSaiu(l: LinhaDaLista, nota: NotaCrua | null): (typeof MOTIVOS)[number]["chave"] {
  if (l.problema === "nota" || notaTravada(nota)) return "nota"
  if (l.problema === "frenet") return "frenet"
  if (l.despachar) return "etiqueta"
  if (nota?.situacao === "processando") return "sefaz"
  return "espera"
}

const centavos = (v: number) => Math.round(v * 100) / 100

const ORDEM: Record<ItemDaFila["nivel"], number> = { grave: 0, atencao: 1, "": 2, ok: 3 }

/** Os pedidos de um item, e o que muda quando é um só: o link vai direto nele. */
type Juntando = {
  item: Omit<ItemDaFila, "quantos" | "pedidos" | "href" | "texto"> & { varios: string }
  pedidos: { numero: number; id: string; criadoEm: string; linha: string }[]
  /** A explicação, com a frase de cada pedido (na ordem do item) e os números deles. */
  texto: (linhas: string[], numeros: number[]) => string
  /** O que se soma entre os pedidos (o valor dos estornos). */
  soma?: number
}

function juntos(g: Juntando): ItemDaFila {
  const pedidos = [...g.pedidos].sort((a, b) => a.criadoEm.localeCompare(b.criadoEm))
  const um = pedidos.length === 1
  const { varios, ...item } = g.item
  return {
    ...item,
    texto: g.texto(
      pedidos.map((p) => p.linha),
      pedidos.map((p) => p.numero)
    ),
    href: um ? `/pedidos/${pedidos[0]!.id}` : varios,
    quantos: pedidos.length,
    pedidos: pedidos.map((p) => ({ numero: p.numero, href: `/pedidos/${p.id}` })),
  }
}

/** Uma frase por pedido quando são várias diferentes ("#12: …"); uma só quando é a mesma. */
const porPedido = (linhas: string[], numeros: number[]) =>
  new Set(linhas).size <= 1
    ? (linhas[0] ?? "")
    : linhas.map((l, i) => `#${numeros[i]}: ${l}`).join("\n")

/**
 * A fila dos pedidos — o que precisa de quem despacha: o que falta sair, a
 * nota, a Frenet, a entrega, o cartão em análise. O estorno que falhou entra
 * só pra quem aperta o "Tentar o estorno de novo" (`veEstornos`). O que é
 * igual vira um item só (ver `ItemDaFila`).
 */
function filaDosPedidos(
  linhas: { o: PedidoCru; l: LinhaDaLista; nota: NotaCrua | null }[],
  veEstornos: boolean,
  ctx: Contexto
): ItemDaFila[] {
  const fila: ItemDaFila[] = []

  const emSeparacao = linhas
    .filter(({ l }) => l.situacao === "separacao")
    .sort((a, b) => a.l.criadoEm.localeCompare(b.l.criadoEm))
  if (emSeparacao.length) {
    const porMotivo = new Map<string, number[]>()
    for (const { l, nota } of emSeparacao) {
      const m = porQueNaoSaiu(l, nota)
      porMotivo.set(m, [...(porMotivo.get(m) ?? []), l.numero])
    }
    const partes = MOTIVOS.flatMap((m) => {
      const numeros = porMotivo.get(m.chave)
      if (!numeros) return []
      return [numeros.length === 1 ? `#${numeros[0]} ${m.um}` : `${numeros.length} ${m.varios}`]
    })
    fila.push({
      chave: "despachar",
      nivel: "atencao",
      icone: "caminhao",
      titulo: "Pra despachar",
      texto: "Pagos e ainda sem sair da loja: a nota, a Frenet e a etiqueta, nessa ordem.",
      href: "/pedidos?filtro=despachar",
      quantos: emSeparacao.length,
      etiquetas: partes,
    })
  }

  const grupos = new Map<string, Juntando>()
  const juntar = (chave: string, novo: () => Omit<Juntando, "pedidos">) => {
    const g = grupos.get(chave) ?? { ...novo(), pedidos: [] }
    grupos.set(chave, g)
    return g
  }
  const pedido = (l: LinhaDaLista, linha = "") => ({
    numero: l.numero,
    id: l.id,
    criadoEm: l.criadoEm,
    linha,
  })

  for (const { o, l, nota } of linhas) {
    if (veEstornos) {
      for (const e of Object.values(lerEstornos(o.metadata))) {
        if (e.situacao !== "falhou") continue
        const proxima = e.proxima ? new Date(e.proxima) : null
        const falta = Math.max(0, e.esperado - e.devolvido) / 100
        const g = juntar("estorno", () => ({
          item: {
            chave: "estorno",
            nivel: "grave",
            icone: "pix",
            titulo: "O estorno não saiu",
            varios: "/pedidos?filtro=problemas",
            etiquetas: [],
          },
          texto: (ls) => ls.join("\n"),
          soma: 0,
        }))
        g.pedidos.push(
          pedido(
            l,
            `#${l.numero}: ${reais(falta)} ${e.forma === "pix" ? "do Pix" : "do cartão"}` +
              (e.motivo ? ` — ${e.motivo}` : "") +
              (e.sozinha && proxima
                ? `. A loja tenta de novo às ${hora(proxima)}.`
                : ". Precisa de você.")
          )
        )
        g.soma = centavos((g.soma ?? 0) + falta)
        g.item.etiquetas = [reais(g.soma)]
      }
    }
    if (nota && notaTravada(nota)) {
      if (nota.cancelar) {
        juntar("nota-cancelar", () => ({
          item: {
            chave: "nota-cancelar",
            nivel: "grave",
            icone: "nota",
            titulo: "Cancelar a nota no Bling",
            varios: "/pedidos?filtro=problemas",
          },
          texto: () =>
            "O pedido foi cancelado depois da nota sair: a SEFAZ aceita o cancelamento até 24 horas depois da emissão.",
        })).pedidos.push(pedido(l))
      } else if (nota.situacao === "a-emitir") {
        const erro = emFrase(nota.erro ?? "O Bling recusou o pedido")
        const curto = motivoCurto(nota.erro)
        const chave = `nota-a-emitir:${curto ?? erro}`
        // A do "3 dias sem nota" tem a chave dela: o grupo inteiro é de atrasadas.
        const atrasada = notaPassouDosTresDias(nota)
        juntar(chave, () => ({
          item: {
            chave,
            nivel: "grave",
            icone: "nota",
            titulo: "A nota não sai sozinha",
            varios: "/pedidos?filtro=problemas",
            ...(curto ? { etiquetas: [curto] } : {}),
          },
          texto: (ls, ns) =>
            atrasada
              ? `${porPedido(ls, ns)} Confira no Bling se a nota já foi feita à mão; se não, tente de novo, no pedido.`
              : `${porPedido(ls, ns)} Corrija o que falta e tente de novo, no pedido.`,
        })).pedidos.push(pedido(l, erro))
      } else {
        juntar("nota-sefaz", () => ({
          item: {
            chave: "nota-sefaz",
            nivel: "grave",
            icone: "nota",
            titulo: "Nota com problema",
            varios: "/pedidos?filtro=problemas",
          },
          texto: (ls, ns) =>
            `${porPedido(ls, ns)} Corrija no Bling e reenvie por lá — a loja percebe sozinha.`,
        })).pedidos.push(
          pedido(l, emFrase(nota.detalhe ?? nota.erro ?? "O Bling não emitiu a nota"))
        )
      }
    }
    const parceiro = lerRegistroNoPedido(o.metadata)
    if (parceiro && canceladoNaFrenet(o)) {
      juntar("frenet-cancelado", () => ({
        item: {
          chave: "frenet-cancelado",
          nivel: "grave",
          icone: "caminhao",
          titulo: "Cancelado, e ainda na Frenet",
          varios: "/pedidos?filtro=problemas",
        },
        texto: (ls, ns) =>
          `${porPedido(ls, ns)} Não gere a etiqueta — se já gerou, cancele lá. A loja segue tentando tirar sozinha.`,
      })).pedidos.push(pedido(l, `A Frenet não deixou tirar o ${parceiro.referencia}.`))
    }
    if (o.status !== "canceled" && parceiro && !parceiro.entrou && parceiro.desistiu_em) {
      juntar("frenet-parou", () => ({
        item: {
          chave: "frenet-parou",
          nivel: "grave",
          icone: "caminhao",
          titulo: "Não entrou na Frenet",
          varios: "/pedidos?filtro=problemas",
          etiquetas: ["3 dias tentando"],
        },
        texto: (ls, ns) =>
          `${porPedido(ls, ns)} A loja tentou por 3 dias e parou: mande de novo, no pedido — ou faça a etiqueta à mão no painel da Frenet.`,
      })).pedidos.push(pedido(l, emFrase(`o último erro: ${parceiro.erro ?? "sem detalhe"}`)))
    } else if (o.status !== "canceled" && parceiro && !parceiro.entrou && parceiro.definitivo) {
      juntar("frenet", () => ({
        item: {
          chave: "frenet",
          nivel: "grave",
          icone: "caminhao",
          titulo: "A Frenet recusou",
          varios: "/pedidos?filtro=problemas",
        },
        texto: (ls, ns) => `${porPedido(ls, ns)} Faça a etiqueta à mão no painel da Frenet.`,
      })).pedidos.push(pedido(l, parceiro.erro ?? "Sem detalhe."))
    }
    if (l.problema === "entrega") {
      juntar("entrega", () => ({
        item: {
          chave: "entrega",
          nivel: "atencao",
          icone: "alerta",
          titulo: "Problema na entrega",
          varios: "/pedidos?filtro=problemas",
        },
        texto: () => "A transportadora não entregou. Fale com o cliente pra combinar.",
      })).pedidos.push(pedido(l))
    }
    if (l.situacao === "analise") {
      const g = juntar("analise", () => ({
        item: {
          chave: "analise",
          nivel: "",
          icone: "cartao",
          titulo: "Cartão em análise",
          varios: "/pedidos?filtro=pagamento",
        },
        texto: () => "O valor está só reservado. Aprovado, a loja cobra sozinha.",
        soma: 0,
      }))
      g.pedidos.push(pedido(l))
      g.soma = centavos((g.soma ?? 0) + l.total)
      // A idade do que espera há mais tempo, e quanto espera (0186: era o número "Esperando pagamento").
      const mais = [...g.pedidos].sort((a, b) => a.criadoEm.localeCompare(b.criadoEm))[0]!
      g.item.etiquetas = [`há ${duracao(minutosEntre(mais.criadoEm, ctx.agora))}`, reais(g.soma)]
    }
    // O Pix gerado e ainda não pago (0186: saiu do número "Esperando pagamento" do Início de antes).
    if (l.situacao === "pix") {
      const g = juntar("pix", () => ({
        item: {
          chave: "pix",
          nivel: "",
          icone: "pix",
          titulo: "Pix esperando",
          varios: "/pedidos?filtro=pagamento",
        },
        texto: () =>
          "O QR foi gerado e o cliente ainda não pagou. Pago, o pedido segue sozinho; vencido, sai daqui.",
        soma: 0,
      }))
      g.pedidos.push(pedido(l))
      g.soma = centavos((g.soma ?? 0) + l.total)
      g.item.etiquetas = [reais(g.soma)]
    }
  }

  for (const g of grupos.values()) fila.push(juntos(g))
  return fila.sort((a, b) => ORDEM[a.nivel] - ORDEM[b.nivel])
}

/** As avaliações que chegaram pela página `/avaliar` e esperam aprovação. */
function itemDasAvaliacoes(quantas: number): ItemDaFila {
  return {
    chave: "avaliacoes",
    nivel: "atencao",
    icone: "estrela",
    titulo: "Avaliações esperando",
    texto:
      "Chegaram de quem comprou, pela página de avaliação. Aprovada, a avaliação vai pro site.",
    href: "/avaliacoes",
    quantos: quantas,
  }
}

function filaDoMarketing(dados: DadosDoInicio): ItemDaFila[] {
  const fila: ItemDaFila[] = []
  if (dados.rascunhos) {
    fila.push({
      chave: "rascunhos",
      nivel: "atencao",
      icone: "produtos",
      titulo: "Produtos em rascunho",
      texto:
        "Chegaram do Bling sem foto, texto ou categoria — e não aparecem na loja até alguém completar.",
      href: "/produtos",
      quantos: dados.rascunhos,
    })
  }
  if (dados.newsletter) {
    const { semana, total } = dados.newsletter
    fila.push({
      chave: "newsletter",
      nivel: "ok",
      icone: "email",
      titulo: "Newsletter",
      texto: "Quem recebe ofertas por e-mail, do rodapé da loja e da conta.",
      href: "/clientes/newsletter",
      etiquetas: [
        semana ? `+${semana} esta semana` : "nenhum novo esta semana",
        `${total} no total`,
      ],
    })
  }
  return fila
}
