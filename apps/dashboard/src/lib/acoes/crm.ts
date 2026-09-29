"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import type { ErrosDaCampanha, FormularioDosAjustes, TextoDaCampanha } from "@/lib/crm"
import { semAcessoA } from "@/lib/equipe"
import { medusa } from "@/lib/medusa"

/**
 * AS AÇÕES DO CRM — salvar os Ajustes (quanto dura cada produto, as regras
 * das etiquetas). Quem confere campo a campo e grava é o Medusa
 * (`POST /dashboard/crm/ajustes`); o erro volta embaixo do campo. Salvo, a
 * aba se refaz com o que ficou gravado.
 */

export type ResultadoDosAjustes = { ok: boolean; texto: string; erros?: Record<string, string> }

export async function salvarAjustesDoCrm(f: FormularioDosAjustes): Promise<ResultadoDosAjustes> {
  const r = await medusa("/dashboard/crm/ajustes", { token: "sessao", corpo: f })
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return { ok: false, texto: semAcessoA("crm") }
  if (r.status === 422 && r.corpo.erros && typeof r.corpo.erros === "object")
    return {
      ok: false,
      texto: "Confira o que está marcado.",
      erros: r.corpo.erros as Record<string, string>,
    }
  if (r.status !== 200)
    return { ok: false, texto: "Não consegui falar com a loja agora. Tenta de novo em instantes." }
  revalidatePath("/crm", "layout")
  return { ok: true, texto: "Ajustes salvos. Valem na próxima ficha de cliente que abrir." }
}

/**
 * "MANDAR PRA MIM" — um dos exemplos do modelo, pro e-mail de quem está no
 * painel (`POST /dashboard/crm/emails/teste`). Quem monta e manda é o Medusa.
 */
export async function mandarTesteDoCrm(
  exemplo: string,
  nome: string
): Promise<ResultadoDosAjustes> {
  const r = await medusa("/dashboard/crm/emails/teste", { token: "sessao", corpo: { exemplo } })
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return { ok: false, texto: semAcessoA("crm") }
  if (r.status === 429)
    return { ok: false, texto: "Já foram 10 testes nesta hora. Tenta de novo mais tarde." }
  if (r.status === 409)
    return { ok: false, texto: "Falta o endereço da loja no Medusa (LOJA_URL)." }
  if (r.status !== 200)
    return { ok: false, texto: "O e-mail não saiu agora. Tenta de novo em instantes." }
  return {
    ok: true,
    texto: `Mandei “${nome}” pra ${String(r.corpo.para)}. Confira a caixa de entrada (e o spam, na primeira vez).`,
  }
}

/**
 * OS FLUXOS — ligar, desligar (`{ fluxo, ligado }`) ou mudar o desconto do
 * cupom (`{ desconto }`). Quem confere e grava é o Medusa
 * (`POST /dashboard/crm/fluxos`).
 */
export async function mudarOsFluxos(
  corpo: { fluxo: string; ligado: boolean } | { desconto: string }
): Promise<ResultadoDosAjustes> {
  const r = await medusa("/dashboard/crm/fluxos", { token: "sessao", corpo })
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return { ok: false, texto: semAcessoA("crm") }
  if (r.status === 422) return { ok: false, texto: String(r.corpo.erro ?? "Confira o que mudou.") }
  if (r.status !== 200)
    return { ok: false, texto: "Não consegui falar com a loja agora. Tenta de novo em instantes." }
  revalidatePath("/crm", "layout")
  if ("desconto" in corpo) return { ok: true, texto: `Desconto salvo: ${corpo.desconto}%.` }
  return {
    ok: true,
    texto: corpo.ligado
      ? "Ligado. Vale pra quem começar uma compra a partir de agora."
      : "Desligado. Ninguém mais recebe esse fluxo.",
  }
}

