import { AVALIACOES, TRECHOS, type Avaliacao, type Trecho } from "@/conteudo/depoimentos"
import { avaliacoesDoMedusa } from "@/lib/avaliacoes-do-medusa"

/**
 * O QUE A ESTEIRA DA HOME MOSTRA — as avaliações e os trechos das entrevistas.
 *
 * Este arquivo é um pedaço de JavaScript À PARTE: a esteira o busca com
 * `import()` só quando a seção chega perto da tela
 * (`components/home/esteira-de-avaliacoes.tsx`), e é por isso que os textos
 * de `conteudo/depoimentos.ts` e a busca das avaliações de quem comprou
 * moram aqui, e não lá — lá, pesariam na primeira tela de toda visita.
 *
 * NÃO IMPORTA `lib/avaliacoes.ts`: o sorteio mora no JavaScript da primeira
 * tela, e um módulo dividido entre ele e este pedaço vira um terceiro
 * pedaço, que a home baixa a mais (+180 bytes comprimidos, medido na 0152).
 * Quem tira as repetidas é a esteira, com o que já tem.
 *
 * As de quem comprou vêm da `/api/avaliacoes` (as aprovadas no painel, pelo
 * cache da loja). Sem resposta, a esteira segue com o resto.
 */
export async function depoimentosDaEsteira(): Promise<{
  avaliacoes: Avaliacao[]
  trechos: Trecho[]
}> {
  const doMedusa = await fetch("/api/avaliacoes")
    .then((r) => (r.ok ? (r.json() as Promise<{ avaliacoes?: unknown }>) : { avaliacoes: [] }))
    .then((c) => avaliacoesDoMedusa(c.avaliacoes))
    .catch(() => [])
  return { avaliacoes: [...doMedusa, ...AVALIACOES], trechos: TRECHOS }
}
