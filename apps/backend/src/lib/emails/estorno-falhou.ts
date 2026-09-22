import type { Email } from "../email"
import { botao, cartao, divisor, emReais, esc, espaco, moldura, paragrafo, titulo } from "./moldura"

/**
 * O AVISO DO ESTORNO QUE NÃO SAIU — pra equipe, não pro cliente.
 *
 * Quem manda e quando (uma vez por falha) é o `lib/estornos.ts`. Vai pros
 * usuários do admin: quem resolve é quem tem acesso ao painel do Pagar.me.
 *
 * NADA DE DADO DO CLIENTE AQUI: número do pedido, valor e o código da
 * cobrança bastam pra achar tudo no admin e no painel. E-mail de aviso
 * interno é encaminhado, fica em caixa compartilhada, vai pro celular.
 */

export type EstornoDoAviso = {
  /** O id do pedido no Medusa — é o link do admin. */
  pedidoId: string
  numero: number
  /** Centavos que deviam ter voltado e não voltaram. */
  falta: number
  forma: "pix" | "cartao"
  /** `ch_…` — é por ela que se acha a cobrança no painel do Pagar.me. */
  cobranca: string
  /** O que a cobrança diz, em português: "voltou pra paga", "está failed"… */
  motivo: string
  /** Se a loja vai pedir de novo sozinha (estorno do pedido inteiro). */
  sozinha: boolean
  horas: number
  tentativas: number
}

/** `MEDUSA_BACKEND_URL` + `/app/orders/<id>`, ou null sem a variável (fica sem botão). */
function linkDoAdmin(pedidoId: string): string | null {
  const base = (process.env.MEDUSA_BACKEND_URL ?? "").trim().replace(/\/+$/, "")
  return /^https?:\/\//.test(base) ? `${base}/app/orders/${encodeURIComponent(pedidoId)}` : null
}

export function emailDoEstornoQueFalhou(para: string, e: EstornoDoAviso): Email {
  const valor = emReais(e.falta / 100)
  const assunto = `O estorno do pedido #${e.numero} não saiu`
  const forma = e.forma === "pix" ? "Pix" : "cartão"
  const oQueHouve =
    `O Pagar.me não devolveu ${valor} do pedido #${e.numero} (${forma}): ${e.motivo}. ` +
    "No admin o pedido aparece como estornado, mas o dinheiro não voltou pra quem comprou."
  const porQue =
    e.forma === "pix"
      ? "No Pix, o estorno sai do saldo disponível da conta no Pagar.me — e Pix que acabou de " +
        "entrar ainda não está nele. É o motivo mais comum."
      : "No cartão é raro: vale conferir a cobrança no painel do Pagar.me."
  const agora = e.sozinha
    ? `A loja pede o estorno de novo sozinha, de ${e.horas} em ${e.horas} horas, até ` +
      `${e.tentativas} vezes. Pra resolver na hora: no pedido, no admin, "Tentar o estorno ` +
      `de novo" — ou estorne pelo painel do Pagar.me, na cobrança ${e.cobranca}.`
    : `Este a loja não pede de novo sozinha (estorno de parte do pedido, ou cobrança fora do ` +
      `comum): estorne pelo painel do Pagar.me, na cobrança ${e.cobranca}.`
  const link = linkDoAdmin(e.pedidoId)

  const texto = [
    assunto,
    "",
    oQueHouve,
    "",
    porQue,
    "",
    agora,
    ...(link ? ["", `O pedido no admin: ${link}`] : []),
  ].join("\n")

  const conteudo = cartao(
    titulo("O estorno não saiu") +
      espaco(12) +
      paragrafo(esc(oQueHouve)) +
      espaco(14) +
      paragrafo(esc(porQue), { suave: true }) +
      espaco(18) +
      divisor() +
      espaco(16) +
      paragrafo(esc(agora), { peso: 700 }) +
      (link ? espaco(22) + botao({ texto: "Abrir o pedido no admin", href: link }) : "")
  )

  const html = moldura({
    assunto,
    previa: `${valor} do pedido #${e.numero} não voltaram pra quem comprou.`,
    conteudo,
    rodape: "Aviso automático da conciliação de pagamentos, pra quem tem acesso ao admin da loja.",
  })

  return { para, assunto, html, texto }
}
