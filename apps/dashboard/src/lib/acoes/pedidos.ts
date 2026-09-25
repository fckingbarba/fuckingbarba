"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { medusa } from "@/lib/medusa"
import { ehIdDePedido, type AcaoDoPedido, type Frase } from "@/lib/pedidos"

/**
 * AS AÇÕES DO PEDIDO — "Emitir a nota agora" (e "Tentar a nota de novo"),
 * "Tentar o estorno de novo" e "Mandar pra Frenet de novo".
 *
 * Quem decide se pode é o Medusa (`POST /dashboard/pedidos/:id/nota`,
 * `/estorno` e `/frenet`): o papel, e se o pedido ainda está no estado do botão — a
 * tela pode estar aberta há uma hora. Quem faz, também: são as funções que
 * o admin já usava. A frase de cada resultado vem pronta de lá; aqui moram
 * só as das recusas.
 *
 * Feito, a página do pedido se refaz (`revalidatePath`): o caminho, a faixa
 * e o histórico — com o nome de quem apertou — já mostram o que mudou.
 */

const GENERICO = "Não consegui falar com a loja agora. Tenta de novo em instantes."

async function fazer(id: string, acao: AcaoDoPedido): Promise<Frase> {
  // Só um id de pedido vai pro endereço — nada de barra ou de caminho no meio.
  if (!ehIdDePedido(id)) return { ok: false, texto: "Não achei esse pedido. Recarregue a página." }

  // O Bling, o Pagar.me e a Frenet podem demorar: a ação espera mais que uma leitura.
  const r = await medusa(`/dashboard/pedidos/${id}/${acao}`, {
    token: "sessao",
    tempoLimite: 60_000,
  })
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  revalidatePath(`/pedidos/${id}`)

  if (r.status === 200 && typeof r.corpo.texto === "string")
    return { ok: r.corpo.ok === true, texto: r.corpo.texto }
  if (r.status === 403)
    return {
      ok: false,
      texto: acao === "estorno" ? "Estorno é com o dono." : "Pedidos são da operação e do dono.",
    }
  if (r.status === 409)
    return {
      ok: false,
      texto:
        "Nada a fazer: o pedido mudou desde que a página abriu. Ela já mostra como está agora.",
    }
  if (r.status === 404) return { ok: false, texto: "Não achei esse pedido. Recarregue a página." }
  if (r.status === 0)
    return {
      ok: false,
      texto: "A loja não respondeu a tempo. Confira o pedido daqui a pouco — pode ter andado.",
    }
  return { ok: false, texto: GENERICO }
}

export async function emitirNota(id: string): Promise<Frase> {
  return fazer(id, "nota")
}

export async function tentarEstorno(id: string): Promise<Frase> {
  return fazer(id, "estorno")
}

export async function mandarPraFrenet(id: string): Promise<Frase> {
  return fazer(id, "frenet")
}
