import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { CRM } from "../../modules/crm"
import type CrmService from "../../modules/crm/service"
import { normalizarEmail } from "../../modules/codigo/regras"
import { inscreverNaNewsletterWorkflow } from "../../workflows/newsletter/inscrever"
import { enviarEmail } from "../email"
import { PRODUTOS_DOS_EXEMPLOS } from "../emails/crm"
import { emailDaPrimeiraCompra, primeiroNome } from "../emails/boas-vindas"
import { urlDaLoja } from "../emails/moldura"
import { criarCupomDoFluxo } from "./cupom"
import { componentesDoProduto, type Componente } from "./etiquetas"
import { produtosPorEndereco } from "./exemplos-dos-emails"
import { lerConfigDosFluxos, PREFIXO_DO_CUPOM_DE_BOAS_VINDAS, validadeDoCupom } from "./fluxos"
import { comQuemManda, dadosDaLoja } from "./motor"
import { linksDeSair } from "./sair"

/**
 * O CADASTRO DO POP-UP DA 1ª COMPRA (entrega 0177) — o nome e o e-mail em
 * troca de um cupom. Quem chama é `POST /store/crm/primeira-compra`, pela
 * loja.
 *
 *   1. O fluxo Boas-vindas tem que estar ligado (CRM → Fluxos): desligado, o
 *      pop-up nem aparece.
 *   2. Um cupom por e-mail, pra sempre: quem já se cadastrou recebe o mesmo
 *      código de volta (ou "venceu"), e nenhum e-mail novo sai. Quem pede é
 *      o registro dos fluxos (`crm_envio`, fluxo "boas-vindas", toque
 *      "boas-vindas-agora", chave = o e-mail): duas chamadas juntas não
 *      criam dois cupons.
 *   3. Quem já comprou não ganha cupom — ele é só da primeira compra, e a
 *      regra do cupom (`primeiraCompra`) derrubaria no checkout. Entra na
 *      lista do mesmo jeito: disse sim às ofertas.
 *   4. O "sim" vai pra newsletter, com a origem "popup", o nome e a página.
 *   5. O cupom (`BEMVINDO-7KQ2MX`): o % dos fluxos (CRM → Fluxos), só na
 *      primeira compra, uma vez, e vale 3 dias.
 *   6. O e-mail sai na hora, com os produtos do que a pessoa estava vendo
 *      (a TRILHA). Sem grupo de controle e sem a regra da madrugada: foi a
 *      pessoa que pediu o cupom. O e-mail que já voltou ou marcou spam
 *      (`semEntrega`) não recebe — o código aparece na tela do mesmo jeito.
 *
 * As partes puras (ler o cadastro, a trilha, os produtos) têm testes.
 */

export type Trilha = "crescimento" | "cuidado" | "cabelo" | "geral"

/** Os produtos do e-mail de cada trilha, pelo endereço. O que a pessoa viu vem antes. */
export const PRODUTOS_DA_TRILHA: Record<Trilha, readonly string[]> = {
  crescimento: [
    "fator-de-crescimento-para-barba",
    "kit-fator-de-crescimento-para-barba-e-shampoo",
    "oleo-para-barba",
  ],
  cuidado: ["kit-completo-para-barba", "oleo-para-barba", "balm-para-barba"],
  cabelo: [
    "pasta-modeladora-matte-80g-fucking-barba",
    "pasta-modeladora-brilho-80g-fucking-barba",
    "spray-modelador-matte-100ml-fucking-barba",
  ],
  geral: PRODUTOS_DOS_EXEMPLOS,
}

export const TITULO_DA_TRILHA: Record<Trilha, string> = {
  crescimento: "Pra barba crescer",
  cuidado: "Pra cuidar da barba",
  cabelo: "Pro cabelo",
  geral: "Os mais pedidos",
}

