/**
 * O QUE A TELA DIZ QUANDO NÃO DEU — as mesmas frases pra todo parceiro.
 *
 * Cada uma diz O QUE FAZER: "transação não autorizada, código 51" não ajuda
 * ninguém a terminar a compra. E nenhuma diz "saldo insuficiente" ou "cartão
 * bloqueado", mesmo quando o banco conta: quem lê a tela pode não ser o dono
 * do cartão.
 *
 * São iguais nos dois parceiros de propósito: o Marketing (Pagamento e
 * frete) e a porta do cartão contam as recusas pela frase gravada na sessão
 * (`RECUSAS`, no `modules/pagarme/situacao.ts`). Só a do "incerto" leva o
 * nome de quem não respondeu (`recusaIncerta`).
 */
export const RECUSA = {
  antifraude:
    "O pagamento não passou na análise de segurança. Tenta outro cartão ou paga no Pix — nada foi cobrado.",
  banco:
    "O banco do cartão não autorizou o pagamento. Confere os dados, tenta outro cartão ou paga no Pix — nada foi cobrado.",
  dados:
    "Não consegui validar o cartão. Confere número, validade e CVV e tenta de novo — nada foi cobrado.",
  fora: "O pagamento não pôde ser processado agora, e nada foi cobrado. Tenta de novo em instantes ou paga no Pix.",
  pix: "Não consegui gerar o Pix agora, e nada foi cobrado. Tenta de novo em instantes.",
} as const

/** A criação que sumiu no caminho: não se sabe se o parceiro cobrou. */
export const recusaIncerta = (parceiro: string) =>
  `O ${parceiro} não respondeu a tempo. Se aparecer alguma cobrança, ela é estornada sozinha — tenta de novo em instantes.`
