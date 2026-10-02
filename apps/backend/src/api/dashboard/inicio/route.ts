import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { abre, exigirArea, type PedidoDaEquipe } from "../../../lib/equipe/acesso"
import { JANELA_DO_TOTAL_MS, montarInicio, precisamDoTotal } from "../../../lib/painel/inicio"
import {
  montarInicioNoPeriodo,
  saidosNoPagamento,
  type DadosDoPeriodo,
  type InicioNoPeriodo,
} from "../../../lib/painel/inicio-periodo"
import { quantasAvaliacoesNovas } from "../../../lib/painel/ler-avaliacoes"
import {
  carrinhosDoCheckout,
  enviosDos,
  lerContexto,
  notasDos,
  numerosDaNewsletter,
  pedidosDesde,
  pedidosFeitosEntre,
  pedidosRecentes,
  produtosComSku,
  quantosRascunhos,
  tentativasDosCarrinhos,
  totaisDesde,
  totaisDos,
} from "../../../lib/painel/ler"
import { linhaDaLista, type Contexto } from "../../../lib/painel/pedido"
import {
  lerDesde,
  lerPeriodo,
  pediuPeriodo,
  type BuscaDoPeriodo,
  type Periodo,
} from "../../../lib/painel/periodo"
import { CRM } from "../../../modules/crm"
import type CrmService from "../../../modules/crm/service"

/**
 * GET /dashboard/inicio — a primeira tela do painel: o que precisa de você,
 * as vendas e os pedidos do dia, conforme o papel e o que ele abre agora
 * (`lib/painel/inicio.ts`).
 *
 * Os pedidos dos últimos 45 dias: é o que cobre a semana do gráfico e o
 * pedido pago que ficou parado sem sair — esse, quanto mais velho, mais
 * precisa aparecer.
 *
 * Lidos SEM o total; o total vem só dos que entram nos números em reais
 * (`precisamDoTotal`): os da semana, lidos junto com a janela (`totaisDesde`), e
 * o que ainda faltar (um pago agora de pedido velho) logo depois. O que não
 * depende um do outro sai junto.
 *
 * O PERÍODO (0186): com `?periodo=` (ou `?de=` e `?ate=`, e `?comparar=`), a
 * resposta traz também `periodo` — os números, o gráfico, os mais vendidos, o
 * checkout e os pedidos do período escolhido na barra de cima
 * (`lib/painel/inicio-periodo.ts`), com as vendas da Nuvemshop antes da
 * virada. Sem nenhum deles (o painel de antes), só o de sempre.
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "inicio")) return

  const papel = pedido.membro.papel
  const agora = new Date()
  // A fila do marketing: cada item só pra quem abre a área dele (sai junto com o resto).
  const marketing = papel === "marketing"
  const busca = req.query as BuscaDoPeriodo
  const periodo = pediuPeriodo(busca) ? lerPeriodo(busca, agora) : null
  const [ctx, pedidos, daSemana, newsletter, rascunhos, avaliacoes] = await Promise.all([
    lerContexto(req.scope, agora),
    pedidosRecentes(req.scope, { limite: 500, dias: 45, agora, semTotal: true }),
    totaisDesde(req.scope, new Date(agora.getTime() - JANELA_DO_TOTAL_MS)),
    marketing && abre(pedido, "newsletter") ? numerosDaNewsletter(req.scope, agora) : null,
    marketing && abre(pedido, "produtos") ? quantosRascunhos(req.scope) : null,
    // As avaliações esperando: pra todo papel que abre a área delas.
    abre(pedido, "avaliacoes") ? quantasAvaliacoesNovas(req.scope) : null,
  ])
  // O período (0186) sai junto com o resto da leitura: não depende dela. O `catch` vazio só
  // marca a promessa como ouvida (quem trata o erro é o `await` lá embaixo).
  const noPeriodo = periodo ? inicioNoPeriodo(req.scope, pedido, periodo, ctx) : null
  noPeriodo?.catch(() => undefined)
  const ids = pedidos.map((o) => o.id)
  const faltam = precisamDoTotal(pedidos, agora).filter((id) => !daSemana.has(id))
  const [notas, envios, outros] = await Promise.all([
    notasDos(req.scope, ids),
    enviosDos(req.scope, ids),
    totaisDos(req.scope, faltam),
  ])
  for (const o of pedidos) {
    const t = daSemana.get(o.id) ?? outros.get(o.id)
    if (t) Object.assign(o, { total: t.total, credit_line_total: t.credit_line_total })
  }
  const doMarketing = {
    ...(newsletter !== null ? { newsletter } : {}),
    ...(rascunhos !== null ? { rascunhos } : {}),
    ...(avaliacoes !== null ? { avaliacoes } : {}),
  }

  const inicio = montarInicio(
    { papel, areas: pedido.areas },
    { pedidos, notas, envios, ...doMarketing },
    ctx
  )
  res.json(noPeriodo ? { ...inicio, periodo: await noPeriodo } : inicio)
}

/** Quantos pedidos do período a lista do Início mostra (o resto, em Pedidos). */
const PEDIDOS_NA_LISTA = 6

