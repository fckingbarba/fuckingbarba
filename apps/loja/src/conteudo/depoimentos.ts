/**
 * Depoimentos de clientes. **As duas listas começam vazias de propósito.**
 *
 * Enquanto estiverem vazias, as duas seções de prova social não aparecem na
 * home — nem meio preenchidas, nem com exemplo. Isso não é excesso de zelo:
 * depoimento inventado é publicidade enganosa (CDC, art. 37), e quando vai
 * junto de estrela em dado estruturado o Google trata como motivo de
 * punição, não de destaque. Prova social falsa também é a coisa que o
 * cliente mais rápido percebe — e a que mais rápido derruba a confiança no
 * resto da página, inclusive no que é verdade.
 *
 * ┌─ COMO PREENCHER ──────────────────────────────────────────────────────┐
 * │ 1. Cole o texto EXATAMENTE como o cliente escreveu. Não corrija a     │
 * │    gramática, não "melhore", não encurte. Texto retocado deixa de ser │
 * │    depoimento e vira anúncio seu com nome de outra pessoa.            │
 * │ 2. Nome: como a pessoa se identificou. "André B." está ótimo; nome    │
 * │    completo sem autorização, não.                                     │
 * │ 3. `compraVerificada` só quando existir pedido no sistema com esse    │
 * │    cliente. É uma afirmação sua, e alguém pode pedir pra comprovar.   │
 * │ 4. Foto de antes e depois exige autorização explícita da pessoa —     │
 * │    imagem de rosto é dado pessoal (LGPD), e "ela mandou no WhatsApp"  │
 * │    não é autorização pra publicar no site.                            │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * Exemplo de como fica preenchido (é só um exemplo, não um depoimento):
 *
 *   export const AVALIACOES: Avaliacao[] = [
 *     {
 *       nome: "André B.",
 *       nota: 5,
 *       texto: "Usei por 1 mês e não vi muita coisa, mais continuei e no " +
 *              "terceiro mês começou aparecer novos fios, valeu a paciência.",
 *       compraVerificada: true,
 *       produtoHandle: "fator-de-crescimento-para-barba",
 *     },
 *   ]
 */

export type Avaliacao = {
  nome: string
  /** De 1 a 5, como a pessoa deu. */
  nota: 1 | 2 | 3 | 4 | 5
  /** O texto do cliente, sem edição. */
  texto: string
  /** Só marque quando existir o pedido no sistema. */
  compraVerificada?: boolean
  /** Handle do produto usado — a foto sai do catálogo. */
  produtoHandle?: string
}

export type AntesEDepois = Avaliacao & {
  /** Uma frase curta que resume o depoimento, pra servir de título. */
  titulo: string
  local?: string
  /** Caminhos em `public/`. Sem as duas fotos, o depoimento não entra. */
  fotos: { antes: string; depois: string }
}

/** A esteira de avaliações ("Nossos clientes nos amam"). */
export const AVALIACOES: Avaliacao[] = []

/** O carrossel de antes e depois ("Resultados reais"). */
export const ANTES_E_DEPOIS: AntesEDepois[] = []

/**
 * A nota média que a esteira exibe. Calculada das avaliações que existem
 * aqui — e só delas. Não é "a nota da loja": é a média do que está publicado,
 * que é a única coisa que dá pra provar olhando a própria página.
 */
export function notaMedia(avaliacoes: Avaliacao[]): number | null {
  if (!avaliacoes.length) return null
  const soma = avaliacoes.reduce((t, a) => t + a.nota, 0)
  return soma / avaliacoes.length
}
