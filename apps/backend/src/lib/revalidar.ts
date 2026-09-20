/**
 * AVISAR A LOJA QUE UM DADO MUDOU.
 *
 * A loja em Next guarda o que vem do Medusa em cache com etiqueta (`"use
 * cache"` + `cacheTag`), e já expõe `POST /api/revalidar` pra derrubar uma
 * etiqueta. Até agora ninguém chamava — o que significava que mudar uma
 * configuração no admin só aparecia na loja quando o cache vencesse sozinho,
 * horas depois. Pra número que a loja ANUNCIA, "horas depois" é tempo demais:
 * é a janela em que a vitrine promete uma coisa e o carrinho cobra outra.
 *
 * NÃO FALHA A OPERAÇÃO QUE A CHAMOU. Se a loja estiver fora do ar, se o
 * segredo não bater ou se as variáveis não estiverem configuradas (o caso do
 * ambiente local), a configuração JÁ FOI SALVA — o que se perde é só o aviso.
 * Derrubar o salvamento porque o site não atendeu seria trocar um problema
 * pequeno e temporário por um grande e imediato.
 */

const TEMPO_LIMITE_MS = 4000

export async function avisarALoja(
  tags: string[],
  logger?: { warn: (m: string) => void },
  /**
   * `"seconds"` pra configuração: quem salvou vai abrir o site pra conferir,
   * e o padrão `"max"` serviria o valor antigo por mais uma visita — o
   * suficiente pra pessoa achar que não salvou, e pra loja anunciar por mais
   * um tempo um piso que o carrinho não pratica mais.
   */
  perfil: "seconds" | "max" = "max"
) {
  const url = process.env.LOJA_URL
  const segredo = process.env.REVALIDAR_SEGREDO
  if (!url || !segredo || !tags.length) return { avisou: false, motivo: "não configurado" }

  try {
    const resposta = await fetch(new URL("/api/revalidar", url), {
      method: "POST",
      headers: { "content-type": "application/json", "x-revalidar-segredo": segredo },
      body: JSON.stringify({ tags, perfil }),
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    })
    if (!resposta.ok) {
      // Não lança: aqui "a loja não atendeu" é um resultado esperado, não uma
      // exceção. Lançar pra capturar duas linhas abaixo esconde a diferença
      // entre falha de rede e resposta ruim, que são coisas diferentes na
      // hora de investigar.
      const motivo = `loja respondeu ${resposta.status}`
      logger?.warn(`[revalidar] não consegui avisar a loja (${tags.join(", ")}): ${motivo}`)
      return { avisou: false, motivo }
    }
    return { avisou: true }
  } catch (e) {
    const motivo = e instanceof Error ? e.message : String(e)
    logger?.warn(`[revalidar] não consegui avisar a loja (${tags.join(", ")}): ${motivo}`)
    return { avisou: false, motivo }
  }
}