/**
 * O Início no período escolhido: as vendas das duas lojas (a nova e a
 * Nuvemshop, do CRM), os produtos (o item da Nuvemshop vira o de hoje pelo
 * SKU), os carrinhos (só pra quem abre o Marketing) e os pedidos feitos no
 * período (só pra quem abre os Pedidos, com o nome do cliente).
 *
 * Dos carrinhos que saíram no pagamento, as tentativas de pagar (0244): o
 * porquê de cada um. Se essa leitura falhar, o checkout aparece sem ele.
 */
async function inicioNoPeriodo(
  container: MedusaContainer,
  pedido: PedidoDaEquipe,
  p: Periodo,
  ctx: Contexto
): Promise<InicioNoPeriodo> {
  const crm = container.resolve<CrmService>(CRM)
  const inicio = p.antes?.janela.de ?? p.atual.de
  const [vendidos, daNuvemshop, produtos, carrinhos, feitos] = await Promise.all([
    pedidosDesde(container, lerDesde(p)),
    crm.vendasDaBase(inicio, p.atual.ate),
    produtosComSku(container),
    abre(pedido, "marketing")
      ? carrinhosDoCheckout(container, { de: inicio, ate: p.atual.ate }).then(async (lidos) => ({
          lidos,
          tentativas: await tentativasDosCarrinhos(
            container,
            saidosNoPagamento(lidos, p.atual).map((c) => c.id)
          ).catch((e: unknown) => {
            container
              .resolve(ContainerRegistrationKeys.LOGGER)
              .warn(
                `[início] as tentativas dos carrinhos não vieram: ${e instanceof Error ? e.message : String(e)}`
              )
            return null
          }),
        }))
      : null,
    abre(pedido, "pedidos") ? pedidosFeitosEntre(container, p.atual, PEDIDOS_NA_LISTA) : null,
  ])
  let lista: DadosDoPeriodo["feitos"] = null
  if (feitos) {
    const ids = feitos.pedidos.map((o) => o.id)
    const [notas, envios] = await Promise.all([notasDos(container, ids), enviosDos(container, ids)])
    lista = {
      lista: feitos.pedidos.map((o) =>
        linhaDaLista(o, notas.get(o.id) ?? null, envios.get(o.id) ?? [], ctx)
      ),
      total: feitos.total,
    }
  }
  return montarInicioNoPeriodo(
    p,
    {
      pedidos: vendidos,
      daNuvemshop,
      produtos,
      carrinhos: carrinhos?.lidos ?? null,
      tentativas: carrinhos?.tentativas ?? null,
      feitos: lista,
    },
    ctx.agora
  )
}
