import { MedusaError } from "@medusajs/framework/utils"
import type { Papel } from "../equipe/regras"
import { lerRegistroNoPedido } from "../envios/registro"
import { lerRegistros as lerEstornos } from "../estornos"
import { chaveDoDia, emFrase, hora, quando, reais } from "./formato"
import { notaTravada, type EnvioCru, type NotaCrua, type PedidoCru } from "./pedido"

/**
 * A OBSERVABILIDADE — a saúde da loja em frase: o que quebrou e o que fazer,
 * as integrações e o último sinal de cada uma, e as rotinas automáticas.
 *
 * Código puro, com testes, como o `inicio.ts`. Quem lê o banco e grava é o
 * vigia (`lib/observabilidade/vigia.ts`) e a rota; aqui só se decide.
 *
 * ┌─ DOIS JEITOS DE UM PROBLEMA EXISTIR ────────────────────────────────────┐
 * │ SOZINHO: é um estado da loja — o estorno que não saiu, a nota travada, │
 * │ a conexão do Bling caída, a rotina falhando. Aparece enquanto o estado │
 * │ durar e sai sozinho quando ele muda; não tem "marcar como resolvido",  │
 * │ porque marcar não muda o estado. O vigia confere de 5 em 5 minutos.     │
 * │                                                                        │
 * │ DE EVENTO: aconteceu e passou — a cotação da Frenet que falhou, o      │
 * │ e-mail que não saiu. Fica até alguém marcar como visto; se acontecer   │
 * │ de novo depois disso, volta. Um cartão por dia, contando as vezes.     │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * Nada de dado de cliente: número do pedido, e o e-mail só mascarado.
 */

type Quando = Date | string | null | undefined

const data = (d: Date | string | number) => (d instanceof Date ? d : new Date(d))
const MIN = 60 * 1000

/* ── as rotinas ─────────────────────────────────────────────────────────── */

export type DefinicaoDaRotina = {
  /** O `config.name` do job. */
  nome: string
  frase: string
  /** O `config.schedule` do job — o teste confere que é o mesmo. */
  agenda: string
  cada: string
}

/** Os jobs de `src/jobs`, na ordem da tela (os mais frequentes primeiro). */
export const ROTINAS: readonly DefinicaoDaRotina[] = [
  {
    nome: "precos-por-quantidade",
    frase: "Recalcula o desconto por quantidade",
    agenda: "* * * * *",
    cada: "a cada minuto",
  },
  {
    nome: "conciliar-pagamentos",
    frase: "Confere os pagamentos com o Pagar.me",
    agenda: "*/5 * * * *",
    cada: "a cada 5 min",
  },
  {
    nome: "confirmar-pedidos",
    frase: "Manda os e-mails de pedido pago e cancelado",
    agenda: "2-59/5 * * * *",
    cada: "a cada 5 min",
  },
  {
    nome: "sincronizar-estoque",
    frase: "Copia o estoque do Bling",
    agenda: "3-59/5 * * * *",
    cada: "a cada 5 min",
  },
  {
    nome: "acompanhar-notas",
    frase: "Emite e acompanha as notas fiscais",
    agenda: "4-59/5 * * * *",
    cada: "a cada 5 min",
  },
  {
    nome: "vigiar-a-loja",
    frase: "Confere a saúde da loja (esta tela)",
    agenda: "1-59/5 * * * *",
    cada: "a cada 5 min",
  },
  {
    nome: "registrar-pedidos",
    frase: "Manda os pedidos pagos pra Frenet",
    agenda: "6-59/10 * * * *",
    cada: "a cada 10 min",
  },
  {
    nome: "acompanhar-envios",
    frase: "Consulta o rastreio dos pacotes",
    agenda: "23 * * * *",
    cada: "de hora em hora",
  },
  {
    nome: "bumps",
    frase: "Atualiza as ofertas do checkout",
    agenda: "23 * * * *",
    cada: "de hora em hora",
  },
]

export const VIGIA = "vigiar-a-loja"

/**
 * Os minutos da hora em que a rotina roda. Só o campo dos minutos varia nas
 * agendas da loja (o resto é `* * * *`): `*`, `*\/5`, `2-59/5`, `23`.
 */
export function minutosDaAgenda(agenda: string): number[] {
  const [campo = "", ...resto] = agenda.trim().split(/\s+/)
  const m = /^(\*|\d{1,2}(?:-\d{1,2})?)(?:\/(\d{1,2}))?$/.exec(campo)
  if (!m || resto.join(" ") !== "* * * *")
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `agenda fora do formato: "${agenda}"`)
  const passo = m[2] ? Number(m[2]) : 1
  const [de, ate] =
    m[1] === "*"
      ? [0, 59]
      : m[1].includes("-")
        ? m[1].split("-").map(Number)
        : [Number(m[1]), m[2] ? 59 : Number(m[1])]
  const minutos: number[] = []
  for (let x = de; x <= Math.min(ate, 59); x += passo) minutos.push(x)
  return minutos
}

/** O maior vão entre duas rodadas, em minutos. */
export function intervaloDaAgenda(agenda: string): number {
  const m = minutosDaAgenda(agenda)
  let maior = 60 - m[m.length - 1] + m[0]
  for (let i = 1; i < m.length; i++) maior = Math.max(maior, m[i] - m[i - 1])
  return maior
}

