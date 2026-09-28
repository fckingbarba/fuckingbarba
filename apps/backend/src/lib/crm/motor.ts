import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { CRM } from "../../modules/crm"
import { AVALIACOES } from "../../modules/avaliacoes"
import type AvaliacoesService from "../../modules/avaliacoes/service"
import type CrmService from "../../modules/crm/service"
import type { RegistroLido } from "../../modules/crm/service"
import { EQUIPE } from "../../modules/equipe"
import type EquipeService from "../../modules/equipe/service"
import { lerConfiguracoes } from "../configuracoes"
import { enviarEmail } from "../email"
import { emailDaTrilha, type ConteudoDoProduto } from "../emails/boas-vindas"
import type { ProdutoDoCrm } from "../emails/crm"
import { emailDaEstreia, type EstreiaDoEmail } from "../emails/estreia"
import { emailDoFluxo, type CompraDoFluxo, type ItemDoFluxo } from "../emails/fluxos"
import { urlDaLoja } from "../emails/moldura"
import { mudarMetadataDaLoja } from "../metadata-da-loja"
import { estadoDaSessao, sessaoDoParceiro } from "../pagamento/parceiros"
import { inscricoesDaNewsletter, lerClientes } from "../painel/ler"
import { cadastrosDaNewsletter, conteudosDasTrilhas, trilhaDaPessoa } from "./boas-vindas"
import { comQuemManda, dadosDaLoja } from "./envio"
import { criarCupomDoFluxo } from "./cupom"
import { linksDeEscolha } from "./escolha"
import {
  comecoDoLote,
  CURTO_DO_COMPONENTE,
  fimDaEstreia,
  produtosPorSku,
  publicoDaEstreia,
  SEGMENTOS_COM_CUPOM,
  type PessoaDaEstreia,
} from "./estreia"
import { produtosDosExemplos } from "./exemplos-dos-emails"
import {
  CHAVE_DOS_FLUXOS,
  comecoDoPix,
  decidir,
  DIAS_ENTRE_CUPONS,
  diasDoFluxo,
  fluxosLigados,
  guardarConfigDosFluxos,
  IDS_DOS_FLUXOS,
  ehToqueDaEstreia,
  ehToqueDasBoasVindas,
  ehToqueDeCompra,
  lerConfigDosFluxos,
  PREFIXO_DO_CUPOM,
  PREFIXO_DO_CUPOM_DE_BOAS_VINDAS,
  registrosDoMotor,
  TOQUE_DA_ESCOLHA,
  type Entrada,
  type IdDoFluxo,
  type Registro,
  validadeDoCupom,
} from "./fluxos"
import { juntar } from "./nuvemshop"
import { produtosDoEmail, trilhaDaPagina } from "./primeira-compra"
import { linksDeSair } from "./sair"
import { linkDeVoltar } from "./voltar"

/**
 * O MOTOR DOS FLUXOS — o que a rotina `fluxos-do-crm` roda a cada 5 minutos.
 * As regras (quem recebe o quê, quando) são as de `lib/crm/fluxos.ts`; aqui
 * é buscar as pessoas, perguntar às regras e fazer o que elas dizem:
 *
 *   1. os fluxos ligados — o ligado que ainda não tem hora de início ganha
 *      a de agora, e só a próxima rodada olha as pessoas;
 *   2. as entradas da janela de cada fluxo (o último toque e mais um dia):
 *      os carrinhos com e-mail que não fecharam (checkout), os sem e-mail de
 *      quem a loja conhece pelo CRM (carrinho) e os pedidos com Pix que não
 *      foi pago (Pix);
 *   3. quem fica de fora: a equipe, quem saiu da lista (sem um "sim" novo
 *      depois) e o e-mail que voltou ou reclamou de spam;
 *   4. pra cada pessoa, a decisão: mandar (com o cupom, se for a vez dele),
 *      guardar pro grupo de controle, ou esperar;
 *   5. o toque é RESERVADO antes do envio — duas rodadas juntas não mandam o
 *      mesmo e-mail — e confirmado depois; o que não saiu volta pra fila.
 *
 * No máximo 60 e-mails por rodada, com uma pausa entre eles (o Resend aceita
 * 2 por segundo): o resto fica pra rodada seguinte.
 */

const DIA = 24 * 60 * 60 * 1000
const POR_RODADA = 60
const PAUSA_MS = 600

export type RelatorioDosFluxos = {
  pessoas: number
  enviados: number
  cupons: number
  controle: number
  pulados: number
  teto: number
  fora: number
  falhas: number
  /** Os fluxos que ganharam a hora de início nesta rodada. */
  ligouAgora: IdDoFluxo[]
}

type Item = {
  product_id?: string | null
  product_title?: string | null
  product_handle?: string | null
  thumbnail?: string | null
  quantity?: number | null
  unit_price?: unknown
  compare_at_unit_price?: unknown
  variant_id?: string | null
}

