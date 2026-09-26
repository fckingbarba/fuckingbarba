import {
  ApplicationMethodAllocation,
  ApplicationMethodTargetType,
  ApplicationMethodType,
  MedusaError,
  PromotionStatus,
  PromotionType,
} from "@medusajs/framework/utils"
import { somaDosProdutos, type LinhaDoCarrinho } from "../modules/frenet/client"
import { PREFIXO_DO_BUMP } from "./bumps"
import type { PoliticaDeFrete } from "./configuracoes"

/**
 * OS CUPONS DA LOJA — o que o painel cria, e as regras que o Medusa confere
 * no carrinho.
 *
 * Cupom é uma PROMOÇÃO DO MEDUSA com código: quem aplica e quem recusa é o
 * Medusa, quando a pessoa digita o código no checkout (a loja só pergunta e
 * mostra a resposta — `apps/loja/src/lib/acoes/checkout.ts`). O limite de
 * usos no total é o do próprio Medusa (`limit`, contado no pedido feito).
 *
 * O FORMULÁRIO É O DA NUVEMSHOP (pedido do dono em 26/09, com o print do
 * "Criar cupom" de lá, entrega 0128): o tipo (porcentagem, valor fixo ou
 * frete grátis — este também só na opção de envio mais barata), a quem vale
 * (a loja toda, categorias ou produtos) e os limites de uso: combinar com
 * outras promoções, por cupom, por cliente (limitado ou só na primeira
 * compra), o período (começo e fim, com hora) e o valor do carrinho. Ficam
 * de fora o "incluir o custo de envio no desconto" e o "valor máximo de
 * desconto": uma promoção do Medusa desconta OU os produtos OU o frete, e a
 * porcentagem dele não tem teto.
 *
 * ┌─ AS REGRAS QUE O MEDUSA NÃO TEM, COMO REGRAS DO MEDUSA ────────────────┐
 * │ Valor do carrinho, período, "por cliente", "primeira compra", "só com  │
 * │ produtos de" e "combinar" não existem prontos. O gancho                │
 * │ `setPromotionContext` (`workflows/hooks/contexto-dos-cupons.ts`) põe   │
 * │ no contexto do carrinho o que falta (`contextoDosCupons`): a soma dos  │
 * │ produtos, a hora, os produtos e as categorias do carrinho, se ele já   │
 * │ ganhou o frete da loja, e — pelo e-mail — quantos pedidos a pessoa já  │
 * │ fez e quantas vezes usou cada código. O cupom nasce com regras comuns  │
 * │ sobre esses campos (`regrasDoCupom`), e o Medusa confere do jeito de   │
 * │ sempre, a cada mudança no carrinho: o cupom que deixou de valer sai    │
 * │ sozinho (o e-mail preenchido depois, o produto tirado da sacola).      │
 * │                                                                        │
 * │ Sem o e-mail, "por cliente" e "primeira compra" deixam aplicar — e o   │
 * │ Medusa confere de novo quando o e-mail chega. O "uma vez por atributo" │
 * │ do próprio Medusa não serve: sem e-mail no carrinho, ele derruba a     │
 * │ conta inteira do carrinho com erro.                                    │
 * │                                                                        │
 * │ Toda condição vem com uma regra a mais: `conferido = "sim"`, que o     │
 * │ gancho só põe quando leu tudo. Se a leitura falhar (ou se alguma       │
 * │ conta do Medusa rodar sem o gancho), cupom com condição não vale: o    │
 * │ Medusa lê número que falta como zero, e o "vale até" passaria sozinho. │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * "Só com produtos de" é como na Nuvemshop: o cupom só vale se TODOS os
 * produtos do carrinho forem das categorias (ou forem os produtos)
 * escolhidas. A regra é um "eq" sobre a lista do carrinho: no Medusa, "eq"
 * com lista quer dizer "todos estão entre os escolhidos".
 *
 * "Permitir combinar com outras promoções", desmarcado, também é como lá: o
 * cupom não desconta o produto que já está com preço promocional (a
 * promoção do painel, o desconto por quantidade) e não vale no pedido que
 * já ganhou o frete grátis da loja. O produto em promoção sai por uma regra
 * de ALVO (o gancho marca cada linha, `fb_promocional`); o frete, por uma
 * regra do carrinho. Carrinho só com produto em promoção: o cupom não tem o
 * que descontar, e não entra.
 *
 * UM CUPOM POR PEDIDO, como na Nuvemshop: o gancho `validate` recusa um
 * segundo código de campanha no mesmo carrinho (a oferta do checkout não
 * conta), e a loja troca um pelo outro quando a pessoa digita outro.
 *
 * O valor do carrinho mede como o frete grátis mede: preço dos produtos
 * vezes a quantidade, sem frete e sem desconto de cupom (`somaDosProdutos`).
 *
 * O que o painel mostra (o tipo, o valor, a quem vale, as datas) vai também
 * no `metadata.fb_cupom` da promoção: a lista não precisa desmontar as
 * regras. O cupom de antes da 0128 guardava `umaVezPorCliente` e o "vale
 * até" só com a data: `cupomGuardado` lê os dois.
 */

