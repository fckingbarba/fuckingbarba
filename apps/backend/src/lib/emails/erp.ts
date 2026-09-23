import type { Email } from "../email"
import { botao, cartao, divisor, esc, espaco, moldura, paragrafo, titulo } from "./moldura"

/**
 * OS AVISOS DO ERP — pra equipe, nunca pro cliente. Quem manda e quando é
 * `lib/erp/notas.ts` (a nota) e `lib/erp/conexao.ts` (a conexão).
 *
 * Como no aviso do estorno: nada de dado do cliente. Número do pedido e o
 * da nota bastam pra achar tudo no admin e no ERP — e-mail interno é
 * encaminhado, fica em caixa compartilhada, vai pro celular.
 */

function linkDoAdmin(caminho: string): string | null {
  const base = (process.env.MEDUSA_BACKEND_URL ?? "").trim().replace(/\/+$/, "")
  return /^https?:\/\//.test(base) ? `${base}/app/${caminho}` : null
}

const quando = (d: Date) =>
  d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })

function montar({
  para,
  assunto,
  previa,
  cabeca,
  blocos,
  forte,
  link,
}: {
  para: string
  assunto: string
  previa: string
  cabeca: string
  blocos: string[]
  forte: string
  link: { texto: string; href: string } | null
}): Email {
  const texto = [
    assunto,
    "",
    ...blocos.flatMap((b) => [b, ""]),
    forte,
    ...(link ? ["", `${link.texto}: ${link.href}`] : []),
  ].join("\n")
  const conteudo = cartao(
    titulo(cabeca) +
      blocos.map((b, i) => espaco(i ? 14 : 12) + paragrafo(esc(b), { suave: i > 0 })).join("") +
      espaco(18) +
      divisor() +
      espaco(16) +
      paragrafo(esc(forte), { peso: 700 }) +
      (link ? espaco(22) + botao(link) : "")
  )
  const html = moldura({
    assunto,
    previa,
    conteudo,
    rodape: "Aviso automático da integração com o ERP, pra quem tem acesso ao admin da loja.",
  })
  return { para, assunto, html, texto }
}

export type NotaParaCancelar = {
  erp: string
  pedidoId: string
  numero: number
  nota: { numero: string | null; serie: string | null; chave: string | null }
  /** Até quando a SEFAZ aceita o cancelamento (autorização + 24 h). */
  prazo: Date | null
  agora: Date
}

/** Pedido cancelado com a nota já autorizada: a API do ERP não cancela. */
export function emailDaNotaParaCancelar(para: string, a: NotaParaCancelar): Email {
  const nf = [a.nota.numero && `nº ${a.nota.numero}`, a.nota.serie && `série ${a.nota.serie}`]
    .filter(Boolean)
    .join(", ")
  const vencido = a.prazo ? a.prazo.getTime() <= a.agora.getTime() : false
  const assunto = `Cancele a nota do pedido #${a.numero} no ${a.erp}`
  const blocos = [
    `O pedido #${a.numero} foi cancelado, e a nota fiscal dele${nf ? ` (${nf})` : ""} já tinha ` +
      `sido autorizada. A integração não cancela nota autorizada: é no painel do ${a.erp}, em ` +
      `Notas fiscais de saída → Cancelar NF-e, com uma justificativa de pelo menos 15 caracteres.`,
    ...(a.nota.chave ? [`Chave de acesso: ${a.nota.chave}.`] : []),
    vencido
      ? "O prazo de 24 horas da SEFAZ já passou: aí a nota não se cancela mais, e o caminho é uma " +
        "nota de estorno ou de devolução — combine com o contador."
      : "Depois de cancelar lá, a loja não precisa de mais nada: o estoque volta pelo " +
        `${a.erp} e aparece na loja na sincronização seguinte.`,
  ]
  const forte = vencido
    ? "O prazo de cancelamento já passou — fale com o contador."
    : a.prazo
      ? `Cancele até ${quando(a.prazo)} (horário de Brasília): depois disso a SEFAZ não aceita.`
      : "Cancele o quanto antes: a SEFAZ aceita até 24 horas depois da autorização."
  const href = linkDoAdmin(`orders/${encodeURIComponent(a.pedidoId)}`)
  return montar({
    para,
    assunto,
    previa: forte,
    cabeca: "Cancele a nota no ERP",
    blocos,
    forte,
    link: href ? { texto: "Abrir o pedido no admin", href } : null,
  })
}

