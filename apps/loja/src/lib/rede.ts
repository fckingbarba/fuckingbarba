import { unstable_rethrow } from "next/navigation"

/**
 * QUANDO A AÇÃO NEM VOLTA DO SERVIDOR
 *
 * Server action, vista do navegador, é um `fetch`. Sem internet — o metrô, o
 * elevador, o 4G que piscou — ele rejeita, e promessa rejeitada dentro de uma
 * transição sobe pro boundary de erro do React. Na sacola, que mora no layout
 * raiz, esse boundary é o `global-error`: um "+" apertado sem sinal trocava o
 * site inteiro por "Essa página não carregou" (24/09). No "Adicionar à
 * sacola", a página.
 *
 * `semQueda` chama a ação e, se ela não voltar, devolve o que a tela precisa
 * pra dizer isso e continuar de pé. As ações já não lançam (cada uma devolve
 * `{ ok, erro }`); o que chega no `catch` é rede, ou o servidor da loja fora
 * do ar.
 *
 * O `redirect` do Next TAMBÉM chega como rejeição — é assim que a ação de
 * pagar leva pra tela de obrigado. Esse passa direto (`unstable_rethrow`):
 * engolido aqui, a compra fechava e a pessoa ficava parada no checkout.
 */

export const SEM_CONEXAO = "A conexão caiu. Confere a internet e tenta de novo."

export async function semQueda<T>(chamar: () => Promise<T>, seCair: () => T): Promise<T> {
  try {
    return await chamar()
  } catch (e) {
    unstable_rethrow(e)
    console.warn("[rede] a ação não voltou:", e)
    return seCair()
  }
}
