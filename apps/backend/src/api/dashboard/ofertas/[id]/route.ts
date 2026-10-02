import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../lib/equipe/acesso"
import {
  acertarPrecosDasOfertas,
  gravarListaDaOferta,
  produtosGuardados,
  servicoDasOfertas,
  type OfertaGuardada,
} from "../../../../lib/ofertas/lista"
import { avisarAsPaginas, ofertasNaLista } from "../../../../lib/ofertas/painel"
import {
  ID_DA_OFERTA,
  lerRelogio,
  RELOGIO_MAXIMO,
  RELOGIO_MINIMO,
  situacaoDaOferta,
} from "../../../../lib/ofertas/regras"
import { anotar } from "../../../../lib/painel/anotar"

/**
 * POST /dashboard/ofertas/:id — `{ acao: "pausar" | "ligar" | "encerrar" }`,
 * ou `{ acao: "relogio", minutos }` (entrega 0245).
 *
 * - PAUSAR: a lista vira rascunho (o carrinho para de achar o preço — a
 *   linha nova sai pelo da vitrine) e o link mostra "Essa oferta acabou".
 * - LIGAR: volta, se ainda está no prazo; os preços são refeitos na hora.
 * - ENCERRAR: o fim vira agora — pra sempre (pra vender de novo, outra
 *   oferta, com outro link).
 * - RELÓGIO: o tempo que a página mostra pra cada pessoa (recomeça quando
 *   zera; o preço vale até o fim). Vazio volta a contar até o fim. Só a
 *   página muda (a loja é avisada); o preço, não.
 *
 * Quem já está no checkout com o preço da oferta: o checkout confere a
 * oferta quando abre (`POST /store/ofertas/conferir`) e volta os preços da
 * vitrine. Marketing e dono.
 *
 * RESPOSTAS: 200 `{ oferta }`; 400 `acao`; 404 `nao_encontrada`; 409
 * `encerrada` (ligar ou pausar a que já acabou); 422 `{ erros: { relogio } }`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "cupons")) return

  const corpo = (req.body ?? {}) as { acao?: unknown; minutos?: unknown }
  const acao = corpo.acao
  if (acao !== "pausar" && acao !== "ligar" && acao !== "encerrar" && acao !== "relogio") {
    res.status(400).json({ message: "acao" })
    return
  }
  const id = req.params.id
  const servico = servicoDasOfertas(req.scope)
  const [lida] = ID_DA_OFERTA.test(id) ? await servico.listOfertas({ id }, { take: 1 }) : []
  if (!lida) {
    res.status(404).json({ message: "nao_encontrada" })
    return
  }
  const antes = {
    ...(lida as unknown as OfertaGuardada),
    produtos: produtosGuardados(lida.produtos),
  }
  const agora = new Date()
  if (situacaoDaOferta(antes, agora.getTime()) === "encerrada") {
    res.status(409).json({ message: "encerrada" })
    return
  }

  if (acao === "relogio") {
    const minutos = lerRelogio(corpo.minutos)
    if (minutos === undefined) {
      res.status(422).json({
        erros: {
          relogio: `O relógio: de ${RELOGIO_MINIMO} minutos a ${RELOGIO_MAXIMO / 60} horas.`,
        },
      })
      return
    }
    await servico.updateOfertas({ id, relogio_minutos: minutos })
    await anotar(pedido, "mudou-relogio-da-oferta", id, {
      nome: antes.nome,
      endereco: antes.slug,
      minutos,
    })
    await avisarAsPaginas(req.scope)
    const [oferta] = await ofertasNaLista(req.scope, [{ ...antes, relogio_minutos: minutos }])
    res.json({ oferta })
    return
  }

  const mudanca =
    acao === "pausar"
      ? { pausada: true }
      : acao === "ligar"
        ? { pausada: false }
        : {
            termina_em: agora,
            // A agendada que se encerra: o começo vem pra antes do fim (a lista recusa o contrário).
            comeca_em: new Date(
              Math.min(new Date(antes.comeca_em).getTime(), agora.getTime() - 1000)
            ),
          }
  await servico.updateOfertas({ id, ...mudanca })
  const depois: OfertaGuardada = { ...antes, ...mudanca }
  await gravarListaDaOferta(req.scope, depois)
  if (acao === "ligar") await acertarPrecosDasOfertas(req.scope, [depois])
  await anotar(
    pedido,
    acao === "pausar" ? "pausou-oferta" : acao === "ligar" ? "ligou-oferta" : "encerrou-oferta",
    id,
    { nome: antes.nome, endereco: antes.slug }
  )
  await avisarAsPaginas(req.scope)

  const [oferta] = await ofertasNaLista(req.scope, [depois])
  res.json({ oferta })
}
