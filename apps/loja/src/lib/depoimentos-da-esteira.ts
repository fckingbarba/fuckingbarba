import { AVALIACOES, TRECHOS, type Depoimento } from "@/conteudo/depoimentos"
import { avaliacoesDoMedusa, semRepetidas } from "@/lib/avaliacoes"

/**
 * O QUE A ESTEIRA DA HOME MOSTRA — as avaliações e os trechos das entrevistas,
 * cada um uma vez só.
 *
 * Este arquivo é um pedaço de JavaScript À PARTE: a esteira o busca com
 * `import()` só quando a seção chega perto da tela
 * (`components/home/esteira-de-avaliacoes.tsx`), e é por isso que os textos
 * de `conteudo/depoimentos.ts` e a busca das avaliações de quem comprou
 * moram aqui, e não lá — lá, pesariam na primeira tela de toda visita.
 *
 * As de quem comprou vêm da `/api/avaliacoes` (as aprovadas no painel, pelo
 * cache da loja). Sem resposta, a esteira segue com o resto.
 */
export async function depoimentosDaEsteira(): Promise<Depoimento[]> {
  const doMedusa = await fetch("/api/avaliacoes")
    .then((r) => (r.ok ? (r.json() as Promise<{ avaliacoes?: unknown }>) : { avaliacoes: [] }))
    .then((c) => avaliacoesDoMedusa(c.avaliacoes))
    .catch(() => [])
  return [...semRepetidas([...doMedusa, ...AVALIACOES]), ...semRepetidas(TRECHOS)]
}
