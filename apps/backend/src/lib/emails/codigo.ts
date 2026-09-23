import type { Email } from "../email"
import {
  cartao,
  comSombra,
  COR,
  divisor,
  esc,
  espaco,
  FONTE,
  moldura,
  paragrafo,
  titulo,
} from "./moldura"

/**
 * O E-MAIL DO CÓDIGO DE ACESSO.
 *
 * O código vai NO ASSUNTO: aparece na notificação do celular e na lista da
 * caixa de entrada, e a pessoa digita sem abrir nada. É o que o "preencher
 * código do e-mail" do iPhone também lê.
 *
 * SEM LINK NENHUM, de propósito — nem no pé. E-mail de acesso com botão
 * "clique aqui" é exatamente o que golpe imita: o nosso só pede pra digitar
 * seis números na tela que a pessoa já tem aberta. E não depende do domínio
 * da loja estar no ar pra funcionar (a logo, se não carregar, vira o nome).
 * Os e-mails da troca de e-mail (`troca-de-email.ts`) seguem a mesma regra.
 */
export function emailDoCodigo({
  para,
  codigo,
  minutos,
}: {
  para: string
  codigo: string
  minutos: number
}): Email {
  const assunto = `${codigo} é o seu código da FuckingBarba`
  const aviso = `Vale por ${minutos} minutos e só funciona uma vez.`
  const naoPediu = "Não pediu? Pode ignorar este e-mail: sem o código, ninguém entra na sua conta."

  const texto = [
    "FuckingBarba",
    "",
    `Seu código de acesso: ${codigo}`,
    "",
    "Digite na tela da loja pra entrar na sua conta.",
    aviso,
    "",
    naoPediu,
  ].join("\n")

  const conteudo = cartao(
    titulo("Seu código de acesso") +
      espaco(8) +
      paragrafo("Digite na tela da loja pra entrar na sua conta.", { suave: true }) +
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
    // Sem o endereço escrito: o Gmail transformaria em link, e este e-mail
    // não tem link nenhum.
    rodape: "Você recebeu porque alguém pediu um código de acesso com este e-mail na FuckingBarba.",
  })

  return { para, assunto, html, texto }
}

/**
 * OS SEIS DÍGITOS NUMA CAIXA SÓ, com espaço largo entre eles — a mesma cara
 * do campo da tela do código. Copiar dá "482917", sem espaço: o espaço é
 * `letter-spacing`, não caractere. É a mesma caixa no código de entrar e no
 * de trocar o e-mail.
 */
export function caixaDoCodigo(codigo: string): string {
  /*
    O `padding-left` igual ao espaçamento empurra os dígitos de volta pro
    centro: o `letter-spacing` põe espaço DEPOIS de cada dígito, inclusive
    do último, e o bloco ficaria torto pra esquerda.
  */
  return comSombra({
    celula:
      `<td class="fb-codigo" align="center" bgcolor="${COR.amarelo}" style="background:${COR.amarelo};` +
      `border:2px solid ${COR.tinta};padding:16px 12px 16px 24px;font-family:${FONTE};font-size:40px;` +
      `line-height:44px;font-weight:800;letter-spacing:12px;color:${COR.tinta};mso-line-height-rule:exactly;` +
      `font-variant-numeric:tabular-nums;">${esc(codigo)}</td>`,
    cor: COR.tinta,
    tamanho: 4,
    fundo: COR.papel,
    largura: "100%",
    classeDaSombra: "fb-sombra",
    classeDoDente: "fb-dente",
  })
}
