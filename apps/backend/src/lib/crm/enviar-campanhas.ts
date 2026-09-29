import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { normalizarEmail } from "../../modules/codigo/regras"
import { CRM } from "../../modules/crm"
import type CrmService from "../../modules/crm/service"
import { enviarEmail } from "../email"
import type { EmailDoCrm } from "../emails/crm"
import { urlDaLoja } from "../emails/moldura"
import { juntarPessoas, newsletterDa } from "../painel/clientes"
import { pedidoDaBase, pedidoDaPessoa } from "../painel/crm"
import { DIAS_PRA_COMPRAR, type PedidoDaTela } from "../painel/fluxos"
import { inscricoesDaNewsletter, lerTodosOsClientes } from "../painel/ler"
import { lerAjustesGuardados } from "./ajustes"
import {
  cabeNoPublico,
  chaveDaCampanha,
  DURACAO_DO_ENVIO,
  emailDaCampanha,
  noControleDaCampanha,
  resultadoDaCampanha,
  resultadoFechou,
  textoDoBanco,
  varianteDa,
  type CampanhaDoBanco,
  type PublicoDaCampanha,
  type TextoDaCampanha,
} from "./campanhas"
import { comQuemManda, dadosDaLoja } from "./envio"
import { etiquetasDaPessoa, type PedidoDaPessoa } from "./etiquetas"
import { produtosPorEndereco } from "./exemplos-dos-emails"
import { deMadrugada, passouDoTeto, registrosDoMotor, type Registro } from "./fluxos"
import { leituraDaRodada, type LeituraDaRodada } from "./leitura"
import { daEquipe, nomesDasPessoas, quemAdormeceu, quemVoltouPraLista } from "./motor"
import { juntar } from "./nuvemshop"
import { linksDeSair } from "./sair"

/**
 * O ENVIO DAS CAMPANHAS (entrega 0206) — o que a rotina `campanhas-do-crm`
 * roda a cada 5 minutos. As regras estão em `lib/crm/campanhas.ts`; aqui é
 * achar o público, e mandar aos poucos:
 *
 *   1. a agendada que chegou na hora vira "enviando";
 *   2. uma campanha por vez, a que começou antes. Passadas 24 horas, ela
 *      acaba — quem ficou de fora (o teto, a madrugada) não recebe mais;
 *   3. de madrugada (22h às 8h, Brasília), espera;
 *   4. o público de agora, menos quem já está no registro da campanha: o
 *      controle só é anotado, quem passou do teto fica pra depois, e o resto
 *      recebe o assunto do sorteio. Cada e-mail é RESERVADO antes de sair,
 *      como nos fluxos: duas rodadas nunca mandam o mesmo.
 *
 * Antes de tudo, o resultado da campanha que passou dos 7 dias é guardado
 * (`fecharUmResultado`).
 *
 * Até 100 por rodada, um por segundo: a rodada acaba antes da dos fluxos,
 * e o Resend aceita 2 por segundo. Uma base de 3.000 pessoas sai em umas 2
 * horas e meia.
 */

export const POR_RODADA = 100
const PAUSA_MS = 1000
/** Tantas falhas numa rodada (o Resend fora do ar), e ela para: a próxima tenta de novo. */
const FALHAS_DA_RODADA = 5
const DIA = 24 * 60 * 60 * 1000

export type RelatorioDasCampanhas = {
  /** A campanha da rodada, se alguma estava pra sair. */
  campanha: string | null
  enviados: number
  controle: number
  /** Quem passou do teto nesta rodada (recebe numa próxima, se der). */
  teto: number
  falhas: number
  /** Quantos ainda faltam, depois desta rodada. */
  restam: number
  /** Se a campanha acabou nesta rodada. */
  acabou: boolean
  /** A campanha que teve o resultado guardado nesta rodada. */
  fechou: string | null
}

/** Se a pessoa cabe: e-mail que não quebra a chave da campanha. */
const valeComoChave = (email: string) => !email.includes("|")

/**
 * A ETAPA DE CADA PESSOA (as etiquetas, com os Ajustes), das compras das duas
 * lojas — só pros públicos que filtram por etapa.
 */