type Endereco = { first_name?: string | null } | null

type CarrinhoCru = {
  id: string
  email: string | null
  updated_at: string | Date
  shipping_address?: Endereco
  billing_address?: Endereco
  items?: Item[] | null
}

type Sessao = { provider_id?: string | null; status?: string | null; data?: unknown }

type PedidoCru = {
  id: string
  display_id?: number | null
  email: string | null
  status: string
  created_at: string | Date
  shipping_address?: Endereco
  items?: Item[] | null
  payment_collections?: { payment_sessions?: Sessao[] | null }[] | null
}

/** O que o motor sabe de cada entrada, pra montar o e-mail. */
type Detalhe = {
  itens: ItemDoFluxo[]
  nome: string | null
  numero: number | null
  pix: { codigo: string; imagem: string | null; vence: Date } | null
  /** Pedido do Pix cancelado depois de vencer — os toques de 24 e 48 horas só saem assim. */
  pixVencido: boolean
  /** Os produtos da sacola, pras avaliações do e-mail de 12 horas do carrinho. */
  produtos: string[]
  depoimentos: NonNullable<CompraDoFluxo["depoimentos"]>
}

const minusculo = (e: string | null | undefined) => (e ?? "").trim().toLowerCase()
const numero = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const primeiroNome = (...enderecos: Endereco[]) => {
  for (const e of enderecos) {
    const nome = (e?.first_name ?? "").trim().split(/\s+/)[0]
    if (nome) return nome.charAt(0).toUpperCase() + nome.slice(1).toLowerCase()
  }
  return null
}

function itensDo(itens: Item[] | null | undefined): ItemDoFluxo[] {
  return (itens ?? []).map((i) => {
    const quantidade = Math.max(1, Number(i.quantity) || 1)
    const preco = numero(i.unit_price)
    const cheio = numero(i.compare_at_unit_price)
    return {
      nome: `${i.product_title ?? "Produto"}${quantidade > 1 ? ` · ${quantidade} unidades` : ""}`,
      handle: i.product_handle ?? "",
      imagem: i.thumbnail ?? null,
      preco,
      precoCheio: preco !== null && cheio !== null && cheio > preco ? cheio : null,
      quantidade,
    }
  })
}

