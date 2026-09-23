import type { Email } from "../email"
import { caixaDoCodigo } from "./codigo"
import { cartao, divisor, esc, espaco, moldura, paragrafo, titulo } from "./moldura"
import { whatsappNaTela } from "./pedido-confirmado"

/**
 * OS DOIS E-MAILS DA TROCA DE E-MAIL DA CONTA — o código, que vai pro
 * endereço NOVO, e o aviso, que vai pro ANTIGO depois que a troca acontece.
 * Quem manda é `api/store/conta/email/` (a rota que pede o código e a que
 * confirma).
 *
 * SEM LINK NENHUM, nos dois, pela regra do e-mail do código de entrar
 * (`codigo.ts`): e-mail de conta com botão "clique aqui" é o que golpe imita.
 * O aviso pede pra chamar no WhatsApp escrevendo o número, não com link.
 */

/**
 * O CÓDIGO, pro e-mail novo. O assunto é diferente do de entrar ("é o
 * código pra confirmar…", não "é o seu código"): quem recebe precisa saber,
 * pela notificação, que isto não abre conta nenhuma — confirma um e-mail
 * numa conta que já existe.
 */
export function emailDaTroca({
  para,
  codigo,
  minutos,
}: {
  para: string
  codigo: string
  minutos: number
}): Email {
  const assunto = `${codigo} é o código pra confirmar seu e-mail na FuckingBarba`
  const pedido = "Digite na tela da loja pra este passar a ser o e-mail da sua conta."
  const aviso = `Vale por ${minutos} minutos e só funciona uma vez.`
  const naoPediu = "Não pediu? Pode ignorar este e-mail: sem o código, nada muda."

  const texto = [
    "FuckingBarba",
    "",
    `Código pra confirmar seu e-mail: ${codigo}`,
    "",
    pedido,
    aviso,
    "",
    naoPediu,
  ].join("\n")

  const conteudo = cartao(
    titulo("Confirme seu e-mail") +
      espaco(8) +
      paragrafo(esc(pedido), { suave: true }) +
      espaco(24) +
      caixaDoCodigo(codigo) +
      espaco(22) +
      paragrafo(esc(aviso), { tamanho: 14, peso: 700 }) +
      espaco(18) +
      divisor() +
      espaco(16) +
      paragrafo(esc(naoPediu), { suave: true, tamanho: 13 })
  )

  const html = moldura({
    assunto,
    previa: `${aviso} ${naoPediu}`,
    conteudo,
    rodape: "Você recebeu porque alguém pediu pra usar este e-mail numa conta da FuckingBarba.",
  })

  return { para, assunto, html, texto }
}

/**
 * O AVISO, pro e-mail antigo, quando a troca já aconteceu.
 *
 * ┌─ POR QUE ELE EXISTE ───────────────────────────────────────────────────┐
 * │ Trocar o e-mail pede o código do endereço NOVO — o que prova que ele é │
 * │ de quem pediu, mas não que quem pediu é o dono da conta. Alguém com a  │
 * │ conta aberta num aparelho esquecido troca pro e-mail dele e passa a    │
 * │ receber os códigos. Este aviso é o que faz o dono saber na hora, no    │
 * │ endereço que ainda é dele.                                             │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * O E-MAIL NOVO VAI ESCRITO, inteiro: é o que o dono precisa ler pra saber
 * se foi ele — e, se não foi, pra dizer à loja pra onde a conta foi.
 */
export function emailDeEmailTrocado({
  para,
  novo,
  whatsapp,
}: {
  para: string
  novo: string
  /**
   * Só dígitos, com DDI — `whatsappDaLoja`. Sem ele, o Instagram, o canal que
   * a loja tem sempre (o `/contato` também mostra). "Responda este e-mail"
   * não serve aqui: o remetente pode ser um `nao-responda@`.
   */
  whatsapp: string | null
}): Email {
  const assunto = "O e-mail da sua conta na FuckingBarba mudou"
  const foiVoce = "Foi você? Então está tudo certo — não precisa fazer nada."
  const naoFoi = whatsapp
    ? `Não foi você? Chama a gente no WhatsApp ${whatsappNaTela(whatsapp)} agora, que a gente resolve.`
    : "Não foi você? Chama a gente agora no Instagram, @fuckingbarba, que a gente resolve."

  const texto = [
    "FuckingBarba",
    "",
    `A sua conta agora entra com ${novo}. Os códigos de acesso vão pra lá, e este endereço não entra mais nela.`,
    "",
    foiVoce,
    "",
    naoFoi,
  ].join("\n")

  const conteudo = cartao(
    titulo("Seu e-mail mudou") +
      espaco(8) +
      paragrafo(
        `A sua conta agora entra com <b>${esc(novo)}</b>. Os códigos de acesso vão pra lá, e ` +
          "este endereço não entra mais nela."
      ) +
      espaco(16) +
      paragrafo(esc(foiVoce), { suave: true }) +
      espaco(18) +
      divisor() +
      espaco(16) +
      paragrafo(esc(naoFoi), { tamanho: 14, peso: 700 })
  )

  const html = moldura({
    assunto,
    previa: `A sua conta agora entra com ${novo}.`,
    conteudo,
    rodape: "Você recebeu porque este era o e-mail da sua conta na FuckingBarba.",
  })

  return { para, assunto, html, texto }
}