/* ── o contexto do carrinho ────────────────────────────────────────────── */

/** Os campos que o gancho põe no contexto, e que as regras dos cupons leem. */
export const CAMPOS_DO_CONTEXTO = {
  /** "sim" quando o gancho leu tudo — a trava de toda condição. */
  conferido: "fb_cupons.conferido",
  /** A soma dos produtos, em reais. */
  produtos: "fb_cupons.produtos",
  /** Quantos pedidos (não cancelados) esse e-mail já fez. */
  pedidos: "fb_cupons.pedidos",
  /** Os códigos que esse e-mail já usou (em pedido não cancelado) — o "uma vez" de antes da 0128. */
  usados: "fb_cupons.usados",
  /** Quantas vezes esse e-mail já usou cada código: a regra lê `fb_cupons.vezes.<CÓDIGO>`. */
  vezes: "fb_cupons.vezes",
  /** Agora, em milissegundos. */
  agora: "fb_cupons.agora",
  /** O produto de cada linha do carrinho. */
  produtosDoCarrinho: "fb_cupons.itens.produtos",
  /** As categorias dos produtos do carrinho (`SEM_CATEGORIA` pelo que não tem nenhuma). */
  categoriasDoCarrinho: "fb_cupons.itens.categorias",
  /** "sim" quando o pedido já ganhou o frete grátis (ou fixo) da loja, pelo valor. */
  freteDaLoja: "fb_cupons.frete_da_loja",
} as const

/**
 * A marca que o gancho põe em cada linha do carrinho: "sim" quando o produto
 * já está com preço promocional (o `compare_at_unit_price` acima do preço).
 * A regra de alvo do cupom que não combina lê `items.fb_promocional`.
 */
export const MARCA_DA_LINHA = "fb_promocional"

/** A categoria de quem não tem categoria: nunca está entre as escolhidas. */
export const SEM_CATEGORIA = "sem-categoria"

export type PedidoDoEmail = { status?: string | null; codigos: string[] }

/** A linha do carrinho como o gancho recebe — só o que as regras usam. */
export type ItemDoCarrinho = LinhaDoCarrinho & {
  product_id?: string | null
  compare_at_unit_price?: unknown
  product?: { id?: string | null; categories?: ({ id?: string | null } | null)[] | null } | null
}

export type ContextoDosCupons = {
  fb_cupons: {
    produtos: number
    agora: number
    itens: { produtos: string[]; categorias: string[] }
    frete_da_loja: "sim" | "nao"
    conferido?: "sim"
    pedidos?: number
    usados?: string[]
    vezes?: Record<string, number>
  }
}

/** O código da oferta do checkout (`lib/bumps.ts`): não é cupom de campanha. */
const ehDaOferta = (codigo: string) => codigo.toUpperCase().startsWith(PREFIXO_DO_BUMP)

/**
 * `pedidos: null` quer dizer "o histórico do e-mail não veio" (a consulta
 * falhou): o contexto sai sem ele e sem o `conferido`, e nenhum cupom com
 * condição vale nessa conta. Sem e-mail é outra coisa: lista vazia.
 *
 * `frete` é a política da loja (o frete grátis ou fixo pelo valor): `null`
 * quando ela não veio, e aí o pedido conta como se tivesse o frete da loja —
 * o cupom que não combina não vale nessa conta.
 */
