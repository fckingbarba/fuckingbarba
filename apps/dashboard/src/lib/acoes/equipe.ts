"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { NOME_DO_PAPEL, PAPEIS, type Papel } from "@/lib/equipe"
import type { EstadoConvite, ResultadoDaMudanca } from "@/lib/equipe-visivel"
import { medusa, type Resposta } from "@/lib/medusa"

/**
 * AS AÇÕES DA TELA "EQUIPE E ACESSOS" — convidar, mudar o papel, tirar da
 * equipe, reenviar o convite.
 *
 * Quem decide se pode é o Medusa (`POST /dashboard/equipe` e
 * `/dashboard/equipe/:id`): só o dono, ninguém mexe em si mesmo, a loja
 * nunca fica sem dono. Aqui mora só a frase de cada resposta.
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
