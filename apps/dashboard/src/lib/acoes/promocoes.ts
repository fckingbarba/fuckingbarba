"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { medusa, type Resposta } from "@/lib/medusa"
import type { Resultado } from "@/lib/produtos"
import type { FormularioDaPromocao } from "@/lib/promocoes"

/**
 * AS AÇÕES DAS PROMOÇÕES — criar e a chave (pausar e ligar). Quem decide é o
 * Medusa (`/dashboard/promocoes`): o papel (marketing e dono) e o formulário
 * campo a campo. Feito, a tela se refaz.
 */

const GENERICO = "Não consegui falar com a loja agora. Tenta de novo em instantes."
const SEM_PAPEL = "As promoções são do marketing e do dono."

function sair(r: Resposta) {
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
}

export type ResultadoDaPromocao = Resultado & { erros?: Record<string, string> }

export async function criarPromocao(f: FormularioDaPromocao): Promise<ResultadoDaPromocao> {
  const r = await medusa("/dashboard/promocoes", { token: "sessao", corpo: f })
  sair(r)
  if (r.status === 403) return { ok: false, texto: SEM_PAPEL }
  if (r.status === 422 && r.corpo.erros && typeof r.corpo.erros === "object")
    return {
      ok: false,
      texto: "Confira o que está marcado.",
      erros: r.corpo.erros as Record<string, string>,
    }
  const promocao = r.corpo.promocao as { etiqueta?: string } | undefined
  if (r.status !== 200 || !promocao?.etiqueta) return { ok: false, texto: GENERICO }
  revalidatePath("/cupons")
  return { ok: true, texto: `Promoção "${promocao.etiqueta}" criada. Já vale na loja.` }
}

export async function mudarPromocao(id: string, acao: "pausar" | "ligar"): Promise<Resultado> {
  if (!/^promo_[0-9A-Z]{10,40}$/.test(id)) return { ok: false, texto: GENERICO }
  const r = await medusa(`/dashboard/promocoes/${id}`, { token: "sessao", corpo: { acao } })
  sair(r)
  if (r.status === 403) return { ok: false, texto: SEM_PAPEL }
  revalidatePath("/cupons")
  if (r.status !== 200) return { ok: false, texto: GENERICO }
  return {
    ok: true,
    texto:
      acao === "ligar"
        ? "Promoção valendo de novo."
        : "Promoção pausada: sai do carrinho e da loja.",
  }
}