export function contextoDosCupons({
  itens,
  pedidos,
  agora,
  frete = null,
}: {
  itens: ItemDoCarrinho[]
  pedidos: PedidoDoEmail[] | null
  agora: number
  frete?: PoliticaDeFrete | null
}): ContextoDosCupons {
  const produtos = somaDosProdutos(itens)
  const produtosDoCarrinho = itens
    .map((i) => i.product?.id ?? i.product_id ?? "")
    .filter((id): id is string => Boolean(id))
  const categorias = itens.flatMap((i) => {
    const ids = (i.product?.categories ?? [])
      .map((c) => c?.id ?? "")
      .filter((id): id is string => Boolean(id))
    return ids.length ? ids : [SEM_CATEGORIA]
  })
  const freteDaLoja = frete === null || (frete.modo !== "nenhuma" && produtos >= frete.piso)
  const base = {
    produtos,
    agora,
    itens: { produtos: [...new Set(produtosDoCarrinho)], categorias: [...new Set(categorias)] },
    frete_da_loja: (freteDaLoja ? "sim" : "nao") as "sim" | "nao",
  }
  if (!pedidos) return { fb_cupons: base }
  const valendo = pedidos.filter((p) => p.status !== "canceled")
  const vezes: Record<string, number> = {}
  for (const p of valendo)
    for (const c of new Set(p.codigos.map((c) => c.toUpperCase()))) vezes[c] = (vezes[c] ?? 0) + 1
  return {
    fb_cupons: {
      ...base,
      conferido: "sim",
      pedidos: valendo.length,
      usados: Object.keys(vezes),
      vezes,
    },
  }
}

/**
 * As linhas do carrinho com a marca do preço promocional (`MARCA_DA_LINHA`),
 * pro gancho devolver no lugar das do carrinho: o resto de cada linha fica
 * como veio (é o mesmo objeto, espalhado).
 */
export function linhasMarcadas<T extends ItemDoCarrinho>(
  itens: T[]
): (T & { [MARCA_DA_LINHA]: "sim" | "nao" })[] {
  return itens.map((i) => ({
    ...i,
    [MARCA_DA_LINHA]:
      Number(i.compare_at_unit_price ?? 0) > Number(i.unit_price ?? 0) ? "sim" : "nao",
  })) as (T & { [MARCA_DA_LINHA]: "sim" | "nao" })[]
}

/**
 * UM CUPOM POR PEDIDO: `null` se pode, ou o código que já está no carrinho.
 * Só quando alguém PÕE um código (`add`, o que a API da loja faz): a conta
 * do Medusa refaz as promoções a cada mudança com `replace`, e um carrinho
 * que (de antes da regra) tivesse dois cupons não pode travar.
 */
export function outroCupomNoCarrinho(
  atuais: (string | null | undefined)[],
  novos: string[],
  acao: string | undefined
): string | null {
  if (acao && acao !== "add") return null
  const campanha = (c: string | null | undefined): c is string => Boolean(c) && !ehDaOferta(c!)
  const novosDeCampanha = new Set(novos.filter(campanha).map((c) => c.toUpperCase()))
  if (!novosDeCampanha.size) return null
  if (novosDeCampanha.size > 1) return [...novosDeCampanha][0]
  return atuais.filter(campanha).find((c) => !novosDeCampanha.has(c.toUpperCase())) ?? null
}

/* ── o cupom novo ──────────────────────────────────────────────────────── */

export type TipoDeCupom = "porcento" | "reais" | "frete"
export type Alcance = "loja" | "categorias" | "produtos"
export type Alvo = { id: string; nome: string }
/** O que o formulário escolhe: as categorias e os produtos da loja. */
export type Catalogo = { categorias: Alvo[]; produtos: Alvo[] }

export type CupomNovo = {
  codigo: string
  tipo: TipoDeCupom
  /** 10 (%), ou 20 (R$); 0 no frete grátis. */
  valor: number
  /** Frete grátis só na opção de envio de menor custo (a econômica). */
  soMaisBarato: boolean
  /** A quem vale: a loja toda, ou só carrinho com produtos das categorias / dos produtos. */
  aplicarA: Alcance
  /** As categorias ou os produtos escolhidos (vazio na loja toda). */
  alvos: Alvo[]
  /** Permitir combinar com outras promoções (preço promocional, frete grátis, oferta do checkout). */
  combina: boolean
  /** Usos no total; `null` = ilimitado. */
  limite: number | null
  /** Usos por cliente, pelo e-mail; `null` = ilimitado. */
  porCliente: number | null
  /** Só pra quem nunca comprou (pelo e-mail). */
  primeiraCompra: boolean
  /** "2026-10-01T00:00", em Brasília; `null` = já vale. */
  de: string | null
  /** "2026-10-15T23:59", em Brasília; `null` = sem fim. O de antes da 0128: "2026-10-15". */
  ate: string | null
  /** Valor do carrinho, acima de (em produtos, sem frete); `null` = qualquer. */
  minimo: number | null
}

