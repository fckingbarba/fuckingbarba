"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import {
  ehPersonalizado,
  NOME_DA_LINHA,
  NOME_DO_PAPEL,
  PAPEIS,
  PAPEIS_AJUSTAVEIS,
  type Area,
  type Papel,
  type PapelAjustavel,
} from "@/lib/equipe"
import type { EstadoConvite, ResultadoDaMudanca } from "@/lib/equipe-visivel"
import { medusa, type Resposta } from "@/lib/medusa"

/**
 * AS AÇÕES DA TELA "EQUIPE E ACESSOS" — convidar, mudar o papel, tirar da
 * equipe, reenviar o convite, salvar a tabela do que cada papel abre, e
 * criar, renomear e apagar os papéis do dono.
 *
 * Quem decide se pode é o Medusa (`POST /dashboard/equipe`,
 * `/dashboard/equipe/:id`, `/dashboard/acessos`, `/dashboard/papeis` e
 * `/dashboard/papeis/:id`): só o dono, ninguém mexe em si mesmo, a loja
 * nunca fica sem dono, o dono abre tudo. Aqui mora só a frase de cada
 * resposta.
 */

const GENERICO = "Não consegui falar com a loja agora. Tenta de novo em instantes."

const FRASES: Record<string, string> = {
  sem_acesso: "Só o dono mexe na equipe.",
  nao_e_dono: "Só o dono mexe na equipe.",
  a_si_mesmo: "Ninguém muda o próprio acesso. Peça pra outro dono.",
  ultimo_dono: "A loja precisa de pelo menos um dono. Faça outra pessoa dono antes.",
  ja_removido: "Essa pessoa já saiu da equipe.",
  ja_entrou: "Essa pessoa já entrou — não precisa mais de convite.",
  nao_encontrado: "Não achei essa pessoa. Recarregue a página.",
  ja_na_equipe: "Esse e-mail já está na equipe.",
  acessos_invalidos: "Não consegui ler a tabela. Recarregue a página e marque de novo.",
  linha_fixa:
    "O Início abre pra todo mundo, a Equipe é só do dono, e o telefone dos clientes segue a Operação e o Marketing — essas não mudam.",
  sem_a_area_de_fora:
    "O que mora dentro de uma área só abre com ela. Recarregue a página e marque de novo.",
  papel_invalido: "Esse papel não existe mais. Recarregue a página.",
  papeis_mudaram:
    "Um papel foi criado ou apagado enquanto você marcava. Recarregue a página e marque de novo.",
  nome_repetido: "Já tem um papel com esse nome. Escolha outro.",
  muitos_papeis: "A loja já tem 10 papéis criados. Apague um antes de criar outro.",
  papel_com_gente:
    "Tem gente com esse papel. Mude o papel dessas pessoas antes de apagar — convidados contam.",
  mudanca_invalida: "Escreve o nome do papel, de 2 a 30 letras.",
}

const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? "").trim()

/** Token recusado no meio do caminho: sai do painel, com o recado certo. */
function seRecusou(r: Resposta) {
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
}

export async function convidar(anterior: EstadoConvite, fd: FormData): Promise<EstadoConvite> {
  const valores = {
    nome: texto(fd, "nome"),
    email: texto(fd, "email").toLowerCase(),
    papel: texto(fd, "papel"),
  }
  const rodada = anterior.rodada + 1

  const r = await medusa("/dashboard/equipe", { corpo: valores, token: "sessao" })
  seRecusou(r)

  if (r.status === 200) {
    revalidatePath("/configuracoes/equipe")
    return {
      ok: true,
      rodada,
      erros: {},
      valores: { nome: "", email: "", papel: "operacao" },
      aviso:
        r.corpo.email_enviado === true
          ? `Convite mandado pra ${valores.email}.`
          : "Convite criado, mas o e-mail não saiu. Use “Reenviar convite” daqui a pouco.",
    }
  }

  const motivo = String(r.corpo.message ?? "")
  const erros: EstadoConvite["erros"] =
    motivo === "nome_invalido"
      ? { nome: "Escreve o nome, de 2 a 80 letras." }
      : motivo === "email_invalido"
        ? { email: "Confere o e-mail." }
        : motivo === "papel_invalido"
          ? { papel: "Escolhe um papel." }
          : motivo === "ja_na_equipe"
            ? { email: FRASES.ja_na_equipe }
            : {}
  const deCampo = Object.keys(erros).length > 0
  return {
    ok: false,
    rodada,
    erros,
    valores,
    aviso: deCampo ? "" : (FRASES[motivo] ?? GENERICO),
  }
}

