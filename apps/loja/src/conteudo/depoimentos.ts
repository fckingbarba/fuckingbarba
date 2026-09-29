/**
 * Depoimentos de clientes, em três listas — e cada uma afirma uma coisa
 * diferente pra quem lê.
 *
 * - `AVALIACOES`: uma pessoa identificada deu uma nota ao produto. Nome,
 *   estrela e, com pedido no sistema, o selo de compra verificada.
 * - `TRECHOS`: o que clientes disseram em entrevistas com a loja. Sem nome,
 *   sem estrela e sem selo — ver a última caixa. Vazia desde a 0213: com as
 *   avaliações de quem comprou chegando, os trechos saíram da loja.
 * - `ANTES_E_DEPOIS`: uma avaliação com as duas fotos.
 *
 * **`AVALIACOES` e `ANTES_E_DEPOIS` começam vazias de propósito.** Enquanto
 * estiverem vazias, as seções delas não aparecem — nem meio preenchidas, nem
 * com exemplo. Isso não é excesso de zelo: depoimento inventado é publicidade
 * enganosa (CDC, art. 37), e quando vai junto de estrela em dado estruturado
 * o Google trata como motivo de punição, não de destaque. Prova social falsa
 * também é a coisa que o cliente mais rápido percebe — e a que mais rápido
 * derruba a confiança no resto da página, inclusive no que é verdade.
 *
 * ┌─ COMO PREENCHER UMA AVALIAÇÃO ────────────────────────────────────────┐
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
 *
 * ┌─ TRECHO DE ENTREVISTA NÃO É AVALIAÇÃO ────────────────────────────────┐
 * │ Na tela, o trecho aparece como é: "Entrevista com cliente", sem       │
 * │ nome, sem estrela e sem selo — e fica fora da nota média, do          │
 * │ "em N avaliações" e do dado estruturado do Google. Nome e estrela     │
 * │ diriam que uma pessoa identificada deu aquela nota ao produto, e      │
 * │ numa entrevista isso não aconteceu.                                   │
 * │                                                                       │
 * │ 1. O texto é o que a pessoa DISSE, sem retoque — a mesma regra da     │
 * │    avaliação. Frase escrita pela loja não é trecho, é anúncio.        │
 * │ 2. Um trecho entra uma vez, no produto de que ele fala. Repetir os    │
 * │    do Fator nos quatro kits dele fazia a mesma fala valer por cinco.  │
 * │ 3. Quem AVALIAR depois (o e-mail pedindo avaliação) entra em          │
 * │    `AVALIACOES`, com o nome e a nota que a própria pessoa deu.        │
 * └───────────────────────────────────────────────────────────────────────┘
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

/**
 * O que um cliente disse numa entrevista com a loja: um trecho, e não uma
 * avaliação — sem nome, sem nota e sem selo. Ver a última caixa lá em cima.
 */
export type Trecho = {
  /** O que o cliente disse, sem edição. */
  texto: string
  /** O produto de que o trecho fala — a foto sai do catálogo. */
  produtoHandle: string
}

/** O que a esteira da home e a seção de cada produto mostram: avaliação ou trecho. */
export type Depoimento = Avaliacao | Trecho

export type AntesEDepois = Avaliacao & {
  /** Uma frase curta que resume o depoimento, pra servir de título. */
  titulo: string
  local?: string
  /** Caminhos em `public/`. Sem as duas fotos, o depoimento não entra. */
  fotos: { antes: string; depois: string }
}

/** A esteira da home ("Nossos clientes nos amam") e a seção de cada produto. */
export const AVALIACOES: Avaliacao[] = []

/**
 * Os trechos das entrevistas com clientes — ver a última caixa lá em cima.
 *
 * VAZIA DE PROPÓSITO desde a entrega 0213 (29/09): com as avaliações de quem
 * comprou chegando (a página `/avaliar`, aprovadas no painel), os 160 trechos
 * saíram da esteira da home e da seção de cada produto. O tipo e o caminho
 * ficam, pra lista voltar sem mexer em tela; os textos estão no histórico do
 * git (entrega 0111).
 */
export const TRECHOS: Trecho[] = []

/** O carrossel de antes e depois ("Resultados reais"). */
export const ANTES_E_DEPOIS: AntesEDepois[] = []

/**
 * A nota média que a esteira exibe. Calculada das avaliações que existem
 * aqui — e só delas: trecho de entrevista não tem nota. Não é "a nota da
 * loja": é a média do que está publicado, que é a única coisa que dá pra
 * provar olhando a própria página.
 */
export function notaMedia(avaliacoes: Avaliacao[]): number | null {
  if (!avaliacoes.length) return null
  const soma = avaliacoes.reduce((t, a) => t + a.nota, 0)
  return soma / avaliacoes.length
}
