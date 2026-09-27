/**
 * A FAIXA DE COOKIES JÁ RESPONDIDA — pros conferidores que não são dela.
 *
 * Desde a entrega 0130 a faixa aparece pra todo mundo (a própria loja
 * pergunta, pro CRM), no pé da tela, por cima do que estiver lá — e o clique
 * do conferidor no botão de baixo caía nela. Aqui, todo contexto novo do
 * navegador nasce como quem já respondeu "Só o necessário": nada de medição
 * nem de CRM, a loja do jeito que era antes da faixa aparecer sempre. Quem
 * confere a faixa são o `conferir-integracoes` e o `conferir-crm` do painel.
 *
 * A versão da resposta é lida do código da loja (`VERSAO_DO_CONSENTIMENTO`):
 * a versão que sobe não deixa a faixa voltar pra cima dos botões.
 */

import { readFileSync } from "node:fs"

const VERSAO = readFileSync(new URL("../src/lib/consentimento.ts", import.meta.url), "utf8").match(
  /VERSAO_DO_CONSENTIMENTO = (\d+)/
)?.[1]
if (!VERSAO) throw new Error("faixa-respondida: não achei a VERSAO_DO_CONSENTIMENTO da loja")

/** O cookie de quem clicou em "Só o necessário", na versão de agora. */
export const JA_RESPONDEU = { name: "fb_consentimento", value: `nao.${VERSAO}.` }

/** Todo contexto (e toda página solta) deste navegador já nasce com a faixa respondida. */
export function comAFaixaRespondida(navegador, loja) {
  const criarContexto = navegador.newContext.bind(navegador)
  navegador.newContext = async (opcoes) => {
    const contexto = await criarContexto(opcoes)
    await contexto.addCookies([{ ...JA_RESPONDEU, url: loja }])
    return contexto
  }
  navegador.newPage = async (opcoes) => {
    const contexto = await navegador.newContext(opcoes)
    const pagina = await contexto.newPage()
    pagina.once("close", () => contexto.close().catch(() => undefined))
    return pagina
  }
  return navegador
}