/** A trilha pelo que o produto tem: o Fator manda; depois a barba; depois o cabelo. */
export function trilhaDosComponentes(componentes: readonly Componente[]): Trilha {
  if (componentes.includes("fator")) return "crescimento"
  if (componentes.some((c) => c === "oleo" || c === "shampoo" || c === "balm")) return "cuidado"
  if (componentes.some((c) => c === "spray" || c === "pasta")) return "cabelo"
  return "geral"
}

/**
 * A trilha pela página em que a pessoa se cadastrou: o produto que ela via,
 * ou a categoria "Para cabelo". A home, "Para barba" e "Kits" não dizem se é
 * crescer ou cuidar: ficam no geral.
 */
export function trilhaDaPagina(pagina: string | null): { trilha: Trilha; produto: string | null } {
  const produto = pagina ? (/^\/produtos\/([a-z0-9-]+)\/?$/.exec(pagina)?.[1] ?? null) : null
  if (produto) {
    const componentes = componentesDoProduto(produto).map((c) => c.componente)
    return { trilha: trilhaDosComponentes(componentes), produto }
  }
  if (pagina && /^\/para-cabelo(\/|$)/.test(pagina)) return { trilha: "cabelo", produto: null }
  return { trilha: "geral", produto: null }
}

/** Os três produtos do e-mail: o que a pessoa via primeiro, depois os da trilha. */
export function produtosDoEmail(trilha: Trilha, produto: string | null): string[] {
  const lista = produto ? [produto, ...PRODUTOS_DA_TRILHA[trilha]] : [...PRODUTOS_DA_TRILHA[trilha]]
  return [...new Set(lista)].slice(0, 3)
}

export type Cadastro = { nome: string; email: string; pagina: string | null }

export type LeituraDoCadastro =
  { ok: true; cadastro: Cadastro } | { ok: false; erro: "nome_invalido" | "email_invalido" }

/**
 * O corpo do pop-up (`{ nome, email, pagina }`), conferido: o nome com pelo
 * menos 2 letras e até 60 caracteres, o e-mail normalizado (`normalizarEmail`),
 * e a página só se for um caminho da loja (sem domínio nem busca).
 */
export function lerCadastro(corpo: unknown): LeituraDoCadastro {
  const c = (corpo ?? {}) as { nome?: unknown; email?: unknown; pagina?: unknown }
  const nome = typeof c.nome === "string" ? c.nome.replace(/\s+/g, " ").trim() : ""
  if (nome.length > 60 || (nome.match(/\p{L}/gu) ?? []).length < 2 || /[<>{}\[\]\\]/.test(nome))
    return { ok: false, erro: "nome_invalido" }
  const email = normalizarEmail(c.email)
  if (!email) return { ok: false, erro: "email_invalido" }
  const pagina =
    typeof c.pagina === "string" && /^\/[a-z0-9\-/]{0,120}$/.test(c.pagina) ? c.pagina : null
  return { ok: true, cadastro: { nome, email, pagina } }
}

export type ResultadoDoCadastro =
  | { tipo: "ok"; codigo: string; ate: Date; porcento: number; nome: string | null }
  /** Já tinha se cadastrado: o mesmo código (null se o primeiro cadastro ainda está saindo). */
  | { tipo: "ja-cadastrado"; codigo: string | null; ate: Date | null; nome: string | null }
  | { tipo: "ja-cliente"; nome: string | null }
  | { tipo: "desligado" }

/** Quantos pedidos (não cancelados) o e-mail já fez — a mesma conta do cupom de 1ª compra. */
async function jaComprou(container: MedusaContainer, email: string): Promise<boolean> {
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order",
    fields: ["id", "status"],
    filters: { email, is_draft_order: false },
  })
  return (data as { status?: string | null }[]).some((o) => o.status !== "canceled")
}