/** "MANDAR PRA MIM" de um toque dos fluxos (`POST /dashboard/crm/fluxos/teste`). */
export async function mandarTesteDoFluxo(
  toque: string,
  nome: string
): Promise<ResultadoDosAjustes> {
  const r = await medusa("/dashboard/crm/fluxos/teste", { token: "sessao", corpo: { toque } })
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return { ok: false, texto: semAcessoA("crm") }
  if (r.status === 429)
    return { ok: false, texto: "Já foram 10 testes nesta hora. Tenta de novo mais tarde." }
  if (r.status === 409)
    return { ok: false, texto: "Falta o endereço da loja no Medusa (LOJA_URL)." }
  if (r.status !== 200)
    return { ok: false, texto: "O e-mail não saiu agora. Tenta de novo em instantes." }
  // Os da estreia vão nos jeitos dela, um e-mail por jeito.
  const quantos = Number(r.corpo.quantos) || 1
  return {
    ok: true,
    texto: `Mandei ${quantos > 1 ? `os ${quantos} jeitos de ` : ""}“${nome}” pra ${String(r.corpo.para)}. Confira a caixa de entrada (e o spam, na primeira vez).`,
  }
}

const inteiro = new Intl.NumberFormat("pt-BR")
const NOME_DO_ARQUIVO = { clientes: "Clientes", vendas: "Vendas", carrinhos: "Carrinhos" } as const
const ERRO_DA_BASE: Record<string, string> = {
  desconhecido: "não é um dos três da Nuvemshop (Clientes, Vendas ou Carrinhos abandonados)",
  vazio: "está vazio",
  grande: "passa de 8 MB",
  arquivo_invalido: "não abriu",
}

/**
 * UM ARQUIVO DA BASE DA NUVEMSHOP — o `gzip` é o arquivo comprimido no
 * navegador, em base64. Quem reconhece qual dos três é, lê e grava é o
 * Medusa (`POST /dashboard/crm/base`); aqui, a frase do que entrou.
 */
export async function importarArquivoDaBase(f: {
  nome: string
  gzip: string
}): Promise<ResultadoDosAjustes> {
  const r = await medusa("/dashboard/crm/base", { token: "sessao", corpo: f })
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return { ok: false, texto: semAcessoA("crm") }
  if (r.status === 413 || r.status === 422)
    return {
      ok: false,
      texto: `“${f.nome}” ${ERRO_DA_BASE[String(r.corpo.erro)] ?? "não entrou"}.`,
    }
  if (r.status !== 200)
    return { ok: false, texto: "Não consegui falar com a loja agora. Tenta de novo em instantes." }
  revalidatePath("/crm", "layout")
  const c = r.corpo as {
    tipo: keyof typeof NOME_DO_ARQUIVO
    lidas: number
    novos: number
    atualizados: number
    ignoradas: number
    /** Os pedidos das vendas que vieram com o endereço inteiro (entrega 0202). */
    comEntrega?: number
  }
  const [um, varios] =
    c.tipo === "clientes"
      ? ["pessoa", "pessoas"]
      : c.tipo === "vendas"
        ? ["pedido", "pedidos"]
        : ["carrinho", "carrinhos"]
  const vezes = (n: number, s: string, p: string) => `${inteiro.format(n)} ${n === 1 ? s : p}`
  const partes = [`${NOME_DO_ARQUIVO[c.tipo]}: ${vezes(c.lidas, um, varios)}`]
  if (c.atualizados)
    partes.push(
      c.atualizados === 1
        ? "1 já estava e foi atualizado"
        : `${inteiro.format(c.atualizados)} já estavam e foram atualizados`
    )
  if (c.ignoradas)
    partes.push(
      `${vezes(c.ignoradas, "linha", "linhas")} sem e-mail ${c.ignoradas === 1 ? "ficou" : "ficaram"} de fora`
    )
  // O "Refazer o pedido" da reposição abre com o endereço destes (entrega 0202).
  if (c.tipo === "vendas" && c.comEntrega)
    partes.push(`${inteiro.format(c.comEntrega)} com o endereço de entrega`)
  return { ok: true, texto: `${partes.join(" · ")}.` }
}

/* ── as campanhas (entrega 0206) ─────────────────────────────────────────── */

export type ResultadoDaCampanhaNoPainel =
  { ok: true; texto: string; id: string } | { ok: false; texto: string; erros?: ErrosDaCampanha }

