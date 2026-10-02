/**
 * SIMULAÇÃO DO ATENDENTE DO WHATSAPP — as conversas de `cenarios.ts` no MESMO
 * atendente do ar (`responderComIa`, `instrucoesDoAtendente`, o catálogo de
 * `catalogoEmTexto` e as ferramentas da loja), com o catálogo lido das
 * páginas públicas da loja e as dúvidas da página /duvidas. Sem banco: as
 * ferramentas de pedido devolvem o texto delas pro cliente de teste
 * (`ferramentas-de-teste.ts`). Serve pra medir, antes de mudar no ar, o
 * modelo, o catálogo, as instruções ou as regras — com a qualidade e o
 * custo de cada resposta.
 *
 *   cd apps/backend
 *   SIM_CHAVE=~/.chave-de-teste npx ts-node ferramentas/simular-atendente/rodar.ts
 *
 * Variáveis:
 *   SIM_CHAVE       o arquivo com uma chave de TESTE da Anthropic (nunca a do ar;
 *                   apague a chave no console no fim). Cada rodada custa dinheiro.
 *   SIM_FALSA=1     em vez da Anthropic, a IA de mentira na 4380
 *                   (`apps/loja/ferramentas/whatsapp-falso.mjs`): confere o encanamento, de graça.
 *   SIM_MODELOS     sonnet (o do ar), opus, haiku — separados por vírgula. Padrão: sonnet.
 *   SIM_REPETICOES  quantas vezes cada conversa (padrão 1).
 *   SIM_SO          só estes cenários (ids separados por vírgula).
 *   SIM_REGRAS      as regras do dono (o campo do painel), se quiser testar.
 *   SIM_SAIDA       a pasta do resultado (padrão: uma pasta nova no tmp do sistema).
 *   SIM_LOJA        a loja de onde ler o catálogo (padrão: a do ar).
 *
 * Na pasta do resultado: `respostas.jsonl` (tudo de cada resposta),
 * `resumo.json` (por modelo: conferência, custo e tempo) e `revisao.md` (as
 * respostas EMBARALHADAS por cenário, pra dar nota sem saber o modelo; o
 * gabarito fica em `chaves.json`).
 *
 * ANTES x DEPOIS de uma mudança nas instruções, no catálogo ou nas
 * ferramentas: rode a versão de antes numa cópia do backend do main
 * (`git archive origin/main apps/backend/src | tar -x -C <pasta>`, com esta
 * pasta, o `tsconfig.json`, o `package.json` e os `node_modules` ao lado; o
 * que a versão de antes não tem, como uma ferramenta nova, sai das esperas de
 * `cenarios.ts` na cópia) e a de depois aqui. O `juntar.ts` embaralha as
 * duas numa revisão às cegas só e, com as notas, dá a média de cada uma.
 */
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import Anthropic from "@anthropic-ai/sdk"
import {
  contextoDaConversa,
  instrucoesDoAtendente,
  responderComIa,
  type ClienteDaIa,
} from "../../src/lib/whatsapp/atendente"
import { catalogoEmTexto } from "../../src/lib/whatsapp/catalogo"
import { duvidasDaLoja } from "../../src/lib/whatsapp/duvidas"
import { FERRAMENTAS_DA_LOJA } from "../../src/lib/whatsapp/ferramentas"
import {
  conversaPraIa,
  RESPOSTA_DE_SOCORRO,
  textoPraEnviar,
  type MensagemLida,
} from "../../src/lib/whatsapp/regras"
import { CENARIOS, type Cenario } from "./cenarios"
import { conferir, type Chamada } from "./conferir"
import { preencher, RESUMO_DO_CLIENTE, usarFerramentaDeTeste } from "./ferramentas-de-teste"
import { lerCatalogoDoSite } from "./paginas"

type Preco = { entrada: number; saida: number; cacheLido: number; cache5m: number; cache1h: number }
const MODELOS: Record<string, { id: string; preco: Preco }> = {
  sonnet: {
    id: "claude-sonnet-5-5",
    preco: { entrada: 2, saida: 10, cacheLido: 0.2, cache5m: 2.5, cache1h: 4 },
  },
  opus: {
    id: "claude-opus-5-5",
    preco: { entrada: 4, saida: 20, cacheLido: 0.2, cache5m: 5, cache1h: 8 },
  },
  haiku: {
    id: "claude-haiku-4-5",
    preco: { entrada: 1, saida: 5, cacheLido: 0.1, cache5m: 1.25, cache1h: 2 },
  },
}

type Uso = Anthropic.Beta.BetaUsage

function custo(u: Uso, p: Preco): { total: number; gravacao: number } {
  const c = u.cache_creation
  const h1 = c?.ephemeral_1h_input_tokens ?? 0
  const m5 = c ? (c.ephemeral_5m_input_tokens ?? 0) : (u.cache_creation_input_tokens ?? 0)
  const gravacao = (h1 * p.cache1h) / 1e6
  return {
    total:
      ((u.input_tokens ?? 0) * p.entrada +
        (u.output_tokens ?? 0) * p.saida +
        (u.cache_read_input_tokens ?? 0) * p.cacheLido +
        m5 * p.cache5m) /
        1e6 +
      gravacao,
    gravacao,
  }
}

