import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { criarLimite, criarTetoDoDia } from "../../../lib/limite"
import { dominioDe, lerEventos } from "../../../lib/observabilidade/telemetria"
import { daLoja, quemPede } from "../../../lib/quem-pede"
import { OBSERVABILIDADE } from "../../../modules/observabilidade"
import type ObservabilidadeService from "../../../modules/observabilidade/service"

/**
 * POST /store/telemetria — `{ eventos: [...] }`: o que o navegador de quem
 * visita a loja mediu e viu — a velocidade (LCP, INP, CLS), a página que
 * não existe e o erro na tela. Vai pra tela de Observabilidade do painel.
 *
 * Quem chama é o servidor da loja (`apps/loja/src/app/api/telemetria`), que
 * recebe o recado do navegador e assina (`x-loja-segredo`, com o IP de quem
 * visitou em `x-cliente-ip`). O navegador nunca fala direto com o Medusa.
 *
 * NADA AQUI É DE CONFIANÇA: a rota da loja é pública. Cada evento é
 * conferido e limpo (`lerEventos`), e cada visitante manda no máximo 60
 * recados por minuto — a loja inteira, 3.000. Passou disso, 429 e nada
 * gravado. Falhar ao gravar não é problema de quem visitou: responde 204 do
 * mesmo jeito, e o log conta.
 *
 * RESPOSTAS: 204; 401 sem assinatura; 429 `limite`.
 */

const POR_VISITANTE = { limite: 60, ms: 60_000 }
const DA_LOJA = { limite: 3000, ms: 60_000 }
const limite = criarLimite()

/*
  O TETO DO DIA (auditoria de 27/09): os limites por minuto contam recados,
  não o que eles gravam. Por dia, 10.000 eventos por rede (`quemPede`, o IPv6
  por /64) e 150.000 pra loja toda — a Observabilidade não enche o banco, e
  quem manda lixo em volume não empurra os erros de verdade pra fora da tela.
*/
const EVENTOS_POR_REDE_NO_DIA = 10_000
const EVENTOS_DA_LOJA_NO_DIA = 150_000
const teto = criarTetoDoDia()

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  if (!daLoja(req)) {
    res.status(401).json({ message: "sem_assinatura" })
    return
  }
  const { chave } = quemPede(req)
  if (!limite.cabe(chave, POR_VISITANTE) || !limite.cabe("loja", DA_LOJA)) {
    res.status(429).json({ message: "limite" })
    return
  }
  limite.contar(chave, POR_VISITANTE)
  limite.contar("loja", DA_LOJA)

  const eventos = lerEventos(req.body, dominioDe(process.env.LOJA_URL))
  if (
    eventos.length &&
    (!teto.cabe(chave, EVENTOS_POR_REDE_NO_DIA, eventos.length) ||
      !teto.cabe("loja", EVENTOS_DA_LOJA_NO_DIA, eventos.length))
  ) {
    res.status(429).json({ message: "limite" })
    return
  }
  teto.somar(chave, eventos.length)
  teto.somar("loja", eventos.length)
  if (eventos.length) {
    await req.scope
      .resolve<ObservabilidadeService>(OBSERVABILIDADE)
      .anotarTelemetria(eventos)
      .catch((e) =>
        req.scope
          .resolve(ContainerRegistrationKeys.LOGGER)
          .warn(
            `[telemetria] não gravei ${eventos.length} eventos: ${e instanceof Error ? e.message : e}`
          )
      )
  }
  res.status(204).send()
}
