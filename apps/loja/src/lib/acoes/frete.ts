"use server"

import { cliente } from "@/lib/medusa"
import { limparCep } from "@/lib/cep"

/**
 * CALCULAR O FRETE ANTES DE TER CARRINHO.
 *
 * A calculadora de CEP da página de produto e a da sacola chamam isto. Ela
 * fala com `POST /store/frete`, uma rota nossa, e não com a do Medusa: a do
 * Medusa exige `cart_id`, e na PDP não existe carrinho — quem está olhando o
 * produto ainda não pôs nada na sacola.
 *
 * ┌─ POR QUE AÇÃO DE SERVIDOR, E NÃO `fetch` DO NAVEGADOR ─────────────────┐
 * │ A cotação precisa da chave publicável e do endereço do backend. Os     │
 * │ dois já vazam pro navegador em outras chamadas — a chave é pública por │
 * │ desenho —, mas passar por aqui evita uma segunda cópia da URL do       │
 * │ Medusa dentro do bundle e mantém a tela falando só com a própria loja. │
 * │ De quebra, o erro chega tratado em português em vez de um 503 cru.     │
 * └────────────────────────────────────────────────────────────────────────┘
 */

export type OpcaoCotada = {
  faixa: "economica" | "expressa"
  nome: string
  preco: number
  transportadora: string | null
  servico: string | null
  prazo: string | null
}

export type Cotacao =
  | {
      ok: true
      cep: string
      emergencia: boolean
      /**
       * Quanto falta, em reais, pro frete grátis. `null` sem promoção,
       * `0` quando já alcançou.
       *
       * Vem do servidor porque é ele quem sabe o preço de cada item — a
       * tela sabe o que está selecionado e não quanto custa, e não pode
       * saber: valor que vem do navegador é valor que o navegador escolhe.
       */
      faltaPraGratis: number | null
      opcoes: OpcaoCotada[]
    }
  | { ok: false; mensagem: string }

/** O que a tela diz quando a transportadora não respondeu. */
const NAO_DEU =
  "Não consegui calcular o frete pra esse CEP agora. Tenta de novo em instantes."

export async function cotarFrete(
  cep: string,
  itens: { varianteId: string; quantidade: number }[]
): Promise<Cotacao> {
  const limpo = limparCep(cep)
  if (!limpo) return { ok: false, mensagem: "O CEP tem oito dígitos." }
  if (!itens.length) return { ok: false, mensagem: NAO_DEU }

  const sdk = cliente()
  if (!sdk) return { ok: false, mensagem: NAO_DEU }

  try {
    const { frete } = await sdk.client.fetch<{
      frete: {
        cep: string
        emergencia: boolean
        faltaPraGratis: number | null
        opcoes: OpcaoCotada[]
      }
    }>("/store/frete", {
      method: "POST",
      body: {
        cep: limpo,
        itens: itens.map((i) => ({
          variante_id: i.varianteId,
          quantidade: i.quantidade,
        })),
      },
    })

    if (!frete?.opcoes?.length) return { ok: false, mensagem: NAO_DEU }
    return {
      ok: true,
      cep: frete.cep,
      emergencia: frete.emergencia,
      faltaPraGratis: frete.faltaPraGratis ?? null,
      opcoes: frete.opcoes,
    }
  } catch {
    /*
      Sem `registrar(e)` barulhento: CEP que não existe, transportadora fora
      do ar e cliente digitando devagar caem todos aqui, e nenhum deles é
      defeito da loja. Quem precisa saber que a Frenet caiu é o log do
      backend, que já anota — este lado só precisa dizer a verdade na tela.
    */
    return { ok: false, mensagem: NAO_DEU }
  }
}
