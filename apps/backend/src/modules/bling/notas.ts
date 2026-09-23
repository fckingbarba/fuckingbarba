import type {
  Acesso,
  EnderecoDaNota,
  EstadoDaNota,
  Passos,
  PedidoParaNota,
  ResultadoDaConsulta,
  ResultadoDaEmissao,
  ResultadoDoDesfazer,
  SituacaoNoErp,
} from "../../lib/erp/contrato"
import { chamarBling, ErroDoBling } from "./api"
import { produtosPorSku } from "./produtos"

/**
 * A NOTA FISCAL PELO BLING — o caminho que o próprio Bling recomenda:
 *
 *   1. o CLIENTE (contato), achado pelo CPF/CNPJ ou criado — e com o
 *      endereço em dia, porque é do contato que a nota tira o destinatário;
 *   2. o PEDIDO DE VENDA, com o nome da loja no `numeroLoja` ("FB-1042") —
 *      é ele que reserva o estoque no Bling;
 *   3. a NF-e, gerada do pedido (`gerar-nfe`), com a natureza de operação
 *      padrão da conta — é lá, e não aqui, que moram CFOP e impostos;
 *   4. a SEFAZ (`enviar`), sem o e-mail do Bling pro cliente.
 *
 * ┌─ UMA NOTA SÓ, MESMO QUE O SERVIDOR CAIA NO MEIO ───────────────────────┐
 * │ O Bling NÃO recusa um segundo pedido com o mesmo `numeroLoja`, e nota  │
 * │ duplicada é problema com a Receita. Então: cada passo é gravado na     │
 * │ hora (`salvar`); antes de criar o pedido, procura pelo `numeroLoja`;   │
 * │ antes de gerar a nota, pergunta ao pedido se ele já tem uma; e antes   │
 * │ de mandar pra SEFAZ, pergunta à nota se ela ainda está pendente — a    │
 * │ nota que já está na SEFAZ não vai de novo (reenvio demais BLOQUEIA a   │
 * │ nota no Bling).                                                        │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * CANCELAR NOTA AUTORIZADA A API NÃO FAZ — não existe a rota (conferido na
 * especificação, 23/09). Quem cancela é alguém, no painel do Bling, em até
 * 24 horas (Santa Catarina). A loja avisa (`lib/erp/notas.ts`); aqui, só o
 * que a API deixa: apagar a nota que não foi autorizada e cancelar o pedido
 * de venda.
 */

type PassosDoBling = { contato?: number; pedido?: number; nota?: number }

const inteiro = (v: unknown) =>
  typeof v === "number" && Number.isInteger(v) && v > 0 ? v : undefined

export function lerPassos(passos: Passos): PassosDoBling {
  return {
    contato: inteiro(passos.contato),
    pedido: inteiro(passos.pedido),
    nota: inteiro(passos.nota),
  }
}

/** Um erro de DADO: o Bling não tem o produto, falta a forma de pagamento… Não passa sozinho. */
export class ErroDeDados extends Error {}

/* ── o cliente ────────────────────────────────────────────────────────────── */