type Mudanca = { papel: Papel } | { acao: "remover" | "reenviar" }

async function mudar(id: string, mudanca: Mudanca): Promise<ResultadoDaMudanca> {
  // Só um id de membro vai pro endereço — nada de barra ou de caminho no meio.
  if (!/^eqp_[0-9A-Za-z]{10,40}$/.test(id))
    return { ok: false, aviso: "", erro: FRASES.nao_encontrado }

  const r = await medusa(`/dashboard/equipe/${id}`, { corpo: mudanca, token: "sessao" })
  seRecusou(r)

  if (r.status === 200) {
    revalidatePath("/configuracoes/equipe")
    const membro = (r.corpo.membro ?? {}) as {
      nome?: string
      email?: string
      papel_nome?: string
    }
    const nome = membro.nome ?? "A pessoa"
    const aviso =
      "papel" in mudanca
        ? `${nome} agora é ${membro.papel_nome ?? "do papel novo"}. Vale a partir do próximo clique.`
        : mudanca.acao === "remover"
          ? `${nome} saiu da equipe. O acesso caiu na hora.`
          : r.corpo.email_enviado === true
            ? `Convite mandado de novo pra ${membro.email ?? nome}. Vale mais 7 dias.`
            : "O prazo do convite foi renovado, mas o e-mail não saiu. Tenta de novo daqui a pouco."
    return { ok: true, aviso, erro: "" }
  }
  return { ok: false, aviso: "", erro: FRASES[String(r.corpo.message ?? "")] ?? GENERICO }
}

export async function mudarPapel(id: string, papel: string): Promise<ResultadoDaMudanca> {
  if (!(PAPEIS as string[]).includes(papel) && !ehPersonalizado(papel))
    return { ok: false, aviso: "", erro: GENERICO }
  return mudar(id, { papel: papel as Papel })
}

export async function tirarDaEquipe(id: string): Promise<ResultadoDaMudanca> {
  return mudar(id, { acao: "remover" })
}

export async function reenviarConvite(id: string): Promise<ResultadoDaMudanca> {
  return mudar(id, { acao: "reenviar" })
}

type Mudou = { papel?: unknown; area?: unknown; abre?: unknown }

/** "Operação agora abre “Cupons e descontos”." — ou quantas mudaram. */
function fraseDosAcessos(mudou: Mudou[], nomes: Record<string, string>): string {
  const [m] = mudou
  if (mudou.length === 1 && typeof m.papel === "string" && typeof m.area === "string") {
    const papel =
      NOME_DO_PAPEL[m.papel as PapelAjustavel] ??
      (nomes[m.papel] as string | undefined) ??
      "O papel"
    const area = NOME_DA_LINHA[m.area as Area] ?? m.area
    return `${papel} ${m.abre === true ? "agora abre" : "não abre mais"} “${area}”.`
  }
  return `Acessos salvos: ${mudou.length} mudanças.`
}

/**
 * SALVAR A TABELA "O QUE CADA PAPEL ABRE" — a coluna inteira da operação,
 * do marketing e de cada papel criado pelo dono, como está na tela. O Medusa
 * confere tudo de novo (só o dono; o Início e a Equipe não mudam; o que mora
 * dentro de uma área só com ela; nenhum papel criado ou apagado no meio do
 * caminho) e responde o que mudou. `nomes` é só pra frase do aviso.
 */