export async function rodarOsFluxos(
  container: MedusaContainer,
  {
    agora = new Date(),
    limite = POR_RODADA,
    so = null,
  }: {
    agora?: Date
    limite?: number
    /** Só as entradas deste e-mail (o "rodar agora" do conferidor, fora de produção). */
    so?: string | null
  } = {}
): Promise<RelatorioDosFluxos> {
  const relatorio: RelatorioDosFluxos = {
    pessoas: 0,
    enviados: 0,
    cupons: 0,
    controle: 0,
    pulados: 0,
    teto: 0,
    fora: 0,
    falhas: 0,
    ligouAgora: [],
  }
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

  /* 1. os fluxos ligados — e a hora de início de quem ainda não tem */
  const config = await mudarMetadataDaLoja(container, (metadata) => {
    const c = lerConfigDosFluxos(metadata)
    const sem = IDS_DOS_FLUXOS.filter((id) => c.fluxos[id].ligado && !c.fluxos[id].desde)
    if (!sem.length) return { resultado: { c, sem } }
    // A hora de verdade, mesmo quando o conferidor faz o tempo andar (`agora` no futuro).
    const desde = new Date(Math.min(agora.getTime(), Date.now()))
    for (const id of sem) c.fluxos[id] = { ligado: true, desde }
    return { gravar: { [CHAVE_DOS_FLUXOS]: guardarConfigDosFluxos(c) }, resultado: { c, sem } }
  })
  if (!config) return relatorio
  relatorio.ligouAgora = config.sem
  // O que ligou agora ainda não olha ninguém: o começo dele é esta rodada.
  const ligados = fluxosLigados(config.c)
  for (const id of config.sem) delete ligados[id]
  if (!Object.keys(ligados).length) return relatorio
  const loja = urlDaLoja()
  if (!loja) {
    logger.warn("[crm] fluxos: sem LOJA_URL, os links não teriam pra onde ir — nada saiu")
    return relatorio
  }

  /* 2. as entradas — cada fluxo com a sua janela: o último toque e mais um dia */
  const janela = (id: IdDoFluxo) => {
    const desde = ligados[id]
    return desde
      ? new Date(Math.max(desde.getTime(), agora.getTime() - diasDoFluxo(id) * DIA))
      : null
  }
  const inicioDo = {
    pix: janela("pix"),
    checkout: janela("checkout"),
    carrinho: janela("carrinho"),
    "boas-vindas": janela("boas-vindas"),
  }
  const maisCedo = (...datas: (Date | null)[]) => {
    const validas = datas.filter((d): d is Date => d !== null).map((d) => d.getTime())
    return validas.length ? new Date(Math.min(...validas)) : null
  }
  // Os carrinhos com e-mail servem ao checkout e ao carrinho (quem abriu o checkout depois, parou).
  const inicioComEmail = maisCedo(inicioDo.checkout, inicioDo.carrinho)
  // A estreia não tem janela: cada pessoa tem o dia do lote dela, até o último lote passar.
  const desdeDaEstreia =
    ligados.estreia && agora.getTime() < fimDaEstreia(ligados.estreia).getTime()
      ? ligados.estreia
      : null
  const inicioDosPedidos =
    maisCedo(
      inicioDo.pix,
      inicioDo.checkout,
      inicioDo.carrinho,
      inicioDo["boas-vindas"],
      desdeDaEstreia
    ) ?? agora
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const campoDoItem = [
    "items.product_id",
    "items.product_title",
    "items.product_handle",
    "items.thumbnail",
    "items.quantity",
    "items.unit_price",
    "items.compare_at_unit_price",
  ]
  const camposDoCarrinho = [
    "id",
    "email",
    "updated_at",
    "shipping_address.first_name",
    "billing_address.first_name",
    ...campoDoItem,
  ]
  const crm = container.resolve<CrmService>(CRM)
  // As sacolas sem e-mail: só as que o CRM sabe de quem são (um dia de folga pra trás).
  const donos = inicioDo.carrinho
    ? await crm.carrinhosComDono(new Date(inicioDo.carrinho.getTime() - DIA))
    : new Map<string, string>()
  const lerSacolas = async (): Promise<CarrinhoCru[]> => {
    const ids = [...donos.keys()]
    const lidos: CarrinhoCru[] = []
    for (let i = 0; i < ids.length && inicioDo.carrinho; i += 500) {
      const { data } = await query.graph({
        entity: "cart",
        fields: camposDoCarrinho,
        filters: {
          id: ids.slice(i, i + 500),
          completed_at: null,
          email: null,
          updated_at: { $gte: inicioDo.carrinho },
        },
      })
      lidos.push(...(data as unknown as CarrinhoCru[]))
    }
    return lidos
  }
  const [comEmail, semEmail, pedidos] = await Promise.all([
    inicioComEmail
      ? query
          .graph({
            entity: "cart",
            fields: camposDoCarrinho,
            filters: {
              completed_at: null,
              updated_at: { $gte: inicioComEmail },
              email: { $ne: null },
            },
            pagination: { take: 2000, order: { updated_at: "DESC" } },
          })
          .then((r) => r.data as unknown as CarrinhoCru[])
      : Promise.resolve([] as CarrinhoCru[]),
    lerSacolas(),
    // Os pedidos da janela: os do Pix e os que dizem "comprou". Como na tela dos
    // carrinhos, o e-mail é comparado sem maiúsculas aqui, e não no banco.
    query
      .graph({
        entity: "order",
        fields: [
          "id",
          "display_id",
          "email",
          "status",
          "created_at",
          "shipping_address.first_name",
          // `items.*`: a quantidade do item do pedido é calculada no Medusa 2.21 (ver a 0116).
          "items.*",
          "payment_collections.payment_sessions.provider_id",
          "payment_collections.payment_sessions.status",
          "payment_collections.payment_sessions.data",
        ],
        filters: { created_at: { $gte: new Date(inicioDosPedidos.getTime() - DIA) } },
        pagination: { take: 5000, order: { created_at: "DESC" } },
      })
      .then((r) => r.data as unknown as PedidoCru[]),
  ])

  const valendo = pedidos.filter((p) => p.status !== "canceled")
  const comprouDepois = (email: string, depois: Date, fora?: string) =>
    valendo.some(
      (p) =>
        p.id !== fora &&
        minusculo(p.email) === email &&
        new Date(p.created_at).getTime() > depois.getTime()
    )
  /** Se a pessoa abriu o checkout (um carrinho com o e-mail dela) depois desta hora. */
  const abriuCheckoutDepois = (email: string, depois: Date) =>
    comEmail.some(
      (c) => minusculo(c.email) === email && new Date(c.updated_at).getTime() > depois.getTime()
    )
  const semPix = { numero: null, pix: null, pixVencido: false, produtos: [], depoimentos: [] }

  const entradas: Entrada[] = []
  const detalhes = new Map<string, Detalhe>()
  if (inicioDo.checkout)
    for (const c of comEmail) {
      const email = minusculo(c.email)
      const itens = itensDo(c.items)
      const comeco = new Date(c.updated_at)
      if (!email || !itens.length || comeco < inicioDo.checkout) continue
      entradas.push({
        fluxo: "checkout",
        chave: c.id,
        email,
        comeco,
        comprou: comprouDepois(email, comeco),
      })
      detalhes.set(c.id, {
        ...semPix,
        itens,
        nome: primeiroNome(c.shipping_address ?? null, c.billing_address ?? null),
      })
    }
  if (inicioDo.carrinho) {
    // A sacola não tem e-mail: quem diz de quem ela é são as anotações do CRM.
    for (const c of semEmail.filter((x) => (x.items ?? []).length)) {
      const email = minusculo(donos.get(c.id))
      if (!email) continue
      const comeco = new Date(c.updated_at)
      entradas.push({
        fluxo: "carrinho",
        chave: c.id,
        email,
        comeco,
        // Comprou, ou abriu o checkout depois (aí quem cuida é o fluxo do checkout).
        comprou: comprouDepois(email, comeco) || abriuCheckoutDepois(email, comeco),
      })
      detalhes.set(c.id, {
        ...semPix,
        itens: itensDo(c.items),
        nome: null,
        produtos: (c.items ?? []).flatMap((i) => (i.product_id ? [i.product_id] : [])),
      })
    }
  }
  if (inicioDo.pix)
    for (const p of pedidos) {
      const email = minusculo(p.email)
      const sessoes = (p.payment_collections ?? []).flatMap((c) => c.payment_sessions ?? [])
      const estado = estadoDaSessao(sessaoDoParceiro(sessoes))
      const vence = estado?.pix?.expiraEm ? new Date(estado.pix.expiraEm) : null
      if (!email || estado?.forma !== "pix" || !vence || Number.isNaN(vence.getTime())) continue
      const criado = new Date(p.created_at)
      if (criado < inicioDo.pix) continue
      entradas.push({
        fluxo: "pix",
        chave: p.id,
        email,
        comeco: comecoDoPix(vence),
        inicio: criado,
        comprou: estado.situacao === "pago" || comprouDepois(email, criado, p.id),
      })
      detalhes.set(p.id, {
        ...semPix,
        itens: itensDo(p.items),
        nome: primeiroNome(p.shipping_address ?? null),
        numero: p.display_id ?? null,
        pix: estado.pix
          ? { codigo: estado.pix.copiaECola, imagem: estado.pix.imagem || null, vence }
          : null,
        pixVencido: p.status === "canceled" && vence.getTime() < agora.getTime(),
      })
    }
  // As boas-vindas: quem se cadastrou no pop-up da 1ª compra (o cupom saiu na hora, pela rota).
  if (inicioDo["boas-vindas"])
    for (const c of await crm.cadastrosDasBoasVindas(inicioDo["boas-vindas"])) {
      const email = minusculo(c.email)
      const comeco = new Date(c.em)
      if (!email) continue
      entradas.push({
        fluxo: "boas-vindas",
        chave: email,
        email,
        comeco,
        comprou: comprouDepois(email, comeco),
      })
    }
  // A estreia: quem aceitou ofertas na loja antiga (menos quem já comprou na nova), no dia do lote.
  const daEstreia = desdeDaEstreia ? await publicoDaEstreia(container, agora) : null
  const pessoasDaEstreia = new Map((daEstreia?.fila ?? []).map((p) => [p.email, p]))
  if (desdeDaEstreia)
    for (const p of pessoasDaEstreia.values())
      entradas.push({
        fluxo: "estreia",
        chave: p.email,
        email: p.email,
        comeco: comecoDoLote(desdeDaEstreia, p.lote),
        comprou: comprouDepois(p.email, desdeDaEstreia),
      })
  if (so) {
    const quem = minusculo(so)
    entradas.splice(0, entradas.length, ...entradas.filter((e) => e.email === quem))
  }
  if (!entradas.length) return relatorio
  await completarOsDoCarrinho(container, entradas, detalhes)

  /* 3. quem fica de fora */
  const emails = [...new Set(entradas.map((e) => e.email))]
  const [equipe, saidas, semEntrega, lidos] = await Promise.all([
    daEquipe(container),
    crm.quemSaiu(emails),
    crm.semEntrega(emails),
    crm.registrosDosFluxos(new Date(agora.getTime() - (DIAS_ENTRE_CUPONS + 1) * DIA), emails),
  ])
  const voltouPraLista = await quemVoltouPraLista(container, saidas)
  const fora = (email: string) =>
    equipe.has(email) || semEntrega.has(email) || (saidas.has(email) && !voltouPraLista.has(email))

  const registrosDe = new Map<string, Registro[]>()
  for (const r of registrosDoMotor(lidos)) juntar(registrosDe, r.email, r)
  const porPessoa = new Map<string, Entrada[]>()
  for (const e of entradas) juntar(porPessoa, e.email, e)

  /* 4 e 5. a decisão de cada pessoa, e o que ela manda fazer */
  const infoDaLoja = await dadosDaLoja(container, loja)
  // O que a sequência das boas-vindas lê do banco: só se alguém dela for receber agora.
  let dasBoasVindas: Promise<DadosDasBoasVindas> | null = null
  const boasVindas = () =>
    (dasBoasVindas ??= lerDadosDasBoasVindas(
      container,
      entradas.filter((e) => e.fluxo === "boas-vindas").map((e) => e.email)
    ))
  // O que os e-mails da estreia mostram: só se alguém dela for receber agora.
  let dasEstreia: Promise<DadosDaEstreia> | null = null
  const estreia = () => (dasEstreia ??= lerDadosDaEstreia(container, daEstreia?.fila ?? []))
  for (const [email, dela] of porPessoa) {
    if (relatorio.enviados >= limite) break
    relatorio.pessoas++
    if (fora(email)) {
      relatorio.fora++
      continue
    }
    const r = decidir({
      entradas: dela,
      registros: registrosDe.get(email) ?? [],
      ligados,
      agora,
    })
    if (!r || r.decisao.tipo === "nada") continue
    const { entrada, decisao } = r
    const base = { email, fluxo: entrada.fluxo, chave: entrada.chave, em: agora }
    if (decisao.tipo === "teto") {
      relatorio.teto++
      continue
    }
    for (const toque of decisao.pulados) {
      if (await crm.anotarNoFluxo({ ...base, toque, como: "pulado" })) relatorio.pulados++
    }
    if (decisao.tipo === "controle") {
      if (await crm.anotarNoFluxo({ ...base, toque: decisao.toque.id, como: "controle" }))
        relatorio.controle++
      continue
    }
    if (entrada.fluxo === "estreia") {
      const pessoa = pessoasDaEstreia.get(email)
      const toque = decisao.toque.id
      if (!pessoa || !ehToqueDaEstreia(toque)) continue
      const dados = await estreia()
      const lead = pessoa.segmento === "lead"
      // O cupom sai no e-mail da loja nova, só pra quem sumiu e quem nunca comprou; o de 2 dias lembra dele.
      const daCupom =
        toque === "estreia-agora" &&
        decisao.darCupom &&
        SEGMENTOS_COM_CUPOM.includes(pessoa.segmento)
      const lembrado =
        toque === "estreia-2d"
          ? cupomQueAindaVale(lidos, email, agora, config.c.desconto, "estreia")
          : null
      const handles = new Set<string>()
      const produtos = (
        lead
          ? [...dados.maisPedidos.values()]
          : pessoa.skus.flatMap((s) => dados.porSku.get(s) ?? [])
      ).filter((p) => !handles.has(p.handle) && Boolean(handles.add(p.handle)))
      const montar = (cupom: EstreiaDoEmail["cupom"]) =>
        emailDaEstreia({
          toque,
          segmento: pessoa.segmento,
          para: email,
          nome: pessoa.nome,
          cupom,
          produtos,
          acabando: pessoa.acabando
            ? {
                ...CURTO_DO_COMPONENTE[pessoa.acabando.componente],
                produto: (pessoa.acabando.sku && dados.porSku.get(pessoa.acabando.sku)) || null,
              }
            : null,
          daLoja: dados.daLoja,
          sair: linksDeSair(loja, email),
          loja: infoDaLoja,
        })
      // O dia sem e-mail (o "vence amanhã" de quem não ganhou cupom): fica como pulado.
      if (!daCupom && !montar(lembrado)) {
        if (await crm.anotarNoFluxo({ ...base, toque, como: "pulado" })) relatorio.pulados++
        continue
      }
      const reserva = await crm.reservarToque({ ...base, toque })
      if (!reserva) continue
      let falha: string | null = null
      let cupomCriado: { id: string; codigo: string; ate: Date } | null = null
      try {
        if (daCupom)
          cupomCriado = await criarCupomDoFluxo(container, {
            porcento: config.c.desconto,
            agora,
            validade: validadeDoCupom("estreia"),
            prefixo: lead ? PREFIXO_DO_CUPOM_DE_BOAS_VINDAS : PREFIXO_DO_CUPOM,
            primeiraCompra: lead,
            campanha: "CRM (estreia)",
          })
        const email1 = montar(
          cupomCriado
            ? { codigo: cupomCriado.codigo, ate: cupomCriado.ate, porcento: config.c.desconto }
            : lembrado
        )
        const enviado = email1
          ? await enviarEmail(comQuemManda(email1), logger, {
              idempotencia: `crm-estreia/${email}/${toque}`,
              tipo: "crm-estreia",
            })
          : { ok: false as const, motivo: "o e-mail não montou" }
        if (enviado.ok) {
          await crm.confirmarToque(reserva, {
            resendId: enviado.id ?? null,
            cupom: cupomCriado?.codigo ?? null,
            cupomAte: cupomCriado?.ate ?? null,
          })
          relatorio.enviados++
          if (cupomCriado) relatorio.cupons++
          await new Promise((ok) => setTimeout(ok, PAUSA_MS))
        } else falha = enviado.motivo
      } catch (e) {
        falha = e instanceof Error ? e.message : String(e)
      }
      if (falha !== null) {
        relatorio.falhas++
        await crm.desfazerToque(reserva)
        // O cupom de um e-mail que não saiu não fica solto: a próxima rodada cria outro.
        if (cupomCriado)
          await container
            .resolve(Modules.PROMOTION)
            .deletePromotions([cupomCriado.id])
            .catch(() => undefined)
        logger.warn(`[crm] fluxos: o toque ${toque} da estreia não saiu — ${falha}`)
      }
      continue
    }
    if (entrada.fluxo === "boas-vindas") {
      const toque = decisao.toque.id
      if (toque === "boas-vindas-agora" || !ehToqueDasBoasVindas(toque)) continue
      const dados = await boasVindas()
      const cadastro = dados.cadastros.get(email)
      const escolha =
        lidos.find(
          (x) => x.email === email && x.fluxo === "boas-vindas" && x.toque === TOQUE_DA_ESCOLHA
        )?.como ?? null
      const { trilha, visto } = trilhaDaPessoa({ escolha, pagina: cadastro?.pagina ?? null })
      const doPopup = lidos.find(
        (x) => x.email === email && x.fluxo === "boas-vindas" && x.toque === "boas-vindas-agora"
      )
      const cupom =
        doPopup?.cupom &&
        doPopup.cupom_ate &&
        new Date(doPopup.cupom_ate).getTime() > agora.getTime()
          ? { codigo: doPopup.cupom, porcento: config.c.desconto, ate: new Date(doPopup.cupom_ate) }
          : null
      const vistoDaTrilha =
        visto && trilhaDaPagina(`/produtos/${visto}`).trilha === trilha ? visto : null
      const email1 = emailDaTrilha({
        toque,
        trilha,
        para: email,
        nome: cadastro?.nome ?? null,
        cupom,
        conteudos: dados.conteudos,
        visto: vistoDaTrilha,
        produtos: produtosDoEmail(trilha, vistoDaTrilha).flatMap((h) => {
          const c = dados.conteudos.get(h)
          return c ? [c.produto] : []
        }),
        depoimentos: dados.depoimentos,
        escolhas: trilha === "geral" ? linksDeEscolha(email) : null,
        daLoja: dados.daLoja,
        sair: linksDeSair(loja, email),
        loja: infoDaLoja,
      })
      // O dia que a trilha não tem (ou sem o conteúdo na página do produto): fica como pulado.
      if (!email1) {
        if (await crm.anotarNoFluxo({ ...base, toque, como: "pulado" })) relatorio.pulados++
        continue
      }
      const reserva = await crm.reservarToque({ ...base, toque })
      if (!reserva) continue
      let falha: string | null = null
      try {
        const enviado = await enviarEmail(comQuemManda(email1), logger, {
          idempotencia: `crm-boas-vindas/${email}/${toque}`,
          tipo: "crm-boas-vindas",
        })
        if (enviado.ok) {
          await crm.confirmarToque(reserva, {
            resendId: enviado.id ?? null,
            cupom: null,
            cupomAte: null,
          })
          relatorio.enviados++
          await new Promise((ok) => setTimeout(ok, PAUSA_MS))
        } else falha = enviado.motivo
      } catch (e) {
        falha = e instanceof Error ? e.message : String(e)
      }
      if (falha !== null) {
        relatorio.falhas++
        await crm.desfazerToque(reserva)
        logger.warn(`[crm] fluxos: o toque ${toque} das boas-vindas não saiu — ${falha}`)
      }
      continue
    }
    const detalhe = detalhes.get(entrada.chave)
    const toqueDaVez = decisao.toque.id
    // O motor só manda os de compra: o cupom das boas-vindas sai na rota do pop-up.
    if (!detalhe || !ehToqueDeCompra(toqueDaVez)) continue
    // Os toques do Pix depois de vencido só saem com o pedido cancelado: o texto diz isso.
    if (entrada.fluxo === "pix" && decisao.toque.id !== "pix-vence" && !detalhe.pixVencido) continue

    const reserva = await crm.reservarToque({ ...base, toque: decisao.toque.id })
    if (!reserva) continue
    let falha: string | null = null
    let cupomCriado: string | null = null
    try {
      const cupom = decisao.darCupom
        ? {
            ...(await criarCupomDoFluxo(container, {
              porcento: config.c.desconto,
              agora,
              validade: validadeDoCupom(entrada.fluxo),
            })),
            porcento: config.c.desconto,
          }
        : cupomQueAindaVale(lidos, entrada.chave, agora, config.c.desconto)
      if (cupom && "id" in cupom) cupomCriado = cupom.id as string
      const compra: CompraDoFluxo = {
        toque: toqueDaVez,
        para: email,
        nome: detalhe.nome,
        itens: detalhe.itens,
        numero: detalhe.numero,
        pix: decisao.toque.id === "pix-vence" ? detalhe.pix : null,
        cupom,
        depoimentos: detalhe.depoimentos,
        voltar: linkDeVoltar(entrada.chave, agora),
        sair: linksDeSair(loja, email),
        loja: infoDaLoja,
      }
      const enviado = await enviarEmail(comQuemManda(emailDoFluxo(compra)), logger, {
        idempotencia: `crm-${entrada.fluxo}/${entrada.chave}/${decisao.toque.id}`,
        tipo: `crm-${entrada.fluxo}`,
      })
      if (enviado.ok) {
        await crm.confirmarToque(reserva, {
          resendId: enviado.id ?? null,
          cupom: decisao.darCupom && cupom ? cupom.codigo : null,
          cupomAte: decisao.darCupom && cupom ? cupom.ate : null,
        })
        relatorio.enviados++
        if (cupomCriado) relatorio.cupons++
        await new Promise((ok) => setTimeout(ok, PAUSA_MS))
      } else falha = enviado.motivo
    } catch (e) {
      falha = e instanceof Error ? e.message : String(e)
    }
    if (falha !== null) {
      relatorio.falhas++
      await crm.desfazerToque(reserva)
      // O cupom de um e-mail que não saiu não fica solto: a próxima rodada cria outro.
      if (cupomCriado)
        await container
          .resolve(Modules.PROMOTION)
          .deletePromotions([cupomCriado])
          .catch(() => undefined)
      logger.warn(
        `[crm] fluxos: o toque ${decisao.toque.id} de ${entrada.chave} não saiu — ${falha}`
      )
    }
  }
  return relatorio
}