/** O que o painel guarda na promoção, pra mostrar sem desmontar as regras. */
export type CupomGuardado = Omit<CupomNovo, "codigo">

const CODIGO = /^[A-Z0-9][A-Z0-9_-]{2,29}$/
const DATA_E_HORA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

/** "barba 20" → "BARBA20": o código como o Medusa guarda (a loja tenta as três caixas). */
export const normalizarCodigo = (v: unknown) =>
  typeof v === "string" ? v.replace(/\s+/g, "").toUpperCase() : ""

/** "R$ 1.234,56" → 1234.56. Também serve às configurações (`lib/painel/configuracoes.ts`). */
export const numeroBrasileiro = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  if (typeof v !== "string" || !v.trim()) return null
  // "R$ 1.234,56" e "99,90": a vírgula é o decimal.
  const limpo = v
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".")
  const n = Number(limpo)
  return Number.isFinite(n) ? n : null
}

/** "2026-09-25" em Brasília. */
export const hojeEmBrasilia = (agora: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora)

/** O fim do dia, em Brasília (o Brasil não tem mais horário de verão). */
export const fimDoDia = (ate: string) => new Date(`${ate}T23:59:59.999-03:00`).getTime()

/** O começo do cupom, em milissegundos: "2026-10-01T00:00" em Brasília. */
export const inicioDe = (de: string) => new Date(`${de}:00.000-03:00`).getTime()

/** O fim do cupom: o minuto inteiro ("…T23:59" vale até 23:59:59,999); a data sozinha, o dia. */
export const fimDe = (ate: string) =>
  ate.length === 10 ? fimDoDia(ate) : new Date(`${ate}:59.999-03:00`).getTime()

export type Leitura = { ok: true; cupom: CupomNovo } | { ok: false; erros: Record<string, string> }

const inteiro = (n: number | null) => n !== null && Number.isInteger(n) && n >= 1 && n <= 1_000_000

/**
 * O que chegou do formulário do painel: o cupom, ou o que está errado em
 * cada campo. As categorias e os produtos são conferidos no `catalogo` (e
 * ganham o nome dele).
 *
 * Aceita também o formulário de antes da 0128 (o painel e o backend sobem
 * em horas diferentes): `limite` sem `porCupom`, `umaVezPorCliente` e o
 * "vale até" só com a data.
 */
