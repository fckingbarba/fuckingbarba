"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import {
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
 * equipe, reenviar o convite, e salvar a tabela do que cada papel abre.
 *
 * Quem decide se pode é o Medusa (`POST /dashboard/equipe`,
 * `/dashboard/equipe/:id` e `/dashboard/acessos`): só o dono, ninguém mexe
 * em si mesmo, a loja nunca fica sem dono, o dono abre tudo. Aqui mora só a
 * frase de cada resposta.
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
  linha_fixa: "O Início abre pra todo mundo, e a Equipe é só do dono — essas duas não mudam.",
  sem_a_area_de_fora:
    "O que mora dentro de uma área só abre com ela. Recarregue a página e marque de novo.",
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
    const membro = (r.corpo.membro ?? {}) as { nome?: string; email?: string; papel?: Papel }
    const nome = membro.nome ?? "A pessoa"
    const aviso =
      "papel" in mudanca
        ? `${nome} agora é ${NOME_DO_PAPEL[mudanca.papel]}. Vale a partir do próximo clique.`
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
  if (!(PAPEIS as string[]).includes(papel)) return { ok: false, aviso: "", erro: GENERICO }
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
function fraseDosAcessos(mudou: Mudou[]): string {
  const [m] = mudou
  if (mudou.length === 1 && typeof m.papel === "string" && typeof m.area === "string") {
    const papel = NOME_DO_PAPEL[m.papel as Papel] ?? m.papel
    const area = NOME_DA_LINHA[m.area as Area] ?? m.area
    return `${papel} ${m.abre === true ? "agora abre" : "não abre mais"} “${area}”.`
  }
  return `Acessos salvos: ${mudou.length} mudanças.`
}

/**
 * SALVAR A TABELA "O QUE CADA PAPEL ABRE" — a coluna inteira da operação e
 * do marketing, como está na tela. O Medusa confere tudo de novo (só o dono;
 * o Início e a Equipe não mudam; o que mora dentro de uma área só com ela) e
 * responde o que mudou.
 */
export async function salvarAcessos(
  colunas: Record<PapelAjustavel, Area[]>
): Promise<ResultadoDaMudanca> {
  const acesso = Object.fromEntries(
    PAPEIS_AJUSTAVEIS.map((p) => [
      p,
      Array.isArray(colunas?.[p]) ? colunas[p].filter((a) => typeof a === "string") : [],
    ])
  )
  const r = await medusa("/dashboard/acessos", { corpo: { acesso }, token: "sessao" })
  seRecusou(r)

  if (r.status === 200) {
    revalidatePath("/configuracoes/equipe")
    const mudou = Array.isArray(r.corpo.mudou) ? (r.corpo.mudou as Mudou[]) : []
    const aviso = mudou.length
      ? `${fraseDosAcessos(mudou)} Vale a partir do próximo clique de cada pessoa.`
      : "Nada mudou: a tabela já estava assim."
    return { ok: true, aviso, erro: "" }
  }
  return { ok: false, aviso: "", erro: FRASES[String(r.corpo.message ?? "")] ?? GENERICO }
}
