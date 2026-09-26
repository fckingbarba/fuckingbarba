import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../lib/equipe/acesso"
import { avisarNoLog, configuracaoDoGa4, ErroDoGa4, respostasDoDia } from "../../../lib/painel/ga4"
import { nomesDosProdutos } from "../../../lib/painel/ler"
import {
  handlesDe,
  montarVisitas,
  soONumero,
  veOBlocoDasVisitas,
} from "../../../lib/painel/visitas"

/** O motivo de verdade vai pro log, no máximo uma linha por hora por motivo. */
const avisar = (req: AuthenticatedMedusaRequest, tipo: string, mensagem: string) =>
  avisarNoLog(req.scope, "as visitas", tipo, mensagem)

/**
 * GET /dashboard/visitas — as visitas do dia, do Google Analytics, pro
 * Início. Todo papel: o dono e o marketing recebem o bloco inteiro (hora a
 * hora, quem está no site agora, de onde vieram, os produtos mais vistos);
 * a operação, só o número (o protótipo: "o dia da operação e o número de
 * visitas") — o resto nem sai daqui.
 *
 * À parte do `/dashboard/inicio` de propósito: o Google pode demorar, e o
 * Início não espera por ele (o painel pede os dois juntos e mostra as
 * visitas quando chegam).
 *
 * RESPOSTAS, sempre 200:
 *   `{ estado: "ok", visitas }`;
 *   `{ estado: "desligado" }` — sem `GA4_PROPERTY_ID` e `GA4_CREDENCIAIS`;
 *   `{ estado: "invalida" }` — uma das duas falta ou não se lê;
 *   `{ estado: "recusado" }` — o Google disse não (a chave, a API, o acesso);
 *   `{ estado: "fora" }` — o Google não respondeu agora.
 * O motivo de verdade vai pro log (`[ga4]`), no máximo um por hora.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "inicio")) return

  const cfg = configuracaoDoGa4()
  if (cfg === "desligado") {
    res.json({ estado: "desligado" })
    return
  }
  if (cfg === "invalida") {
    avisar(
      req,
      "invalida",
      "GA4_PROPERTY_ID ou GA4_CREDENCIAIS falta ou não se lê (ver .env.example)"
    )
    res.json({ estado: "invalida" })
    return
  }
  try {
    const agora = new Date()
    const respostas = await respostasDoDia(cfg, agora)
    const nomes = await nomesDosProdutos(req.scope, handlesDe(respostas.paginas))
    const visitas = montarVisitas(respostas, { agora, nomes })
    res.json({
      estado: "ok",
      visitas: veOBlocoDasVisitas(pedido.membro.papel) ? visitas : soONumero(visitas),
    })
  } catch (e) {
    const tipo = e instanceof ErroDoGa4 ? e.tipo : "fora"
    avisar(req, tipo, e instanceof Error ? e.message : String(e))
    res.json({ estado: tipo })
  }
}
