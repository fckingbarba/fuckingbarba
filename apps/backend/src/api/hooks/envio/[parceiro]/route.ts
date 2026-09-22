import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { receberNovidade, type Recebido } from "../../../../lib/envios/nucleo"
import { parceiroDeEntrega } from "../../../../lib/envios/parceiros"

/**
 * POST /hooks/envio/:parceiro — a porta dos avisos de entrega.
 *
 * Uma rota pra todo parceiro: o `:parceiro` escolhe o tradutor
 * (`lib/envios/parceiros.ts`), o tradutor confere a autenticação dele e
 * traduz, e o núcleo faz o resto. Parceiro novo não mexe aqui.
 *
 *   Frenet ──POST /hooks/envio/frenet──▶ tradutor ──▶ núcleo ──▶ 200
 *
 * ┌─ RESPONDER RÁPIDO, E SÓ ERRAR QUANDO VALE REENVIAR ────────────────────┐
 * │ A Frenet espera 2XX em até 10 segundos, e não segue redirecionamento.  │
 * │ O núcleo grava, recalcula e marca o pedido — segundos, no pior caso; o │
 * │ e-mail ao cliente sai depois, por evento, fora desta resposta.         │
 * │                                                                         │
 * │ Os códigos dizem ao parceiro se vale tentar de novo:                   │
 * │   404 — parceiro que a loja não conhece;                               │
 * │   401 — sem a chave certa (ou sem a variável dela no Railway);         │
 * │   400 — não é um aviso que o tradutor entenda;                         │
 * │   200 — entendido: gravado, repetido ou sem nada a fazer;              │
 * │   500 — o banco ou o Redis falhou: aí, sim, reenviar resolve.          │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Sem `/store` nem `/admin` no caminho, o Medusa não pede chave publicável
 * nem sessão — quem autentica é o tradutor. E o corpo cru fica guardado
 * (`middlewares.ts`) pro parceiro que assina o corpo em vez de mandar token.
 */
export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  const parceiro = parceiroDeEntrega(String(req.params.parceiro ?? ""))
  if (!parceiro) {
    res.status(404).json({ message: "parceiro_desconhecido" })
    return
  }

  const leitura = parceiro.lerAviso({
    cabecalhos: req.headers,
    consulta: (req.query ?? {}) as Record<string, unknown>,
    corpo: req.body,
    bruto: req.rawBody ? String(req.rawBody) : null,
  })

  if (!leitura.ok) {
    switch (leitura.motivo) {
      case "sem-configuracao":
        logger.error(`[envio] ${parceiro.nome}: aviso recusado — ${leitura.detalhe}`)
        res.status(401).json({ message: "nao_autorizado" })
        return
      case "nao-autorizado":
        logger.warn(`[envio] ${parceiro.nome}: aviso recusado — ${leitura.detalhe}`)
        res.status(401).json({ message: "nao_autorizado" })
        return
      case "ilegivel":
        logger.warn(`[envio] ${parceiro.nome}: aviso que não entendi — ${leitura.detalhe}`)
        res.status(400).json({ message: "aviso_ilegivel" })
        return
      case "ignorado":
        res.json({ ok: true, ignorado: leitura.detalhe })
        return
    }
  }

  const resultados: Recebido[] = []
  for (const novidade of leitura.novidades) {
    const r = await receberNovidade(req.scope, novidade, {
      parceiro: parceiro.id,
      avisarCliente: true,
    })
    resultados.push(r)
    if (r.estado === "ok" && (r.mudou || r.eventosNovos)) {
      logger.info(
        `[envio] ${parceiro.nome}: ${novidade.codigo ?? novidade.idNoParceiro} → ${r.situacao}` +
          (r.pedidoId
            ? ` (pedido ${r.pedidoId})`
            : " (ainda sem pedido — liga quando o código aparecer num)")
      )
    }
  }

  res.json({
    ok: true,
    envios: resultados.map((r) =>
      r.estado === "ok"
        ? { id: r.envioId, pedido: r.pedidoId, situacao: r.situacao, novos: r.eventosNovos }
        : { ignorado: r.motivo }
    ),
  })
}
