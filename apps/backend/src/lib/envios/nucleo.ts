import type { InferTypeOf, MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { ENVIOS } from "../../modules/envios"
import type { Envio } from "../../modules/envios/models/envio"
import type EnviosService from "../../modules/envios/service"
import { sincronizarComMedusa } from "./medusa"
import type { EventoDoParceiro, Novidade } from "./parceiro"
import {
  chaveDoEvento,
  ehTipoDeEvento,
  jaSaiu,
  lerAvisos,
  limparCodigo,
  momentoDe,
  resumir,
  transportadoraPeloCodigo,
  type SituacaoDoEnvio,
} from "./situacao"

/**
 * O NÚCLEO DOS ENVIOS — onde toda notícia de pacote chega, venha de onde vier.
 *
 *   aviso do parceiro ──(tradutor)──┐
 *   "Mark as shipped" no admin ─────┼──▶ receberNovidade ──▶ envio + linha do tempo
 *   (depois) consulta periódica ────┘         │
 *                                             ├──▶ o pedido no Medusa (medusa.ts)
 *                                             └──▶ `envio.mudou` ──▶ e-mail (avisos.ts)
 *
 * Ele não sabe o que é Frenet. Recebe `Novidade` (o vocabulário de
 * `situacao.ts`) e decide o resto:
 *
 *   1. DE QUAL PACOTE É — pelo código de rastreio; sem código, pelo id do
 *      envio no parceiro.
 *   2. DE QUAL PEDIDO É — o que o envio já sabe; o que o admin disse; o que
 *      o parceiro diz (`order_…` ou o número, #1042); ou a etiqueta que o
 *      admin cadastrou no Medusa com aquele código. Nenhum? O envio fica
 *      guardado sem pedido, e se liga no dia em que o código aparecer num.
 *   3. O QUE É NOVO — evento repetido não entra (ver `chaveDoEvento`).
 *   4. ONDE O PACOTE ESTÁ — recalculado de todos os eventos (`resumir`).
 *   5. O PEDIDO ACOMPANHA — enviado e entregue no Medusa, com o código.
 *   6. QUEM MAIS PRECISA SABER — sai o evento `envio.mudou`; o e-mail ao
 *      cliente é um assinante dele, e o próximo interessado (WhatsApp,
 *      avaliação sete dias depois) também vai ser.
 *
 * ┌─ UM PACOTE DE CADA VEZ ────────────────────────────────────────────────┐
 * │ O mesmo código pode chegar ao mesmo tempo por dois caminhos: o aviso   │
 * │ da Frenet e o admin clicando "Mark as shipped". Tudo o que vai do 1 ao │
 * │ 5 roda com uma trava no código (a trava do Medusa, no Redis): o        │
 * │ segundo espera o primeiro e encontra o envio pronto, em vez de criar   │
 * │ outro.                                                                  │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

export const ENVIO_MUDOU = "envio.mudou"

type EnvioGuardado = InferTypeOf<typeof Envio>
/** Os campos que o núcleo escreve num envio. */
type Mudanca = Partial<
  Omit<EnvioGuardado, "id" | "eventos" | "created_at" | "updated_at" | "deleted_at">
>
type Passagem =
  | { tipo: "ignorado"; motivo: string }
  | { tipo: "ok"; envio: EnvioGuardado; mudou: boolean; novos: number; pendencia: string | null }

export type Origem = {
  /** O id do parceiro que mandou, ou "loja" — o admin, pelo Medusa. */
  parceiro: string
  /**
   * O cliente deve saber desta mudança? O admin pode postar sem avisar;
   * nesse caso o momento fica marcado como dispensado e não sai depois.
   */
  avisarCliente: boolean
  /** O que a origem já sabe (o admin sabe o pedido e o fulfillment). */
  pedidoId?: string | null
  fulfillmentId?: string | null
}

export type Recebido =
  | { estado: "ignorado"; motivo: string }
  | {
      estado: "ok"
      envioId: string
      pedidoId: string | null
      situacao: SituacaoDoEnvio
      mudou: boolean
      eventosNovos: number
      pendencia: string | null
    }

const LOJA = "loja"

export async function receberNovidade(
  container: MedusaContainer,
  novidade: Novidade,
  origem: Origem
): Promise<Recebido> {
  const codigo = limparCodigo(novidade.codigo)
  const idNoParceiro = origem.parceiro === LOJA ? null : (novidade.idNoParceiro?.trim() ?? null)
  if (!codigo && !idNoParceiro) {
    return { estado: "ignorado", motivo: "aviso sem código de rastreio nem id do envio" }
  }

  const envios = container.resolve<EnviosService>(ENVIOS)
  const trava = container.resolve(Modules.LOCKING)
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const chave = codigo ? `envio:${codigo}` : `envio:${origem.parceiro}:${idNoParceiro}`

  const r = await trava.execute(
    chave,
    async (): Promise<Passagem> => {
      let envio = await acharEnvio(envios, codigo, origem.parceiro, idNoParceiro)

      if (envio?.pedido_id && origem.pedidoId && envio.pedido_id !== origem.pedidoId) {
        return {
          tipo: "ignorado",
          motivo: `o código ${codigo} já é de outro pedido (${envio.pedido_id}) — nada mudou`,
        }
      }

      const pedidoId =
        envio?.pedido_id ??
        origem.pedidoId ??
        (await pedidoDaReferencia(container, novidade.pedido)) ??
        (codigo ? await pedidoPelaEtiqueta(container, codigo) : null)

      if (!envio) {
        envio = await envios.createEnvios({
          pedido_id: pedidoId,
          fulfillment_id: origem.fulfillmentId ?? null,
          parceiro: origem.parceiro,
          id_no_parceiro: idNoParceiro,
          referencia: novidade.pedido,
          codigo,
          url: novidade.url,
          transportadora: novidade.transportadora ?? transportadoraPeloCodigo(codigo),
          servico: novidade.servico,
          situacao: "aguardando",
        })
      }

      /* Os dados do pacote: o que veio preenche, o que não veio não apaga. */
      const mudanca: Mudanca = {}
      const preencher = <K extends keyof Mudanca>(k: K, v: Mudanca[K] | null | undefined) => {
        if (v !== null && v !== undefined && envio![k] !== v) mudanca[k] = v
      }
      preencher("pedido_id", pedidoId)
      preencher("fulfillment_id", origem.fulfillmentId)
      preencher("codigo", codigo)
      preencher("url", novidade.url)
      preencher("transportadora", novidade.transportadora ?? transportadoraPeloCodigo(codigo))
      preencher("servico", novidade.servico)
      if (origem.parceiro !== LOJA) {
        // O parceiro que fala por último é quem fala pelo pacote dali em diante.
        preencher("parceiro", origem.parceiro)
        preencher("referencia", novidade.pedido)
        if (idNoParceiro && envio.id_no_parceiro !== idNoParceiro) {
          // O id do envio no parceiro é único; se outro pacote já tem esse
          // id, o código manda e o id fica de fora.
          const [dono] = await envios.listEnvios(
            { parceiro: origem.parceiro, id_no_parceiro: idNoParceiro },
            { select: ["id"], take: 1 }
          )
          if (!dono || dono.id === envio.id) mudanca.id_no_parceiro = idNoParceiro
        }
      }

      /* Os eventos novos. */
      const existentes = await envios.listEventos(
        { envio_id: envio.id },
        { select: ["id", "tipo", "quando", "chave", "origem"], take: 1000 }
      )
      const conhecidas = new Set(existentes.map((e) => e.chave))
      const doParceiro = origem.parceiro !== LOJA
      const antes = resumir(queContam(existentes).map(paraResumir))
      /*
        O ADMIN SÓ CONTA A HISTÓRIA QUE NINGUÉM CONTOU. O "postado" dele (a
        hora do clique) entra só em envio sem evento nenhum — depois de um
        "em trânsito" da transportadora, ele puxaria o pacote de volta pro
        começo. O "entregue" dele entra enquanto o pacote não chegou.
      */
      const candidatos = doParceiro
        ? novidade.eventos
        : novidade.eventos.filter((e) =>
            e.tipo === "entregue" ? antes.situacao !== "entregue" : existentes.length === 0
          )
      const novos: (EventoDoParceiro & { chave: string })[] = []
      for (const e of candidatos) {
        const k = chaveDoEvento(e)
        if (conhecidas.has(k)) continue
        conhecidas.add(k)
        novos.push({ ...e, chave: k })
      }
      if (novos.length) {
        await envios.createEventos(
          novos.map((e) => ({
            envio_id: envio!.id,
            tipo: e.tipo,
            descricao: e.descricao,
            local: e.local,
            quando: e.quando,
            origem: doParceiro ? "parceiro" : LOJA,
            chave: e.chave,
            bruto: (e.bruto ?? null) as Record<string, unknown> | null,
          }))
        )
      }

      /* Onde o pacote está agora. */
      const resumo = resumir(
        queContam([
          ...existentes,
          ...novos.map((e) => ({ ...e, origem: doParceiro ? "parceiro" : LOJA })),
        ]).map(paraResumir)
      )
      /*
        MUDOU é o que alguém precisa saber: o pacote mudou de lugar, acendeu
        ou apagou um alerta — ou o envio que estava sem dono ganhou um
        pedido agora (o cliente dele ainda não sabe de nada).
      */
      const ganhouPedido = Boolean(pedidoId && !envio.pedido_id)
      const mudou =
        resumo.situacao !== envio.situacao ||
        resumo.alerta !== (envio.alerta ?? null) ||
        ganhouPedido
      if (mudou) {
        mudanca.situacao = resumo.situacao
        mudanca.alerta = resumo.alerta
        mudanca.desde = resumo.desde
        if (!origem.avisarCliente) {
          const momento = momentoDe(resumo.situacao)
          const avisos = lerAvisos(envio.avisos)
          if (momento && !avisos[momento]) {
            avisos[momento] = { em: new Date().toISOString(), como: "dispensado" }
            mudanca.avisos = avisos as Record<string, unknown>
          }
        }
      }
      if (!mesmaData(resumo.postadoEm, envio.postado_em)) mudanca.postado_em = resumo.postadoEm
      if (!mesmaData(resumo.entregueEm, envio.entregue_em)) mudanca.entregue_em = resumo.entregueEm

      if (Object.keys(mudanca).length) {
        envio = await envios.updateEnvios({ id: envio.id, ...mudanca })
      }

      /* O pedido acompanha — dentro da trava, pra dois avisos do mesmo pacote não postarem duas vezes. */
      const acompanhado = await acompanharNoMedusa(container, envios, envio)
      envio = acompanhado.envio
      const pendencia = acompanhado.pendencia

      return { tipo: "ok", envio, mudou, novos: novos.length, pendencia }
    },
    { timeout: 20 }
  )

  if (r.tipo === "ignorado") {
    logger.warn(`[envio] ${r.motivo}`)
    return { estado: "ignorado", motivo: r.motivo }
  }

  if (r.mudou) {
    const eventos = container.resolve(Modules.EVENT_BUS)
    await eventos.emit({ name: ENVIO_MUDOU, data: { id: r.envio.id } })
  }

  return {
    estado: "ok",
    envioId: r.envio.id,
    pedidoId: r.envio.pedido_id ?? null,
    situacao: r.envio.situacao as SituacaoDoEnvio,
    mudou: r.mudou,
    eventosNovos: r.novos,
    pendencia: r.pendencia,
  }
}

/* ── o pedido acompanha ───────────────────────────────────────────────────── */

/**
 * Leva a situação do envio pro pedido no Medusa (`medusa.ts`) e anota o
 * resultado: a pendência, quando não deu, e o fulfillment que ficou com o
 * código. Chamada DENTRO da trava do pacote.
 */
async function acompanharNoMedusa(
  container: MedusaContainer,
  envios: EnviosService,
  envio: EnvioGuardado
): Promise<{ envio: EnvioGuardado; pendencia: string | null }> {
  if (!envio.pedido_id || !jaSaiu(envio.situacao as SituacaoDoEnvio)) {
    return { envio, pendencia: envio.pendencia ?? null }
  }
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const s = await sincronizarComMedusa(container, {
    pedido_id: envio.pedido_id,
    fulfillment_id: envio.fulfillment_id ?? null,
    codigo: envio.codigo ?? null,
    url: envio.url ?? null,
    situacao: envio.situacao as SituacaoDoEnvio,
  }).catch((e) => ({ ok: false as const, motivo: mensagem(e) }))

  const pendencia = s.ok ? null : s.motivo
  const fulfillmentId = s.ok ? s.fulfillmentId : (envio.fulfillment_id ?? null)
  if (pendencia !== (envio.pendencia ?? null) || fulfillmentId !== (envio.fulfillment_id ?? null)) {
    envio = await envios.updateEnvios({ id: envio.id, pendencia, fulfillment_id: fulfillmentId })
  }
  if (s.ok && s.fez.length) {
    logger.info(`[envio] ${envio.codigo}: pedido ${envio.pedido_id} — ${s.fez.join(", ")}`)
  }
  if (!s.ok) logger.warn(`[envio] ${envio.codigo}: o pedido não acompanhou — ${s.motivo}`)
  return { envio, pendencia }
}

/**
 * De novo, pro que ficou pendente — o job de acompanhamento chama. Mesma
 * trava do aviso: se um aviso do mesmo pacote chegar junto, um espera o
 * outro.
 */
export async function acompanharDeNovo(container: MedusaContainer, envioId: string) {
  const envios = container.resolve<EnviosService>(ENVIOS)
  const [primeiro] = await envios.listEnvios({ id: envioId }, { take: 1 })
  if (!primeiro) return null
  const chave = primeiro.codigo
    ? `envio:${primeiro.codigo}`
    : `envio:${primeiro.parceiro}:${primeiro.id_no_parceiro}`
  return container.resolve(Modules.LOCKING).execute(
    chave,
    async () => {
      const [envio] = await envios.listEnvios({ id: envioId }, { take: 1 })
      return envio ? (await acompanharNoMedusa(container, envios, envio)).pendencia : null
    },
    { timeout: 20 }
  )
}

/* ── achar ────────────────────────────────────────────────────────────────── */

/**
 * Os eventos que decidem a situação. O "postado" que o ADMIN marcou tem a
 * hora do clique, que costuma ser DEPOIS dos primeiros eventos da
 * transportadora (ninguém clica na hora em que posta): contando, ele
 * puxaria um "em trânsito" de volta pra "postado". Então ele só vale
 * enquanto a transportadora não disse nada. O "entregue" do admin vale
 * sempre — é alguém da loja confirmando.
 */
function queContam<T extends { tipo: string; origem?: string | null }>(eventos: T[]): T[] {
  const daTransportadora = eventos.some((e) => e.origem !== LOJA)
  return daTransportadora
    ? eventos.filter((e) => !(e.origem === LOJA && e.tipo === "postado"))
    : eventos
}

function mensagem(e: unknown): string {
  const m = (e as { message?: unknown } | null)?.message
  return typeof m === "string" ? m : String(e)
}

function paraResumir(e: { tipo: string; quando: Date | string }) {
  return {
    tipo: ehTipoDeEvento(e.tipo) ? e.tipo : ("informativo" as const),
    quando: e.quando instanceof Date ? e.quando : new Date(e.quando),
  }
}

function mesmaData(a: Date | null, b: Date | string | null | undefined): boolean {
  const tb = b ? new Date(b).getTime() : null
  return (a?.getTime() ?? null) === tb
}

async function acharEnvio(
  envios: EnviosService,
  codigo: string | null,
  parceiro: string,
  idNoParceiro: string | null
): Promise<EnvioGuardado | null> {
  if (codigo) {
    const [pelo] = await envios.listEnvios({ codigo }, { take: 1 })
    if (pelo) return pelo
  }
  if (idNoParceiro) {
    const [pelo] = await envios.listEnvios({ parceiro, id_no_parceiro: idNoParceiro }, { take: 1 })
    if (pelo) return pelo
  }
  return null
}

/**
 * O pedido pelo que o parceiro diz: o id do Medusa, ou o número da loja
 * (1042, #1042) — que é o que alguém digitaria no painel do parceiro —, ou o
 * nome que a loja deu ao pedido quando o mandou pra lá (FB-1042, ver
 * `referenciaDoPedido`).
 */
async function pedidoDaReferencia(
  container: MedusaContainer,
  referencia: string | null
): Promise<string | null> {
  const t = referencia?.trim()
  if (!t) return null
  let filtros: Record<string, unknown>
  if (/^order_[0-9A-Za-z]{10,40}$/.test(t)) filtros = { id: t }
  else {
    const m = t.match(/^(?:FB-|#)?(\d{1,9})$/i)
    if (!m) return null
    filtros = { display_id: Number(m[1]) }
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "order", fields: ["id"], filters: filtros })
  return data.length === 1 ? (data[0] as { id: string }).id : null
}

/**
 * O pedido pela etiqueta que o admin cadastrou no Medusa com este código —
 * inclusive as de antes de o núcleo existir. A etiqueta só se procura pelo
 * módulo de fulfillment (o `query` não lista etiqueta solta); o pedido, pelo
 * `query`, que conhece o elo entre os dois.
 */
async function pedidoPelaEtiqueta(
  container: MedusaContainer,
  codigo: string
): Promise<string | null> {
  const achados = await container.resolve(Modules.FULFILLMENT).listFulfillments(
    // ILIKE sem curinga: a mesma letra, maiúscula ou não. `%` e `_` escapados.
    { labels: { tracking_number: { $ilike: codigo.replace(/[\\%_]/g, "\\$&") } } } as Record<
      string,
      unknown
    >,
    { select: ["id", "canceled_at"], take: 20 }
  )
  const vivos = achados.filter((f) => !f.canceled_at).map((f) => f.id)
  if (!vivos.length) return null
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "fulfillment",
    fields: ["id", "order.id"],
    filters: { id: vivos },
  })
  const pedidos = new Set<string>()
  for (const f of data as { order?: { id?: string } | null }[]) {
    if (f.order?.id) pedidos.add(f.order.id)
  }
  return pedidos.size === 1 ? [...pedidos][0]! : null
}
