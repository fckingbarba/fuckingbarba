"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { semAcessoA } from "@/lib/equipe"
import { medusa, type Resposta } from "@/lib/medusa"
import { corpoDaOferta, type FormularioDaOferta, type OfertaNaLista } from "@/lib/ofertas"
import type { Resultado } from "@/lib/produtos"

/**
 * AS AÇÕES DAS OFERTAS OCULTAS — criar, pausar, ligar e encerrar. Quem decide
 * é o Medusa (`/dashboard/ofertas`): quem abre os Cupons e descontos (no
 * padrão, o marketing e o dono) e o formulário campo a campo. Feito, a tela
 * se refaz.
 */

const GENERICO = "Não consegui falar com a loja agora. Tenta de novo em instantes."
const SEM_PAPEL = semAcessoA("cupons")

function sair(r: Resposta) {
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
}

export type ResultadoDaOferta = Resultado & { erros?: Record<string, string>; link?: string | null }

export async function criarOferta(f: FormularioDaOferta): Promise<ResultadoDaOferta> {
  const r = await medusa("/dashboard/ofertas", { token: "sessao", corpo: corpoDaOferta(f) })
  sair(r)
  if (r.status === 403) return { ok: false, texto: SEM_PAPEL }
  if (r.status === 422 && r.corpo.erros && typeof r.corpo.erros === "object")
    return {
      ok: false,
      texto: "Confira o que está marcado.",
      erros: r.corpo.erros as Record<string, string>,
    }
  const oferta = r.corpo.oferta as OfertaNaLista | undefined
  if (r.status !== 200 || !oferta?.endereco) return { ok: false, texto: GENERICO }
  revalidatePath("/cupons")
  return {
    ok: true,
    texto:
      oferta.situacao === "agendada"
        ? `Oferta "${oferta.nome}" criada. O link vende a partir do começo.`
        : `Oferta "${oferta.nome}" criada. O link já vende.`,
    link: oferta.link,
  }
}

const FEITO = {
  pausar: "Oferta pausada: o link mostra que acabou, e o preço sai do carrinho.",
  ligar: "Oferta no ar de novo.",
  encerrar: "Oferta encerrada. Pra vender de novo, crie outra.",
} as const

export async function mudarOferta(
  id: string,
  acao: "pausar" | "ligar" | "encerrar"
): Promise<Resultado> {
  if (!/^ofe_[0-9A-Z]{10,40}$/.test(id)) return { ok: false, texto: GENERICO }
  const r = await medusa(`/dashboard/ofertas/${id}`, { token: "sessao", corpo: { acao } })
  sair(r)
  if (r.status === 403) return { ok: false, texto: SEM_PAPEL }
  revalidatePath("/cupons")
  if (r.status === 409) return { ok: false, texto: "Essa oferta já acabou." }
  if (r.status !== 200) return { ok: false, texto: GENERICO }
  return { ok: true, texto: FEITO[acao] }
}

/**
 * O relógio da página de uma oferta (entrega 0245): o tempo que cada pessoa
 * vê, recomeçando quando zera; `""` volta a contar até o fim. O preço não
 * muda — só a página.
 */
export async function mudarRelogioDaOferta(
  id: string,
  minutos: number | ""
): Promise<ResultadoDaOferta> {
  if (!/^ofe_[0-9A-Z]{10,40}$/.test(id)) return { ok: false, texto: GENERICO }
  const r = await medusa(`/dashboard/ofertas/${id}`, {
    token: "sessao",
    corpo: { acao: "relogio", minutos },
  })
  sair(r)
  if (r.status === 403) return { ok: false, texto: SEM_PAPEL }
  if (r.status === 422 && r.corpo.erros && typeof r.corpo.erros === "object")
    return {
      ok: false,
      texto: String((r.corpo.erros as Record<string, string>).relogio ?? "Confira o relógio."),
      erros: r.corpo.erros as Record<string, string>,
    }
  revalidatePath("/cupons")
  if (r.status === 409) return { ok: false, texto: "Essa oferta já acabou." }
  if (r.status !== 200) return { ok: false, texto: GENERICO }
  return {
    ok: true,
    texto: minutos === "" ? "O relógio volta a contar até o fim." : "Relógio mudado na página.",
  }
}
