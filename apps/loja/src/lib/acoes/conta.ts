"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { COOKIE_CARRINHO } from "@/lib/carrinho"
import {
  carrinhoEhDaConta,
  lerEntrando,
  medusa,
  OPCOES_ENTRANDO,
  OPCOES_SESSAO,
  pedirCodigoAoMedusa,
  type Entrando,
} from "@/lib/conta"
import {
  SEGUNDOS_ENTRE_ENVIOS,
  type EstadoCodigo,
  type EstadoEntrar,
  type Reenvio,
} from "@/lib/conta-visivel"
import { COOKIE_ENTRANDO, COOKIE_SESSAO, destinoSeguro, lerToken } from "@/lib/sessao"

/**
 * AS AÇÕES DE ENTRAR — pedir o código, conferir, reenviar e sair.
 *
 * Toda ação é um POST público (ver a caixa em `acoes/checkout.ts`), então o
 * e-mail da tela do código vem do COOKIE, nunca de campo escondido, e nada
 * aqui confia no que a tela diz além do que a pessoa digitou.
 *
 * AS FRASES MORAM AQUI. O Medusa responde códigos (`codigo_errado`,
 * `espera`, `limite`); a voz da loja é deste lado.
 */

const GENERICO = "Não consegui falar com a loja agora. Tenta de novo em instantes."
const SEM_EMAIL = "Não conseguimos mandar o e-mail agora. Tenta de novo em alguns minutos."
const LIMITE = "Muitos códigos pedidos pra esse e-mail. Espera um pouco e tenta de novo."
const PERDIDO = "O tempo pra digitar o código acabou. Volta e pede um novo."

const DO_CODIGO: Record<string, { erro: string; morto: boolean }> = {
  codigo_errado: { erro: "Código errado. Confere e tenta de novo.", morto: false },
  codigo_vencido: { erro: "Esse código venceu. Pede um novo aqui embaixo.", morto: true },
  codigo_esgotado: { erro: "Muitas tentativas. Pede um código novo aqui embaixo.", morto: true },
}

const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? "").trim()

/** Só a forma, como no checkout — a prova de que o e-mail existe é o código chegar. */
const ehEmail = (v: string) => v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)

async function gravarEntrando(dado: Entrando) {
  ;(await cookies()).set(COOKIE_ENTRANDO, JSON.stringify(dado), OPCOES_ENTRANDO)
}

/* ── 1. o e-mail ──────────────────────────────────────────────────────────── */

export async function pedirCodigo(anterior: EstadoEntrar, fd: FormData): Promise<EstadoEntrar> {
  const email = texto(fd, "email").toLowerCase()
  const para = destinoSeguro(texto(fd, "para"))
  const erro = (mensagem: string): EstadoEntrar => ({
    erro: mensagem,
    email,
    rodada: anterior.rodada + 1,
  })

  if (!ehEmail(email)) return erro("Confere o e-mail.")

  const r = await pedirCodigoAoMedusa(email)
  const motivo = r.corpo.message

  /*
    "espera" também leva pra tela do código: é quem voltou e pediu de novo em
    menos de 30 segundos. O código de antes chegou (ou está chegando) e
    continua valendo — mandar a pessoa ler "espera 20 segundos" aqui seria
    fazê-la esperar pra receber o que ela já tem.
  */
  if (r.status === 200 || (r.status === 429 && motivo === "espera")) {
    const faltam = r.status === 429 ? Number(r.corpo.segundos) || 0 : SEGUNDOS_ENTRE_ENVIOS
    await gravarEntrando({
      email,
      para,
      enviadoEm: Date.now() - (SEGUNDOS_ENTRE_ENVIOS - faltam) * 1000,
    })
    redirect("/conta/entrar/codigo")
  }

  if (r.status === 400) return erro("Confere o e-mail.")
  if (r.status === 429) return erro(LIMITE)
  if (r.status === 503) return erro(SEM_EMAIL)
  return erro(GENERICO)
}

/* ── 2. o código ──────────────────────────────────────────────────────────── */

/**
 * Da primeira vez, o token que o código rende ainda não tem cliente: ele
 * prova o e-mail e mais nada. `/store/conta/vincular` liga (ou cria) o
 * cliente, e o refresh devolve o token de cliente de verdade. Das outras
 * vezes o token já vem com o cliente, e nada disso roda.
 */
