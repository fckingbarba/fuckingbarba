"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { gravarEntrando, lerEntrando, OPCOES_ENTRANDO, OPCOES_SESSAO } from "@/lib/entrando"
import {
  SEGUNDOS_ENTRE_ENVIOS,
  type EstadoCodigo,
  type EstadoEntrar,
  type Reenvio,
} from "@/lib/entrar-visivel"
import { medusa } from "@/lib/medusa"
import { COOKIE_ENTRANDO, COOKIE_SESSAO, lerToken } from "@/lib/sessao"

/**
 * AS AÇÕES DE ENTRAR NO PAINEL — pedir o código, conferir, reenviar.
 *
 * O caminho é o da conta do cliente na loja (`apps/loja/src/lib/acoes/conta.ts`),
 * com o provedor da equipe: `POST /dashboard/entrar/codigo` manda,
 * `POST /auth/equipe/codigo-equipe` confere, `POST /dashboard/vincular` liga
 * o membro (e anota a entrada) e o refresh devolve o token com ele dentro.
 *
 * O e-mail da tela do código vem do COOKIE, nunca de campo escondido.
 *
 * AS FRASES MORAM AQUI: o Medusa responde códigos (`codigo_errado`,
 * `espera`, `limite`, `fora_da_equipe`), e a voz é deste lado.
 */

const GENERICO = "Não consegui falar com a loja agora. Tenta de novo em instantes."
const SEM_EMAIL = "Não conseguimos mandar o e-mail agora. Tenta de novo em alguns minutos."
const LIMITE = "Muitos códigos pedidos pra esse e-mail. Espera um pouco e tenta de novo."
const PERDIDO = "O tempo pra digitar o código acabou. Volta e pede um novo."
const FORA = "Esse e-mail não tem acesso ao painel agora. Fale com o dono da loja."

const DO_CODIGO: Record<string, { erro: string; morto: boolean }> = {
  codigo_errado: { erro: "Código errado. Confere e tenta de novo.", morto: false },
  codigo_vencido: { erro: "Esse código venceu. Pede um novo aqui embaixo.", morto: true },
  codigo_esgotado: { erro: "Muitas tentativas. Pede um código novo aqui embaixo.", morto: true },
}

const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? "").trim()
const ehEmail = (v: string) => v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)

const pedirAoMedusa = (email: string) => medusa("/dashboard/entrar/codigo", { corpo: { email } })

/* ── 1. o e-mail ──────────────────────────────────────────────────────────── */

export async function pedirCodigo(anterior: EstadoEntrar, fd: FormData): Promise<EstadoEntrar> {
  const email = texto(fd, "email").toLowerCase()
  const erro = (mensagem: string): EstadoEntrar => ({
    erro: mensagem,
    email,
    rodada: anterior.rodada + 1,
  })

  if (!ehEmail(email)) return erro("Confere o e-mail.")

  const r = await pedirAoMedusa(email)
  const motivo = r.corpo.message

  // "espera" também vai pra tela do código: o de antes chegou e ainda vale.
  if (r.status === 200 || (r.status === 429 && motivo === "espera")) {
    const faltam = r.status === 429 ? Number(r.corpo.segundos) || 0 : SEGUNDOS_ENTRE_ENVIOS
    await gravarEntrando({ email, enviadoEm: Date.now() - (SEGUNDOS_ENTRE_ENVIOS - faltam) * 1000 })
    redirect("/entrar/codigo")
  }

  if (r.status === 400) return erro("Confere o e-mail.")
  if (r.status === 429) return erro(LIMITE)
  if (r.status === 503) return erro(SEM_EMAIL)
  return erro(GENERICO)
}

/* ── 2. o código ──────────────────────────────────────────────────────────── */

/**
 * Toda entrada passa pelo `vincular`, e não só a primeira: é ele que confere
 * se a pessoa ainda é da equipe (o dono pode ter tirado entre o código sair
 * e voltar) e anota a entrada no registro. O refresh depois devolve o token
 * com o membro dentro — na primeira vez, o do código ainda não tem.
 */
async function tokenDoMembro(token: string): Promise<{ token: string } | { erro: string }> {
  const ligou = await medusa("/dashboard/vincular", { token })
  if (ligou.status === 401) return { erro: FORA }
  if (ligou.status !== 200) return { erro: GENERICO }

  const novo = await medusa("/auth/token/refresh", { token })
  const final = typeof novo.corpo.token === "string" ? novo.corpo.token : ""
  return novo.status === 200 && lerToken(final)?.actor_id ? { token: final } : { erro: GENERICO }
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

  const r = await medusa("/auth/equipe/codigo-equipe", { corpo: { email: entrando.email, codigo } })
  if (r.status === 401) {
    const traduzido = DO_CODIGO[String(r.corpo.message ?? "")] ?? DO_CODIGO.codigo_errado
    return erro(traduzido.erro, { morto: traduzido.morto })
  }
  const token = typeof r.corpo.token === "string" ? r.corpo.token : ""
  if (r.status !== 200 || !token) return erro(GENERICO)

  const final = await tokenDoMembro(token)
  if ("erro" in final) return erro(final.erro, { morto: final.erro === FORA })

  const jar = await cookies()
  jar.set(COOKIE_SESSAO, final.token, OPCOES_SESSAO)
  jar.set(COOKIE_ENTRANDO, "", { ...OPCOES_ENTRANDO, maxAge: 0 })
  redirect("/")
}

/* ── o "reenviar" ─────────────────────────────────────────────────────────── */

export async function reenviarCodigo(): Promise<Reenvio> {
  const entrando = await lerEntrando()
  if (!entrando) return { ok: false, segundos: 0, erro: PERDIDO }

  const r = await pedirAoMedusa(entrando.email)
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