/**
 * O cupom que o toque de 24 horas deu pra esta entrada, se ainda vale — o de
 * 48 horas lembra dele. Com o `fluxo`, só o daquele fluxo: a chave da estreia
 * é o e-mail, como a das boas-vindas.
 */
function cupomQueAindaVale(
  lidos: readonly RegistroLido[],
  chave: string,
  agora: Date,
  porcento: number,
  fluxo?: IdDoFluxo
): CompraDoFluxo["cupom"] {
  const r = lidos.find(
    (x) => (!fluxo || x.fluxo === fluxo) && x.chave === chave && x.cupom && x.cupom_ate
  )
  if (!r?.cupom || !r.cupom_ate || new Date(r.cupom_ate).getTime() <= agora.getTime()) return null
  return { codigo: r.cupom, ate: new Date(r.cupom_ate), porcento }
}

/** Os e-mails da equipe do painel e do admin do Medusa: e-mail de oferta não é pra eles. */
async function daEquipe(container: MedusaContainer): Promise<Set<string>> {
  const [membros, usuarios] = await Promise.all([
    container
      .resolve<EquipeService>(EQUIPE)
      .listMembros({}, { select: ["email"], take: 1000 })
      .catch(() => []),
    container
      .resolve(Modules.USER)
      .listUsers({}, { select: ["email"], take: 1000 })
      .catch(() => []),
  ])
  return new Set([...membros, ...usuarios].map((m) => minusculo(m.email)).filter(Boolean))
}