export function lerCupomNovo(
  v: unknown,
  agora: Date,
  catalogo: Catalogo = { categorias: [], produtos: [] }
): Leitura {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>
  const erros: Record<string, string> = {}

  const codigo = normalizarCodigo(o.codigo)
  if (!CODIGO.test(codigo)) erros.codigo = "Use letras, números, hífen e _: de 3 a 30."
  else if (codigo.startsWith(PREFIXO_DO_BUMP))
    erros.codigo = `"${PREFIXO_DO_BUMP}" é das ofertas do checkout: escolha outro começo.`

  const tipo: TipoDeCupom | null =
    o.tipo === "porcento" || o.tipo === "reais" || o.tipo === "frete" ? o.tipo : null
  if (!tipo) erros.tipo = "Escolha o tipo."

  const valor = tipo === "frete" ? 0 : numeroBrasileiro(o.valor)
  if (
    tipo === "porcento" &&
    (valor === null || !Number.isInteger(valor) || valor < 1 || valor > 100)
  )
    erros.valor = "De 1 a 100, sem vírgula."
  if (tipo === "reais" && (valor === null || valor <= 0 || valor > 10_000))
    erros.valor = "Um valor em reais, maior que zero."

  const aplicarA: Alcance =
    o.aplicarA === "categorias" || o.aplicarA === "produtos" ? o.aplicarA : "loja"
  const ids = [
    ...new Set((Array.isArray(o.alvos) ? o.alvos : []).filter((x) => typeof x === "string")),
  ] as string[]
  const opcoes = aplicarA === "categorias" ? catalogo.categorias : catalogo.produtos
  const alvos =
    aplicarA === "loja" ? [] : opcoes.filter((a) => ids.includes(a.id)).map((a) => ({ ...a }))
  if (aplicarA !== "loja" && !ids.length)
    erros.alvos =
      aplicarA === "categorias"
        ? "Escolha pelo menos uma categoria."
        : "Escolha pelo menos um produto."
  else if (aplicarA !== "loja" && alvos.length !== ids.length)
    erros.alvos = "Alguma escolha não existe mais na loja: recarregue a página."

  // Por cupom: "ilimitado" | "limitado" (o formulário de antes: só o `limite`).
  const limite = o.porCupom === "ilimitado" ? null : numeroBrasileiro(o.limite)
  if (o.porCupom === "limitado" && limite === null) erros.limite = "Quantos usos, no total?"
  else if (limite !== null && !inteiro(limite)) erros.limite = "Um número inteiro, de 1 pra cima."

  // Por cliente: "ilimitado" | "limitado" | "primeira" (o de antes: as duas caixinhas).
  let porCliente: number | null = null
  let primeiraCompra = false
  if (o.porCliente === "limitado") {
    porCliente = numeroBrasileiro(o.usosPorCliente)
    if (!inteiro(porCliente)) erros.usosPorCliente = "Quantas vezes cada cliente: de 1 pra cima."
  } else if (o.porCliente === "primeira") primeiraCompra = true
  else if (o.porCliente === undefined) {
    porCliente = o.umaVezPorCliente === true ? 1 : null
    primeiraCompra = o.primeiraCompra === true
  }

  // Data: "ilimitado" | "periodo" (o de antes: só o `ate`, uma data).
  let de: string | null = null
  let ate: string | null = null
  if (o.data === "periodo") {
    de = typeof o.de === "string" ? o.de.trim() : ""
    ate = typeof o.ate === "string" ? o.ate.trim() : ""
    if (!DATA_E_HORA.test(de) || Number.isNaN(inicioDe(de))) erros.de = "O começo: data e hora."
    if (!DATA_E_HORA.test(ate) || Number.isNaN(fimDe(ate))) erros.ate = "O fim: data e hora."
    else if (fimDe(ate) < agora.getTime()) erros.ate = "Esse fim já passou."
    else if (!erros.de && fimDe(ate) <= inicioDe(de))
      erros.ate = "O fim tem que ser depois do começo."
  } else if (o.data === undefined && typeof o.ate === "string" && o.ate.trim()) {
    ate = o.ate.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ate) || Number.isNaN(fimDoDia(ate))) erros.ate = "Uma data."
    else if (ate < hojeEmBrasilia(agora)) erros.ate = "Essa data já passou."
  }

  const minimo = numeroBrasileiro(o.minimo)
  if (minimo !== null && (minimo < 0 || minimo > 100_000)) erros.minimo = "Um valor em reais."
  if (tipo === "reais" && valor !== null && minimo !== null && minimo > 0 && minimo < valor)
    erros.minimo = "O valor do carrinho tem que ser maior que o desconto."

  if (Object.keys(erros).length) return { ok: false, erros }
  return {
    ok: true,
    cupom: {
      codigo,
      tipo: tipo!,
      valor: tipo === "reais" ? Math.round(valor! * 100) / 100 : valor!,
      soMaisBarato: tipo === "frete" && o.soMaisBarato === true,
      aplicarA,
      alvos,
      combina: o.combina !== false,
      limite,
      porCliente,
      primeiraCompra,
      de: de || null,
      ate: ate || null,
      minimo: minimo && minimo > 0 ? Math.round(minimo * 100) / 100 : null,
    },
  }
}

export type RegraDoCupom = {
  attribute: string
  operator: "gte" | "lte" | "lt" | "ne" | "eq"
  values: string[]
}

/**
 * As regras do cupom, sobre os campos do gancho (`CAMPOS_DO_CONTEXTO`). Com
 * alguma condição, vai junto a trava do `conferido`; sem nenhuma, nenhuma
 * regra.
 */