export async function cadastrarNaPrimeiraCompra(
  container: MedusaContainer,
  { nome, email, pagina }: Cadastro,
  agora = new Date()
): Promise<ResultadoDoCadastro> {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const lojas = await container
    .resolve(Modules.STORE)
    .listStores({}, { select: ["metadata"], take: 1 })
  const config = lerConfigDosFluxos(lojas[0]?.metadata)
  if (!config.fluxos["boas-vindas"].ligado) return { tipo: "desligado" }
  const primeiro = primeiroNome(nome)

  /* 1. já se cadastrou: o mesmo código, e nenhum e-mail novo */
  const crm = container.resolve<CrmService>(CRM)
  const doEmail = async () =>
    (await crm.registrosDosFluxos(new Date(0), [email])).find(
      (r) => r.fluxo === "boas-vindas" && r.toque === "boas-vindas-agora"
    )
  const antes = await doEmail()
  if (antes)
    return { tipo: "ja-cadastrado", codigo: antes.cupom, ate: antes.cupom_ate, nome: primeiro }

  /* 2. o "sim" das ofertas, com o nome e a página */
  await inscreverNaNewsletterWorkflow(container).run({
    input: { email, origem: "popup", nome, pagina },
  })

  /* 3. quem já comprou não ganha o cupom de primeira compra */
  if (await jaComprou(container, email)) return { tipo: "ja-cliente", nome: primeiro }

  /* 4. a reserva: duas chamadas juntas, um cupom só */
  const reserva = await crm.reservarToque({
    email,
    fluxo: "boas-vindas",
    chave: email,
    toque: "boas-vindas-agora",
    em: agora,
  })
  if (!reserva) {
    const outro = await doEmail()
    return {
      tipo: "ja-cadastrado",
      codigo: outro?.cupom ?? null,
      ate: outro?.cupom_ate ?? null,
      nome: primeiro,
    }
  }

  /* 5. o cupom — sem ele, a reserva sai e a pessoa tenta de novo */
  let cupom: { codigo: string; ate: Date; id: string }
  try {
    cupom = await criarCupomDoFluxo(container, {
      porcento: config.desconto,
      agora,
      validade: validadeDoCupom("boas-vindas"),
      prefixo: PREFIXO_DO_CUPOM_DE_BOAS_VINDAS,
      primeiraCompra: true,
      campanha: "CRM (boas-vindas)",
    })
  } catch (e) {
    await crm.desfazerToque(reserva)
    throw e
  }

  /* 6. o e-mail, na hora — se não sair, o código aparece na tela do mesmo jeito */
  let resendId: string | null = null
  const loja = urlDaLoja()
  const semEntrega = await crm.semEntrega([email])
  if (loja && !semEntrega.has(email)) {
    try {
      const { trilha, produto } = trilhaDaPagina(pagina)
      const handles = produtosDoEmail(trilha, produto)
      const [porEndereco, infoDaLoja] = await Promise.all([
        produtosPorEndereco(container, handles),
        dadosDaLoja(container, loja),
      ])
      const enviado = await enviarEmail(
        comQuemManda(
          emailDaPrimeiraCompra({
            para: email,
            nome,
            cupom: { codigo: cupom.codigo, porcento: config.desconto, ate: cupom.ate },
            tituloDosProdutos: TITULO_DA_TRILHA[trilha],
            produtos: handles.flatMap((h) => {
              const p = porEndereco.get(h)
              return p ? [p] : []
            }),
            sair: linksDeSair(loja, email),
            loja: infoDaLoja,
          })
        ),
        logger,
        { idempotencia: `crm-boas-vindas/${email}/agora`, tipo: "crm-boas-vindas" }
      )
      if (enviado.ok) resendId = enviado.id ?? null
      else logger.warn(`[crm] o e-mail do cupom da 1ª compra não saiu: ${enviado.motivo}`)
    } catch (e) {
      logger.warn(`[crm] o e-mail do cupom da 1ª compra não saiu: ${(e as Error).message}`)
    }
  }
  await crm.confirmarToque(reserva, { resendId, cupom: cupom.codigo, cupomAte: cupom.ate })
  return {
    tipo: "ok",
    codigo: cupom.codigo,
    ate: cupom.ate,
    porcento: config.desconto,
    nome: primeiro,
  }
}