/**
 * De quem saiu da lista, quem disse "sim" de novo DEPOIS (a newsletter do
 * rodapé, a caixa de ofertas da conta): esses voltaram por conta própria.
 */
async function quemVoltouPraLista(
  container: MedusaContainer,
  saidas: Map<string, Date>
): Promise<Set<string>> {
  const voltou = new Set<string>()
  for (const [email, saiu] of saidas) {
    const [inscricoes, clientes] = await Promise.all([
      inscricoesDaNewsletter(container, { email }),
      lerClientes(container, { email }),
    ])
    const sins = [
      ...inscricoes.map((i) => i.consentido_em),
      ...clientes.map((c) => {
        const ofertas = (c.metadata?.ofertas ?? null) as Record<string, unknown> | null
        return typeof ofertas?.email === "string" ? ofertas.email : null
      }),
    ]
    if (sins.some((s) => s && new Date(s).getTime() > saiu.getTime())) voltou.add(email)
  }
  return voltou
}

type DadosDasBoasVindas = {
  conteudos: Map<string, ConteudoDoProduto>
  depoimentos: { texto: string; quem: string; estrelas: number }[]
  cadastros: Map<string, { nome: string | null; pagina: string | null }>
  daLoja: { prazoDePostagem: string | null; freteGratisAcima: number | null }
}