export async function etapasDasPessoas(
  leitura: LeituraDaRodada,
  emails: readonly string[],
  agora: Date
): Promise<Map<string, string>> {
  const [daLoja, daBase, metadata] = await Promise.all([
    leitura.pedidosDaLoja(),
    leitura.pedidosDaBase(),
    leitura.metadataDaLoja(),
  ])
  const { dias, regras } = lerAjustesGuardados(metadata)
  const quero = new Set(emails)
  const porEmail = new Map<string, PedidoDaPessoa[]>()
  for (const o of daLoja) {
    const email = normalizarEmail(o.email)
    if (email && quero.has(email)) juntar(porEmail, email, pedidoDaPessoa(o))
  }
  for (const p of daBase) if (quero.has(p.email)) juntar(porEmail, p.email, pedidoDaBase(p))
  const semSinais = { ultimoClique: null, ultimaVisita: null, newsletterDesde: null }
  return new Map(
    emails.map((email) => [
      email,
      etiquetasDaPessoa({
        pedidos: porEmail.get(email) ?? [],
        sinais: semSinais,
        agora,
        dias,
        regras,
      }).etapa.valor,
    ])
  )
}

/**
 * O PÚBLICO DE UMA CAMPANHA, agora: quem aceita ofertas (a newsletter e a
 * caixa da conta da loja nova, com o sim por padrão; quem aceitou na
 * Nuvemshop), menos a equipe, quem saiu da lista (sem um sim novo depois), o
 * e-mail que voltou ou reclamou, e quem adormeceu no sunset — e, se o
 * público pede, só a etapa dele.
 */
export async function publicoDaCampanha(
  container: MedusaContainer,
  publico: PublicoDaCampanha,
  agora: Date,
  leitura: LeituraDaRodada = leituraDaRodada(container)
): Promise<string[]> {
  const crm = container.resolve<CrmService>(CRM)
  const [clientes, inscricoes, daBase] = await Promise.all([
    lerTodosOsClientes(container),
    inscricoesDaNewsletter(container),
    leitura.pessoasDaEstreia(),
  ])
  const aceitam = new Set<string>()
  for (const i of newsletterDa(juntarPessoas(clientes, [], inscricoes), inscricoes, agora)
    .inscritos) {
    const email = normalizarEmail(i.email)
    if (email) aceitam.add(email)
  }
  for (const p of daBase) {
    const email = normalizarEmail(p.email)
    if (email) aceitam.add(email)
  }
  const emails = [...aceitam].filter(valeComoChave)
  if (!emails.length) return []
  const [equipe, saidas, semEntrega, sunsets] = await Promise.all([
    daEquipe(container),
    crm.quemSaiu(emails),
    crm.semEntrega(emails),
    crm.sunsetDosEmails(emails),
  ])
  const [voltou, adormecidos] = await Promise.all([
    quemVoltouPraLista(container, saidas),
    quemAdormeceu(container, sunsets, agora),
  ])
  const ficam = emails.filter(
    (e) =>
      !equipe.has(e) &&
      !semEntrega.has(e) &&
      !(saidas.has(e) && !voltou.has(e)) &&
      !adormecidos.has(e)
  )
  if (publico === "todos") return ficam
  const etapas = await etapasDasPessoas(leitura, ficam, agora)
  return ficam.filter((e) => cabeNoPublico(publico, etapas.get(e) ?? "lead"))
}

/** Os pedidos feitos entre duas horas, pro "comprou em 7 dias" das campanhas. */
export async function pedidosEntre(
  container: MedusaContainer,
  desde: Date,
  ate: Date
): Promise<PedidoDaTela[]> {
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order",
    fields: ["email", "created_at", "total", "status"],
    filters: { created_at: { $gte: desde, $lte: ate } },
    pagination: { take: 5000 },
  })
  return (data as unknown as PedidoDaTela[]).map((p) => ({ ...p, total: Number(p.total) || 0 }))
}

/**
 * GUARDA O RESULTADO de uma campanha que fechou (`resultadoFechou`, 7 dias
 * depois do fim do envio): a conta uma última vez, com os pedidos da janela
 * dela. Uma por rodada; devolve qual.
 */
