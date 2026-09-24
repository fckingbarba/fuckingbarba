import { buscarPromocao, home } from "@/lib/medusa"
import { OfertasRelampago } from "./ofertas-relampago"

/**
 * A faixa de ofertas relâmpago.
 *
 * Só aparece quando existe promoção **com data de fim** no catálogo. Sem
 * prazo não há contagem regressiva honesta — e contador que corre sem nada
 * acabando no fim é urgência inventada, que no Brasil não é só falta de
 * educação: é publicidade enganosa pelo CDC.
 *
 * Pra ligar: no admin do Medusa, Price Lists → a promoção → data de fim.
 * A seção acende sozinha e some sozinha quando a data passa. O título vem
 * do painel ("Layout da home").
 */
export async function Ofertas() {
  const [promocao, { conteudo }] = await Promise.all([buscarPromocao(), home()])
  if (!promocao) return null
  return <OfertasRelampago terminaEm={promocao.termina_em} titulo={conteudo.ofertas.titulo} />
}