/**
 * A próxima rodada depois de `agora`. Os minutos não mudam com o fuso (o de
 * Brasília é de hora cheia), então a conta é em UTC, como a do servidor.
 */
export function proximaRodada(agenda: string, agora: Date): Date {
  const minutos = new Set(minutosDaAgenda(agenda))
  const base = Math.floor(agora.getTime() / MIN) * MIN
  for (let i = 1; i <= 60; i++) {
    const t = new Date(base + i * MIN)
    if (minutos.has(t.getUTCMinutes())) return t
  }
  return new Date(base + 60 * MIN)
}

/** Uma linha da tabela `obs_rotina`: a última rodada de um job. */
export type LinhaDaRotina = {
  nome: string
  ultima_inicio?: Quando
  ultima_fim?: Quando
  ultima_duracao_ms?: number | null
  ultima_situacao?: string | null
  ultimo_erro?: string | null
  ultimo_ok_em?: Quando
  falhas_seguidas?: number | null
}

export type SituacaoDaRotina = "ok" | "atencao" | "erro" | "espera"

export type RotinaNaTela = {
  nome: string
  frase: string
  cada: string
  s: SituacaoDaRotina
  /** "hoje, 21:05" */
  ultima: string | null
  /** "1,2 s" */
  duracao: string | null
  texto: string | null
  /** "21:10" */
  proxima: string
}

/** Mais que isto rodando, travou (o job mais longo, o do rastreio, leva segundos). */
const TRAVADA_MIN = 30

/** Sem rodar há mais de dois intervalos (e uma folga), parou. */
export function parada(def: DefinicaoDaRotina, linha: LinhaDaRotina | undefined, agora: Date) {
  if (!linha?.ultima_inicio) return false
  const limite = (2 * intervaloDaAgenda(def.agenda) + 2) * MIN
  return agora.getTime() - data(linha.ultima_inicio).getTime() > limite
}

export function duracaoDaRodada(ms: number | null | undefined): string | null {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return null
  if (ms >= 60_000) return `${Math.round(ms / 60_000)} min`
  return `${(Math.max(ms, 100) / 1000).toFixed(1).replace(".", ",")} s`
}

export function rotinaNaTela(
  def: DefinicaoDaRotina,
  linha: LinhaDaRotina | undefined,
  agora: Date
): RotinaNaTela {
  const proxima = hora(proximaRodada(def.agenda, agora))
  const base = { nome: def.nome, frase: def.frase, cada: def.cada, proxima }
  if (!linha?.ultima_inicio) {
    return { ...base, s: "espera", ultima: null, duracao: null, texto: "Ainda não rodou." }
  }
  const inicio = data(linha.ultima_inicio)
  const ultima = quando(inicio, agora)
  const duracao = duracaoDaRodada(linha.ultima_duracao_ms)

  if (linha.ultima_situacao === "rodando") {
    return agora.getTime() - inicio.getTime() > TRAVADA_MIN * MIN
      ? {
          ...base,
          s: "erro",
          ultima,
          duracao: null,
          texto: `Travou: começou ${ultima} e não terminou.`,
        }
      : { ...base, s: "ok", ultima, duracao: null, texto: "Rodando agora." }
  }
  if (parada(def, linha, agora)) {
    return {
      ...base,
      s: "erro",
      ultima,
      duracao,
      texto: `Parou: não roda desde ${ultima}.`,
    }
  }
  if (linha.ultima_situacao === "erro") {
    const vezes = Math.max(1, Number(linha.falhas_seguidas ?? 1))
    return {
      ...base,
      s: vezes >= 2 ? "erro" : "atencao",
      ultima,
      duracao,
      texto:
        `Falhou${vezes >= 2 ? ` nas últimas ${vezes} vezes` : ""}: ` +
        `${emFrase(linha.ultimo_erro ?? "sem detalhe")} Tenta de novo sozinha às ${proxima}.`,
    }
  }
  return { ...base, s: "ok", ultima, duracao, texto: null }
}

/* ── os problemas ───────────────────────────────────────────────────────── */

export type Nivel = "grave" | "atencao" | "info"

export type AreaDoProblema =
  "Pagamento" | "Nota fiscal" | "Frete" | "Entrega" | "E-mail" | "Rotinas" | "Site"

export type Acao = { texto: string; href: string; externo?: boolean }

/** Um problema como o vigia acha — sem estado. A `chave` diz se é o mesmo de antes. */
export type ProblemaAchado = {
  chave: string
  nivel: Nivel
  area: AreaDoProblema
  titulo: string
  texto: string
  acao: Acao | null
  /** A linha técnica, pra quem for investigar (sem dado de cliente). */
  detalhe: string | null
  pedidoId: string | null
  /** Quantas vezes (a cotação que falhou) — 1 pros de estado. */
  vezes: number
  /** A última vez que aconteceu (o de estado: quando começou). */
  ocorreu: Date
  /** Sai sozinho quando o estado muda; senão, alguém marca como visto. */
  sozinho: boolean
  /** Dinheiro de cliente: só o dono vê, como no Início. */
  soDono: boolean
}

