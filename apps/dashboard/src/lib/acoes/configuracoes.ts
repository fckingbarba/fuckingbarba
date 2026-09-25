"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import type {
  FormularioDaEmergencia,
  FormularioDaEmpresa,
  FormularioDoFrete,
  FormularioDasIntegracoes,
} from "@/lib/configuracoes"
import { medusa, type Resposta } from "@/lib/medusa"
import type { Resultado } from "@/lib/produtos"

/**
 * AS AÇÕES DAS CONFIGURAÇÕES — os dados da empresa, o frete, a emergência e
 * a hora da nota. Quem decide é o Medusa (`/dashboard/configuracoes/*`): o
 * papel (só o dono) e cada campo. Salvo, a loja atualiza em segundos (o
 * Medusa avisa ela) e a aba se refaz.
 */

const GENERICO = "Não consegui falar com a loja agora. Tenta de novo em instantes."
const SEM_PAPEL = "As configurações são só do dono."

export type ResultadoDoFormulario = Resultado & { erros?: Record<string, string> }

function sair(r: Resposta) {
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
}

async function salvar(
  caminho: string,
  corpo: object,
  certo: (r: Resposta) => string
): Promise<ResultadoDoFormulario> {
  const r = await medusa(`/dashboard/configuracoes/${caminho}`, { token: "sessao", corpo })
  sair(r)
  if (r.status === 403) return { ok: false, texto: SEM_PAPEL }
  if (r.status === 422 && r.corpo.erros && typeof r.corpo.erros === "object")
    return {
      ok: false,
      texto: "Confira o que está marcado.",
      erros: r.corpo.erros as Record<string, string>,
    }
  if (r.status !== 200) return { ok: false, texto: GENERICO }
  revalidatePath("/configuracoes", "layout")
  return { ok: true, texto: certo(r) }
}

const naLoja = (r: Resposta) =>
  r.corpo.lojaAvisada === false
    ? " A loja não respondeu ao aviso: a mudança aparece lá em até algumas horas."
    : " A loja já mostra."

export async function salvarIntegracoes(f: FormularioDasIntegracoes) {
  return salvar(
    "integracoes",
    f,
    (r) =>
      "Integrações salvas. Elas carregam na loja depois do “Aceitar” da faixa de cookies." +
      (r.corpo.lojaAvisada === false
        ? " A loja não respondeu ao aviso: a mudança aparece lá em até algumas horas."
        : "")
  )
}

export async function salvarEmpresa(f: FormularioDaEmpresa) {
  return salvar("empresa", f, (r) => `Dados da empresa salvos.${naLoja(r)}`)
}

export async function salvarFrete(f: FormularioDoFrete) {
  return salvar(
    "frete",
    f,
    (r) => `${String(r.corpo.frase ?? "Frete salvo.")} Vale na próxima cotação.`
  )
}

export async function salvarEmergencia(f: FormularioDaEmergencia) {
  return salvar("emergencia", f, () =>
    f.preco.trim()
      ? "Salvo: se a Frenet cair, a loja segue vendendo por esse preço e esse prazo."
      : "Salvo: se a Frenet cair, a loja para de vender até a cotação voltar."
  )
}

export async function mudarJanela(janela: number): Promise<Resultado> {
  return salvar("nota", { janela }, () =>
    janela === 0
      ? "A nota passa a sair logo depois do pagamento."
      : `A nota passa a esperar ${
          janela === 60
            ? "1 hora"
            : janela % 60 === 0
              ? `${janela / 60} horas`
              : `${janela} minutos`
        } depois do pagamento.`
  )
}
