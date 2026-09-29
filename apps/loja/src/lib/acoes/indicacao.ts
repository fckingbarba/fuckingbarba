"use server"

import { lerSessao, medusa } from "@/lib/conta"
import { indicacaoValida, type IndicacaoDaConta } from "@/lib/indicacao"

/**
 * O "PEGAR MEU LINK" do indique um brother em Minha conta (entrega 0215): o
 * Medusa cria o link, se a pessoa ainda não tem, e devolve o mesmo que a
 * leitura (`POST /store/crm/indicacao`).
 */
export async function pegarMeuLink(): Promise<
  { ok: true; indicacao: IndicacaoDaConta } | { ok: false; texto: string }
> {
  const token = await lerSessao()
  if (!token) return { ok: false, texto: "Sua sessão acabou. Entre de novo pra pegar o link." }
  const r = await medusa("/store/crm/indicacao", { corpo: {}, token })
  if (r.status === 401)
    return { ok: false, texto: "Sua sessão acabou. Entre de novo pra pegar o link." }
  if (r.status === 429)
    return { ok: false, texto: "Muitas tentativas nesta hora. Tenta de novo mais tarde." }
  const indicacao = r.status === 200 ? indicacaoValida(r.corpo.indicacao) : null
  if (!indicacao?.indique)
    return { ok: false, texto: "Não consegui criar o link agora. Tenta de novo em instantes." }
  return { ok: true, indicacao }
}