export type PedidoDoVigia = { o: PedidoCru; nota: NotaCrua | null; envios: EnvioCru[] }

const ENTREGA_RUIM: Record<string, string> = {
  nao_entregue: "A transportadora não conseguiu entregar.",
  devolvido: "O pacote voltou pra loja.",
  extraviado: "A transportadora perdeu o pacote.",
}

/** Os problemas que moram nos pedidos: estorno, nota, Frenet e entrega. */
export function problemasDosPedidos(pedidos: PedidoDoVigia[], agora: Date): ProblemaAchado[] {
  const achados: ProblemaAchado[] = []
  for (const { o, nota, envios } of pedidos) {
    const numero = o.display_id ?? 0
    const abrir: Acao = { texto: "Abrir o pedido", href: `/pedidos/${o.id}` }
    const comum = { pedidoId: o.id, acao: abrir, vezes: 1, sozinho: true, soDono: false }

    for (const [pagamento, e] of Object.entries(lerEstornos(o.metadata))) {
      if (e.situacao !== "falhou") continue
      const falta = Math.max(0, e.esperado - e.devolvido) / 100
      const proxima = e.proxima ? new Date(e.proxima) : null
      achados.push({
        ...comum,
        soDono: true,
        chave: `estorno/${o.id}/${pagamento}`,
        nivel: "grave",
        area: "Pagamento",
        titulo: `O estorno do #${numero} não saiu`,
        texto:
          `${reais(falta)} ${e.forma === "pix" ? "do Pix" : "do cartão"}` +
          (e.motivo ? ` — ${e.motivo}` : "") +
          (e.sozinha && proxima
            ? `. A loja tenta de novo sozinha ${quando(proxima, agora)}.`
            : ". A loja não tenta mais: devolva pelo painel do Pagar.me."),
        detalhe:
          `[estorno] #${numero}: ${e.motivo ?? "falhou"} · cobrança ${e.cobranca} · ` +
          `${e.tentativas} ${e.tentativas === 1 ? "tentativa" : "tentativas"} da loja`,
        vezes: Math.max(1, e.tentativas),
        ocorreu: e.desde ? new Date(e.desde) : agora,
      })
    }

    if (nota && notaTravada(nota)) {
      achados.push({
        ...comum,
        chave: `nota/${o.id}/${nota.cancelar ? "cancelar" : nota.situacao}`,
        nivel: "grave",
        area: "Nota fiscal",
        titulo: nota.cancelar
          ? `Cancelar a nota do #${numero} no Bling`
          : nota.situacao === "a-emitir"
            ? `A nota do #${numero} não sai sozinha`
            : `A nota do #${numero} foi rejeitada`,
        texto: nota.cancelar
          ? "O pedido foi cancelado depois da nota sair: a SEFAZ aceita o cancelamento até 24 horas depois da emissão."
          : nota.situacao === "a-emitir"
            ? `${emFrase(nota.erro ?? "O Bling recusou o pedido")} Corrija o que falta e tente de novo, no pedido.`
            : `${emFrase(nota.detalhe ?? nota.erro ?? "O Bling não emitiu a nota")} Corrija no Bling e reenvie por lá — a loja percebe sozinha.`,
        detalhe:
          `[erp] ${nota.referencia}: ${nota.cancelar ? "cancelar" : nota.situacao}` +
          [nota.erro, nota.detalhe]
            .filter(Boolean)
            .map((t) => ` — ${t}`)
            .join(""),
        ocorreu: nota.updated_at ? data(nota.updated_at) : agora,
      })
    }

    const parceiro = lerRegistroNoPedido(o.metadata)
    if (o.status !== "canceled" && parceiro && !parceiro.entrou && parceiro.definitivo) {
      achados.push({
        ...comum,
        chave: `frenet-recusou/${o.id}`,
        nivel: "grave",
        area: "Frete",
        titulo: `A Frenet recusou o #${numero}`,
        texto: `${emFrase(parceiro.erro ?? "Sem detalhe")} Faça a etiqueta à mão no painel da Frenet.`,
        detalhe: `[envio] #${numero}: ${parceiro.erro ?? "recusado"} (${parceiro.tentativas} tentativas)`,
        ocorreu: new Date(parceiro.em),
      })
    }

    const ruim = envios.find((e) => ENTREGA_RUIM[e.alerta ?? ""] || ENTREGA_RUIM[e.situacao ?? ""])
    if (ruim) {
      const frase = ENTREGA_RUIM[ruim.alerta ?? ""] ?? ENTREGA_RUIM[ruim.situacao ?? ""]
      achados.push({
        ...comum,
        chave: `entrega/${o.id}/${ruim.codigo ?? ""}`,
        nivel: "atencao",
        area: "Entrega",
        titulo: `Problema na entrega do #${numero}`,
        texto: `${frase} Fale com o cliente pra combinar.`,
        detalhe: `[envio] #${numero}: ${ruim.transportadora ?? "transportadora"} ${ruim.codigo ?? ""} — ${ruim.alerta ?? ruim.situacao}`,
        ocorreu: ruim.desde ? data(ruim.desde) : agora,
      })
    }
  }
  return achados
}

export type ErpDoVigia = {
  id: string
  nome: string
  configurado: boolean
  queda: string | null
}

