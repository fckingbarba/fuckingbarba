import type { Email } from "../email"
import { LIMITES } from "../cartao/robo"
import { urlDoPainel } from "./convite"
import { botao, cartao, divisor, esc, espaco, moldura, paragrafo, titulo } from "./moldura"

/**
 * O AVISO DO FREIO DO CARTÃO — pra equipe (o dono), no instante em que a
 * loja liga o freio: muita recusa de cartão em pouco tempo, que é o jeito de
 * um robô testando cartão roubado (`lib/cartao/robo.ts`).
 *
 * Quem manda é o `lib/cartao/aviso.ts`, no máximo um por hora. Nada de dado
 * de cliente: são números da loja, e o que fazer.
 */
export function emailDoRoboNoCartao(
  para: string,
  { recusas, terminadas }: { recusas: number; terminadas: number }
): Email {
  const minutos = LIMITES.freio.minutos
  const assunto = "Robô testando cartão na loja: o cartão ficou mais restrito"
  const oQueHouve =
    `Nos últimos ${minutos} minutos, ${recusas} de ${terminadas} tentativas de pagar com cartão ` +
    "foram recusadas. É o jeito de um robô testando cartão roubado: ele tenta um cartão atrás " +
    "do outro pra descobrir quais funcionam."
  const oQueALojaFez =
    "A loja ligou o freio sozinha: o cartão passou a aceitar poucas tentativas por vez, e quem " +
    "for barrado lê que pode pagar no Pix. O Pix segue normal. O freio desliga sozinho quando " +
    "as recusas pararem."
  const oQueFazer =
    "Não precisa fazer nada agora. Se este aviso chegar de novo hoje, vale contar pro suporte do " +
    "Pagar.me que a loja está recebendo teste de cartão."
  const painel = urlDoPainel()
  const link = painel ? `${painel}/observabilidade` : null

  const texto = [
    assunto,
    "",
    oQueHouve,
    "",
    oQueALojaFez,
    "",
    oQueFazer,
    ...(link ? ["", `Na Observabilidade do painel: ${link}`] : []),
  ].join("\n")

  const conteudo = cartao(
    titulo("Robô testando cartão") +
      espaco(12) +
      paragrafo(esc(oQueHouve)) +
      espaco(14) +
      paragrafo(esc(oQueALojaFez), { suave: true }) +
      espaco(18) +
      divisor() +
      espaco(16) +
      paragrafo(esc(oQueFazer), { peso: 700 }) +
      (link ? espaco(22) + botao({ texto: "Ver na Observabilidade", href: link }) : "")
  )

  const html = moldura({
    assunto,
    previa: `${recusas} de ${terminadas} tentativas de cartão recusadas em ${minutos} minutos.`,
    conteudo,
    rodape: "Aviso automático da proteção do cartão, pra quem cuida da loja.",
  })

  return { para, assunto, html, texto }
}
