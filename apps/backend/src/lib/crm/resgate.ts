import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto"
import { normalizarEmail } from "../../modules/codigo/regras"
import { CRM } from "../../modules/crm"
import type CrmService from "../../modules/crm/service"
import type { BotoesDoResgate } from "../emails/resgate"
import { pedidoDaBase, pedidoDaPessoa } from "../painel/crm"
import { pedidosParaAsEtiquetas } from "../painel/ler"
import { lerAjustesGuardados } from "./ajustes"
import {
  COMPONENTES,
  ENTREGA_ESTIMADA_DIAS,
  etiquetasDaPessoa,
  quandoAcaba,
  type Componente,
} from "./etiquetas"
import { diasDoFluxo } from "./fluxos"
import { juntar } from "./nuvemshop"
import type { PedidoDaReposicao } from "./reposicao"

/**
 * O RESGATE E O SUNSET (entrega 0192, a etapa 4 do "Ciclo da Barba") — quem
 * passou do dia de comprar de novo (a etapa "em risco" das etiquetas: o dia
 * de acabar mais a tolerância dos Ajustes, ou 60 dias sem pedido quando não
 * se sabe quanto dura o que ela levou).
 *
 * NO DIA, a pergunta de 1 clique, com os 4 botões do plano (escolha do dono,
 * 28/09). O clique passa pelo Medusa (`GET /crm/resgate?t=…`), que anota a
 * resposta e manda pro lugar dela:
 *
 *   - "Tá caro": o cupom de 15% na hora, guardado na loja (`/discount/<código>`);
 *   - "Esqueci de repor": o pedido de sempre, num carrinho novo (o link de voltar);
 *   - "Não vi resultado": o WhatsApp da loja, com a mensagem pronta;
 *   - "Comprei em outro lugar": a loja — e o resgate para por aí.
 *
 * Quem respondeu não recebe mais nada do resgate. Quem não respondeu ganha
 * 15% em 7 dias (e o "vence amanhã" em 9). EM 45 DIAS, SEM SINAL NENHUM
 * (resposta, clique, abertura, visita, compra), o SUNSET: "Quer continuar
 * recebendo?". Sem o "Sim" em 7 dias, a pessoa fica ADORMECIDA: os fluxos
 * param pra ela (`adormecido`), menos os que ela mesma começa (Pix,
 * checkout, carrinho, cadastro). Os e-mails de pedido não passam por aqui.
 * Voltar a clicar, visitar ou comprar acorda.
 *
 * O resgate é oferta: vai pra quem comprou na loja nova (o sim por padrão,
 * 0184) e pra quem aceitou ofertas na loja antiga. Quem saiu da lista, não.
 *
 * O `t` dos botões é a resposta, o pedido e a chave do resgate CIFRADOS
 * (AES-256-GCM), como o do check-in: a chave é só pra isto, derivada do
 * `JWT_SECRET`. As partes puras têm testes.
 */

const DIA = 24 * 60 * 60 * 1000

export type RespostaDoResgate = "caro" | "esqueci" | "resultado" | "outro" | "sim"

export const RESPOSTAS_DO_RESGATE: readonly RespostaDoResgate[] = [
  "caro",
  "esqueci",
  "resultado",
  "outro",
  "sim",
]

/** Quanto tempo o "Sim, quero continuar" tem pra chegar, depois do e-mail do sunset. */
export const PRAZO_DO_SIM = 7 * DIA

const PEDIDO = /^(order|nso)_[0-9A-Z]{26}$/
const CHAVE = /^[^\s|]{3,254}\|\d{4}-\d{2}-\d{2}$/

const DIA_DE_BRASILIA = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

/** A chave de um resgate: a pessoa e o dia em que ela ficou em risco (outro dia, outro resgate). */
export const chaveDoResgate = (email: string, desde: Date) =>
  `${email}|${DIA_DE_BRASILIA.format(desde)}`

/** O e-mail da chave do resgate. */
export const emailDaChave = (chave: string) => chave.slice(0, chave.lastIndexOf("|"))

function chaveDoLink(): Buffer {
  const segredo = process.env.JWT_SECRET
  if (!segredo)
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, "JWT_SECRET não configurado")
  return createHmac("sha256", segredo).update("fb-crm-resgate").digest()
}

