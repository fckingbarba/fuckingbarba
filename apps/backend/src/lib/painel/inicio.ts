import type { Papel } from "../equipe/regras"
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
  linhaDaLista,
  nomeCurto,
  notaTravada,
  pagamentoDo,
  type Contexto,
  type EnvioCru,
  type LinhaDaLista,
  type NotaCrua,
  type PedidoCru,
} from "./pedido"

/**
 * O INÍCIO — o que precisa de alguém hoje, as vendas e os pedidos do dia.
 *
 * Código puro, como o `pedido.ts`: recebe os pedidos recentes (com as notas
 * e os envios) e devolve a tela pronta, conforme o papel. O que o papel não
 * vê não entra na resposta — o marketing recebe os números e os mais
 * vendidos, sem nome de cliente; o estorno que falhou só vai pro dono.
 *
 * "VENDA" É PEDIDO PAGO: Pix esperando e cartão em análise ficam de fora das
 * vendas (eles têm o número deles, "Esperando pagamento"), e pedido pago
 * depois cancelado também — o dinheiro voltou.
 */

export type ItemDaFila = {
  nivel: "grave" | "atencao" | "" | "ok"
  icone: "caminhao" | "nota" | "pix" | "cartao" | "alerta" | "email" | "produtos"
  titulo: string
  texto: string
  href: string
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
  /** Dono e operação: os pedidos feitos hoje. */
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
}

const DIA_MS = 24 * 60 * 60 * 1000

export function montarInicio(papel: Papel, dados: DadosDoInicio, ctx: Contexto): Inicio {
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
    fila:
      papel === "marketing"
        ? filaDoMarketing(dados)
        : filaDaOperacao(
            linhas.map(({ o, l }) => ({ o, l, nota: dados.notas.get(o.id) ?? null })),
            papel,
            ctx
          ),
    pedidosDeHoje:
      papel === "marketing"
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

function filaDaOperacao(
  linhas: { o: PedidoCru; l: LinhaDaLista; nota: NotaCrua | null }[],
  papel: Papel,
  ctx: Contexto
): ItemDaFila[] {
  const fila: ItemDaFila[] = []
  const pra = (id: string) => `/pedidos/${id}`

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
      nivel: "atencao",
      icone: "caminhao",
      titulo:
        emSeparacao.length === 1
          ? "1 pedido pra despachar"
          : `${emSeparacao.length} pedidos pra despachar`,
      texto: partes.join(" · "),
      href: "/pedidos?filtro=despachar",
    })
  }

  for (const { o, l, nota } of linhas) {
    if (papel === "dono") {
      for (const e of Object.values(lerEstornos(o.metadata))) {
        if (e.situacao !== "falhou") continue
        const proxima = e.proxima ? new Date(e.proxima) : null
        fila.push({
          nivel: "grave",
          icone: "pix",
          titulo: `O estorno do #${l.numero} não saiu`,
          texto:
            `${reais(Math.max(0, e.esperado - e.devolvido) / 100)} ${e.forma === "pix" ? "do Pix" : "do cartão"}` +
            (e.motivo ? ` — ${e.motivo}` : "") +
            (e.sozinha && proxima
              ? `. A loja tenta de novo às ${hora(proxima)}.`
              : ". Precisa de você."),
          href: pra(l.id),
        })
      }
    }
    if (nota && notaTravada(nota)) {
      fila.push({
        nivel: "grave",
        icone: "nota",
        titulo: nota.cancelar
          ? `Cancelar a nota do #${l.numero} no Bling`
          : nota.situacao === "a-emitir"
            ? `A nota do #${l.numero} não sai sozinha`
            : `Nota com problema no pedido #${l.numero}`,
        texto: nota.cancelar
          ? "O pedido foi cancelado depois da nota sair: a SEFAZ aceita o cancelamento até 24 horas depois da emissão."
          : nota.situacao === "a-emitir"
            ? `${emFrase(nota.erro ?? "O Bling recusou o pedido")} Corrija o que falta e tente de novo, no pedido.`
            : `${emFrase(nota.detalhe ?? nota.erro ?? "O Bling não emitiu a nota")} Corrija no Bling e reenvie por lá — a loja percebe sozinha.`,
        href: pra(l.id),
      })
    }
    const parceiro = lerRegistroNoPedido(o.metadata)
    if (o.status !== "canceled" && parceiro && !parceiro.entrou && parceiro.definitivo) {
      fila.push({
        nivel: "grave",
        icone: "caminhao",
        titulo: `A Frenet recusou o #${l.numero}`,
        texto: `${parceiro.erro ?? "Sem detalhe."} Faça a etiqueta à mão no painel da Frenet.`,
        href: pra(l.id),
      })
    }
    if (l.problema === "entrega") {
      fila.push({
        nivel: "atencao",
        icone: "alerta",
        titulo: `Problema na entrega do #${l.numero}`,
        texto: "A transportadora não entregou. Fale com o cliente pra combinar.",
        href: pra(l.id),
      })
    }
    if (l.situacao === "analise") {
      fila.push({
        nivel: "",
        icone: "cartao",
        titulo: `Cartão em análise há ${duracao(minutosEntre(l.criadoEm, ctx.agora))} — #${l.numero}`,
        texto: "O valor está só reservado. Aprovado, a loja cobra sozinha.",
        href: pra(l.id),
      })
    }
  }

  return fila.sort((a, b) => ORDEM[a.nivel] - ORDEM[b.nivel])
}

function filaDoMarketing(dados: DadosDoInicio): ItemDaFila[] {
  const fila: ItemDaFila[] = []
  if (dados.rascunhos) {
    fila.push({
      nivel: "atencao",
      icone: "produtos",
      titulo:
        dados.rascunhos === 1 ? "1 produto em rascunho" : `${dados.rascunhos} produtos em rascunho`,
      texto:
        "Chegaram do Bling sem foto, texto ou categoria — e não aparecem na loja até alguém completar.",
      href: "/produtos",
    })
  }
  if (dados.newsletter) {
    const { semana, total } = dados.newsletter
    fila.push({
      nivel: "ok",
      icone: "email",
      titulo: semana
        ? `+${semana} na newsletter esta semana`
        : "Newsletter sem inscrição nova esta semana",
      texto: `${total} ${total === 1 ? "recebe" : "recebem"} ofertas por e-mail, do rodapé e da conta.`,
      href: "/clientes/newsletter",
    })
  }
  return fila
}