/**
 * O que a equipe faz com a nota que não saiu:
 *   "a-mao"      a loja desistiu: emitir à mão no ERP (ou corrigir e tentar de
 *                novo pelo admin);
 *   "acompanha"  a nota está no ERP: corrigir e reenviar lá, e a loja acompanha;
 *   "reconectar" falta permissão no app do ERP: marcar o escopo e conectar de
 *                novo — a loja segue tentando sozinha.
 */
export type JeitoDoAviso = "a-mao" | "acompanha" | "reconectar"

export type NotaComProblema = {
  erp: string
  pedidoId: string
  numero: number
  motivo: string
  jeito: JeitoDoAviso
}

/** A nota não saiu: rejeitada, denegada, o ERP recusou o pedido, ou falta permissão no app. */
export function emailDaNotaComProblema(para: string, a: NotaComProblema): Email {
  const assunto = `A nota do pedido #${a.numero} não saiu`
  const causa = `A nota fiscal do pedido #${a.numero} não foi autorizada: ${a.motivo}.`
  const porJeito: Record<JeitoDoAviso, { bloco: string; forte: string; ondeLink: string }> = {
    "a-mao": {
      bloco:
        `A loja não tenta de novo sozinha. Se o problema for do pedido (o CPF que faltava), ` +
        `corrija e clique em "Tentar de novo" na tela do ERP, no admin; senão, emita a nota à ` +
        `mão no ${a.erp}. Até lá, o pedido fica sem nota.`,
      forte: `Corrija e tente de novo pelo admin, ou emita a nota do pedido #${a.numero} à mão no ${a.erp}.`,
      ondeLink: "erp",
    },
    acompanha: {
      bloco:
        `Corrija no ${a.erp} e envie a nota de novo por lá. A loja acompanha: quando ela for ` +
        "autorizada, o pedido segue sozinho (inclusive pro painel da Frenet).",
      forte: `Corrija e reenvie a nota no ${a.erp}.`,
      ondeLink: `orders/${encodeURIComponent(a.pedidoId)}`,
    },
    reconectar: {
      bloco:
        `Falta uma permissão no app da loja no ${a.erp}. Marque o escopo no app (Central de ` +
        `Extensões → Área do Integrador → o app da loja → escopos) e, no admin da loja, em ERP, ` +
        `clique em "Conectar de novo". Depois disso a loja tenta de novo sozinha — não emita à ` +
        "mão, senão a nota sai duas vezes. A tela do ERP tem o botão que confere as permissões.",
      forte: `Marque o escopo no app do ${a.erp} e conecte de novo no admin.`,
      ondeLink: "erp",
    },
  }
  const j = porJeito[a.jeito]
  const href = linkDoAdmin(j.ondeLink)
  return montar({
    para,
    assunto,
    previa: j.forte,
    cabeca: "A nota não saiu",
    blocos: [causa, j.bloco],
    forte: j.forte,
    link: href
      ? {
          texto: j.ondeLink === "erp" ? "Abrir a tela do ERP" : "Abrir o pedido no admin",
          href,
        }
      : null,
  })
}

/** A renovação do token foi recusada: sem conectar de novo, nada sai. */
export function emailDaConexaoQueCaiu(para: string, a: { erp: string; motivo: string }): Email {
  const assunto = `A conexão com o ${a.erp} caiu`
  const blocos = [
    `O ${a.erp} recusou a renovação do acesso da loja (${a.motivo}). Enquanto ninguém conectar de ` +
      "novo, a loja não emite nota fiscal e não atualiza o estoque.",
    "Os pedidos pagos nesse meio-tempo recebem a nota quando a conexão voltar (até três dias " +
      "depois do pagamento) — não emita à mão, senão a nota sai duas vezes.",
  ]
  const forte = `No admin da loja, em ERP, clique em "Conectar o ${a.erp}".`
  const href = linkDoAdmin("erp")
  return montar({
    para,
    assunto,
    previa: forte,
    cabeca: "A conexão com o ERP caiu",
    blocos,
    forte,
    link: href ? { texto: "Abrir a tela do ERP", href } : null,
  })
}