async function tokenDeCliente(token: string): Promise<string | null> {
  if (lerToken(token)?.actor_id) return token

  const ligou = await medusa("/store/conta/vincular", { token })
  if (ligou.status !== 200) {
    console.warn(`[conta] vincular respondeu ${ligou.status}: ${String(ligou.corpo.message ?? "")}`)
    return null
  }

  const novo = await medusa("/auth/token/refresh", { token })
  const final = typeof novo.corpo.token === "string" ? novo.corpo.token : ""
  return novo.status === 200 && lerToken(final)?.actor_id ? final : null
}

export async function confirmarCodigo(anterior: EstadoCodigo, fd: FormData): Promise<EstadoCodigo> {
  const erro = (mensagem: string, extra: Partial<EstadoCodigo> = {}): EstadoCodigo => ({
    erro: mensagem,
    morto: false,
    perdido: false,
    ...extra,
    rodada: anterior.rodada + 1,
  })

  const entrando = await lerEntrando()
  if (!entrando) return erro(PERDIDO, { perdido: true })

  const codigo = texto(fd, "codigo").replace(/\D+/g, "")
  if (codigo.length !== 6) return erro("O código tem 6 números.")

  const r = await medusa("/auth/customer/codigo", { corpo: { email: entrando.email, codigo } })
  if (r.status === 401) {
    const traduzido = DO_CODIGO[String(r.corpo.message ?? "")] ?? DO_CODIGO.codigo_errado
    return erro(traduzido.erro, { morto: traduzido.morto })
  }
  const token = typeof r.corpo.token === "string" ? r.corpo.token : ""
  if (r.status !== 200 || !token) return erro(GENERICO)

  const final = await tokenDeCliente(token)
  if (!final) return erro(GENERICO)

  const jar = await cookies()
  jar.set(COOKIE_SESSAO, final, OPCOES_SESSAO)
  jar.set(COOKIE_ENTRANDO, "", { ...OPCOES_ENTRANDO, maxAge: 0 })
  redirect(entrando.para)
}

/* ── o "reenviar" ─────────────────────────────────────────────────────────── */

export async function reenviarCodigo(): Promise<Reenvio> {
  const entrando = await lerEntrando()
  if (!entrando) return { ok: false, segundos: 0, erro: PERDIDO }

  const r = await pedirCodigoAoMedusa(entrando.email)
  if (r.status === 200) {
    await gravarEntrando({ ...entrando, enviadoEm: Date.now() })
    return { ok: true, segundos: SEGUNDOS_ENTRE_ENVIOS, erro: "" }
  }
  if (r.status === 429 && r.corpo.message === "espera") {
    return { ok: false, segundos: Number(r.corpo.segundos) || SEGUNDOS_ENTRE_ENVIOS, erro: "" }
  }
  if (r.status === 429) return { ok: false, segundos: 0, erro: LIMITE }
  if (r.status === 503) return { ok: false, segundos: 0, erro: SEM_EMAIL }
  return { ok: false, segundos: 0, erro: GENERICO }
}

/* ── sair ─────────────────────────────────────────────────────────────────── */

/**
 * O token continua válido no Medusa até vencer — é assim que JWT funciona —,
 * mas ele só existia neste cookie, que não é lido por ninguém além do
 * servidor da loja. Apagado o cookie, não sobra onde usar.
 *
 * A SACOLA DA CONTA VAI JUNTO: o checkout passa o carrinho pro nome da conta,
 * e quem usasse este navegador depois compraria nela (ver
 * `carrinhoEhDaConta`). Sacola que não é da conta fica.
 */
export async function sair() {
  const jar = await cookies()
  const token = jar.get(COOKIE_SESSAO)?.value
  const carrinho = jar.get(COOKIE_CARRINHO)?.value
  if (token && carrinho && (await carrinhoEhDaConta(carrinho, token))) {
    jar.delete(COOKIE_CARRINHO)
  }
  jar.set(COOKIE_SESSAO, "", { ...OPCOES_SESSAO, maxAge: 0 })
  redirect("/conta/entrar?saiu=1")
}
