import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { AVALIACOES } from "../../modules/avaliacoes"
import type AvaliacoesService from "../../modules/avaliacoes/service"
import { NEWSLETTER } from "../../modules/newsletter"
import type NewsletterService from "../../modules/newsletter/service"
import { precosDasVariantes } from "../avise-me"
import {
  PRODUTOS_DAS_TRILHAS,
  semMarcas,
  type ConteudoDoProduto,
  type TrilhaDoEmail,
} from "../emails/boas-vindas"
import { lerPdp } from "../pdp"
import { TRILHAS_ESCOLHIDAS, type TrilhaEscolhida } from "./escolha"
import { trilhaDaPagina } from "./primeira-compra"

/**
 * O QUE A SEQUÊNCIA DAS BOAS-VINDAS LÊ DO BANCO (entrega 0178) — o texto da
 * página de cada produto das trilhas (`fb_pdp`), as avaliações aprovadas do
 * Fator e o nome e a página de quem se cadastrou. Quem monta o e-mail é
 * `emailDaTrilha` (`lib/emails/boas-vindas.ts`); quem manda é o motor.
 */

/** O nome curto de cada produto na frase, com o artigo. O que não está aqui usa o título. */
const CURTOS: Record<string, { curto: string; artigo: "o" | "a" }> = {
  "fator-de-crescimento-para-barba": { curto: "Fator de Crescimento", artigo: "o" },
  "kit-completo-para-barba": { curto: "Kit Completo", artigo: "o" },
  "oleo-para-barba": { curto: "óleo", artigo: "o" },
  "balm-para-barba": { curto: "balm", artigo: "o" },
  "shampoo-para-barba": { curto: "shampoo", artigo: "o" },
  "pasta-modeladora-matte-80g-fucking-barba": { curto: "pasta matte", artigo: "a" },
  "pasta-modeladora-brilho-80g-fucking-barba": { curto: "pasta brilho", artigo: "a" },
  "spray-modelador-matte-100ml-fucking-barba": { curto: "spray modelador", artigo: "o" },
}

/**
 * A trilha de cada pessoa, na hora do e-mail: a que ela escolheu no "Barba ou
 * cabelo?" vale mais; depois, a da página em que ela se cadastrou.
 */
export function trilhaDaPessoa({
  escolha,
  pagina,
}: {
  escolha: string | null
  pagina: string | null
}): { trilha: TrilhaDoEmail; visto: string | null } {
  if (escolha && TRILHAS_ESCOLHIDAS.includes(escolha as TrilhaEscolhida))
    return { trilha: escolha as TrilhaEscolhida, visto: null }
  const { trilha, produto } = trilhaDaPagina(pagina)
  return { trilha, visto: produto }
}

/** O conteúdo dos produtos das trilhas (e dos que as pessoas viram), pelo endereço. */
export async function conteudosDasTrilhas(
  container: MedusaContainer,
  vistos: readonly string[]
): Promise<{
  conteudos: Map<string, ConteudoDoProduto>
  depoimentos: { texto: string; quem: string; estrelas: number }[]
}> {
  const handles = [...new Set([...Object.values(PRODUTOS_DAS_TRILHAS), ...vistos])]
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "product",
    fields: ["id", "title", "handle", "thumbnail", "metadata", "variants.id"],
    filters: { handle: handles, status: "published" },
  })
  const produtos = data as {
    id: string
    title?: string | null
    handle: string
    thumbnail?: string | null
    metadata?: Record<string, unknown> | null
    variants?: { id: string }[] | null
  }[]
  const precos = await precosDasVariantes(
    container,
    produtos.flatMap((p) => (p.variants?.[0]?.id ? [p.variants[0].id] : []))
  )
  const conteudos = new Map<string, ConteudoDoProduto>()
  for (const p of produtos) {
    const preco = p.variants?.[0]?.id ? precos.get(p.variants[0].id) : undefined
    const nome = (p.title ?? "").trim() || p.handle
    const { conteudo: c } = lerPdp(p.metadata)
    const limpa = (lista: string[]) => lista.map(semMarcas).filter(Boolean)
    conteudos.set(p.handle, {
      produto: {
        nome,
        handle: p.handle,
        imagem: p.thumbnail ?? null,
        preco: preco?.preco ?? null,
        precoCheio: preco?.precoCheio ?? null,
      },
      ...(CURTOS[p.handle] ?? { curto: nome, artigo: "o" }),
      tempo: c.tempo?.passos.length
        ? {
            titulo: semMarcas(c.tempo.titulo),
            passos: c.tempo.passos.map((x) => semMarcas(`${x.quando} · ${x.titulo}`)),
          }
        : null,
      uso: c.funciona?.usoPassos.length
        ? {
            titulo: semMarcas(c.funciona.usoTitulo),
            passos: limpa(c.funciona.usoPassos),
            dica: c.funciona.dica ? semMarcas(c.funciona.dica) : null,
          }
        : null,
      duvidas: c.duvidas?.perguntas.length
        ? {
            titulo: semMarcas(c.duvidas.titulo),
            perguntas: c.duvidas.perguntas.map((q) => ({
              pergunta: semMarcas(q.pergunta),
              resposta: limpa(q.resposta).join(" "),
            })),
          }
        : null,
      promessa: c.promessa?.itens.length
        ? { titulo: semMarcas(c.promessa.titulo), itens: limpa(c.promessa.itens) }
        : null,
    })
  }
  // As avaliações aprovadas do Fator, de 4 e 5 estrelas, as mais novas primeiro.
  const fator = produtos.find((p) => p.handle === PRODUTOS_DAS_TRILHAS.fator)
  const avaliacoes = fator
    ? ((await container
        .resolve<AvaliacoesService>(AVALIACOES)
        .listAvaliacoes(
          { produto_id: fator.id, situacao: "aprovada" },
          { select: ["nome", "nota", "texto"], order: { created_at: "DESC" }, take: 20 }
        )
        .catch(() => [])) as { nome: string; nota: number; texto: string }[])
    : []
  return {
    conteudos,
    depoimentos: avaliacoes
      .filter((a) => a.nota >= 4 && a.texto.trim())
      .slice(0, 2)
      .map((a) => ({ texto: a.texto.trim(), quem: a.nome, estrelas: a.nota })),
  }
}

/** O nome e a página de quem se cadastrou no pop-up, pelo e-mail (a newsletter guarda). */
export async function cadastrosDaNewsletter(
  container: MedusaContainer,
  emails: readonly string[]
): Promise<Map<string, { nome: string | null; pagina: string | null }>> {
  if (!emails.length) return new Map()
  const inscricoes = await container
    .resolve<NewsletterService>(NEWSLETTER)
    .listInscricoes({ email: [...emails] }, { take: emails.length })
  return new Map(
    inscricoes.map((i) => [i.email, { nome: i.nome ?? null, pagina: i.pagina ?? null }])
  )
}