/**
 * O cliente da IA trocando só o modelo. O que o modelo não aceita (o esforço,
 * no Haiku; a reserva da Anthropic) sai na primeira recusa, e fica anotado.
 */
function clienteDoModelo(
  real: Anthropic,
  id: string,
  tirar: Set<string>,
  usos: Uso[]
): ClienteDaIa {
  async function criar(
    corpo: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming,
    tentativa = 0
  ): Promise<Anthropic.Beta.BetaMessage> {
    const pedido = { ...corpo, model: id } as Record<string, unknown>
    if (tirar.has("effort")) delete pedido.output_config
    if (tirar.has("fallbacks")) {
      delete pedido.fallbacks
      pedido.betas = ((pedido.betas as string[]) ?? []).filter(
        (b) => !b.startsWith("server-side-fallback")
      )
    }
    try {
      const r = await real.beta.messages.create(
        pedido as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming
      )
      usos.push(r.usage)
      return r
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const qual = /fallback/i.test(msg)
        ? "fallbacks"
        : /effort|output_config/i.test(msg)
          ? "effort"
          : null
      if ((e as { status?: number }).status === 400 && qual && !tirar.has(qual) && tentativa < 3) {
        tirar.add(qual)
        return criar(corpo, tentativa + 1)
      }
      throw e
    }
  }
  return { beta: { messages: { create: criar } } }
}