export function regrasDoCupom(c: CupomNovo): RegraDoCupom[] {
  const R = CAMPOS_DO_CONTEXTO
  const condicoes: RegraDoCupom[] = [
    ...(c.minimo
      ? [{ attribute: R.produtos, operator: "gte" as const, values: [String(c.minimo)] }]
      : []),
    ...(c.de
      ? [{ attribute: R.agora, operator: "gte" as const, values: [String(inicioDe(c.de))] }]
      : []),
    ...(c.ate
      ? [{ attribute: R.agora, operator: "lte" as const, values: [String(fimDe(c.ate))] }]
      : []),
    ...(c.porCliente
      ? [
          {
            attribute: `${R.vezes}.${c.codigo}`,
            operator: "lt" as const,
            values: [String(c.porCliente)],
          },
        ]
      : []),
    ...(c.primeiraCompra ? [{ attribute: R.pedidos, operator: "eq" as const, values: ["0"] }] : []),
    ...(c.aplicarA !== "loja"
      ? [
          {
            attribute: c.aplicarA === "produtos" ? R.produtosDoCarrinho : R.categoriasDoCarrinho,
            operator: "eq" as const,
            values: c.alvos.map((a) => a.id),
          },
        ]
      : []),
    ...(!c.combina ? [{ attribute: R.freteDaLoja, operator: "eq" as const, values: ["nao"] }] : []),
  ]
  return condicoes.length
    ? [{ attribute: R.conferido, operator: "eq", values: ["sim"] }, ...condicoes]
    : []
}

/**
 * A promoção do Medusa pro cupom: código, ativa, sem ser automática (só vale
 * digitada), o limite de usos, o desconto e as regras.
 *
 * Porcentagem: sobre a soma dos produtos, dividida entre eles (o "cada
 * produto" do Medusa 2.21 pede um teto de unidades, e dá no mesmo); não pega
 * o frete. Reais: sobre o pedido, dividido entre os produtos. Frete grátis:
 * 100% do frete — de qualquer opção, ou só das `maisBaratas` (os ids da
 * entrega econômica, que a rota acha pela `faixa`). O que não combina com
 * outras promoções não desconta o produto em promoção (regra de alvo).
 */
export function promocaoDoCupom(
  c: CupomNovo,
  quem: string,
  agora: Date,
  maisBaratas: string[] = []
) {
  if (c.tipo === "frete" && c.soMaisBarato && !maisBaratas.length)
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "frete grátis na opção mais barata sem a opção mais barata"
    )
  const guardado: CupomGuardado = {
    tipo: c.tipo,
    valor: c.valor,
    soMaisBarato: c.soMaisBarato,
    aplicarA: c.aplicarA,
    alvos: c.alvos,
    combina: c.combina,
    limite: c.limite,
    porCliente: c.porCliente,
    primeiraCompra: c.primeiraCompra,
    de: c.de,
    ate: c.ate,
    minimo: c.minimo,
  }
  const semPromocao = c.combina
    ? []
    : [{ attribute: `items.${MARCA_DA_LINHA}`, operator: "eq", values: ["nao"] }]
  return {
    code: c.codigo,
    type: PromotionType.STANDARD,
    status: PromotionStatus.ACTIVE,
    is_automatic: false,
    ...(c.limite ? { limit: c.limite } : {}),
    application_method:
      c.tipo === "porcento"
        ? {
            type: ApplicationMethodType.PERCENTAGE,
            target_type: ApplicationMethodTargetType.ITEMS,
            allocation: ApplicationMethodAllocation.ACROSS,
            value: c.valor,
            target_rules: semPromocao,
          }
        : c.tipo === "reais"
          ? {
              type: ApplicationMethodType.FIXED,
              target_type: ApplicationMethodTargetType.ORDER,
              allocation: ApplicationMethodAllocation.ACROSS,
              value: c.valor,
              currency_code: "brl",
              ...(semPromocao.length ? { target_rules: semPromocao } : {}),
            }
          : {
              type: ApplicationMethodType.PERCENTAGE,
              target_type: ApplicationMethodTargetType.SHIPPING_METHODS,
              allocation: ApplicationMethodAllocation.ACROSS,
              value: 100,
              target_rules: c.soMaisBarato
                ? [
                    {
                      attribute: "shipping_methods.shipping_option_id",
                      operator: "in",
                      values: maisBaratas,
                    },
                  ]
                : [],
            },
    rules: regrasDoCupom(c),
    metadata: { fb_cupom: { ...guardado, criadoPor: quem, criadoEm: agora.toISOString() } },
  }
}

/* ── a lista ───────────────────────────────────────────────────────────── */

/** A promoção como o Medusa devolve — só o que a lista usa. */
export type PromocaoCrua = {
  id: string
  code?: string | null
  status?: string | null
  is_automatic?: boolean | null
  limit?: number | null
  used?: number | null
  created_at?: string | Date | null
  metadata?: Record<string, unknown> | null
  application_method?: {
    type?: string | null
    target_type?: string | null
    value?: unknown
  } | null
}

