"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"
import { cabecalhosDeQuemPede, lerSessao, medusa } from "@/lib/conta"
import {
  SEGUNDOS_ENTRE_ENVIOS,
  type ConfirmacaoDaTroca,
  type EnvioDaTroca,
  type Reenvio,
} from "@/lib/conta-visivel"

/**
 * TROCAR O E-MAIL DA CONTA — pedir o código pro endereço novo, reenviar e
 * confirmar. Quem troca é o backend (`api/store/conta/email/`, com o porquê
 * de cada regra); aqui ficam o token e as frases.
 *
 * Chamadas direto pelo `TrocaDeEmail` (`components/conta/troca-de-email.tsx`),
 * sem `<form>`: os campos da troca moram DENTRO do formulário de "Meus
 * dados", e formulário dentro de formulário não existe. Como toda ação, é
 * um POST público — o que vem da tela é só o que a pessoa digitou, e a conta
 * sai do cookie.
 *
 * O e-mail novo não viaja na confirmação: o backend guardou com o código, e
 * é pra ele que a troca vai, digite a tela o que digitar.
 */

const GENERICO = "Não consegui falar com a loja agora. Tenta de novo em instantes."
const SEM_EMAIL = "Não conseguimos mandar o e-mail agora. Tenta de novo em alguns minutos."
const LIMITE = "Muitos códigos pedidos. Espera um pouco e tenta de novo."
const EM_USO = "Esse e-mail já é de outra conta da loja. Pra usar ele, sai desta e entra com ele."

const DO_CODIGO: Record<string, { erro: string; morto: boolean }> = {
  codigo_errado: { erro: "Código errado. Confere e tenta de novo.", morto: false },
  codigo_vencido: { erro: "Esse código venceu. Pede um novo aqui embaixo.", morto: true },
  codigo_esgotado: { erro: "Muitas tentativas. Pede um código novo aqui embaixo.", morto: true },
  sem_troca: { erro: "Esse código não vale mais. Pede um novo aqui embaixo.", morto: true },
}

/** Só a forma, como no entrar — a prova de que o e-mail existe é o código chegar. */
const ehEmail = (v: string) => v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)

async function token(): Promise<string> {
  const sessao = await lerSessao()
  if (!sessao) redirect("/conta/entrar?para=%2Fconta%2Fdados")
  return sessao
}

async function pedir(email: string) {
  const r = await medusa("/store/conta/email/codigo", {
    corpo: { email },
    token: await token(),
    extras: await cabecalhosDeQuemPede(),
  })
  if (r.status === 401) redirect("/conta/sair?motivo=expirou")
  return r
}

/* ── 1. o e-mail novo ─────────────────────────────────────────────────────── */

export async function pedirCodigoDaTroca(digitado: string): Promise<EnvioDaTroca> {
  const email = String(digitado ?? "")
    .trim()
    .toLowerCase()
  const erro = (mensagem: string): EnvioDaTroca => ({
    ok: false,
    email,
    segundos: 0,
    erro: mensagem,
  })
  if (!ehEmail(email)) return erro("Confere o e-mail.")

  const r = await pedir(email)
  const motivo = String(r.corpo.message ?? "")

  if (r.status === 200) return { ok: true, email, segundos: SEGUNDOS_ENTRE_ENVIOS, erro: "" }
  // "espera" é quem pediu pro mesmo e-mail há menos de 30 segundos: o código
  // de antes está chegando e vale — é pra digitar ele, não pra esperar outro.
  if (r.status === 429 && motivo === "espera") {
    return {
      ok: true,
      email,
      segundos: Number(r.corpo.segundos) || SEGUNDOS_ENTRE_ENVIOS,
      erro: "",
    }
  }
  if (r.status === 400 && motivo === "mesmo_email") return erro("Esse já é o e-mail da conta.")
  if (r.status === 400) return erro("Confere o e-mail.")
  if (r.status === 429) return erro(LIMITE)
  if (r.status === 503) return erro(SEM_EMAIL)
  return erro(GENERICO)
}

/* ── o "reenviar" ─────────────────────────────────────────────────────────── */

export async function reenviarCodigoDaTroca(email: string): Promise<Reenvio> {
  const r = await pedir(String(email ?? ""))
  if (r.status === 200) return { ok: true, segundos: SEGUNDOS_ENTRE_ENVIOS, erro: "" }
  if (r.status === 429 && r.corpo.message === "espera") {
    return { ok: false, segundos: Number(r.corpo.segundos) || SEGUNDOS_ENTRE_ENVIOS, erro: "" }
  }
  if (r.status === 429) return { ok: false, segundos: 0, erro: LIMITE }
  if (r.status === 503) return { ok: false, segundos: 0, erro: SEM_EMAIL }
  return { ok: false, segundos: 0, erro: GENERICO }
}

/* ── 2. o código ──────────────────────────────────────────────────────────── */

export async function confirmarTrocaDeEmail(digitado: string): Promise<ConfirmacaoDaTroca> {
  const falhou = (erro: string, extra: Partial<ConfirmacaoDaTroca> = {}): ConfirmacaoDaTroca => ({
    ok: false,
    email: "",
    erro,
    morto: false,
    emUso: false,
    ...extra,
  })

  const codigo = String(digitado ?? "").replace(/\D+/g, "")
  if (codigo.length !== 6) return falhou("O código tem 6 números.")

  const r = await medusa("/store/conta/email", { corpo: { codigo }, token: await token() })
  if (r.status === 401) redirect("/conta/sair?motivo=expirou")

  const email = typeof r.corpo.email === "string" ? r.corpo.email : ""
  if (r.status === 200 && email) {
    // A página inteira passa a mostrar o e-mail novo — o menu e a visão geral também.
    refresh()
    return { ok: true, email, erro: "", morto: false, emUso: false }
  }
  if (r.status === 409) return falhou(EM_USO, { emUso: true })
  const traduzido = r.status === 400 ? DO_CODIGO[String(r.corpo.message ?? "")] : undefined
  return traduzido ? falhou(traduzido.erro, { morto: traduzido.morto }) : falhou(GENERICO)
}