/** O que o botão leva: o resgate, o pedido de sempre (o "Esqueci") e o que acabou (o "Não vi resultado"). */
export type LinkDoResgate = {
  chave: string
  pedido: string | null
  componente: Componente | null
  resposta: RespostaDoResgate
}

/** O `t` do botão desta resposta, pra este resgate. */
export function tokenDoResgate(
  { chave, pedido, componente, resposta }: LinkDoResgate,
  k: Buffer = chaveDoLink()
): string {
  if (!CHAVE.test(chave))
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "chave do resgate fora do formato")
  if (pedido !== null && !PEDIDO.test(pedido))
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `pedido fora do formato: ${pedido}`)
  const iv = randomBytes(12)
  const cifra = createCipheriv("aes-256-gcm", k, iv)
  const texto = Buffer.concat([
    cifra.update(`${resposta}|${pedido ?? ""}|${componente ?? ""}|${chave}`, "utf8"),
    cifra.final(),
  ])
  return Buffer.concat([iv, texto, cifra.getAuthTag()]).toString("base64url")
}

/** O que o `t` leva, se é um link que esta loja fez; `null` pra qualquer outra coisa. */
export function resgateDoToken(t: unknown, k: Buffer = chaveDoLink()): LinkDoResgate | null {
  if (typeof t !== "string" || t.length < 40 || t.length > 500 || !/^[\w-]+$/.test(t)) return null
  const bytes = Buffer.from(t, "base64url")
  if (bytes.length < 12 + 16 + 5) return null
  try {
    const decifra = createDecipheriv("aes-256-gcm", k, bytes.subarray(0, 12))
    decifra.setAuthTag(bytes.subarray(bytes.length - 16))
    const texto = Buffer.concat([
      decifra.update(bytes.subarray(12, bytes.length - 16)),
      decifra.final(),
    ]).toString("utf8")
    const [resposta, pedido, componente, ...resto] = texto.split("|")
    const chave = resto.join("|")
    if (!RESPOSTAS_DO_RESGATE.includes(resposta as RespostaDoResgate)) return null
    if (pedido && !PEDIDO.test(pedido)) return null
    if (componente && !COMPONENTES.includes(componente as Componente)) return null
    if (!CHAVE.test(chave)) return null
    return {
      chave,
      pedido: pedido || null,
      componente: (componente || null) as Componente | null,
      resposta: resposta as RespostaDoResgate,
    }
  } catch {
    return null
  }
}