/** O conteúdo das trilhas, as avaliações do Fator, o nome e a página de cada um, e o que a loja diz de si. */
async function lerDadosDasBoasVindas(
  container: MedusaContainer,
  emails: string[]
): Promise<DadosDasBoasVindas> {
  const [cadastros, lojas] = await Promise.all([
    cadastrosDaNewsletter(container, [...new Set(emails)]),
    container.resolve(Modules.STORE).listStores({}, { select: ["metadata"], take: 1 }),
  ])
  const vistos = [...cadastros.values()].flatMap((c) => {
    const produto = trilhaDaPagina(c.pagina).produto
    return produto ? [produto] : []
  })
  const { conteudos, depoimentos } = await conteudosDasTrilhas(container, vistos)
  return { conteudos, depoimentos, cadastros, daLoja: oQueALojaDiz(lojas[0]?.metadata) }
}

/** O prazo de postagem e o frete grátis das Configurações, pros e-mails que falam da loja. */
function oQueALojaDiz(metadata: unknown): DadosDasBoasVindas["daLoja"] {
  const { frete, atendimento } = lerConfiguracoes(metadata as Record<string, unknown> | null)
  return {
    prazoDePostagem: atendimento.prazoDePostagem,
    freteGratisAcima: frete.modo === "gratis" ? frete.piso : null,
  }
}