async function principal() {
  const env = process.env
  // Os links da sacola e do refazer são assinados (`lib/crm/voltar.ts`); aqui são de mentira.
  env.JWT_SECRET ||= "so-pra-assinar-os-links-da-simulacao"
  const loja = env.SIM_LOJA ?? "https://www.fuckingbarba.com.br"
  const falsa = env.SIM_FALSA === "1"
  const chave = falsa
    ? "sk-ant-teste"
    : readFileSync((env.SIM_CHAVE ?? "").replace(/^~/, homedir()), "utf8").trim()
  const real = new Anthropic({
    apiKey: chave,
    baseURL: falsa ? "http://127.0.0.1:4380" : undefined,
    maxRetries: 6,
    timeout: 120_000,
  })
  const saida = env.SIM_SAIDA ?? mkdtempSync(join(tmpdir(), "simular-atendente-"))
  mkdirSync(saida, { recursive: true })

  const produtos = await lerCatalogoDoSite(loja)
  const catalogo = catalogoEmTexto(produtos, loja)
  const duvidas = await duvidasDaLoja(loja)
  const instrucoes = instrucoesDoAtendente({
    loja,
    catalogo,
    duvidas,
    regras: env.SIM_REGRAS?.trim() || null,
  })
  writeFileSync(join(saida, "instrucoes.txt"), instrucoes)
  console.log(
    `${produtos.length} produtos; instruções com ${instrucoes.length} letras` +
      `${duvidas ? "" : " (as dúvidas da loja NÃO carregaram)"}; resultado em ${saida}`
  )

  const so = (env.SIM_SO ?? "").split(",").filter(Boolean)
  const cenarios = CENARIOS.filter((c) => !so.length || so.includes(c.id))
  const nomes = (env.SIM_MODELOS ?? "sonnet").split(",").map((n) => n.trim())
  const desconhecido = nomes.find((n) => !MODELOS[n])
  if (desconhecido) {
    console.error(`modelo desconhecido: ${desconhecido} (são: ${Object.keys(MODELOS).join(", ")})`)
    process.exit(1)
  }
  const repeticoes = Number(env.SIM_REPETICOES ?? 1)
  const linhas: Record<string, unknown>[] = []

  await Promise.all(
    nomes.map(async (nome) => {
      const m = MODELOS[nome]
      const tirar = new Set<string>()
      for (let rep = 1; rep <= repeticoes; rep++)
        for (const c of cenarios) {
          const agora = new Date()
          const usos: Uso[] = []
          const chamadas: Chamada[] = []
          const depois: string[] = []
          const mensagens: MensagemLida[] = c.falas.map((f, i) => ({
            autor: f.de === "cliente" ? "cliente" : "bot",
            tipo: "texto",
            texto: preencher(f.texto),
            em: new Date(agora.getTime() - (c.falas.length - i) * 20_000),
          }))
          const inicio = Date.now()
          let r: { texto: string | null; equipe: string | null; erro?: string }
          try {
            const resposta = await responderComIa({
              cliente: clienteDoModelo(real, m.id, tirar, usos),
              instrucoes,
              contexto: contextoDaConversa({
                agora,
                nome: c.nome,
                cliente: c.cliente ? RESUMO_DO_CLIENTE : null,
              }),
              conversa: conversaPraIa(mensagens)!,
              ferramentas: FERRAMENTAS_DA_LOJA,
              executar: async (n, entrada) => {
                const res = usarFerramentaDeTeste(n, entrada, {
                  produtos,
                  cliente: Boolean(c.cliente),
                  loja,
                  agora,
                  depois,
                })
                chamadas.push({
                  nome: n,
                  entrada,
                  resultado: res?.conteudo ?? null,
                  erro: Boolean(res?.erro),
                })
                return res
              },
            })
            r =
              resposta.tipo === "recusou"
                ? { texto: RESPOSTA_DE_SOCORRO, equipe: "recusou" }
                : { texto: textoPraEnviar(resposta.texto), equipe: resposta.equipe }
          } catch (e) {
            r = { texto: null, equipe: null, erro: e instanceof Error ? e.message : String(e) }
          }
          const contas = usos.map((u) => custo(u, m.preco))
          const conferencia = conferir(c, { ...r, chamadas, extras: depois }, instrucoes, preencher)
          const linha = {
            modelo: nome,
            cenario: c.id,
            rep,
            ...r,
            extras: depois,
            chamadas,
            chamadasIa: usos.length,
            ms: Date.now() - inicio,
            custo: contas.reduce((s, x) => s + x.total, 0),
            gravacao: contas.reduce((s, x) => s + x.gravacao, 0),
            usos,
            tirou: [...tirar],
            ...conferencia,
          }
          linhas.push(linha)
          appendFileSync(join(saida, "respostas.jsonl"), `${JSON.stringify(linha)}\n`)
          console.log(
            `${nome} r${rep} ${c.id}: ${r.erro ? `ERRO ${r.erro.slice(0, 100)}` : `${(linha.ms / 1000).toFixed(1)} s, US$ ${linha.custo.toFixed(4)}`}` +
              `${chamadas.length ? `, ${chamadas.map((x) => x.nome).join("+")}` : ""}${r.equipe ? ", equipe" : ""}` +
              `${conferencia.falhas.length ? ` ✗ ${conferencia.falhas.join("; ")}` : ""}`
          )
        }
    })
  )

  // O resumo por modelo; a gravação do catálogo à parte (a 1ª resposta de cada modelo grava).
  const resumo: Record<string, unknown> = {}
  for (const nome of nomes) {
    const ls = linhas.filter((l) => l.modelo === nome)
    const ms = ls.map((l) => Number(l.ms)).sort((a, b) => a - b)
    const morno =
      ls.reduce((s, l) => s + Number(l.custo) - Number(l.gravacao), 0) / Math.max(1, ls.length)
    resumo[nome] = {
      respostas: ls.length,
      passou: ls.filter((l) => !(l.falhas as string[]).length).length,
      falhas: ls.flatMap((l) => (l.falhas as string[]).map((f) => `${l.cenario} r${l.rep}: ${f}`)),
      avisos: ls.flatMap((l) => (l.avisos as string[]).map((a) => `${l.cenario} r${l.rep}: ${a}`)),
      custoTotal: ls.reduce((s, l) => s + Number(l.custo), 0),
      custoPorRespostaSemGravar: morno,
      maiorGravacao: Math.max(0, ...ls.map((l) => Number(l.gravacao))),
      tempoMediano: ms[Math.floor(ms.length / 2)] / 1000,
    }
  }
  writeFileSync(join(saida, "resumo.json"), JSON.stringify(resumo, null, 1))

  // As respostas embaralhadas por cenário, pra nota às cegas.
  const chaves: Record<string, { modelo: string; rep: number }> = {}
  let md = "# Revisão às cegas\n"
  for (const c of cenarios as Cenario[]) {
    const ls = linhas.filter((l) => l.cenario === c.id).sort(() => Math.random() - 0.5)
    md += `\n## ${c.id} — ${c.titulo}\n`
    for (const f of c.falas) md += `> [${f.de}] ${preencher(f.texto)}\n`
    md += `\nBOM: ${preencher(c.bom)}\n`
    ls.forEach((l, i) => {
      const letra = String.fromCharCode(65 + i)
      chaves[`${c.id}/${letra}`] = { modelo: String(l.modelo), rep: Number(l.rep) }
      const ch = (l.chamadas as Chamada[])
        .map((x) => `${x.nome}(${JSON.stringify(x.entrada)})`)
        .join("; ")
      md += `\n### ${letra} | ferramentas: ${ch || "-"} | equipe: ${l.equipe ?? "-"} | pix separado: ${(l.extras as string[]).length > 0}\n${l.texto ?? `[ERRO] ${l.erro}`}\n`
    })
  }
  writeFileSync(join(saida, "revisao.md"), md)
  writeFileSync(join(saida, "chaves.json"), JSON.stringify(chaves, null, 1))

  for (const [nome, r] of Object.entries(resumo) as [string, Record<string, unknown>][])
    console.log(
      `\n${nome}: passou ${r.passou}/${r.respostas} | US$ ${Number(r.custoTotal).toFixed(3)} no total | ` +
        `US$ ${Number(r.custoPorRespostaSemGravar).toFixed(4)} por resposta sem gravar | ` +
        `gravar o catálogo: US$ ${Number(r.maiorGravacao).toFixed(3)} | ${r.tempoMediano} s (mediana)`
    )
  console.log(`\nresultado: ${saida}`)
}

principal().catch((e) => {
  console.error(e)
  process.exit(1)
})