export function problemaDoErp(
  erp: ErpDoVigia | null,
  { agora, admin }: { agora: Date; admin: string | null }
): ProblemaAchado | null {
  if (!erp?.configurado || !erp.queda) return null
  return {
    chave: `erp-caiu/${erp.id}`,
    nivel: "grave",
    area: "Nota fiscal",
    titulo: `A conexão com o ${erp.nome} caiu`,
    texto:
      `${emFrase(erp.queda)} Sem ela, as notas não saem e o estoque não é copiado. ` +
      `Conecte de novo no admin, na tela do ${erp.nome}.`,
    acao: admin ? { texto: "Abrir o admin", href: `${admin}/app/erp`, externo: true } : null,
    detalhe: `[erp] a conexão com o ${erp.nome} caiu: ${erp.queda}`,
    pedidoId: null,
    vezes: 1,
    ocorreu: agora,
    sozinho: true,
    soDono: false,
  }
}

/** A rotina que falha seguido, e a que parou (enquanto as outras rodam). */
export function problemasDasRotinas(linhas: LinhaDaRotina[], agora: Date): ProblemaAchado[] {
  const achados: ProblemaAchado[] = []
  for (const def of ROTINAS) {
    const linha = linhas.find((l) => l.nome === def.nome)
    if (!linha?.ultima_inicio) continue
    const comum = {
      area: "Rotinas" as const,
      acao: null,
      pedidoId: null,
      vezes: 1,
      sozinho: true,
      soDono: false,
    }
    if (def.nome !== VIGIA && parada(def, linha, agora)) {
      achados.push({
        ...comum,
        chave: `rotina-parada/${def.nome}`,
        nivel: "grave",
        titulo: `A rotina "${def.frase}" parou`,
        texto: `Ela roda ${def.cada} e não roda desde ${quando(linha.ultima_inicio, agora)}. As outras seguem rodando.`,
        detalhe: `[rotina] ${def.nome}: última rodada em ${data(linha.ultima_inicio).toISOString()}`,
        ocorreu: data(linha.ultima_inicio),
      })
      continue
    }
    const vezes = Number(linha.falhas_seguidas ?? 0)
    if (linha.ultima_situacao !== "erro" || vezes < 2) continue
    const ok = linha.ultimo_ok_em ? data(linha.ultimo_ok_em) : null
    const longe = !ok || agora.getTime() - ok.getTime() > 60 * MIN
    achados.push({
      ...comum,
      chave: `rotina/${def.nome}`,
      nivel: longe ? "grave" : "atencao",
      titulo: `A rotina "${def.frase}" está falhando`,
      texto:
        `Falhou nas últimas ${vezes} vezes` +
        (ok ? `; a última que deu certo foi ${quando(ok, agora)}` : "") +
        `. Ela tenta de novo sozinha, ${def.cada}.`,
      detalhe: `[rotina] ${def.nome}: ${linha.ultimo_erro ?? "sem detalhe"}`,
      vezes,
      ocorreu: data(linha.ultima_inicio),
    })
  }
  return achados
}

/* ── os sinais das integrações ─────────────────────────────────────────── */

/** As integrações que mandam sinal (`lib/observabilidade/sinal.ts`). */
export type Integracao =
  "resend" | "frenet" | "pagarme" | "pagarme-aviso" | "bling" | "ga4" | "loja"

/** Uma linha da tabela `obs_sinal`: o dia de uma integração. */
export type LinhaDoSinal = {
  integracao: string
  /** "2026-09-24", no fuso da loja. */
  dia: string
  ok: number
  falhas: number
  ultimo_ok_em?: Quando
  primeira_falha_em?: Quando
  ultima_falha_em?: Quando
  /** A falha em frase (o assunto e o e-mail mascarado, no Resend). */
  ultima_falha_resumo?: string | null
  /** A linha técnica da falha. */
  ultima_falha?: string | null
}

const vezes = (n: number) => (n === 1 ? "1 vez" : `${n} vezes`)

function faixaDoDia(s: LinhaDoSinal, agora: Date): string {
  const primeira = s.primeira_falha_em ? data(s.primeira_falha_em) : null
  const ultima = s.ultima_falha_em ? data(s.ultima_falha_em) : null
  if (!ultima) return ""
  const quandoFoi = chaveDoDia(ultima) === chaveDoDia(agora) ? "hoje" : "ontem"
  if (!primeira || hora(primeira) === hora(ultima)) return `${quandoFoi}, às ${hora(ultima)}`
  return `${quandoFoi}, entre ${hora(primeira)} e ${hora(ultima)}`
}

/**
 * Os problemas de evento, um por integração e por dia: a cotação da Frenet
 * que falhou, o e-mail que não saiu, o Pagar.me e o Bling que não
 * responderam. `emergencia` é o preço de emergência do frete (null: sem).
 */