/** O que os pedidos dizem de um cupom: quantos, quanto de desconto, quanto venderam. */
export type UsoDoCupom = { pedidos: number; desconto: number; vendeu: number }

export type Situacao = "valendo" | "agendado" | "pausado" | "vencido" | "esgotado"

export type CupomNaLista = {
  id: string
  codigo: string
  /** "15% em pedidos a partir de R$ 99,90" */
  descricao: string
  /** "até 30/09 · 100 usos no total · uma vez por cliente" */
  regra: string
  /** "23 de 100 usos" */
  usos: string
  situacao: Situacao
  /** Pode ligar e desligar: o vencido e o esgotado não voltam pela chave. */
  ligado: boolean
  pedidos: number
  desconto: number
  vendeu: number
}

const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const reais = (v: number) => REAIS.format(v).replace(/\s/g, " ")
const diaCurto = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
/** "15/10" (a data sozinha) ou "15/10 às 18:00". */
const quando = (d: string) =>
  d.length === 10 ? diaCurto(d) : `${diaCurto(d)} às ${d.slice(11, 16)}`

const alvosValidos = (v: unknown): Alvo[] =>
  Array.isArray(v)
    ? v
        .filter(
          (a): a is Alvo => Boolean(a) && typeof a.id === "string" && typeof a.nome === "string"
        )
        .map((a) => ({ id: a.id, nome: a.nome }))
    : []

/** O cupom guardado pelo painel (o de antes da 0128 também); o do script sai da promoção. */
export function cupomGuardado(p: PromocaoCrua): CupomGuardado {
  const g = (p.metadata?.fb_cupom ?? null) as
    (Partial<Record<keyof CupomGuardado, unknown>> & { umaVezPorCliente?: unknown }) | null
  const limite = typeof p.limit === "number" ? p.limit : null
  if (
    g &&
    (g.tipo === "porcento" || g.tipo === "reais" || g.tipo === "frete") &&
    typeof g.valor === "number"
  )
    return {
      tipo: g.tipo,
      valor: g.valor,
      soMaisBarato: g.soMaisBarato === true,
      aplicarA: g.aplicarA === "categorias" || g.aplicarA === "produtos" ? g.aplicarA : "loja",
      alvos: alvosValidos(g.alvos),
      combina: g.combina !== false,
      limite,
      porCliente:
        typeof g.porCliente === "number" ? g.porCliente : g.umaVezPorCliente === true ? 1 : null,
      primeiraCompra: g.primeiraCompra === true,
      de: typeof g.de === "string" ? g.de : null,
      ate: typeof g.ate === "string" ? g.ate : null,
      minimo: typeof g.minimo === "number" ? g.minimo : null,
    }
  const frete = p.application_method?.target_type === ApplicationMethodTargetType.SHIPPING_METHODS
  return {
    tipo: frete ? "frete" : p.application_method?.type === "fixed" ? "reais" : "porcento",
    valor: frete ? 0 : Number(p.application_method?.value ?? 0),
    soMaisBarato: false,
    aplicarA: "loja",
    alvos: [],
    combina: true,
    limite,
    porCliente: null,
    primeiraCompra: false,
    de: null,
    ate: null,
    minimo: null,
  }
}

/** "Óleo" · "Óleo ou Balm" · "Óleo, Balm ou Shampoo" · "Óleo, Balm e mais 3". */
function emLista(nomes: string[]): string {
  if (nomes.length <= 1) return nomes[0] ?? ""
  if (nomes.length <= 3) return `${nomes.slice(0, -1).join(", ")} ou ${nomes[nomes.length - 1]}`
  return `${nomes.slice(0, 2).join(", ")} e mais ${nomes.length - 2}`
}

/**
 * "10% em qualquer pedido" · "R$ 20,00 de desconto em pedidos a partir de
 * R$ 150,00" · "Frete grátis na opção mais barata em qualquer pedido" ·
 * "15% só com produtos de Kits, em pedidos a partir de R$ 99,90"
 */
