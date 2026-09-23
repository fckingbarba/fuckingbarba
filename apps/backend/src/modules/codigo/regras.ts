import { createHmac, randomInt, timingSafeEqual } from "node:crypto"

/**
 * O CÓDIGO DE ACESSO — as regras, num arquivo só.
 *
 * Duas pontas usam isto: a rota que MANDA o código
 * (`api/store/conta/codigo/route.ts`) e o provedor de auth que CONFERE
 * (`service.ts`, ao lado). Se cada uma tivesse o próprio "10 minutos" ou o
 * próprio jeito de calcular o hash, um dia elas discordariam — e o código
 * que acabou de chegar no e-mail seria recusado como errado. A troca de
 * e-mail da conta (`api/store/conta/email/`) usa as mesmas regras, com o
 * contexto dela (a seção do fim).
 *
 * Sem nada do Medusa aqui dentro: são contas e datas. É o que deixa o
 * `regras.unit.spec.ts` testar cada fronteira sem subir servidor.
 *
 * ┌─ POR QUE ESTES NÚMEROS ────────────────────────────────────────────────┐
 * │ Seis dígitos são um milhão de combinações. Com 5 tentativas por código │
 * │ e no máximo 10 códigos por dia pro mesmo e-mail, quem tenta adivinhar  │
 * │ acerta uma vez em 20 mil dias — e manda dez e-mails por dia pro dono   │
 * │ da conta no processo, que é quem mais rápido percebe a tentativa.      │
 * │                                                                        │
 * │ 10 minutos de validade é o que cabe entre "pedi o código" e "achei o   │
 * │ e-mail no spam". 30 segundos entre um envio e outro segura o dedo      │
 * │ nervoso no "reenviar" sem fazer ninguém esperar de verdade.            │
 * └────────────────────────────────────────────────────────────────────────┘
 */

export const MINUTOS_DE_VALIDADE = 10
export const TENTATIVAS = 5
export const SEGUNDOS_ENTRE_ENVIOS = 30
export const ENVIOS_POR_HORA = 5
export const ENVIOS_POR_DIA = 10

const HORA = 60 * 60 * 1000
const DIA = 24 * HORA

/** O código esperando confirmação. Só o hash — o código em si não fica em lugar nenhum. */
export type Pendente = {
  hash: string
  expira_em: string
  tentativas: number
}

/**
 * A troca de e-mail esperando o código que foi pro endereço NOVO — ver
 * `api/store/conta/email/`. O `email` é o novo; o de agora é o `entity_id`
 * da própria identidade, e continua valendo até o código voltar certo.
 */
export type TrocaPendente = {
  email: string
  codigo: Pendente
}

/**
 * O que mora no `provider_metadata` da identidade `codigo` (tabela
 * `provider_identity`, do módulo de auth do Medusa). `envios` são as horas
 * dos códigos mandados nas últimas 24 horas, e é deles que saem os limites.
 *
 * `troca` e `envios_troca` são a mesma coisa pra trocar o e-mail da conta,
 * contados à parte: um não gasta o limite do outro. Toda escrita aqui
 * espalha o que já existia (`...meta`) — quem mexe no código de entrar não
 * apaga a troca pendente, e vice-versa.
 */
export type MetadadosDoCodigo = {
  codigo?: Pendente | null
  envios?: string[]
  ultimo_acesso?: string
  troca?: TrocaPendente | null
  envios_troca?: string[]
}

/**
 * E-mail em minúscula e sem espaço, ou null.
 *
 * Minúscula porque é assim que o Medusa grava o e-mail do cliente e do
 * pedido (`validateEmail`), e é assim que o checkout manda. "Rafael@X.com" e
 * "rafael@x.com" virando duas contas seria o cliente entrando e achando a
 * conta vazia.
 *
 * Só a forma, como no checkout: regra esperta demais recusa e-mail que
 * existe, e e-mail que não existe se descobre sozinho — o código não chega.
 */
export function normalizarEmail(valor: unknown): string | null {
  if (typeof valor !== "string") return null
  const email = valor.trim().toLowerCase()
  if (email.length > 254) return null
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null
}

/** Seis dígitos, zero à esquerda incluído. `randomInt` é o sorteio do crypto, não o `Math.random`. */
export function gerarCodigo(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0")
}

/** O contexto do código de ENTRAR. O da troca de e-mail é `contextoDaTroca`, lá embaixo. */
const ENTRAR = "codigo-de-acesso"

/**
 * HMAC, e não um hash puro. Com um milhão de códigos possíveis, o hash
 * simples se desfaz em milissegundos por quem tiver o banco na mão; com a
 * chave, precisa ter também o segredo do servidor. A chave é o JWT_SECRET,
 * com o mesmo recuo do Medusa quando ele falta (só acontece fora de
 * produção — lá o Medusa não sobe sem ele).
 *
 * O e-mail entra na conta: o mesmo código mandado pra duas pessoas não gera
 * o mesmo hash. O `contexto` separa os usos — o código de entrar e o de
 * trocar o e-mail nunca conferem um no lugar do outro.
 */
export function hashDoCodigo(email: string, codigo: string, contexto = ENTRAR): string {
  const chave = process.env.JWT_SECRET || "supersecret"
  return createHmac("sha256", chave).update(`${contexto}:${email}:${codigo}`).digest("hex")
}

