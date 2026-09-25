"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import type { FormularioDoCupom } from "@/lib/cupons"
import { medusa, type Resposta } from "@/lib/medusa"
import type { Resultado } from "@/lib/produtos"

/**
 * AS AÇÕES DOS CUPONS — criar e a chave (pausar e ligar). Quem decide é o
 * Medusa (`/dashboard/cupons`): o papel (marketing e dono), o formulário
 * campo a campo, e o código que não pode repetir. Feito, a tela se refaz.
 */

const GENERICO = "Não consegui falar com a loja agora. Tenta de novo em instantes."
const SEM_PAPEL = "Os cupons são do marketing e do dono."

function sair(r: Resposta) {
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
}

export type ResultadoDoCupom = Resultado & { erros?: Record<string, string> }

export async function criarCupom(f: FormularioDoCupom): Promise<ResultadoDoCupom> {
  const r = await medusa("/dashboard/cupons", { token: "sessao", corpo: f })
  sair(r)
  if (r.status === 403) return { ok: false, texto: SEM_PAPEL }
  if (r.status === 422 && r.corpo.erros && typeof r.corpo.erros === "object")
    return {
      ok: false,
      texto: "Confira o que está marcado.",
      erros: r.corpo.erros as Record<string, string>,
    }
  if (r.status === 409)
    return {
      ok: false,
      texto: "Esse código já existe.",
      erros: { codigo: "Esse código já existe: escolha outro." },
    }
  const cupom = r.corpo.cupom as { codigo?: string } | undefined
  if (r.status !== 200 || !cupom?.codigo) return { ok: false, texto: GENERICO }
  revalidatePath("/cupons")
  return { ok: true, texto: `Cupom ${cupom.codigo} criado. Já vale no checkout.` }
}

export async function mudarCupom(id: string, acao: "pausar" | "ligar"): Promise<Resultado> {
  if (!/^promo_[0-9A-Z]{10,40}$/.test(id)) return { ok: false, texto: GENERICO }
  const r = await medusa(`/dashboard/cupons/${id}`, { token: "sessao", corpo: { acao } })
  sair(r)
  if (r.status === 403) return { ok: false, texto: SEM_PAPEL }
  if (r.status !== 200) {
    revalidatePath("/cupons")
    return { ok: false, texto: GENERICO }
  }
  revalidatePath("/cupons")
  return {
    ok: true,
    texto:
      acao === "ligar" ? "Cupom valendo de novo." : "Cupom pausado: o checkout recusa o código.",
  }
}
