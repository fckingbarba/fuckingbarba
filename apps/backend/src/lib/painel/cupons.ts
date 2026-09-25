import { DESCONTO_DO_BUMP } from "../bumps"
import type { PoliticaDeFrete } from "../configuracoes"
import { FAIXAS } from "../precos-por-quantidade"

/**
 * OS DESCONTOS QUE A LOJA APLICA SOZINHA — o bloco de baixo da tela de
 * Cupons: ninguém digita nada. Em frase, a partir de onde cada um mora (o
 * desconto por quantidade em `lib/precos-por-quantidade.ts`, a oferta do
 * checkout em `lib/bumps.ts`, o frete grátis nas configurações da loja).
 * Código puro, com testes.
 */

export type DescontoAutomatico = {
  id: "quantidade" | "oferta" | "frete"
  titulo: string
  texto: string
  valendo: boolean
}

const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const reais = (v: number) => REAIS.format(v).replace(/\s/g, " ")

/** "4% levando 2 do mesmo produto; 6% levando 3 ou mais." */
export function fraseDasFaixas(
  faixas: readonly { unidades: number; ate: number | null; desconto: number }[] = FAIXAS
): string {
  const partes = faixas.map((f, i) =>
    i === 0
      ? `${f.desconto}% levando ${f.unidades}${f.ate === null ? " ou mais" : ""} do mesmo produto`
      : `${f.desconto}% levando ${f.unidades}${f.ate === null ? " ou mais" : ""}`
  )
  return `${partes.join("; ")}. O total arredonda pra baixo até o ",90".`
}

export function descontosAutomaticos({
  frete,
  oferta,
}: {
  frete: PoliticaDeFrete
  /** Nos últimos 7 dias: em quantos pedidos pagos a oferta do checkout entrou, e quantos foram. */
  oferta: { aceitas: number; pedidos: number }
}): DescontoAutomatico[] {
  const alvo = (a: string) =>
    a === "todas" ? "em todas as opções da cotação" : "na opção mais barata da cotação"
  return [
    {
      id: "quantidade",
      titulo: "Desconto por quantidade",
      texto: fraseDasFaixas(),
      valendo: true,
    },
    {
      id: "oferta",
      titulo: "Oferta do checkout",
      texto:
        `${DESCONTO_DO_BUMP}% no produto que o motor de recomendação escolhe pra cada sacola.` +
        (oferta.pedidos
          ? ` Entrou em ${oferta.aceitas} de ${oferta.pedidos} ${oferta.pedidos === 1 ? "pedido pago" : "pedidos pagos"} nos últimos 7 dias.`
          : " Nenhum pedido pago nos últimos 7 dias."),
      valendo: true,
    },
    frete.modo === "gratis"
      ? {
          id: "frete",
          titulo: "Frete grátis",
          texto: `Em pedidos a partir de ${reais(frete.piso)} em produtos, ${alvo(frete.alvo)}.`,
          valendo: true,
        }
      : frete.modo === "fixo"
        ? {
            id: "frete",
            titulo: "Frete fixo",
            texto: `${reais(frete.preco)} em pedidos a partir de ${reais(frete.piso)} em produtos, ${alvo(frete.alvo)}.`,
            valendo: true,
          }
        : {
            id: "frete",
            titulo: "Frete grátis",
            texto: "Desligado: quem compra paga o frete da cotação.",
            valendo: false,
          },
  ]
}