type DadosDaEstreia = {
  /** Os produtos da loja nova pelo SKU (o código do Bling, o mesmo da Nuvemshop). */
  porSku: Map<string, ProdutoDoCrm>
  /** Os mais pedidos: os produtos do e-mail de quem nunca comprou. */
  maisPedidos: Map<string, ProdutoDoCrm>
  daLoja: DadosDasBoasVindas["daLoja"]
}

/** Os produtos das últimas compras de quem está na fila, os mais pedidos e o que a loja diz de si. */
async function lerDadosDaEstreia(
  container: MedusaContainer,
  fila: readonly PessoaDaEstreia[]
): Promise<DadosDaEstreia> {
  const skus = new Set(
    fila.flatMap((p) => [...p.skus, ...(p.acabando?.sku ? [p.acabando.sku] : [])])
  )
  const [porSku, maisPedidos, lojas] = await Promise.all([
    produtosPorSku(container, [...skus]),
    produtosDosExemplos(container),
    container.resolve(Modules.STORE).listStores({}, { select: ["metadata"], take: 1 }),
  ])
  return { porSku, maisPedidos, daLoja: oQueALojaDiz(lojas[0]?.metadata) }
}

/**
 * O que a sacola não tem e o e-mail do carrinho usa: o primeiro nome (da
 * conta com aquele e-mail, se tiver) e as avaliações de verdade dos produtos
 * — as aprovadas no painel, de 4 e 5 estrelas, as mais novas primeiro.
 */