export function descricaoDoCupom(
  c: Pick<CupomGuardado, "tipo" | "valor" | "minimo"> &
    Partial<Pick<CupomGuardado, "soMaisBarato" | "aplicarA" | "alvos">>
): string {
  const quanto =
    c.tipo === "porcento"
      ? `${c.valor}%`
      : c.tipo === "reais"
        ? `${reais(c.valor)} de desconto`
        : c.soMaisBarato
          ? "Frete grátis na opção mais barata"
          : "Frete grátis"
  const nomes = (c.alvos ?? []).map((a) => a.nome)
  const onde =
    c.aplicarA === "categorias" && nomes.length
      ? `só com produtos de ${emLista(nomes)}`
      : c.aplicarA === "produtos" && nomes.length
        ? `só com ${emLista(nomes)}`
        : null
  const minimo = c.minimo ? `em pedidos a partir de ${reais(c.minimo)}` : null
  if (onde) return minimo ? `${quanto} ${onde}, ${minimo}` : `${quanto} ${onde}`
  return `${quanto} ${minimo ?? "em qualquer pedido"}`
}

/**
 * "de 01/10 às 00:00 até 15/10 às 23:59 · 200 usos no total · 2 vezes por
 * cliente · só na primeira compra · não combina com outras promoções"
 */
export function regraDoCupom(
  c: Pick<CupomGuardado, "ate" | "limite" | "primeiraCompra"> &
    Partial<Pick<CupomGuardado, "de" | "porCliente" | "combina">>
): string {
  const periodo =
    c.de && c.ate
      ? `de ${quando(c.de)} até ${quando(c.ate)}`
      : c.de
        ? `a partir de ${quando(c.de)}`
        : c.ate
          ? `até ${quando(c.ate)}`
          : "sem data de fim"
  const porCliente = c.porCliente ?? null
  return [
    periodo,
    ...(c.limite ? [`${c.limite} ${c.limite === 1 ? "uso" : "usos"} no total`] : []),
    ...(porCliente
      ? [porCliente === 1 ? "uma vez por cliente" : `${porCliente} vezes por cliente`]
      : []),
    ...(c.primeiraCompra ? ["só na primeira compra"] : []),
    ...(c.combina === false ? ["não combina com outras promoções"] : []),
  ].join(" · ")
}

/** Os cupons de campanha: com código, digitados — nem os da oferta do checkout, nem automáticos. */
export const ehCupomDeCampanha = (p: PromocaoCrua) =>
  Boolean(p.code) && !p.is_automatic && !String(p.code).startsWith(PREFIXO_DO_BUMP)

export function cupomNaLista(p: PromocaoCrua, uso: UsoDoCupom, agora: Date): CupomNaLista {
  const c = cupomGuardado(p)
  const usados = Number(p.used ?? 0)
  const pausado = p.status !== PromotionStatus.ACTIVE
  const vencido = c.ate !== null && fimDe(c.ate) < agora.getTime()
  const esgotado = c.limite !== null && usados >= c.limite
  const agendado = c.de !== null && inicioDe(c.de) > agora.getTime()
  return {
    id: p.id,
    codigo: String(p.code),
    descricao: descricaoDoCupom(c),
    regra: regraDoCupom(c),
    usos: c.limite ? `${usados} de ${c.limite} usos` : `${usados} ${usados === 1 ? "uso" : "usos"}`,
    situacao: vencido
      ? "vencido"
      : esgotado
        ? "esgotado"
        : pausado
          ? "pausado"
          : agendado
            ? "agendado"
            : "valendo",
    ligado: !pausado,
    ...uso,
  }
}

/**
 * O que os pedidos contam de cada código: em quantos pedidos (não
 * cancelados) ele entrou, quanto de desconto deu, e quanto esses pedidos
 * venderam (os pagos).
 */
export function usosPorCodigo(
  pedidos: {
    status?: string | null
    pago: boolean
    total: number
    ajustes: { code?: string | null; amount?: unknown }[]
  }[]
): Map<string, UsoDoCupom> {
  const mapa = new Map<string, UsoDoCupom>()
  for (const o of pedidos) {
    if (o.status === "canceled") continue
    const porCodigo = new Map<string, number>()
    for (const a of o.ajustes) {
      if (!a.code) continue
      const k = a.code.toUpperCase()
      porCodigo.set(k, (porCodigo.get(k) ?? 0) + Number(a.amount ?? 0))
    }
    for (const [codigo, desconto] of porCodigo) {
      const atual = mapa.get(codigo) ?? { pedidos: 0, desconto: 0, vendeu: 0 }
      mapa.set(codigo, {
        pedidos: atual.pedidos + 1,
        desconto: Math.round((atual.desconto + desconto) * 100) / 100,
        vendeu: Math.round((atual.vendeu + (o.pago ? o.total : 0)) * 100) / 100,
      })
    }
  }
  return mapa
}
