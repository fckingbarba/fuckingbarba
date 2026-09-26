import type { Achado } from "./marketing-canais"

/**
 * "O QUE OS DADOS DIZEM" — o bloco do Resumo do Marketing que junta as frases
 * de todas as abas (o bloco do protótipo, em `mktResumo`). Código puro, com
 * testes (`__tests__/marketing-achados.unit.spec.ts`); quem lê cada aba é o
 * `ler-marketing.ts`.
 *
 * A ORDEM: primeiro o que pede conserto ("problema"), depois as
 * oportunidades, e o que vai bem por último; no mesmo tipo, a ordem das abas.
 * As frases de "ainda é pouco" de cada aba ficam na aba: aqui só entram se
 * nenhuma aba tiver conclusão — e aí viram uma só. Cabem `ACHADOS_NO_RESUMO`;
 * as outras continuam nas abas (`mais` diz quantas).
 */

/** As abas que têm frases, na ordem da tela. */
export const ABAS_COM_ACHADOS = [
  "funil",
  "canais",
  "produtos",
  "ofertas",
  "clientes",
  "pagamento",
] as const
export type AbaComAchados = (typeof ABAS_COM_ACHADOS)[number]

/** Uma frase do Resumo, com a aba de onde veio (o atalho); `null` na frase de "ainda é pouco". */
export type AchadoDoResumo = Achado & { aba: AbaComAchados | null }

/** Por que as abas do Google (funil, canais, produtos) vieram sem frase. */
export type SemGoogleNoResumo = "desligado" | "invalida" | "recusado" | "fora"

export type AchadosDoResumo = {
  achados: AchadoDoResumo[]
  /** As frases que não couberam: continuam nas abas. */
  mais: number
  /** Sem o Google, faltam as frases do funil, dos canais e dos produtos; `null` com ele. */
  semGoogle: SemGoogleNoResumo | null
}

/** Quantas frases cabem no Resumo (duas fileiras de três no computador). */
export const ACHADOS_NO_RESUMO = 6

const ORDEM_DO_TIPO: Record<Achado["tipo"], number> = {
  problema: 0,
  oportunidade: 1,
  bom: 2,
  info: 3,
}

export const AINDA_E_POUCO: Achado = {
  tipo: "info",
  titulo: "Ainda é pouco pra concluir",
  texto:
    "Com os números do período, qualquer diferença pode ser acaso. Com mais visitas e pedidos " +
    "(depois da virada), aqui aparece o que mais pesa: onde as pessoas desistem, o que não passa no " +
    "pagamento e o produto que muita gente vê e pouca leva.",
}

export const NADA_FORA_DO_COMUM: Achado = {
  tipo: "info",
  titulo: "Nada fora do comum no período",
  texto: "Os números do período não apontam nada que peça atenção. Cada aba tem os detalhes.",
}

export function juntarAchados(
  porAba: Partial<Record<AbaComAchados, Achado[]>>,
  semGoogle: SemGoogleNoResumo | null
): AchadosDoResumo {
  const todos: AchadoDoResumo[] = ABAS_COM_ACHADOS.flatMap((aba) =>
    (porAba[aba] ?? []).map((a) => ({ ...a, aba }))
  )
  // `sort` é estável: no mesmo tipo, fica a ordem das abas.
  const comConclusao = todos
    .filter((a) => a.tipo !== "info")
    .sort((a, b) => ORDEM_DO_TIPO[a.tipo] - ORDEM_DO_TIPO[b.tipo])
  if (!comConclusao.length) {
    // Alguma aba disse "ainda é pouco": uma frase só. Nenhuma frase e sem o Google: não dá pra
    // dizer que está tudo bem (o aviso do Google basta). Com tudo lido e nada: nada fora do comum.
    const frase = todos.length ? AINDA_E_POUCO : semGoogle ? null : NADA_FORA_DO_COMUM
    return { achados: frase ? [{ ...frase, aba: null }] : [], mais: 0, semGoogle }
  }
  return {
    achados: comConclusao.slice(0, ACHADOS_NO_RESUMO),
    mais: Math.max(0, comConclusao.length - ACHADOS_NO_RESUMO),
    semGoogle,
  }
}