const TEXTO_DA_ACAO = {
  salvar: "Campanha salva.",
  agendar: "Campanha agendada.",
  desmarcar: "Envio desmarcado: a campanha voltou a rascunho.",
  parar: "Envio parado: quem ainda não recebeu, não recebe mais.",
  apagar: "Rascunho apagado.",
} as const

/**
 * UMA CAMPANHA — salvar, agendar, desmarcar, parar ou apagar. Quem confere
 * campo a campo e grava é o Medusa (`POST /dashboard/crm/campanhas`); o erro
 * volta embaixo do campo.
 */
export async function mudarACampanha(p: {
  acao: keyof typeof TEXTO_DA_ACAO
  id?: string | null
  campanha?: TextoDaCampanha
  agenda?: string | null
}): Promise<ResultadoDaCampanhaNoPainel> {
  const r = await medusa("/dashboard/crm/campanhas", { token: "sessao", corpo: p })
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return { ok: false, texto: semAcessoA("crm") }
  if (r.status === 422)
    return {
      ok: false,
      texto: "Confira os campos em vermelho.",
      erros: (r.corpo.erros ?? {}) as ErrosDaCampanha,
    }
  if (r.status === 409)
    return {
      ok: false,
      texto: "A campanha já mudou de situação (começou a sair, ou já saiu). Recarregue a tela.",
    }
  if (r.status === 404) return { ok: false, texto: "Essa campanha não existe mais." }
  if (r.status !== 200)
    return { ok: false, texto: "Não consegui falar com a loja agora. Tenta de novo em instantes." }
  revalidatePath("/crm", "layout")
  return { ok: true, texto: TEXTO_DA_ACAO[p.acao], id: String(r.corpo.id) }
}

/** O "VER COMO FICA" da campanha: o e-mail pronto, sem salvar (`POST …/campanhas/previa`). */
export async function verACampanha(
  campanha: TextoDaCampanha
): Promise<
  | { ok: true; emails: { assunto: string; html: string }[] }
  | { ok: false; texto: string; erros?: ErrosDaCampanha }
> {
  const r = await medusa("/dashboard/crm/campanhas/previa", {
    token: "sessao",
    corpo: { campanha },
  })
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return { ok: false, texto: semAcessoA("crm") }
  if (r.status === 422)
    return {
      ok: false,
      texto: "Confira os campos em vermelho.",
      erros: (r.corpo.erros ?? {}) as ErrosDaCampanha,
    }
  if (r.status === 409)
    return { ok: false, texto: "Falta o endereço da loja no Medusa (LOJA_URL)." }
  if (r.status !== 200)
    return { ok: false, texto: "Não consegui falar com a loja agora. Tenta de novo em instantes." }
  return { ok: true, emails: (r.corpo.emails ?? []) as { assunto: string; html: string }[] }
}

/** "MANDAR PRA MIM" da campanha, sem salvar (`POST …/campanhas/teste`): o assunto A e, com o teste, o B. */
export async function mandarTesteDaCampanha(
  campanha: TextoDaCampanha
): Promise<{ ok: boolean; texto: string; erros?: ErrosDaCampanha }> {
  const r = await medusa("/dashboard/crm/campanhas/teste", {
    token: "sessao",
    corpo: { campanha },
  })
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return { ok: false, texto: semAcessoA("crm") }
  if (r.status === 422)
    return {
      ok: false,
      texto: "Confira os campos em vermelho.",
      erros: (r.corpo.erros ?? {}) as ErrosDaCampanha,
    }
  if (r.status === 429)
    return { ok: false, texto: "Já foram 10 testes nesta hora. Tenta de novo mais tarde." }
  if (r.status === 409)
    return { ok: false, texto: "Falta o endereço da loja no Medusa (LOJA_URL)." }
  if (r.status !== 200)
    return { ok: false, texto: "O e-mail não saiu agora. Tenta de novo em instantes." }
  const quantos = Number(r.corpo.quantos) || 1
  return {
    ok: true,
    texto: `Mandei ${quantos > 1 ? "os dois assuntos" : "a campanha"} pra ${String(r.corpo.para)}. Confira a caixa de entrada (e Promoções).`,
  }
}
