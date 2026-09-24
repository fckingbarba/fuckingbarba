"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import type { Valores } from "@/lib/formulario"
import type { IdDaSecaoDaHome } from "@/lib/home"
import { medusa, type Resposta } from "@/lib/medusa"
import type { Resultado } from "@/lib/produtos"
import type { MudancaNaOrdem } from "@/lib/acoes/produtos"

/**
 * AS AÇÕES DA HOME — o texto de uma seção, ligar/desligar e a ordem (tudo no
 * rascunho), o "Publicar" e o "Desfazer".
 *
 * Quem decide se pode é o Medusa (`/dashboard/home/*`): o papel (marketing e
 * dono) e se o que chegou faz sentido. Cada mudança é aplicada sobre o
 * rascunho gravado AGORA, não sobre a tela — duas pessoas mexendo ao mesmo
 * tempo não se atropelam.
 *
 * Feito, a tela se refaz (`revalidatePath`) e a faixa conta o que está
 * esperando. A loja só é avisada no "Publicar".
 */

const GENERICO = "Não consegui falar com a loja agora. Tenta de novo em instantes."
const SEM_PAPEL = "O layout da home é do marketing e do dono."
const NO_RASCUNHO = "No rascunho — vai pro site quando alguém apertar “Publicar”"

async function chamar(acao: string, corpo: unknown): Promise<Resposta> {
  const r = await medusa(`/dashboard/home/${acao}`, { token: "sessao", corpo, tempoLimite: 20_000 })
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  return r
}

/** As respostas que toda ação trata igual. `null`: é com quem chamou. */
function comum(r: Resposta): Resultado | null {
  if (r.status === 403) return { ok: false, texto: SEM_PAPEL }
  if (r.status === 0)
    return {
      ok: false,
      texto: "A loja não respondeu a tempo. Confira a tela daqui a pouco — pode ter salvado.",
    }
  return null
}

export async function salvarSecaoDaHome(
  secao: IdDaSecaoDaHome,
  valores: Valores
): Promise<Resultado> {
  const r = await chamar("secao", { secao, valores })
  const erro = comum(r)
  if (erro) return erro
  if (r.status === 422 && Array.isArray(r.corpo.faltando))
    return {
      ok: false,
      texto: "Falta preencher o que está marcado.",
      faltando: (r.corpo.faltando as unknown[]).filter((f): f is string => typeof f === "string"),
    }
  if (r.status !== 200) return { ok: false, texto: GENERICO }
  revalidatePath("/home")
  return { ok: true, texto: `Salvo. ${NO_RASCUNHO}` }
}

export async function mudarSecaoDaHome(
  secao: IdDaSecaoDaHome,
  mudanca: MudancaNaOrdem
): Promise<Resultado> {
  const r = await chamar("ordem", { secao, mudanca })
  const erro = comum(r)
  if (erro) return erro
  if (r.status === 409) {
    revalidatePath("/home")
    return { ok: false, texto: "Essa seção não anda pra lá. A tela foi atualizada." }
  }
  if (r.status !== 200) return { ok: false, texto: GENERICO }
  revalidatePath("/home")
  return { ok: true, texto: NO_RASCUNHO }
}

export async function publicarHome(): Promise<Resultado> {
  const r = await chamar("publicar", {})
  const erro = comum(r)
  if (erro) return erro
  if (r.status === 409) {
    revalidatePath("/home")
    return { ok: false, texto: "Não há nada esperando: a home do site já é essa." }
  }
  if (r.status !== 200) return { ok: false, texto: GENERICO }
  revalidatePath("/home")
  return {
    ok: true,
    texto:
      r.corpo.lojaAvisada === false
        ? "Publicada. A loja demorou a confirmar: a home pode levar alguns minutos pra mudar."
        : "Publicada — a home do site muda em alguns segundos",
  }
}

export async function desfazerHome(): Promise<Resultado> {
  const r = await chamar("desfazer", {})
  const erro = comum(r)
  if (erro) return erro
  if (r.status !== 200 && r.status !== 409) return { ok: false, texto: GENERICO }
  revalidatePath("/home")
  return { ok: true, texto: "Pronto — o painel voltou a mostrar a home que está no site" }
}
