import { buscarPromocao, home } from "@/lib/medusa"
import { OfertasRelampago } from "./ofertas-relampago"

/**
 * A faixa de ofertas relâmpago.
 *
 * Sempre ligada, com o contador zerando à meia-noite de Brasília todo dia —
 * pedido da loja em 24/09. Antes ela só aparecia com promoção com data de fim
 * no catálogo, porque contador que zera sem nenhum preço mudar pode ser lido
 * como urgência inventada (publicidade enganosa, CDC art. 37). O risco foi
 * explicado ao dono e ele escolheu o contador sempre ligado.
 *
 * A promoção com prazo (admin do Medusa → Price Lists → data de fim) ainda
 * conta num caso: se ela acabar antes da meia-noite, o contador vai até ela.
 * O título vem do painel ("Layout da home"), que também liga e desliga a
 * seção.
 */
export async function Ofertas() {
  const [promocao, { conteudo }] = await Promise.all([buscarPromocao(), home()])
  return (
    <OfertasRelampago
      promocaoTerminaEm={promocao?.termina_em ?? null}
      titulo={conteudo.ofertas.titulo}
    />
  )
}