export function problemasDosSinais(
  sinais: LinhaDoSinal[],
  { agora, emergencia, admin }: { agora: Date; emergencia: number | null; admin: string | null }
): ProblemaAchado[] {
  const achados: ProblemaAchado[] = []
  for (const s of sinais) {
    if (!s.falhas || !s.ultima_falha_em) continue
    const comum = {
      pedidoId: null,
      vezes: s.falhas,
      ocorreu: data(s.ultima_falha_em),
      sozinho: false,
      soDono: false,
      detalhe: s.ultima_falha ?? null,
    }
    const faixa = faixaDoDia(s, agora)
    if (s.integracao === "frenet") {
      achados.push({
        ...comum,
        chave: `frete/${s.dia}`,
        nivel: emergencia === null ? "atencao" : "info",
        area: "Frete",
        titulo: `A cotação do frete falhou ${vezes(s.falhas)}`,
        texto:
          `A Frenet não respondeu ${faixa}. ` +
          (emergencia === null
            ? "Sem preço de emergência, quem estava no checkout nessa hora ficou sem opção de entrega."
            : `Nessas vezes, a loja cobrou o preço de emergência (${reais(emergencia)}) e seguiu vendendo.`),
        acao:
          emergencia === null && admin
            ? {
                texto: "Configurar o preço de emergência",
                href: `${admin}/app/configuracoes`,
                externo: true,
              }
            : null,
      })
    } else if (s.integracao === "resend") {
      achados.push({
        ...comum,
        chave: `email/${s.dia}`,
        nivel: "atencao",
        area: "E-mail",
        titulo: s.falhas === 1 ? "Um e-mail não saiu" : `${s.falhas} e-mails não saíram`,
        texto:
          `O Resend não aceitou ${faixa}` +
          (s.ultima_falha_resumo ? ` — o último foi ${s.ultima_falha_resumo}` : "") +
          ". Os e-mails de pedido a loja tenta de novo sozinha; o código de acesso, a pessoa pede outro.",
        acao: null,
      })
    } else if (s.integracao === "pagarme") {
      achados.push({
        ...comum,
        chave: `pagarme/${s.dia}`,
        nivel: "atencao",
        area: "Pagamento",
        titulo: `O Pagar.me não respondeu ${vezes(s.falhas)}`,
        texto: `${emFrase(faixa)} A conciliação confere os pagamentos de 5 em 5 minutos e acerta o que ficou pra trás.`,
        acao: null,
      })
    } else if (s.integracao === "bling") {
      achados.push({
        ...comum,
        chave: `bling/${s.dia}`,
        nivel: "atencao",
        area: "Nota fiscal",
        titulo: `O Bling não respondeu ${vezes(s.falhas)}`,
        texto: `${emFrase(faixa)} As notas e o estoque tentam de novo sozinhos na próxima rodada.`,
        acao: null,
      })
    }
  }
  return achados
}

/* ── o que muda na tabela ──────────────────────────────────────────────── */

/** Uma linha da tabela `obs_problema` — só o que a conciliação usa. */
export type ProblemaGravado = {
  id: string
  chave: string
  situacao: "aberto" | "resolvido"
  sozinho: boolean
  pedido_id?: string | null
  resolvido_em?: Quando
  resolvido_por?: string | null
}

export const SOZINHA = "sozinha"

export type Mudancas = {
  criar: ProblemaAchado[]
  /** `reabrir`: estava resolvido e voltou. */
  atualizar: { id: string; achado: ProblemaAchado; reabrir: boolean }[]
  /** Os de estado que sumiram: resolvidos sozinhos. */
  resolver: string[]
}

/**
 * O que o vigia grava, dado o que achou agora e o que já estava na tabela.
 *
 * `pedidosVistos`: os pedidos que o vigia leu. Um problema de pedido fora da
 * leitura (mais velho que a janela) não some por não ter sido visto.
 */
export function conciliarProblemas(
  gravados: ProblemaGravado[],
  achados: ProblemaAchado[],
  pedidosVistos: ReadonlySet<string>
): Mudancas {
  const porChave = new Map(gravados.map((g) => [g.chave, g]))
  const mudancas: Mudancas = { criar: [], atualizar: [], resolver: [] }
  const achadas = new Set<string>()

  for (const a of achados) {
    if (achadas.has(a.chave)) continue
    achadas.add(a.chave)
    const g = porChave.get(a.chave)
    if (!g) {
      mudancas.criar.push(a)
    } else if (g.situacao === "aberto") {
      mudancas.atualizar.push({ id: g.id, achado: a, reabrir: false })
    } else if (g.resolvido_por === SOZINHA) {
      // Tinha saído sozinho e o estado voltou.
      mudancas.atualizar.push({ id: g.id, achado: a, reabrir: true })
    } else if (
      !a.sozinho &&
      g.resolvido_em &&
      a.ocorreu.getTime() > data(g.resolvido_em).getTime()
    ) {
      // Alguém marcou como visto, e aconteceu de novo depois.
      mudancas.atualizar.push({ id: g.id, achado: a, reabrir: true })
    }
  }

  for (const g of gravados) {
    if (g.situacao !== "aberto" || !g.sozinho || achadas.has(g.chave)) continue
    if (g.pedido_id && !pedidosVistos.has(g.pedido_id)) continue
    mudancas.resolver.push(g.id)
  }
  return mudancas
}

/* ── as integrações na tela ─────────────────────────────────────────────── */

export type SituacaoDaIntegracao = "ok" | "atencao" | "erro" | "off"

export type IntegracaoNaTela = {
  id: string
  nome: string
  onde: string
  s: SituacaoDaIntegracao
  texto: string
  /** "hoje, 21:08" · "agora" · null (nenhum sinal hoje). */
  sinal: string | null
}

