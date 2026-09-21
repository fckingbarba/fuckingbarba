/**
 * MANDAR E-MAIL — pelo Resend.
 *
 * Direto pela API deles (`POST /emails`), sem SDK: é uma chamada só, e um
 * pacote a mais no backend seria mais uma coisa pra atualizar por uma
 * função de vinte linhas.
 *
 * ┌─ POR QUE NÃO O MÓDULO DE NOTIFICAÇÃO DO MEDUSA ────────────────────────┐
 * │ Ele grava cada envio no banco, com os dados do e-mail — e o primeiro   │
 * │ e-mail desta loja é um CÓDIGO DE ACESSO. Guardar o código em texto     │
 * │ puro numa tabela, mesmo vencido, é o tipo de coisa que ninguém lembra  │
 * │ que existe até o dia do vazamento. Os e-mails de pedido (fase 5) podem │
 * │ passar por ele; o código, não.                                         │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * SEM `RESEND_API_KEY`:
 *   - fora de produção, o e-mail vai pro LOG, com o código, e a função diz
 *     que mandou — é assim que se entra na conta no desenvolvimento;
 *   - em produção, não manda nada, avisa no log e diz que NÃO mandou. A
 *     loja mostra "não conseguimos mandar o código agora" em vez de fingir.
 *
 * `RESEND_URL` só existe no teste: o `conferir-conta.mjs` sobe um Resend
 * falso e lê o código de lá.
 */

export type Email = {
  para: string
  assunto: string
  html: string
  texto: string
}

export type Enviado = { ok: true; id?: string } | { ok: false; motivo: string }

type Registro = { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void }

const TEMPO_LIMITE_MS = 8000

/** "rafael.souza@email.com" → "r•••@email.com" — o log não precisa do e-mail inteiro de ninguém. */
export function emailNoLog(email: string): string {
  const [nome, dominio] = email.split("@")
  return `${(nome ?? "").slice(0, 1)}•••@${dominio ?? ""}`
}

export async function enviarEmail(email: Email, logger: Registro): Promise<Enviado> {
  const chave = process.env.RESEND_API_KEY
  const remetente = process.env.EMAIL_REMETENTE || "FuckingBarba <nao-responda@fuckingbarba.com.br>"
  const base = (process.env.RESEND_URL || "https://api.resend.com").replace(/\/+$/, "")

  if (!chave) {
    if (process.env.NODE_ENV === "production") {
      logger.error("[email] RESEND_API_KEY não configurada: nenhum e-mail sai (ver .env.example)")
      return { ok: false, motivo: "sem RESEND_API_KEY" }
    }
    logger.info(
      `[email] sem RESEND_API_KEY — o e-mail NÃO saiu, está aqui:\n` +
        `  para: ${email.para}\n  assunto: ${email.assunto}\n\n${email.texto}`
    )
    return { ok: true }
  }

  try {
    const resposta = await fetch(`${base}/emails`, {
      method: "POST",
      headers: { authorization: `Bearer ${chave}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: remetente,
        to: [email.para],
        subject: email.assunto,
        html: email.html,
        text: email.texto,
      }),
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    })
    if (!resposta.ok) {
      // O corpo do erro do Resend diz o porquê ("domínio não verificado",
      // "remetente inválido") — é a linha que resolve o problema no log.
      const corpo = await resposta.text().catch(() => "")
      logger.warn(
        `[email] o Resend recusou (${resposta.status}) o e-mail pra ${emailNoLog(email.para)}: ${corpo.slice(0, 300)}`
      )
      return { ok: false, motivo: `Resend ${resposta.status}` }
    }
    const { id } = (await resposta.json().catch(() => ({}))) as { id?: string }
    return { ok: true, id }
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e)
    logger.warn(`[email] não consegui falar com o Resend (${emailNoLog(email.para)}): ${motivo}`)
    return { ok: false, motivo }
  }
}
