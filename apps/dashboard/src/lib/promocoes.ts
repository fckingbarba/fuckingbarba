/**
 * AS PROMOÇÕES DO PAINEL — o "Leve X, pague Y" (o "Compre X e pague Y" da
 * Nuvemshop): os tipos, como o backend devolve (`apps/backend/src/lib/
 * promocoes.ts`, pela rota `/dashboard/cupons`, na mesma tela dos cupons), e
 * a prévia do formulário.
 *
 * Quem dá o desconto é o Medusa, sozinho, no carrinho: ninguém digita
 * código. A prévia é só pra quem preenche ver a frase antes de criar.
 */

import type { Catalogo } from "@/lib/cupons"

export type SituacaoDaPromocao = "valendo" | "agendado" | "pausado" | "vencido"

export type PromocaoNaLista = {
  id: string
  codigo: string
  nome: string
  /** O que o cliente vê: "Leve 3, pague 2". */
  etiqueta: string
  /** "Leve 3, pague 2 em Fator de Crescimento" */
  descricao: string
  /** "de 01/10 às 00:00 até 31/10 às 23:59 · fora do preço promocional" */
  regra: string
  situacao: SituacaoDaPromocao
  /** A chave: a vencida não volta por ela. */
  ligado: boolean
  pedidos: number
  desconto: number
  vendeu: number
}

export const NOME_DA_SITUACAO: Record<SituacaoDaPromocao, string> = {
  valendo: "Valendo",
  agendado: "Agendada",
  pausado: "Pausada",
  vencido: "Encerrada",
}

/** A cor do selo (`.status[data-s]`, em `pecas.css`). */
export const COR_DA_SITUACAO: Record<SituacaoDaPromocao, string> = {
  valendo: "ativo",
  agendado: "esperando",
  pausado: "pausado",
  vencido: "cancelado",
}

/** O formulário da promoção nova, como a tela guarda (texto, como foi digitado). */
export type FormularioDaPromocao = {
  nome: string
  tipo: "leve-pague"
  comprando: string
  pague: string
  aplicarA: "loja" | "categorias" | "produtos"
  /** Os ids das categorias ou dos produtos escolhidos. */
  alvos: string[]
  /** Vale também no produto com preço promocional (o de/por). */
  promocional: boolean
  data: "ilimitado" | "periodo"
  /** "2026-10-01T00:00", em Brasília (o campo de data e hora). */
  de: string
  ate: string
  /** O selo da loja; vazio = "Leve 3, pague 2". */
  etiqueta: string
}

/** Como a gaveta abre: leve 3, pague 2, escolhendo os produtos, sem data de fim. */
export const PROMOCAO_VAZIA: FormularioDaPromocao = {
  nome: "",
  tipo: "leve-pague",
  comprando: "3",
  pague: "2",
  aplicarA: "produtos",
  alvos: [],
  promocional: true,
  data: "ilimitado",
  de: "",
  ate: "",
  etiqueta: "",
}

const inteiro = (v: string): number | null => {
  const n = Number(v.trim())
  return v.trim() && Number.isInteger(n) ? n : null
}
const quando = (d: string) =>
  d.length >= 16 ? `${d.slice(8, 10)}/${d.slice(5, 7)} às ${d.slice(11, 16)}` : "…"
/** "Óleo" · "Óleo e Balm" · "Óleo, Balm e Shampoo" · "Óleo, Balm e mais 3". */
function emLista(nomes: string[]): string {
  if (nomes.length <= 1) return nomes[0] ?? ""
  if (nomes.length <= 3) return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`
  return `${nomes.slice(0, 2).join(", ")} e mais ${nomes.length - 2}`
}

/** A etiqueta que vai pro selo: a escrita, ou "Leve 3, pague 2". */
export function etiquetaDa(f: FormularioDaPromocao): string {
  const escrita = f.etiqueta.replace(/\s+/g, " ").trim()
  if (escrita) return escrita
  const comprando = inteiro(f.comprando)
  const pague = inteiro(f.pague)
  return `Leve ${comprando ?? "…"}, pague ${pague ?? "…"}`
}

/**
 * "Leve 3, pague 2 em Fator de Crescimento · sem data de fim" — a mesma frase
 * que a lista vai mostrar (`descricaoDaPromocao` e `regraDaPromocao`, no
 * backend).
 */
export function previaDaPromocao(
  f: FormularioDaPromocao,
  catalogo: Catalogo = { categorias: [], produtos: [] }
): string {
  const comprando = inteiro(f.comprando)
  const pague = inteiro(f.pague)
  const conta = `Leve ${comprando ?? "…"}, pague ${pague ?? "…"}`
  const opcoes = f.aplicarA === "categorias" ? catalogo.categorias : catalogo.produtos
  const nomes =
    f.aplicarA === "loja" ? [] : opcoes.filter((a) => f.alvos.includes(a.id)).map((a) => a.nome)
  const onde =
    f.aplicarA === "loja"
      ? "em toda a loja"
      : f.aplicarA === "categorias"
        ? `nos produtos de ${nomes.length ? emLista(nomes) : "…"}`
        : `em ${nomes.length ? emLista(nomes) : "…"}`
  const regra = [
    f.data === "periodo" ? `de ${quando(f.de)} até ${quando(f.ate)}` : "sem data de fim",
    ...(f.promocional ? [] : ["fora do preço promocional"]),
  ].join(" · ")
  return `${conta} ${onde} · ${regra}`
}

/**
 * "A cada 3 unidades, 2 são pagas e a mais barata sai de graça." — a conta
 * do Medusa em uma frase, embaixo do "Comprando" e do "Pague".
 */
export function contaEmFrase(f: Pick<FormularioDaPromocao, "comprando" | "pague">): string {
  const comprando = inteiro(f.comprando)
  const pague = inteiro(f.pague)
  if (comprando === null || pague === null || pague < 1 || pague >= comprando)
    return "Levando mais do que paga: as que sobram, as mais baratas, saem de graça."
  const gratis = comprando - pague
  return (
    `A cada ${comprando} unidades, ${pague} ${pague === 1 ? "é paga" : "são pagas"} e ` +
    (gratis === 1 ? "a mais barata sai de graça." : `as ${gratis} mais baratas saem de graça.`)
  )
}