export async function salvarAcessos(
  colunas: Record<string, Area[]>,
  nomes: Record<string, string> = {}
): Promise<ResultadoDaMudanca> {
  const papeis = Object.keys(colunas ?? {}).filter(
    (p) => (PAPEIS_AJUSTAVEIS as readonly string[]).includes(p) || ehPersonalizado(p)
  )
  const acesso = Object.fromEntries(
    papeis.map((p) => [
      p,
      Array.isArray(colunas[p]) ? colunas[p].filter((a) => typeof a === "string") : [],
    ])
  )
  const r = await medusa("/dashboard/acessos", { corpo: { acesso }, token: "sessao" })
  seRecusou(r)

  if (r.status === 200) {
    revalidatePath("/configuracoes/equipe")
    const mudou = Array.isArray(r.corpo.mudou) ? (r.corpo.mudou as Mudou[]) : []
    const aviso = mudou.length
      ? `${fraseDosAcessos(mudou, nomes)} Vale a partir do próximo clique de cada pessoa.`
      : "Nada mudou: a tabela já estava assim."
    return { ok: true, aviso, erro: "" }
  }
  return { ok: false, aviso: "", erro: FRASES[String(r.corpo.message ?? "")] ?? GENERICO }
}

/**
 * CRIAR UM PAPEL — com o nome que o dono escolheu e, se ele quiser, começando
 * com o que a operação ou o marketing abrem agora. Ele aparece como uma
 * coluna a mais na tabela, e como opção no convite e no "Mudar".
 */
export async function criarPapel(nome: string, igualA: string): Promise<ResultadoDaMudanca> {
  const corpo = {
    nome: String(nome ?? "").trim(),
    ...((PAPEIS_AJUSTAVEIS as readonly string[]).includes(igualA) ? { igualA } : {}),
  }
  const r = await medusa("/dashboard/papeis", { corpo, token: "sessao" })
  seRecusou(r)

  if (r.status === 200) {
    revalidatePath("/configuracoes/equipe")
    const papel = (r.corpo.papel ?? {}) as { nome?: string }
    return {
      ok: true,
      aviso: `Papel “${papel.nome ?? corpo.nome}” criado. Marque na tabela o que ele abre e salve.`,
      erro: "",
    }
  }
  const motivo = String(r.corpo.message ?? "")
  const erro = motivo === "nome_invalido" ? FRASES.mudanca_invalida : FRASES[motivo]
  return { ok: false, aviso: "", erro: erro ?? GENERICO }
}

async function mudarOPapel(
  id: string,
  corpo: { nome: string } | { acao: "apagar" }
): Promise<ResultadoDaMudanca> {
  // Só um id de papel vai pro endereço — nada de barra ou de caminho no meio.
  if (!ehPersonalizado(id)) return { ok: false, aviso: "", erro: FRASES.papel_invalido }

  const r = await medusa(`/dashboard/papeis/${id}`, { corpo, token: "sessao" })
  seRecusou(r)

  if (r.status === 200) {
    revalidatePath("/configuracoes/equipe")
    const aviso =
      "nome" in corpo
        ? `Agora o papel se chama “${corpo.nome}”.`
        : "Papel apagado. As caixinhas dele saíram da tabela."
    return { ok: true, aviso, erro: "" }
  }
  const motivo = String(r.corpo.message ?? "")
  const erro = motivo === "nao_encontrado" ? FRASES.papel_invalido : FRASES[motivo]
  return { ok: false, aviso: "", erro: erro ?? GENERICO }
}

export async function renomearPapel(id: string, nome: string): Promise<ResultadoDaMudanca> {
  return mudarOPapel(id, { nome: String(nome ?? "").trim() })
}

export async function apagarPapel(id: string): Promise<ResultadoDaMudanca> {
  return mudarOPapel(id, { acao: "apagar" })
}