export async function fecharUmResultado(
  container: MedusaContainer,
  agora: Date
): Promise<string | null> {
  const crm = container.resolve<CrmService>(CRM)
  const semResultado = (await crm.listCampanhas(
    { situacao: ["enviada", "parada"], resultado: null },
    { take: 50 }
  )) as unknown as CampanhaDoBanco[]
  const c = semResultado.find((x) => resultadoFechou(x, agora))
  if (!c) return null
  const acabou = new Date(c.acabou_em!)
  const [registros, pedidos] = await Promise.all([
    crm.registrosDaCampanha(c.id),
    pedidosEntre(
      container,
      new Date(c.comecou_em ?? acabou),
      new Date(acabou.getTime() + DIAS_PRA_COMPRAR * DIA)
    ),
  ])
  const resultado = resultadoDaCampanha(textoDoBanco(c), registros, pedidos)
  await crm.updateCampanhas({
    id: c.id,
    resultado: resultado as unknown as Record<string, unknown>,
  })
  return c.id
}

/** Os produtos publicados da loja, pelo nome: o formulário escolhe entre eles. */
export async function produtosDaLoja(
  container: MedusaContainer
): Promise<{ handle: string; nome: string }[]> {
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "product",
    fields: ["handle", "title"],
    filters: { status: "published" },
    pagination: { take: 500 },
  })
  return (data as { handle?: string | null; title?: string | null }[])
    .filter((p): p is { handle: string; title?: string | null } => Boolean(p.handle))
    .map((p) => ({ handle: p.handle, nome: (p.title ?? "").trim() || p.handle }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
}

/**
 * Os e-mails de exemplo de uma campanha — o "Ver como fica" e o "Mandar pra
 * mim": o assunto A e, com o teste, o B, pra quem pediu. Nulo sem a loja.
 */
export async function exemplosDaCampanha(
  container: MedusaContainer,
  texto: TextoDaCampanha,
  quem: { email: string; nome: string | null }
): Promise<EmailDoCrm[] | null> {
  const loja = urlDaLoja()
  if (!loja) return null
  const [produtos, infoDaLoja] = await Promise.all([
    produtosPorEndereco(container, texto.produtos),
    dadosDaLoja(container, loja),
  ])
  const variantes = texto.assuntoB ? (["a", "b"] as const) : (["a"] as const)
  return variantes.map((v) =>
    emailDaCampanha(texto, v, {
      para: quem.email,
      nome: quem.nome,
      produtos: texto.produtos.flatMap((h) => produtos.get(h) ?? []),
      sair: linksDeSair(loja, quem.email),
      loja: infoDaLoja,
    })
  )
}

/** Quantas pessoas cada público tem agora — o formulário da campanha mostra. */
export async function quantosEmCadaPublico(
  container: MedusaContainer,
  agora: Date
): Promise<Record<PublicoDaCampanha, number>> {
  const leitura = leituraDaRodada(container)
  const todos = await publicoDaCampanha(container, "todos", agora, leitura)
  const etapas = await etapasDasPessoas(leitura, todos, agora)
  const conta = (p: PublicoDaCampanha) =>
    todos.filter((e) => cabeNoPublico(p, etapas.get(e) ?? "lead")).length
  return {
    todos: todos.length,
    clientes: conta("clientes"),
    leads: conta("leads"),
    "em-risco": conta("em-risco"),
  }
}

/**
 * UMA RODADA DAS CAMPANHAS. `so`: só este e-mail (o "rodar agora" do
 * conferidor, fora de produção); `agora`: a hora da rodada (o conferidor anda
 * no tempo).
 */
export async function rodarAsCampanhas(
  container: MedusaContainer,
  {
    agora = new Date(),
    limite = POR_RODADA,
    so = null,
  }: { agora?: Date; limite?: number; so?: string | null } = {}
): Promise<RelatorioDasCampanhas> {
  const relatorio: RelatorioDasCampanhas = {
    campanha: null,
    enviados: 0,
    controle: 0,
    teto: 0,
    falhas: 0,
    restam: 0,
    acabou: false,
    fechou: null,
  }
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const crm = container.resolve<CrmService>(CRM)

  /* 0. o resultado de uma campanha que fechou fica guardado */
  relatorio.fechou = await fecharUmResultado(container, agora)

  /* 1. a agendada que chegou na hora começa */
  const agendadas = (await crm.listCampanhas(
    { situacao: "agendada" },
    { take: 50 }
  )) as unknown as CampanhaDoBanco[]
  for (const c of agendadas)
    if (c.agenda && new Date(c.agenda).getTime() <= agora.getTime())
      await crm.updateCampanhas({ id: c.id, situacao: "enviando", comecou_em: agora })

  /* 2. uma por vez: a que começou antes */
  const enviando = (
    (await crm.listCampanhas(
      { situacao: "enviando" },
      { take: 50 }
    )) as unknown as CampanhaDoBanco[]
  ).sort((a, b) => new Date(a.comecou_em ?? 0).getTime() - new Date(b.comecou_em ?? 0).getTime())
  const c = enviando[0]
  if (!c) return relatorio
  relatorio.campanha = c.id
  const acabar = async () => {
    await crm.updateCampanhas({ id: c.id, situacao: "enviada", acabou_em: agora })
    relatorio.acabou = true
  }
  // Uma rodada com o relógio antes do começo não manda: só o conferidor anda no tempo (o
  // `agora` do "rodar"), e a rotina de verdade não pode mandar a campanha dele pra todo mundo.
  if (new Date(c.comecou_em ?? agora).getTime() > agora.getTime()) return relatorio
  if (agora.getTime() - new Date(c.comecou_em ?? agora).getTime() > DURACAO_DO_ENVIO) {
    await acabar()
    return relatorio
  }

  /* 3. de madrugada, espera */
  if (deMadrugada(agora)) return relatorio
  const loja = urlDaLoja()
  if (!loja) {
    logger.warn("[crm] campanhas: sem LOJA_URL, os links não teriam pra onde ir — nada saiu")
    return relatorio
  }

  /* 4. quem falta */
  const texto = textoDoBanco(c)
  const leitura = leituraDaRodada(container)
  const [publico, feitos] = await Promise.all([
    publicoDaCampanha(container, texto.publico, agora, leitura),
    crm.registrosDaCampanha(c.id),
  ])
  const jaFoi = new Set(feitos.map((r) => r.email))
  const quem = so ? normalizarEmail(so) : null
  const faltam = publico.filter((e) => !jaFoi.has(e) && (!quem || e === quem))
  if (!faltam.length) {
    // Com o `so` (o conferidor), a campanha não acaba por faltar só aquele e-mail.
    if (!quem) await acabar()
    return relatorio
  }
  const [produtos, infoDaLoja] = await Promise.all([
    produtosPorEndereco(container, texto.produtos),
    dadosDaLoja(container, loja),
  ])
  const osProdutos = texto.produtos.flatMap((h) => produtos.get(h) ?? [])
  const cheia = () =>
    relatorio.enviados + relatorio.controle >= limite || relatorio.falhas >= FALHAS_DA_RODADA
  // Em lotes, com folga pro teto: quem passou fica pra depois, e o próximo lote segue — muita
  // gente no teto no começo da lista não trava a campanha.
  for (let i = 0; i < faltam.length && !cheia(); i += limite * 2) {
    const lote = faltam.slice(i, i + limite * 2)
    const registrosDe = new Map<string, Registro[]>()
    for (const r of registrosDoMotor(
      await crm.registrosDosFluxos(new Date(agora.getTime() - 8 * DIA), lote)
    ))
      juntar(registrosDe, r.email, r)
    const nomes = await nomesDasPessoas(container, lote)
    for (const email of lote) {
      if (cheia()) break
      const base = { email, fluxo: "campanha", chave: chaveDaCampanha(c.id, email), em: agora }
      if (noControleDaCampanha(email, c.id)) {
        if (await crm.anotarNoFluxo({ ...base, toque: "controle", como: "controle" }))
          relatorio.controle++
        continue
      }
      if (passouDoTeto(registrosDe.get(email) ?? [], email, agora)) {
        relatorio.teto++
        continue
      }
      const variante = texto.assuntoB ? varianteDa(email, c.id) : "a"
      const reserva = await crm.reservarToque({ ...base, toque: variante })
      if (!reserva) continue
      let falha: string | null = null
      try {
        const email1 = emailDaCampanha(texto, variante, {
          para: email,
          nome: nomes.get(email) ?? null,
          produtos: osProdutos,
          sair: linksDeSair(loja, email),
          loja: infoDaLoja,
        })
        const enviado = await enviarEmail(comQuemManda(email1), logger, {
          idempotencia: `crm-campanha/${c.id}/${email}`,
          tipo: "crm-campanha",
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
        logger.warn(`[crm] campanhas: um e-mail da campanha ${c.id} não saiu — ${falha}`)
      }
    }
  }
  relatorio.restam = Math.max(0, faltam.length - relatorio.enviados - relatorio.controle)
  return relatorio
}