export type EstadoDasIntegracoes = {
  agora: Date
  producao: boolean
  loja: { configurada: boolean; ok: boolean; ms: number | null; motivo: string | null }
  /** Quando o Medusa (este processo) ligou. */
  medusaDesde: Date
  pagarme: boolean
  frenet: boolean
  resend: boolean
  ga4: boolean
  erp: {
    nome: string
    configurado: boolean
    conectado: boolean
    queda: string | null
    ultimaNota: Date | null
  }
  /** Os sinais de hoje. */
  sinais: LinhaDoSinal[]
}

const VAZIO: LinhaDoSinal = { integracao: "", dia: "", ok: 0, falhas: 0 }

/** Falhou por último e não voltou: erro se já são 3; senão, atenção. Falhou e voltou: atenção. */
function peloSinal(s: LinhaDoSinal): SituacaoDaIntegracao {
  if (!s.falhas) return "ok"
  const falha = s.ultima_falha_em ? data(s.ultima_falha_em).getTime() : 0
  const ok = s.ultimo_ok_em ? data(s.ultimo_ok_em).getTime() : 0
  return falha > ok && s.falhas >= 3 ? "erro" : "atencao"
}

function ultimoSinal(sinais: LinhaDoSinal[], agora: Date): string | null {
  const t = Math.max(
    0,
    ...sinais.flatMap((s) =>
      [s.ultimo_ok_em, s.ultima_falha_em].flatMap((d) => (d ? [data(d).getTime()] : []))
    )
  )
  return t ? quando(new Date(t), agora) : null
}

/** " · 2 falhas hoje (a última hoje, 14:02)" */
const falhasDoDia = (s: LinhaDoSinal, agora: Date) =>
  s.falhas && s.ultima_falha_em
    ? ` · ${s.falhas} ${s.falhas === 1 ? "falha" : "falhas"} hoje (a última ${quando(s.ultima_falha_em, agora)})`
    : ""

export function integracoesNaTela(e: EstadoDasIntegracoes): IntegracaoNaTela[] {
  const { agora } = e
  const sinal = (id: Integracao) => e.sinais.find((s) => s.integracao === id) ?? VAZIO
  const loja = sinal("loja")
  const pagarme = sinal("pagarme")
  const aviso = sinal("pagarme-aviso")
  const frenet = sinal("frenet")
  const resend = sinal("resend")
  const bling = sinal("bling")
  const ga4 = sinal("ga4")

  const lista: IntegracaoNaTela[] = []

  lista.push(
    !e.loja.configurada
      ? {
          id: "loja",
          nome: "Loja (site)",
          onde: "Vercel",
          s: "off",
          texto: "O endereço da loja não está configurado no backend (LOJA_URL).",
          sinal: null,
        }
      : e.loja.ok
        ? {
            id: "loja",
            nome: "Loja (site)",
            onde: "Vercel",
            s: loja.falhas ? "atencao" : "ok",
            texto:
              `No ar · respondeu em ${e.loja.ms ?? 0} ms` +
              (loja.falhas
                ? ` · ${loja.falhas === 1 ? "1 aviso de mudança não chegou" : `${loja.falhas} avisos de mudança não chegaram`} hoje`
                : ""),
            sinal: "agora",
          }
        : {
            id: "loja",
            nome: "Loja (site)",
            onde: "Vercel",
            s: "erro",
            texto: `Não respondeu agora: ${e.loja.motivo ?? "sem resposta"}.`,
            sinal: "agora",
          }
  )

  lista.push({
    id: "medusa",
    nome: "Medusa (pedidos e estoque)",
    onde: "Railway",
    s: "ok",
    texto: `No ar · ligado ${quando(e.medusaDesde, agora)}`,
    sinal: "agora",
  })

  lista.push(
    !e.pagarme
      ? {
          id: "pagarme",
          nome: "Pagar.me",
          onde: "pagamentos",
          s: e.producao ? "erro" : "off",
          texto: "Sem a chave do Pagar.me: a loja não recebe pagamento.",
          sinal: null,
        }
      : {
          id: "pagarme",
          nome: "Pagar.me",
          onde: "pagamentos",
          s: peloSinal(pagarme),
          texto:
            (aviso.ultimo_ok_em
              ? `Último aviso ${quando(aviso.ultimo_ok_em, agora)}`
              : "Nenhum aviso hoje") + falhasDoDia(pagarme, agora),
          sinal: ultimoSinal([pagarme, aviso], agora),
        }
  )

  const erp = e.erp
  lista.push(
    !erp.configurado
      ? {
          id: "erp",
          nome: erp.nome,
          onde: "nota fiscal e estoque",
          s: "off",
          texto: "Não configurado: as notas e o estoque não passam por ele.",
          sinal: null,
        }
      : erp.queda
        ? {
            id: "erp",
            nome: erp.nome,
            onde: "nota fiscal e estoque",
            s: "erro",
            texto: `A conexão caiu: ${emFrase(erp.queda)}`,
            sinal: ultimoSinal([bling], agora),
          }
        : !erp.conectado
          ? {
              id: "erp",
              nome: erp.nome,
              onde: "nota fiscal e estoque",
              s: "erro",
              texto: "Desconectado: conecte no admin, na tela do ERP.",
              sinal: null,
            }
          : {
              id: "erp",
              nome: erp.nome,
              onde: "nota fiscal e estoque",
              s: peloSinal(bling),
              texto:
                "Conectado" +
                (erp.ultimaNota ? ` · última nota ${quando(erp.ultimaNota, agora)}` : "") +
                falhasDoDia(bling, agora),
              sinal: ultimoSinal([bling], agora),
            }
  )

  lista.push(
    !e.frenet
      ? {
          id: "frenet",
          nome: "Frenet",
          onde: "frete e rastreio",
          s: e.producao ? "erro" : "off",
          texto: "Sem o token da Frenet: a loja não cota o frete.",
          sinal: null,
        }
      : {
          id: "frenet",
          nome: "Frenet",
          onde: "frete e rastreio",
          s: peloSinal(frenet),
          texto:
            (frenet.ok + frenet.falhas
              ? `${frenet.ok + frenet.falhas} ${frenet.ok + frenet.falhas === 1 ? "cotação" : "cotações"} hoje`
              : "Nenhuma cotação hoje") +
            (frenet.falhas && frenet.ultima_falha_em
              ? ` · ${frenet.falhas} ${frenet.falhas === 1 ? "falhou" : "falharam"} (a última ${quando(frenet.ultima_falha_em, agora)})`
              : ""),
          sinal: ultimoSinal([frenet], agora),
        }
  )

  lista.push(
    !e.resend
      ? {
          id: "resend",
          nome: "Resend",
          onde: "e-mails",
          s: e.producao ? "erro" : "off",
          texto: "Sem a chave do Resend: nenhum e-mail sai.",
          sinal: null,
        }
      : {
          id: "resend",
          nome: "Resend",
          onde: "e-mails",
          s: peloSinal(resend),
          texto:
            `${resend.ok} ${resend.ok === 1 ? "e-mail" : "e-mails"} hoje` +
            (resend.falhas
              ? ` · ${resend.falhas} não ${resend.falhas === 1 ? "saiu" : "saíram"}`
              : ""),
          sinal: ultimoSinal([resend], agora),
        }
  )

  lista.push(
    !e.ga4
      ? {
          id: "ga4",
          nome: "Google Analytics",
          onde: "visitas",
          s: "off",
          texto: "Não configurado: o Início não mostra as visitas.",
          sinal: null,
        }
      : {
          id: "ga4",
          nome: "Google Analytics",
          onde: "visitas",
          s: peloSinal(ga4),
          texto:
            peloSinal(ga4) === "ok"
              ? ga4.ok
                ? "Respondendo"
                : "Nenhuma consulta hoje"
              : `${ga4.falhas} ${ga4.falhas === 1 ? "consulta falhou" : "consultas falharam"} hoje` +
                (ga4.ultima_falha_resumo ? `: ${ga4.ultima_falha_resumo}` : ""),
          sinal: ultimoSinal([ga4], agora),
        }
  )

  return lista
}