export function novoPendente(
  email: string,
  codigo: string,
  agora = Date.now(),
  contexto = ENTRAR
): Pendente {
  return {
    hash: hashDoCodigo(email, codigo, contexto),
    expira_em: new Date(agora + MINUTOS_DE_VALIDADE * 60 * 1000).toISOString(),
    tentativas: 0,
  }
}

export type Veredito = "certo" | "errado" | "vencido" | "esgotado" | "sem_codigo"

/**
 * Confere um código contra o que está esperando.
 *
 * A ORDEM IMPORTA. Esgotado vem antes de tudo: depois da quinta tentativa
 * errada, nem o código certo entra — senão a sexta tentativa seria só mais
 * uma chance. Vencido vem antes da comparação pelo mesmo motivo.
 *
 * `timingSafeEqual` pra comparar: comparar texto com `===` para no primeiro
 * caractere diferente, e o tempo de resposta passa a contar quantos acertaram.
 */
export function conferir(
  pendente: Pendente | null | undefined,
  email: string,
  codigo: string,
  agora = Date.now(),
  contexto = ENTRAR
): Veredito {
  if (!pendente?.hash) return "sem_codigo"
  if ((pendente.tentativas ?? 0) >= TENTATIVAS) return "esgotado"
  const expira = Date.parse(pendente.expira_em)
  if (!Number.isFinite(expira) || expira <= agora) return "vencido"
  const esperado = Buffer.from(pendente.hash, "hex")
  const recebido = Buffer.from(hashDoCodigo(email, codigo, contexto), "hex")
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido)
    ? "certo"
    : "errado"
}

/** Só as horas das últimas 24 horas, e só as que são data de verdade. */
function recentes(envios: string[] | undefined, agora: number): number[] {
  return (Array.isArray(envios) ? envios : [])
    .map((e) => Date.parse(e))
    .filter((t) => Number.isFinite(t) && t <= agora && agora - t < DIA)
}

export type PodeEnviar =
  { ok: true } | { ok: false; motivo: "espera"; segundos: number } | { ok: false; motivo: "limite" }

/** Tem código esperando que ainda serve? (Nem usado, nem vencido, nem esgotado.) */
export function codigoVivo(pendente: Pendente | null | undefined, agora = Date.now()): boolean {
  if (!pendente?.hash || (pendente.tentativas ?? 0) >= TENTATIVAS) return false
  const expira = Date.parse(pendente.expira_em)
  return Number.isFinite(expira) && expira > agora
}

/**
 * Pode mandar mais um código pra este e-mail agora?
 *
 * "espera" é pedir de novo antes dos 30 segundos COM UM CÓDIGO VIVO na
 * caixa: a loja leva a pessoa pra tela do código, que já foi mandado. Sem
 * código vivo — ele já foi usado pra entrar, venceu ou esgotou as
 * tentativas —, esperar não serviria pra nada: não há o que digitar. Aí vale
 * só o limite por hora e por dia. (Foi o conferidor da conta que achou: quem
 * saía e entrava de novo em menos de 30 segundos caía na tela de um código
 * que já não existia.)
 */
export function podeEnviar(meta: MetadadosDoCodigo | undefined, agora = Date.now()): PodeEnviar {
  const horas = recentes(meta?.envios, agora)
  if (codigoVivo(meta?.codigo, agora)) {
    const ultimo = horas.length ? Math.max(...horas) : 0
    const passados = (agora - ultimo) / 1000
    if (ultimo && passados < SEGUNDOS_ENTRE_ENVIOS) {
      return { ok: false, motivo: "espera", segundos: Math.ceil(SEGUNDOS_ENTRE_ENVIOS - passados) }
    }
  }
  if (horas.filter((t) => agora - t < HORA).length >= ENVIOS_POR_HORA) {
    return { ok: false, motivo: "limite" }
  }
  if (horas.length >= ENVIOS_POR_DIA) return { ok: false, motivo: "limite" }
  return { ok: true }
}

/** A lista de envios com este a mais — e sem o que passou de 24 horas, pra não crescer pra sempre. */
export function registrarEnvio(envios: string[] | undefined, agora = Date.now()): string[] {
  return [...recentes(envios, agora), agora].map((t) => new Date(t).toISOString())
}

/* ── a troca de e-mail ────────────────────────────────────────────────────── */

/**
 * O contexto do código da troca: leva a CONTA junto (o id da identidade de
 * auth). O código que foi pro e-mail novo só confirma a troca da conta que
 * pediu — e nunca abre a conta de ninguém como código de entrar.
 */
export function contextoDaTroca(identidade: string): string {
  return `troca-de-email:${identidade}`
}

/**
 * Pode mandar mais um código de troca agora? As regras do código de entrar,
 * com os envios da troca: 5 por hora e 10 por dia por CONTA, venham pra que
 * e-mail vierem — sem isso, uma conta viraria um jeito de mandar e-mail pra
 * caixa de qualquer um.
 *
 * A espera dos 30 segundos só vale pro MESMO e-mail com código vivo: quem
 * errou a digitação e corrigiu na hora pede pro endereço certo sem esperar,
 * e o código do errado morre (só existe uma troca pendente por conta).
 */
export function podeEnviarTroca(
  meta: MetadadosDoCodigo | undefined,
  email: string,
  agora = Date.now()
): PodeEnviar {
  const mesma = meta?.troca?.email === email ? meta.troca.codigo : null
  return podeEnviar({ codigo: mesma, envios: meta?.envios_troca }, agora)
}
