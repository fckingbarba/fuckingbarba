import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { MedusaContainer } from "@medusajs/framework/types"
import { abre, exigirArea, type PedidoDaEquipe } from "../../../lib/equipe/acesso"
import {
  agoraNoSite,
  avisarNoLog,
  configuracaoDoGa4,
  ErroDoGa4,
  relatoriosDoMarketing,
  respostasDoDia,
  type ConfiguracaoDoGa4,
} from "../../../lib/painel/ga4"
import { enderecosDasCategorias, nomesDosProdutos, pagosDesde } from "../../../lib/painel/ler"
import { dentro, hostsDaLoja, type Janela } from "../../../lib/painel/marketing"
import { pagamentoDo } from "../../../lib/painel/pedido"
import {
  janelasNoCorte,
  lerDesde,
  lerPeriodo,
  pediuPeriodo,
  type BuscaDoPeriodo,
  type Periodo,
} from "../../../lib/painel/periodo"
import {
  corteDoGoogle,
  montarVisitasNoPeriodo,
  perguntasDoPeriodo,
  type VisitasNoPeriodo,
} from "../../../lib/painel/visitas-do-periodo"
import { handlesDe, montarVisitas, soONumero } from "../../../lib/painel/visitas"
import { CRM } from "../../../modules/crm"
import type CrmService from "../../../modules/crm/service"

/** O motivo de verdade vai pro log, no máximo uma linha por hora por motivo. */
const avisar = (req: AuthenticatedMedusaRequest, tipo: string, mensagem: string) =>
  avisarNoLog(req.scope, "as visitas", tipo, mensagem)

/**
 * GET /dashboard/visitas — as visitas do dia, do Google Analytics, pro
 * Início. Todo papel: quem abre o Marketing (no padrão, o dono e o
 * marketing) recebe o bloco inteiro (hora a hora, quem está no site agora,
 * de onde vieram, os produtos mais vistos); os outros, só o número (o
 * protótipo: "o dia da operação e o número de visitas") — o resto nem sai
 * daqui.
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
 *
 * O PERÍODO (0186): com `?periodo=` (ou `?de=` e `?ate=`, e `?comparar=`), a
 * resposta ok é `{ estado: "ok", periodo }` — as visitas do período da barra
 * de cima (`lib/painel/visitas-do-periodo.ts`): o número e o gráfico pra
 * todo papel; o que as visitas fizeram, as taxas, de onde vieram e quem está
 * no site, pra quem abre o Marketing. Sem nenhum deles (o painel de antes),
 * as visitas do dia, como sempre.
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
    const busca = req.query as BuscaDoPeriodo
    if (pediuPeriodo(busca)) {
      const periodo = await visitasNoPeriodo(
        req.scope,
        cfg,
        lerPeriodo(busca, agora),
        abre(pedido, "marketing"),
        agora
      )
      res.json({ estado: "ok", periodo })
      return
    }
    const respostas = await respostasDoDia(cfg, agora)
    const nomes = await nomesDosProdutos(req.scope, handlesDe(respostas.paginas))
    const visitas = montarVisitas(respostas, { agora, nomes })
    res.json({
      estado: "ok",
      visitas: abre(pedido, "marketing") ? visitas : soONumero(visitas),
    })
  } catch (e) {
    const tipo = e instanceof ErroDoGa4 ? e.tipo : "fora"
    avisar(req, tipo, e instanceof Error ? e.message : String(e))
    res.json({ estado: tipo })
  }
}

/**
 * As visitas do período. Pra quem abre o Marketing, junto: as páginas de
 * categoria (os endereços, do Medusa), quem está no site agora e as vendas
 * das duas lojas — contadas no mesmo corte de hora das visitas, pra taxa
 * "visitas que compraram" (`janelasNoCorte`).
 */
async function visitasNoPeriodo(
  container: MedusaContainer,
  cfg: ConfiguracaoDoGa4,
  p: Periodo,
  completo: boolean,
  agora: Date
): Promise<VisitasNoPeriodo> {
  const hosts = hostsDaLoja(process.env.LOJA_URL)
  const categorias = completo ? await enderecosDasCategorias(container) : []
  const chave =
    `inicio:${p.de}:${p.ate}:${p.antes?.de ?? "-"}:${completo ? "tudo" : "numero"}:` +
    hosts.join(",")
  const inicio = p.antes?.janela.de ?? p.atual.de
  const [relatorios, noSite, pedidos, daNuvemshop] = await Promise.all([
    relatoriosDoMarketing(cfg, chave, perguntasDoPeriodo(p, hosts, categorias, completo), agora),
    // O tempo real é enfeite: sem ele, o resto vem igual.
    completo ? agoraNoSite(cfg).catch(() => null) : null,
    completo ? pagosDesde(container, lerDesde(p)) : [],
    completo ? container.resolve<CrmService>(CRM).vendasDaBase(inicio, p.atual.ate) : [],
  ])
  if (!completo) return montarVisitasNoPeriodo(relatorios, p, agora, { completo })

  // As vendas das duas lojas no corte do Google: o instante do pagamento de cada uma.
  const pagas = [
    ...pedidos.flatMap((o) => {
      const pagoEm = o.status === "canceled" ? null : pagamentoDo(o).pagoEm
      return pagoEm ? [pagoEm] : []
    }),
    ...daNuvemshop.map((o) => new Date(o.pagoEm ?? o.feitoEm)),
  ]
  const noCorte = janelasNoCorte(p, corteDoGoogle(relatorios[0] ?? {}, p, agora))
  const contar = (j: Janela) => pagas.filter((d) => dentro(d, j)).length
  return montarVisitasNoPeriodo(relatorios, p, agora, {
    completo,
    noSite,
    vendas: {
      atual: contar(noCorte.atual),
      antes: noCorte.antes ? contar(noCorte.antes) : null,
      // As do período inteiro (até agora), as do card Vendas: "(4 no dia)".
      noPeriodo: contar(p.atual),
    },
  })
}