/* ── a tela ─────────────────────────────────────────────────────────────── */

/** Uma linha da tabela `obs_problema`, como a tela lê. */
export type LinhaDoProblema = ProblemaGravado & {
  nivel: Nivel
  area: string
  titulo: string
  texto: string
  acao?: Acao | null
  detalhe?: string | null
  vezes?: number | null
  primeira_em: Quando
  ultima_em: Quando
  so_dono?: boolean | null
  resolvido_nome?: string | null
}

export type ProblemaNaTela = {
  id: string
  nivel: Nivel
  area: string
  titulo: string
  texto: string
  meta: string
  acao: Acao | null
  detalhe: string | null
  situacao: "aberto" | "resolvido"
  /** "Resolvido por Ana, hoje, 10:12" · "Saiu sozinho hoje, 10:12" */
  resolvido: string | null
  sozinho: boolean
  podeMarcar: boolean
}

export type TelaDaObservabilidade = {
  geral: { nivel: "grave" | "atencao" | "info"; titulo: string; texto: string }
  numeros: {
    problemas: { abertos: number; graves: number; olhar: number }
    rotinas: { ok: number; total: number }
    integracoes: { ok: number; total: number }
    emails: { hoje: number; falhas: number }
  }
  problemas: ProblemaNaTela[]
  integracoes: IntegracaoNaTela[]
  rotinas: RotinaNaTela[]
}

const ORDEM: Record<Nivel, number> = { grave: 0, atencao: 1, info: 2 }

export const podeVer = (papel: Papel, p: { so_dono?: boolean | null }) =>
  papel === "dono" || !p.so_dono

function metaDo(p: LinhaDoProblema, agora: Date): string {
  const partes: string[] = []
  const primeira = p.primeira_em ? data(p.primeira_em) : null
  const ultima = p.ultima_em ? data(p.ultima_em) : null
  if (p.sozinho) {
    if (primeira) partes.push(`desde ${quando(primeira, agora)}`)
  } else {
    const n = Number(p.vezes ?? 1)
    if (n > 1) partes.push(vezes(n))
    if (ultima) partes.push(`${n > 1 ? "a última " : ""}${quando(ultima, agora)}`)
  }
  return partes.join(" · ")
}

