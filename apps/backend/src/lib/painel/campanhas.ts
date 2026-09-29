import {
  NOME_DO_PUBLICO,
  PUBLICOS,
  resultadoDaCampanha,
  resultadoGuardado,
  textoDoBanco,
  type CampanhaDoBanco,
  type PublicoDaCampanha,
  type RegistroDaCampanha,
  type ResultadoDaCampanha,
  type SituacaoDaCampanha,
  type TextoDaCampanha,
} from "../crm/campanhas"
import type { PedidoDaTela } from "./fluxos"

/**
 * A ABA CAMPANHAS DO CRM (entrega 0206) — a lista, o formulário (os públicos
 * com quantas pessoas cada um tem agora, e os produtos da loja) e o resultado
 * de cada campanha que saiu: por assunto, quem recebeu e comprou em 7 dias, e
 * o controle. Código puro, com testes; quem lê o banco é a rota.
 */

export type CampanhaNaTela = {
  id: string
  situacao: SituacaoDaCampanha
  texto: TextoDaCampanha
  nomeDoPublico: string
  agenda: string | null
  comecouEm: string | null
  acabouEm: string | null
  /** Quem mexeu por último. */
  por: string | null
  /** Só das que começaram a sair. */
  resultado: ResultadoDaCampanha | null
}

export type TelaDasCampanhas = {
  publicos: { id: PublicoDaCampanha; nome: string; pessoas: number }[]
  produtos: { handle: string; nome: string }[]
  campanhas: CampanhaNaTela[]
}

const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null)
const ms = (d: Date | string | null) => (d ? new Date(d).getTime() : 0)
const SITUACOES: readonly SituacaoDaCampanha[] = [
  "rascunho",
  "agendada",
  "enviando",
  "enviada",
  "parada",
]
/** A ordem da lista: a que está saindo, as agendadas, os rascunhos e, no fim, as que já saíram. */
const ORDEM: Record<SituacaoDaCampanha, number> = {
  enviando: 0,
  agendada: 1,
  rascunho: 2,
  enviada: 3,
  parada: 3,
}

export function montarTelaDasCampanhas({
  campanhas,
  registros,
  pedidos,
  publicos,
  produtos,
}: {
  campanhas: readonly (CampanhaDoBanco & { updated_at?: Date | string | null })[]
  /** O registro de cada campanha que começou e não tem o resultado guardado, pelo id. */
  registros: ReadonlyMap<string, readonly RegistroDaCampanha[]>
  pedidos: readonly PedidoDaTela[]
  publicos: Record<PublicoDaCampanha, number>
  produtos: { handle: string; nome: string }[]
}): TelaDasCampanhas {
  const lista = campanhas.map((c): CampanhaNaTela & { _ordem: number } => {
    const situacao = SITUACOES.find((s) => s === c.situacao) ?? "rascunho"
    const texto = textoDoBanco(c)
    const saiu = situacao === "enviando" || situacao === "enviada" || situacao === "parada"
    return {
      id: c.id,
      situacao,
      texto,
      nomeDoPublico: NOME_DO_PUBLICO[texto.publico],
      agenda: iso(c.agenda),
      comecouEm: iso(c.comecou_em),
      acabouEm: iso(c.acabou_em),
      por: c.por,
      resultado:
        resultadoGuardado(c.resultado) ??
        (saiu ? resultadoDaCampanha(texto, registros.get(c.id) ?? [], pedidos) : null),
      _ordem:
        ORDEM[situacao] * 1e15 +
        (situacao === "agendada"
          ? ms(c.agenda)
          : situacao === "rascunho"
            ? -ms(c.updated_at ?? null)
            : -ms(c.comecou_em)),
    }
  })
  return {
    publicos: PUBLICOS.map((id) => ({ id, nome: NOME_DO_PUBLICO[id], pessoas: publicos[id] })),
    produtos,
    campanhas: lista.sort((a, b) => a._ordem - b._ordem).map(({ _ordem, ...c }) => c),
  }
}
