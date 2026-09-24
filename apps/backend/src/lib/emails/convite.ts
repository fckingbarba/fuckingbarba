import type { Email } from "../email"
import { areasDo, DIAS_DO_CONVITE, NOME_DA_AREA, NOME_DO_PAPEL, type Papel } from "../equipe/regras"
import { botao, cartao, divisor, esc, espaco, moldura, paragrafo, titulo } from "./moldura"

/**
 * O CONVITE PRO PAINEL DA LOJA — pra quem o dono chamou pra equipe.
 *
 * Ao contrário do e-mail do código, este TEM link: o endereço do painel, e
 * só. Nada no link faz ninguém entrar — sem token, sem o e-mail na URL.
 * Quem clica cai na tela de entrar e ainda precisa do código que chega
 * neste mesmo e-mail. O endereço também vai escrito, pra pessoa conferir
 * que é o domínio da loja antes de clicar.
 *
 * Sem `DASHBOARD_URL` o convite sai do mesmo jeito, sem o botão: o dono
 * passa o endereço de outro jeito, e o código funciona igual.
 */

/** `DASHBOARD_URL` (o endereço do painel, na Vercel), sem a barra do fim — ou null. */
export function urlDoPainel(): string | null {
  const url = (process.env.DASHBOARD_URL ?? "").trim().replace(/\/+$/, "")
  return /^https?:\/\/[^\s]+$/.test(url) ? url : null
}

export function emailDoConvite({
  para,
  nome,
  papel,
  quem,
}: {
  para: string
  /** Quem foi convidado — como o dono escreveu. */
  nome: string
  papel: Papel
  /** Quem convidou (ou reenviou): o nome do dono. */
  quem: string
}): Email {
  const painel = urlDoPainel()
  const endereco = painel ? painel.replace(/^https?:\/\//, "") : null
  const primeiroNome = nome.split(" ")[0]
  const papelNome = NOME_DO_PAPEL[papel]
  const areas = areasDo(papel).map((a) => NOME_DA_AREA[a])

  const assunto = "Seu convite pro painel da FuckingBarba"
  const chamada = `${quem} te chamou pra equipe do painel da FuckingBarba, com o papel ${papelNome}.`
  const abre = `Com esse papel, você abre: ${juntar(areas)}.`
  const comoEntrar = endereco
    ? `Pra entrar, abra ${endereco}, digite este e-mail e confirme com o código de 6 números que chega aqui. Não tem senha.`
    : "Pra entrar, abra o painel da loja, digite este e-mail e confirme com o código de 6 números que chega aqui. Não tem senha."
  const prazo = `O convite vale ${DIAS_DO_CONVITE} dias. Passou disso, peça pra ${quem} reenviar.`
  const naoEsperava =
    "Não esperava este convite? Pode ignorar: sem o código, ninguém entra com o seu e-mail."

  const texto = [
    "FuckingBarba — painel da loja",
    "",
    `Oi, ${primeiroNome}!`,
    "",
    chamada,
    abre,
    "",
    comoEntrar,
    ...(painel ? ["", `O painel: ${painel}`] : []),
    "",
    prazo,
    "",
    naoEsperava,
  ].join("\n")

  const conteudo = cartao(
    titulo("Seu convite pro painel") +
      espaco(12) +
      paragrafo(`Oi, ${esc(primeiroNome)}!`, { peso: 700 }) +
      espaco(8) +
      paragrafo(esc(chamada)) +
      espaco(10) +
      paragrafo(esc(abre), { suave: true }) +
      espaco(18) +
      paragrafo(esc(comoEntrar)) +
      (painel ? espaco(22) + botao({ texto: "Entrar no painel", href: `${painel}/entrar` }) : "") +
      espaco(22) +
      paragrafo(esc(prazo), { tamanho: 14, peso: 700 }) +
      espaco(18) +
      divisor() +
      espaco(16) +
      paragrafo(esc(naoEsperava), { suave: true, tamanho: 13 })
  )

  const html = moldura({
    assunto,
    previa: `${chamada} ${prazo}`,
    conteudo,
    rodape: `Você recebeu porque ${esc(quem)} convidou este e-mail pra equipe do painel da FuckingBarba.`,
  })

  return { para, assunto, html, texto }
}

/** "a, b e c" */
function juntar(itens: string[]): string {
  if (itens.length <= 1) return itens.join("")
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`
}