export function problemaNaTela(p: LinhaDoProblema, papel: Papel, agora: Date): ProblemaNaTela {
  const resolvidoEm = p.resolvido_em ? data(p.resolvido_em) : null
  return {
    id: p.id,
    nivel: p.nivel,
    area: p.area,
    titulo: p.titulo,
    texto: p.texto,
    meta: metaDo(p, agora),
    acao: p.acao ?? null,
    detalhe: p.detalhe ?? null,
    situacao: p.situacao,
    resolvido:
      p.situacao !== "resolvido"
        ? null
        : p.resolvido_por === SOZINHA
          ? `Saiu sozinho${resolvidoEm ? ` ${quando(resolvidoEm, agora)}` : ""}`
          : `Resolvido${p.resolvido_nome ? ` por ${p.resolvido_nome}` : ""}${resolvidoEm ? `, ${quando(resolvidoEm, agora)}` : ""}`,
    sozinho: p.sozinho,
    podeMarcar: p.situacao === "aberto" && !p.sozinho && podeVer(papel, p),
  }
}

/**
 * As rotinas pararam todas — o vigia também, então ninguém grava problema
 * nenhum. A tela diz na hora, sem tabela: é o caso do worker fora do ar.
 */
export function problemaDasRotinasParadas(
  linhas: LinhaDaRotina[],
  agora: Date
): LinhaDoProblema | null {
  const vigia = ROTINAS.find((r) => r.nome === VIGIA)!
  const linhaDoVigia = linhas.find((l) => l.nome === VIGIA)
  if (!linhaDoVigia?.ultima_inicio || !parada(vigia, linhaDoVigia, agora)) return null
  const ultima = Math.max(
    ...linhas.flatMap((l) => (l.ultima_inicio ? [data(l.ultima_inicio).getTime()] : []))
  )
  return {
    id: "rotinas-paradas",
    chave: "rotinas-paradas",
    situacao: "aberto",
    sozinho: true,
    nivel: "grave",
    area: "Rotinas",
    titulo: "As rotinas automáticas pararam",
    texto:
      `Nenhuma roda desde ${quando(new Date(ultima), agora)}. Pagamentos, notas, e-mails e estoque ` +
      "ficam parados até elas voltarem. No Railway, reinicie o serviço do Medusa.",
    detalhe: "[rotina] nenhum job rodou no worker nos últimos minutos",
    primeira_em: new Date(ultima),
    ultima_em: agora,
  }
}

export function telaDaObservabilidade(
  papel: Papel,
  {
    agora,
    problemas,
    rotinas,
    integracoes,
  }: {
    agora: Date
    /** Os abertos e os resolvidos recentes, da tabela. */
    problemas: LinhaDoProblema[]
    rotinas: LinhaDaRotina[]
    integracoes: EstadoDasIntegracoes
  }
): TelaDaObservabilidade {
  const paradas = problemaDasRotinasParadas(rotinas, agora)
  const visiveis = [...(paradas ? [paradas] : []), ...problemas].filter((p) => podeVer(papel, p))
  const naTela = visiveis
    .map((p) => problemaNaTela(p, papel, agora))
    .sort(
      (a, b) =>
        Number(a.situacao === "resolvido") - Number(b.situacao === "resolvido") ||
        ORDEM[a.nivel] - ORDEM[b.nivel]
    )
  const abertos = naTela.filter((p) => p.situacao === "aberto")
  const graves = abertos.filter((p) => p.nivel === "grave").length
  const olhar = abertos.filter((p) => p.nivel === "atencao").length

  const rotinasNaTela = ROTINAS.map((def) =>
    rotinaNaTela(
      def,
      rotinas.find((l) => l.nome === def.nome),
      agora
    )
  )
  const integracoesNaLista = integracoesNaTela(integracoes)
  const resend = integracoes.sinais.find((s) => s.integracao === "resend") ?? VAZIO

  return {
    geral: graves
      ? {
          nivel: "grave",
          titulo: graves === 1 ? "1 problema grave agora" : `${graves} problemas graves agora`,
          texto: "Cada um diz o que fazer, embaixo. O resto da loja segue funcionando.",
        }
      : abertos.length
        ? {
            nivel: "atencao",
            titulo: "Nada grave agora",
            texto:
              abertos.length === 1
                ? "Tem 1 coisa pra olhar, embaixo, quando der."
                : `Tem ${abertos.length} coisas pra olhar, embaixo, quando der.`,
          }
        : {
            nivel: "info",
            titulo: "Tudo funcionando",
            texto: "Nenhum problema aberto. O site está no ar e as rotinas estão rodando.",
          },
    numeros: {
      problemas: { abertos: abertos.length, graves, olhar },
      rotinas: {
        ok: rotinasNaTela.filter((r) => r.s === "ok").length,
        total: rotinasNaTela.length,
      },
      integracoes: {
        ok: integracoesNaLista.filter((i) => i.s === "ok").length,
        total: integracoesNaLista.filter((i) => i.s !== "off").length,
      },
      emails: { hoje: resend.ok, falhas: resend.falhas },
    },
    problemas: naTela,
    integracoes: integracoesNaLista,
    rotinas: rotinasNaTela,
  }
}
