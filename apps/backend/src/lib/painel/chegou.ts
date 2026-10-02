import type { EmailLidoDoBanco } from "./crm"

/**
 * O E-MAIL CHEGOU? — o que os avisos do Resend contaram (`crm_email`), em
 * frase pro dono. Mora aqui, sem depender de nada, porque são dois que
 * leem: o CRM ("Os e-mails da loja", `emFraseDoEmail`) e o histórico do
 * pedido (entrega 0248) — e o `crm.ts` já importa o `pedido.ts`.
 */

/** Por que não chegou, do jeito que o dono entende. */
export function porQueNaoChegou(e: EmailLidoDoBanco): string {
  if (e.suprimido_em || /suppress/i.test(e.devolucao ?? ""))
    return "o endereço está bloqueado no Resend (já voltou ou reclamou antes)"
  if (e.falhou_em && !e.devolvido_em) return "o Resend não conseguiu mandar"
  if (/^transient/i.test(e.devolucao ?? "")) return "a caixa recusou por agora"
  return "o endereço não aceita e-mail"
}

/**
 * Pro histórico do pedido: chegou, não chegou (e por quê), ou está
 * atrasando. Sem aviso nenhum ainda (o Resend leva uns segundos, e os
 * e-mails de antes da 0138 nunca tiveram), `null`: a linha fica só com o
 * "enviado". A abertura não entra: o rastreio dela está desligado.
 */
export function comoChegou(
  e: EmailLidoDoBanco | undefined
): { texto: string; ruim: boolean } | null {
  if (!e) return null
  if (e.reclamou_em) return { texto: "chegou, e o cliente marcou como spam", ruim: true }
  if (e.devolvido_em ?? e.falhou_em ?? e.suprimido_em)
    return { texto: `não chegou · ${porQueNaoChegou(e)}`, ruim: true }
  if (e.entregue_em ?? e.aberto_em ?? e.clicado_em)
    return { texto: "chegou na caixa do cliente", ruim: false }
  if (e.atrasado_em) return { texto: "está atrasando", ruim: false }
  return null
}