/** Os botões deste resgate, no endereço do Medusa (`MEDUSA_BACKEND_URL`): os 4 da pergunta e o "Sim". */
export function linksDoResgate(
  r: Pick<ResgateDaPessoa, "chave" | "pedido" | "componente">
): { botoes: BotoesDoResgate; sim: string } | null {
  const backend = (process.env.MEDUSA_BACKEND_URL ?? "").trim().replace(/\/+$/, "")
  if (!/^https?:\/\//.test(backend)) return null
  const k = chaveDoLink()
  const link = (resposta: RespostaDoResgate) =>
    `${backend}/crm/resgate?t=${tokenDoResgate({ ...r, resposta }, k)}`
  return {
    botoes: {
      caro: link("caro"),
      esqueci: link("esqueci"),
      resultado: link("resultado"),
      outro: link("outro"),
    },
    sim: link("sim"),
  }
}

/** O WhatsApp da loja com a mensagem do "Não vi resultado" pronta, ou `null` sem o número. */
export function whatsappDoResultado(
  whatsapp: string | null,
  acabou: { curto: string; artigo: "o" | "a" } | null
): string | null {
  const digitos = (whatsapp ?? "").replace(/\D/g, "")
  if (digitos.length < 10) return null
  const texto = acabou
    ? `Oi! Não vi resultado com ${acabou.artigo} ${acabou.curto} e queria uma ajuda.`
    : "Oi! Não vi resultado com os produtos e queria uma ajuda."
  return `https://wa.me/${digitos}?text=${encodeURIComponent(texto)}`
}

/** Se a pessoa deu sinal de vida depois de `desde` (qualquer uma das datas). */
export const deuSinalDepois = (sinais: readonly (Date | null)[], desde: Date) =>
  sinais.some((d) => d !== null && d.getTime() > desde.getTime())

/**
 * A PESSOA ESTÁ ADORMECIDA? Recebeu o "Quer continuar recebendo?" (`sunset`),
 * passaram os 7 dias do prazo, e nada depois dele: nem o "Sim", nem clique,
 * visita ou compra (a abertura não conta: abrir e não clicar no "Sim" é a
 * resposta).
 */
export function adormecido(
  e: { sunset: Date | null; sim: Date | null; sinais: readonly (Date | null)[] },
  agora: Date
): boolean {
  if (!e.sunset) return false
  if (agora.getTime() < e.sunset.getTime() + PRAZO_DO_SIM) return false
  return !deuSinalDepois([e.sim, ...e.sinais], e.sunset)
}

/** Quem está no resgate, com o que os e-mails e os botões usam. */
export type ResgateDaPessoa = {
  email: string
  /** A pessoa e o dia em que ficou em risco (`chaveDoResgate`): a chave da entrada. */
  chave: string
  /** O dia em que ficou em risco: o começo do resgate. */
  desde: Date
  /** A última compra paga (`order_…` ou `nso_…`): o "Refazer o pedido". */
  pedido: string | null
  /** O que acabou primeiro na última compra, pela conta dos dias; `null` sem a conta. */
  componente: Componente | null
  /** Os SKUs da última compra: o "de sempre" do e-mail do cupom. */
  skus: string[]
}

/**
 * QUEM ESTÁ NO RESGATE, agora: as pessoas em risco (as etiquetas, com os
 * Ajustes) há até o fim do fluxo — o toque de 45 dias e a folga —, que
 * aceitam oferta: compraram na loja nova, ou aceitaram ofertas na antiga.
 */
export async function publicoDoResgate(
  container: MedusaContainer,
  agora: Date = new Date()
): Promise<ResgateDaPessoa[]> {
  const crm = container.resolve<CrmService>(CRM)
  const [daLoja, daBase, lojas, aceitam] = await Promise.all([
    pedidosParaAsEtiquetas(container),
    crm.pedidosDaBase(),
    container.resolve(Modules.STORE).listStores({}, { select: ["metadata"], take: 1 }),
    crm.pessoasDaEstreia(),
  ])
  const { dias, regras } = lerAjustesGuardados(lojas[0]?.metadata)
  const porEmail = new Map<string, PedidoDaReposicao[]>()
  const compraramNaNova = new Set<string>()
  for (const o of daLoja) {
    const email = normalizarEmail(o.email)
    if (!email) continue
    juntar(porEmail, email, { ...pedidoDaPessoa(o), ref: o.id })
    compraramNaNova.add(email)
  }
  for (const p of daBase) if (p.id) juntar(porEmail, p.email, { ...pedidoDaBase(p), ref: p.id })
  const aceitaNaAntiga = new Set(aceitam.map((p) => p.email))
  const janela = diasDoFluxo("resgate") * DIA
  const semSinais = { ultimoClique: null, ultimaVisita: null, newsletterDesde: null }
  return [...porEmail].flatMap(([email, pedidos]): ResgateDaPessoa[] => {
    // O "|" separa a chave do resgate: e-mail com ele (raríssimo) fica de fora.
    if (email.includes("|")) return []
    if (!compraramNaNova.has(email) && !aceitaNaAntiga.has(email)) return []
    const { etapa } = etiquetasDaPessoa({ pedidos, sinais: semSinais, agora, dias, regras })
    const desde = etapa.desde
    if (!desde || agora.getTime() - desde.getTime() > janela) return []
    const ultimo = pedidos
      .filter((p) => p.pagoEm && !p.cancelado)
      .sort((a, b) => a.pagoEm!.getTime() - b.pagoEm!.getTime())
      .at(-1)
    const chegou = ultimo
      ? (ultimo.entregueEm ?? new Date(ultimo.pagoEm!.getTime() + ENTREGA_ESTIMADA_DIAS * DIA))
      : null
    const acaba = ultimo && chegou ? quandoAcaba(ultimo, chegou, dias) : null
    return [
      {
        email,
        chave: chaveDoResgate(email, desde),
        desde,
        pedido: ultimo && PEDIDO.test(ultimo.ref) ? ultimo.ref : null,
        componente: acaba?.componente ?? null,
        skus: [
          ...new Set(
            (ultimo?.itens ?? []).flatMap((i) =>
              i.sku?.trim() ? [i.sku.trim().toUpperCase()] : []
            )
          ),
        ],
      },
    ]
  })
}