async function completarOsDoCarrinho(
  container: MedusaContainer,
  entradas: Entrada[],
  detalhes: Map<string, Detalhe>
) {
  const doCarrinho = entradas.filter((e) => e.fluxo === "carrinho")
  if (!doCarrinho.length) return
  const produtos = [...new Set(doCarrinho.flatMap((e) => detalhes.get(e.chave)?.produtos ?? []))]
  const [clientes, avaliacoes] = await Promise.all([
    container
      .resolve(ContainerRegistrationKeys.QUERY)
      .graph({
        entity: "customer",
        fields: ["email", "first_name"],
        filters: { email: [...new Set(doCarrinho.map((e) => e.email))] },
      })
      .then((r) => r.data as { email?: string | null; first_name?: string | null }[])
      .catch(() => []),
    produtos.length
      ? container
          .resolve<AvaliacoesService>(AVALIACOES)
          .listAvaliacoes(
            { produto_id: produtos, situacao: "aprovada" },
            {
              select: ["produto_id", "nome", "nota", "texto"],
              order: { created_at: "DESC" },
              take: 500,
            }
          )
          .catch(() => [])
      : Promise.resolve([]),
  ])
  const nomes = new Map<string, string | null>(
    clientes.map((c): [string, string | null] => [
      minusculo(c.email),
      primeiroNome({ first_name: c.first_name ?? null }),
    ])
  )
  const boas = (
    avaliacoes as { produto_id: string; nome: string; nota: number; texto: string }[]
  ).filter((a) => a.nota >= 4 && a.texto.trim())
  for (const e of doCarrinho) {
    const d = detalhes.get(e.chave)
    if (!d) continue
    d.nome = nomes.get(e.email) ?? null
    d.depoimentos = boas
      .filter((a) => d.produtos.includes(a.produto_id))
      .slice(0, 2)
      .map((a) => ({ texto: a.texto.trim(), quem: a.nome, estrelas: a.nota }))
  }
}
