import { sinal } from "./sinal"

/**
 * O VIGIA DE FORA — quem avisa quando o próprio vigia cai.
 *
 * A Observabilidade mora dentro do Medusa: se o serviço cai no Railway (ou
 * fica de pé mas sem rodar as rotinas), nenhum e-mail sai e o painel não
 * abre — ninguém fica sabendo até um cliente reclamar. Por isso, um serviço
 * de fora (o UptimeRobot, na conta do dono) espera um "estou viva" da loja: o
 * job `vigiar-a-loja`, de 5 em 5 minutos, chama o endereço dele DEPOIS de a
 * rodada dar certo (a loja conferida, os problemas em dia). Se o recado para
 * de chegar — o Medusa caiu, as rotinas travaram, o banco não responde —, o
 * UptimeRobot avisa no celular e por e-mail.
 *
 * O endereço mora no Railway (`VIGIA_DE_FORA_URL`) e NUNCA vai pro log nem
 * pro banco: quem tem ele consegue fingir que a loja está viva. Sem ele, nada
 * sai, e a Observabilidade mostra o vigia de fora desligado.
 */

/** O endereço do "estou viva", ou `null` sem a variável (ou com um valor que não é endereço). */
export function enderecoDoVigiaDeFora(valor = process.env.VIGIA_DE_FORA_URL): string | null {
  const url = (valor ?? "").trim()
  return /^https?:\/\/[^\s]+$/.test(url) ? url : null
}

export type RecadoDoVigia = "sem-endereco" | "ok" | "falhou"

/**
 * Manda o "estou viva". Nunca lança: o recado que não chegou vira o sinal do
 * dia (a linha "Vigia de fora" das integrações), e a rodada segue.
 */
export async function avisarOVigiaDeFora(
  url = enderecoDoVigiaDeFora(),
  buscar: typeof fetch = fetch
): Promise<RecadoDoVigia> {
  if (!url) return "sem-endereco"
  try {
    const r = await buscar(url, { method: "GET", signal: AbortSignal.timeout(10_000) })
    await r.body?.cancel().catch(() => undefined)
    if (r.ok) {
      sinal({ integracao: "vigia-de-fora", ok: true })
      return "ok"
    }
    sinal({
      integracao: "vigia-de-fora",
      ok: false,
      resumo: `o vigia de fora respondeu ${r.status}`,
      detalhe: `[vigia] o "estou viva" respondeu ${r.status}`,
    })
  } catch (e) {
    const tempo = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")
    sinal({
      integracao: "vigia-de-fora",
      ok: false,
      resumo: tempo
        ? "o vigia de fora não respondeu em 10 segundos"
        : "o vigia de fora não atendeu",
      detalhe: `[vigia] o "estou viva" não chegou: ${tempo ? "tempo esgotado" : "sem resposta"}`,
    })
  }
  return "falhou"
}