const cep = (v: string) => {
  const d = v.replace(/\D/g, "")
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

function enderecoDoBling(e: EnderecoDaNota) {
  return {
    endereco: e.rua,
    numero: e.numero,
    complemento: e.complemento ?? "",
    bairro: e.bairro,
    cep: cep(e.cep),
    municipio: e.cidade,
    uf: e.uf,
  }
}

export function corpoDoContato(p: PedidoParaNota) {
  const c = p.cliente
  return {
    nome: c.nome,
    situacao: "A",
    tipo: c.documento.tipo === "cnpj" ? "J" : "F",
    numeroDocumento: c.documento.valor,
    // Consumidor final, não contribuinte do ICMS: é a venda da loja online.
    indicadorIe: 9,
    // O e-mail e o telefone vão também nos campos que a NOTA usa: o "e-mail
    // pra nota fiscal" e o telefone fixo. Sem eles, a nota pega o que estiver lá.
    ...(c.email ? { email: c.email, emailNotaFiscal: c.email } : {}),
    ...(c.telefone ? { telefone: c.telefone, celular: c.telefone } : {}),
    endereco: { geral: enderecoDoBling(c.endereco) },
  }
}

const igual = (a: unknown, b: unknown) =>
  String(a ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase() ===
  String(b ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()

/**
 * O contato como está no Bling, com o nome, o e-mail e o endereço do pedido
 * — ou `null` se nada mudou. Vai no PUT INTEIRO, com o resto como estava:
 * o PUT troca o contato todo, e um campo que ficasse de fora (o vendedor, o
 * tipo, o que a equipe cadastrou lá) seria apagado.
 */
/**
 * O cliente que JÁ EXISTE no Bling (o mesmo CPF), com os dados deste pedido:
 * nome, endereço, e-mail e telefone — inclusive o "e-mail pra nota fiscal" e
 * o telefone fixo, que são os que a NOTA usa. O resto do cadastro (vendedor,
 * o endereço de cobrança, o que a equipe pôs lá) fica.
 *
 * Por que tudo: o cadastro antigo pode ser de outra época, ou ter os dados de
 * outra pessoa — foi o que saiu na nota do primeiro pedido de teste (23/09):
 * o CPF certo, com o e-mail e o telefone de outro cliente. Quem comprou agora
 * é quem vai na nota.
 */
export function contatoAtualizado(
  existente: Record<string, unknown>,
  p: PedidoParaNota
): Record<string, unknown> | null {
  const novo = enderecoDoBling(p.cliente.endereco)
  const endereco = (existente.endereco ?? {}) as { geral?: Record<string, unknown> }
  const geral = endereco.geral ?? {}
  const email = p.cliente.email
  const fone = p.cliente.telefone
  const digitos = (v: unknown) => String(v ?? "").replace(/\D/g, "")
  const mudou =
    !igual(existente.nome, p.cliente.nome) ||
    (email !== null &&
      (!igual(existente.email, email) || !igual(existente.emailNotaFiscal, email))) ||
    (fone !== null &&
      (digitos(existente.telefone) !== digitos(fone) ||
        digitos(existente.celular) !== digitos(fone))) ||
    (Object.keys(novo) as (keyof typeof novo)[]).some((k) =>
      k === "cep"
        ? geral.cep?.toString().replace(/\D/g, "") !== novo.cep.replace(/\D/g, "")
        : !igual(geral[k], novo[k])
    )
  if (!mudou) return null
  const resto = Object.fromEntries(Object.entries(existente).filter(([k]) => k !== "id"))
  return {
    ...resto,
    nome: p.cliente.nome,
    ...(email ? { email, emailNotaFiscal: email } : {}),
    ...(fone ? { telefone: fone, celular: fone } : {}),
    endereco: { ...endereco, geral: { ...geral, ...novo } },
  }
}

async function garantirContato(
  acesso: Acesso,
  p: PedidoParaNota
): Promise<{ id: number; aviso: string | null }> {
  const busca = await chamarBling<{
    data?: { id?: unknown; numeroDocumento?: unknown; situacao?: unknown }[]
  }>(
    acesso,
    "GET",
    "/contatos",
    // `criterio` 1: todos. O padrão ("últimos incluídos") deixaria cliente antigo de fora.
    { consulta: { numeroDocumento: p.cliente.documento.valor, criterio: 1 } }
  )
  const doc = p.cliente.documento.valor.toUpperCase()
  const existente = (busca.corpo?.data ?? []).find(
    (c) =>
      inteiro(c.id) &&
      c.situacao !== "E" &&
      String(c.numeroDocumento ?? "")
        .replace(/[^0-9A-Za-z]/g, "")
        .toUpperCase() === doc
  )
  if (existente) {
    const id = existente.id as number
    try {
      const inteiroNoBling = await chamarBling<{ data?: Record<string, unknown> }>(
        acesso,
        "GET",
        `/contatos/${id}`
      )
      const novo = inteiroNoBling.corpo?.data
        ? contatoAtualizado(inteiroNoBling.corpo.data, p)
        : null
      if (novo) await chamarBling(acesso, "PUT", `/contatos/${id}`, { corpo: novo })
    } catch (e) {
      // Nota com o cadastro antigo é menos grave que nota nenhuma: segue com
      // o contato como está — mas a equipe fica sabendo, pra conferir a nota.
      return {
        id,
        aviso:
          `o cadastro do cliente no Bling não foi atualizado com este pedido ` +
          `(${e instanceof Error ? e.message : String(e)}) — a nota saiu com o nome, o ` +
          "endereço, o e-mail e o telefone que já estavam lá",
      }
    }
    return { id, aviso: null }
  }
  const criado = await chamarBling<{ data?: { id?: unknown } }>(acesso, "POST", "/contatos", {
    corpo: corpoDoContato(p),
  })
  const id = inteiro(criado.corpo?.data?.id)
  if (!id)
    throw new ErroDoBling(
      criado.status,
      "o Bling criou o contato sem devolver o id",
      criado.corpo,
      true
    )
  return { id, aviso: null }
}

/* ── o pedido de venda ────────────────────────────────────────────────────── */

/** Tipos de pagamento do Bling (`GET /formas-pagamentos`): 17 é Pix, 3 é cartão de crédito. */
const TIPO_DO_PAGAMENTO = { pix: 17, cartao: 3 } as const

/** A forma de pagamento da conta pra forma da loja — a ativa do tipo, ou a padrão. */
export function escolherFormaDePagamento(
  corpo: unknown,
  forma: PedidoParaNota["pagamento"]["forma"]
): number | null {
  const formas = ((corpo as { data?: unknown } | null)?.data ?? []) as {
    id?: unknown
    tipoPagamento?: unknown
    situacao?: unknown
    padrao?: unknown
    finalidade?: unknown
  }[]
  const ativas = formas.filter(
    (f) => inteiro(f.id) && f.situacao !== 0 && f.finalidade !== 1 // 1 = só pagamentos (contas a pagar)
  )
  const tipo = forma === "outra" ? null : TIPO_DO_PAGAMENTO[forma]
  const doTipo = tipo ? ativas.find((f) => f.tipoPagamento === tipo) : undefined
  const escolhida = doTipo ?? ativas.find((f) => f.padrao === 1) ?? ativas[0]
  return (escolhida?.id as number | undefined) ?? null
}

let formas: { lidas: number; corpo: unknown } | null = null

async function formaDePagamento(
  acesso: Acesso,
  forma: PedidoParaNota["pagamento"]["forma"]
): Promise<number> {
  if (!formas || Date.now() - formas.lidas > 60 * 60 * 1000) {
    const r = await chamarBling(acesso, "GET", "/formas-pagamentos", { consulta: { situacao: 1 } })
    formas = { lidas: Date.now(), corpo: r.corpo }
  }
  const id = escolherFormaDePagamento(formas.corpo, forma)
  if (!id)
    throw new ErroDeDados("a conta do Bling não tem forma de pagamento ativa pra recebimento")
  return id
}

const centavos = (v: number) => Math.round(v * 100) / 100

export function corpoDoPedidoDeVenda(
  p: PedidoParaNota,
  ids: { contato: number; produtos: Map<string, number>; formaDePagamento: number }
) {
  const itens = p.itens.map((i) => ({
    codigo: i.sku,
    descricao: i.nome,
    unidade: "UN",
    quantidade: i.quantidade,
    valor: centavos(i.precoUnitario),
    produto: { id: ids.produtos.get(i.sku) },
  }))
  return {
    numeroLoja: p.referencia,
    data: p.data,
    dataSaida: p.data,
    dataPrevista: p.data,
    contato: { id: ids.contato },
    itens,
    ...(p.desconto > 0 ? { desconto: { valor: centavos(p.desconto), unidade: "REAL" } } : {}),
    transporte: {
      // CIF: a loja contrata a entrega, e o cliente paga o frete no pedido.
      fretePorConta: 0,
      frete: centavos(p.frete),
      etiqueta: { nome: p.entrega.nome, ...enderecoDoBling(p.entrega) },
    },
    parcelas: [
      {
        dataVencimento: p.data,
        valor: centavos(p.total),
        formaPagamento: { id: ids.formaDePagamento },
      },
    ],
    observacoesInternas: `Pedido ${p.referencia} da loja online (${
      p.pagamento.forma === "pix"
        ? "Pix"
        : p.pagamento.forma === "cartao"
          ? `cartão em ${p.pagamento.parcelas}x`
          : "outra forma"
    }).`,
  }
}

/** O pedido de venda que já tem este `numeroLoja` — `numerosLojas[]`, no plural. */
async function acharPedido(acesso: Acesso, referencia: string): Promise<number | undefined> {
  const r = await chamarBling<{
    data?: { id?: unknown; numeroLoja?: unknown; situacao?: { id?: unknown } }[]
  }>(acesso, "GET", "/pedidos/vendas", { consulta: { "numerosLojas[]": [referencia] } })
  const achado = (r.corpo?.data ?? []).find((v) => v.numeroLoja === referencia && inteiro(v.id))
  return achado ? (achado.id as number) : undefined
}

async function criarPedido(acesso: Acesso, p: PedidoParaNota, contato: number): Promise<number> {
  const produtos = await produtosPorSku(
    acesso,
    p.itens.map((i) => i.sku)
  )
  const faltam = p.itens.filter((i) => !produtos.has(i.sku)).map((i) => i.sku)
  if (faltam.length) {
    throw new ErroDeDados(`o Bling não tem produto ativo com o SKU ${faltam.join(", ")}`)
  }
  const corpo = corpoDoPedidoDeVenda(p, {
    contato,
    produtos: new Map([...produtos].map(([sku, prod]) => [sku, prod.id])),
    formaDePagamento: await formaDePagamento(acesso, p.pagamento.forma),
  })
  const r = await chamarBling<{ data?: { id?: unknown } }>(acesso, "POST", "/pedidos/vendas", {
    corpo,
  })
  const id = inteiro(r.corpo?.data?.id)
  if (!id)
    throw new ErroDoBling(r.status, "o Bling criou o pedido sem devolver o id", r.corpo, true)
  return id
}

/* ── a nota ───────────────────────────────────────────────────────────────── */

/** As situações da NF-e no Bling (1 a 11, fixas) → a língua da loja. */
const SITUACOES: Record<number, { situacao: SituacaoNoErp; nome: string }> = {
  1: { situacao: "pendente", nome: "Pendente" },
  2: { situacao: "cancelada", nome: "Cancelada" },
  3: { situacao: "processando", nome: "Aguardando recibo" },
  4: { situacao: "rejeitada", nome: "Rejeitada pela SEFAZ — o motivo está na nota, no Bling" },
  5: { situacao: "autorizada", nome: "Autorizada" },
  6: { situacao: "autorizada", nome: "Autorizada (DANFE emitida)" },
  7: { situacao: "processando", nome: "Registrada" },
  8: { situacao: "processando", nome: "Aguardando protocolo" },
  9: { situacao: "denegada", nome: "Denegada pela SEFAZ" },
  10: { situacao: "processando", nome: "Consultando a situação na SEFAZ" },
  11: { situacao: "rejeitada", nome: "Bloqueada no Bling (reenvios demais)" },
}

/** "2026-09-23 14:30:00" — Brasília, sem fuso escrito — vira ISO. */
function horaDoBling(v: unknown): string | null {
  const t = typeof v === "string" ? v.trim() : ""
  const m = t.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)$/)
  const d = m ? new Date(`${m[1]}T${m[2]}-03:00`) : t ? new Date(t) : null
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null
}

const texto = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null

export function lerNota(corpo: unknown): EstadoDaNota {
  const n = ((corpo as { data?: unknown } | null)?.data ?? {}) as Record<string, unknown>
  const codigo = typeof n.situacao === "number" ? n.situacao : Number(n.situacao)
  const s = SITUACOES[codigo] ?? {
    situacao: "processando" as const,
    nome: `situação ${String(n.situacao)} no Bling`,
  }
  const valor = typeof n.valorNota === "number" ? n.valorNota : null
  return {
    situacao: s.situacao,
    detalhe: s.nome,
    numero: texto(n.numero),
    serie: texto(n.serie),
    chave: texto(n.chaveAcesso),
    emitidaEm: s.situacao === "autorizada" ? horaDoBling(n.dataEmissao) : null,
    valor,
    linkDanfe: texto(n.linkDanfe) ?? texto(n.linkPDF),
  }
}

async function consultar(acesso: Acesso, nota: number): Promise<EstadoDaNota> {
  const r = await chamarBling(acesso, "GET", `/nfe/${nota}`)
  return lerNota(r.corpo)
}

async function notaDoPedido(acesso: Acesso, pedido: number): Promise<number | undefined> {
  const r = await chamarBling<{ data?: { notaFiscal?: { id?: unknown } | null } }>(
    acesso,
    "GET",
    `/pedidos/vendas/${pedido}`
  )
  return inteiro(r.corpo?.data?.notaFiscal?.id)
}

async function gerarNota(acesso: Acesso, pedido: number): Promise<number> {
  const r = await chamarBling<{ idNotaFiscal?: unknown; data?: { idNotaFiscal?: unknown } }>(
    acesso,
    "POST",
    `/pedidos/vendas/${pedido}/gerar-nfe`
  )
  const id = inteiro(r.corpo?.idNotaFiscal) ?? inteiro(r.corpo?.data?.idNotaFiscal)
  if (!id) throw new ErroDoBling(r.status, "o Bling gerou a nota sem devolver o id", r.corpo, true)
  return id
}

/* ── o contrato ───────────────────────────────────────────────────────────── */

function comoFalha(e: unknown): {
  ok: false
  motivo: string
  definitivo: boolean
  precisaDeGente?: boolean
} {
  if (e instanceof ErroDeDados) return { ok: false, motivo: e.message, definitivo: true }
  // Permissão que falta no app: depois de marcar o escopo e conectar de novo,
  // a mesma tentativa passa — não é pra desistir da nota.
  if (e instanceof ErroDoBling && e.semPermissao)
    return { ok: false, motivo: e.message, definitivo: false, precisaDeGente: true }
  if (e instanceof ErroDoBling) return { ok: false, motivo: e.message, definitivo: !e.temporario }
  return { ok: false, motivo: e instanceof Error ? e.message : String(e), definitivo: false }
}

export async function emitirNota(
  acesso: Acesso,
  pedido: PedidoParaNota,
  passosGuardados: Passos,
  salvar: (passos: Passos) => Promise<void>
): Promise<ResultadoDaEmissao> {
  const passos = lerPassos(passosGuardados)
  const gravar = async (novo: PassosDoBling) => {
    Object.assign(passos, novo)
    await salvar({ ...passos })
  }
  const avisos: string[] = []
  try {
    if (!passos.contato) {
      const contato = await garantirContato(acesso, pedido)
      if (contato.aviso) avisos.push(contato.aviso)
      await gravar({ contato: contato.id })
    }
    if (!passos.pedido) {
      await gravar({
        pedido:
          (await acharPedido(acesso, pedido.referencia)) ??
          (await criarPedido(acesso, pedido, passos.contato!)),
      })
    }
    if (!passos.nota) {
      await gravar({
        nota:
          (await notaDoPedido(acesso, passos.pedido!)) ?? (await gerarNota(acesso, passos.pedido!)),
      })
    }
    // A nota que ainda está pendente vai pra SEFAZ — a cada tentativa, e só
    // ela: a que já está lá não vai de novo (a espera entre as tentativas
    // vem de quem chama).
    let nota = await consultar(acesso, passos.nota!)
    if (nota.situacao === "pendente") {
      await chamarBling(acesso, "POST", `/nfe/${passos.nota}/enviar`, {
        // O e-mail do Bling pro cliente fica desligado (decidido em 23/09).
        consulta: { enviarEmail: false },
        prazoMs: 60_000,
      })
      nota = await consultar(acesso, passos.nota!)
    }
    return { ok: true, nota, ...(avisos.length ? { avisos } : {}) }
  } catch (e) {
    return comoFalha(e)
  }
}

export async function consultarNota(
  acesso: Acesso,
  passosGuardados: Passos
): Promise<ResultadoDaConsulta> {
  const { nota } = lerPassos(passosGuardados)
  if (!nota) return { ok: false, motivo: "a nota ainda não existe no Bling" }
  try {
    return { ok: true, nota: await consultar(acesso, nota) }
  } catch (e) {
    return { ok: false, motivo: comoFalha(e).motivo }
  }
}

/** O id da situação "Cancelado" dos pedidos de venda — é por conta, então vem da API. */
let cancelado: number | null = null

async function situacaoCancelado(acesso: Acesso): Promise<number> {
  if (cancelado) return cancelado
  try {
    const modulos = await chamarBling<{
      data?: { id?: unknown; nome?: unknown; descricao?: unknown }[]
    }>(acesso, "GET", "/situacoes/modulos")
    const vendas = (modulos.corpo?.data ?? []).find((m) =>
      /vendas/i.test(`${String(m.nome ?? "")} ${String(m.descricao ?? "")}`)
    )
    if (inteiro(vendas?.id)) {
      const r = await chamarBling<{ data?: { id?: unknown; nome?: unknown }[] }>(
        acesso,
        "GET",
        `/situacoes/modulos/${vendas!.id as number}`
      )
      const s = (r.corpo?.data ?? []).find((x) =>
        /^cancelad[oa]$/i.test(String(x.nome ?? "").trim())
      )
      if (inteiro(s?.id)) cancelado = s!.id as number
    }
  } catch {
    // Sem a permissão de ler as situações (ou o Bling fora), vale o padrão
    // abaixo — e a próxima vez pergunta de novo.
  }
  // 12 é o "Cancelado" padrão das contas do Bling, se a conta não disser outro.
  return cancelado ?? 12
}

export async function desfazerNota(
  acesso: Acesso,
  passosGuardados: Passos
): Promise<ResultadoDoDesfazer> {
  const passos = lerPassos(passosGuardados)
  try {
    const feito: string[] = []
    if (passos.nota) {
      const nota = await consultar(acesso, passos.nota)
      if (nota.situacao === "autorizada") {
        return { ok: false, motivo: "a nota já foi autorizada", precisaDeGente: true }
      }
      if (nota.situacao === "processando") {
        return {
          ok: false,
          motivo: "a nota está na SEFAZ, sem resposta ainda",
          precisaDeGente: false,
        }
      }
      if (nota.situacao === "denegada") {
        // Nota denegada não se cancela nem se apaga: fica no Bling como está.
        feito.push("a nota denegada fica no Bling")
      }
      if (nota.situacao === "pendente" || nota.situacao === "rejeitada") {
        const r = await chamarBling<{ data?: { idsExcluidos?: unknown[] } }>(
          acesso,
          "DELETE",
          "/nfe",
          {
            consulta: { "idsNotas[]": [passos.nota] },
          }
        )
        const excluidos = (r.corpo?.data?.idsExcluidos ?? []).map(Number)
        if (!excluidos.includes(passos.nota)) {
          return {
            ok: false,
            motivo: "o Bling não apagou a nota não autorizada",
            precisaDeGente: true,
          }
        }
        feito.push("a nota não autorizada foi apagada")
      }
    }
    if (passos.pedido) {
      await chamarBling(
        acesso,
        "PATCH",
        `/pedidos/vendas/${passos.pedido}/situacoes/${await situacaoCancelado(acesso)}`
      )
      feito.push("o pedido de venda foi cancelado")
    }
    return { ok: true, como: feito.join(" e ") || "nada tinha chegado ao Bling" }
  } catch (e) {
    const f = comoFalha(e)
    return { ok: false, motivo: f.motivo, precisaDeGente: f.definitivo }
  }
}
