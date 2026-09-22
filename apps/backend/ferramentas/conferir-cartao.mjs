/**
 * POR QUE O CARTÃO APROVOU E VOLTOU — a resposta do Pagar.me, pedido por
 * pedido, sem caçar no painel.
 *
 *   PAGARME_SECRET_KEY=sk_... node ferramentas/conferir-cartao.mjs
 *   PAGARME_SECRET_KEY=sk_... node ferramentas/conferir-cartao.mjs 14
 *
 * O número no fim é quantos dias olhar pra trás (7, se não vier).
 *
 * ┌─ O QUE ESTA FERRAMENTA ESTÁ PROCURANDO ────────────────────────────────┐
 * │ Compra no cartão que é aprovada — o banco avisa no celular, o dinheiro │
 * │ sai — e segundos depois volta. Isso NÃO é código da loja: o único      │
 * │ estorno automático que existe aqui é o da conciliação, e ele só toca   │
 * │ numa cobrança 15 minutos depois de nascer (`ORFAO_DEPOIS_DE_MS`).      │
 * │ Segundos é o Pagar.me.                                                 │
 * │                                                                         │
 * │ E o suspeito tem nome: a loja manda `auth_and_capture`, então o cartão │
 * │ é autorizado E capturado no mesmo passo. A ANÁLISE DE FRAUDE roda      │
 * │ depois disso. Reprovou, o Pagar.me desfaz a captura sozinho — e o      │
 * │ extrato de quem comprou mostra exatamente o que você viu.              │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * Ela só LÊ (GET). Não cria, não estorna, não cancela nada.
 *
 * A chave secreta não fica no arquivo e não é impressa: vem do ambiente, na
 * mesma variável que o backend usa (`PAGARME_SECRET_KEY`). Use a do modo em
 * que as compras foram feitas — a de produção pra compras de verdade.
 */

const CHAVE = process.env.PAGARME_SECRET_KEY ?? ""
const URL = process.env.PAGARME_URL || "https://api.pagar.me/core/v5"
const DIAS = Number(process.argv[2] || 7)

if (!CHAVE) {
  console.error(
    "Falta a chave. Rode assim, com a chave secreta do Pagar.me no lugar do sk_...:\n\n" +
      "  PAGARME_SECRET_KEY=sk_... node ferramentas/conferir-cartao.mjs\n"
  )
  process.exit(1)
}

const autorizacao = `Basic ${Buffer.from(`${CHAVE}:`).toString("base64")}`
const reais = (centavos) => `R$ ${(Number(centavos ?? 0) / 100).toFixed(2).replace(".", ",")}`
const hora = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR") : "—")

/** Quanto tempo entre nascer e mudar pela última vez. É o "segundos depois". */
function depoisDe(inicio, fim) {
  const ms = Date.parse(fim ?? "") - Date.parse(inicio ?? "")
  if (!Number.isFinite(ms) || ms < 0) return "—"
  if (ms < 90 * 1000) return `${Math.round(ms / 1000)} s depois`
  if (ms < 90 * 60 * 1000) return `${Math.round(ms / 60000)} min depois`
  return `${Math.round(ms / 3600000)} h depois`
}

async function pegar(caminho) {
  const r = await fetch(`${URL}${caminho}`, {
    headers: { authorization: autorizacao, accept: "application/json" },
  })
  if (!r.ok) {
    const corpo = await r.text().catch(() => "")
    throw new Error(`${r.status} em ${caminho}${corpo ? ` — ${corpo.slice(0, 300)}` : ""}`)
  }
  return r.json()
}

async function listarPedidos() {
  const desde = new Date(Date.now() - DIAS * 24 * 60 * 60 * 1000).toISOString()
  const pedidos = []
  for (let pagina = 1; pagina <= 10; pagina++) {
    const r = await pegar(
      `/orders?created_since=${encodeURIComponent(desde)}&page=${pagina}&size=100`
    )
    const lote = r.data ?? []
    pedidos.push(...lote)
    if (lote.length < 100) break
  }
  return pedidos
}

/**
 * A LISTAGEM NÃO TRAZ A TRANSAÇÃO — e a transação é onde mora o motivo.
 *
 * O `GET /orders` devolve o resumo: valor, status, cliente. Sem bandeira,
 * sem final do cartão, sem `antifraud_response` e sem o código do banco. A
 * primeira versão desta ferramenta leu só a lista e concluiu "nenhuma
 * reprovação por análise de fraude" — quando o que havia era nenhuma
 * INFORMAÇÃO sobre análise de fraude. São coisas muito diferentes, e a
 * segunda não pode ser dita como se fosse a primeira.
 *
 * Então cada pedido é buscado inteiro, um por um.
 */
async function pedidoInteiro(id) {
  try {
    return await pegar(`/orders/${id}`)
  } catch {
    return null
  }
}

/**
 * O VEREDITO DE UMA COBRANÇA, em uma frase.
 *
 * A antifraude é lida ANTES do status, de propósito: uma cobrança reprovada
 * pela análise aparece como `canceled` ou `refunded`, e "cancelada" não conta
 * a história — quem cancelou foi a análise, e é isso que precisa ser dito.
 */
function veredito(cobranca) {
  const t = cobranca.last_transaction ?? {}
  const anti = String(t.antifraud_response?.status ?? "").toLowerCase()
  const status = String(cobranca.status ?? "").toLowerCase()
  const transacao = String(t.status ?? "").toLowerCase()

  if (anti === "reproved") return { marca: "🚩", frase: "REPROVADA PELA ANÁLISE DE FRAUDE" }
  if (anti === "pending") return { marca: "⏳", frase: "em análise de fraude" }
  if (status === "paid") return { marca: "✓", frase: "paga" }
  if (status === "refunded") return { marca: "↩", frase: "estornada" }
  if (status === "canceled") {
    /*
      Cancelada é a autorização DESFEITA, e o Pagar.me usa a mesma palavra
      pra duas histórias opostas: a análise de fraude derrubando a compra, e
      alguém com a chave secreta pedindo o cancelamento pela API. Quando a
      transação foi autorizada e não capturada, o cancelamento veio de fora
      do banco — e "de fora" inclui o código desta loja.
    */
    if (transacao === "voided" || transacao === "canceled") {
      return { marca: "↩", frase: "AUTORIZAÇÃO DESFEITA (alguém mandou cancelar)" }
    }
    return { marca: "↩", frase: "cancelada" }
  }
  if (status === "failed") {
    return {
      marca: "✗",
      frase: transacao === "not_authorized" ? "o banco não autorizou" : "falhou",
    }
  }
  return { marca: "·", frase: status || "sem status" }
}

async function main() {
  console.log(`\nPagar.me: pedidos no cartão dos últimos ${DIAS} dias.\n`)

  const pedidos = await listarPedidos()
  const noCartao = pedidos.filter((p) =>
    (p.charges ?? []).some((c) => String(c.payment_method ?? "").toLowerCase() === "credit_card")
  )

  if (!noCartao.length) {
    console.log(
      pedidos.length
        ? `Nenhuma compra no cartão. (${pedidos.length} pedidos no período, todos no Pix.)\n`
        : "Nenhum pedido no período. Se as compras foram de verdade, a chave é a do modo teste.\n"
    )
    return
  }

  const contagem = {}
  for (const resumo of noCartao) {
    const p = (await pedidoInteiro(resumo.id)) ?? resumo
    for (const c of p.charges ?? []) {
      if (String(c.payment_method ?? "").toLowerCase() !== "credit_card") continue
      const t = c.last_transaction ?? {}
      const v = veredito(c)
      contagem[v.frase] = (contagem[v.frase] ?? 0) + 1

      console.log(`${v.marca}  ${c.id}  ${reais(c.amount)}  ${hora(c.created_at)}`)
      console.log(`   ${v.frase}`)
      console.log(
        `   cartão ${t.card?.brand ?? "?"} final ${t.card?.last_four_digits ?? "????"}` +
          `, ${t.installments ?? 1}x · ${p.customer?.name ?? "?"}` +
          ` · ${p.customer?.address?.state ?? "?"}`
      )
      console.log(
        `   pedido "${p.status ?? "?"}" · cobrança "${c.status ?? "?"}"` +
          ` · transação "${t.status ?? "sem transação"}"` +
          (t.operation_type ? ` (${t.operation_type})` : "")
      )
      if (t.antifraud_response?.status) {
        console.log(
          `   antifraude: ${t.antifraud_response.status}` +
            (t.antifraud_response.score ? ` (nota ${t.antifraud_response.score})` : "") +
            (t.antifraud_response.return_message ? ` — ${t.antifraud_response.return_message}` : "")
        )
      } else {
        console.log("   antifraude: o Pagar.me não respondeu nada (análise não rodou)")
      }
      if (t.acquirer_return_code || t.acquirer_message) {
        console.log(
          `   banco: ${t.acquirer_return_code ?? "?"} — ${t.acquirer_message ?? "sem mensagem"}` +
            (t.acquirer_auth_code ? ` · autorização ${t.acquirer_auth_code}` : "")
        )
      }
      const erros = (t.gateway_response?.errors ?? []).map((e) => e.message).filter(Boolean)
      if (t.gateway_response?.code || erros.length) {
        console.log(
          `   gateway: ${t.gateway_response?.code ?? "?"}${erros.length ? ` — ${erros.join("; ")}` : ""}`
        )
      }
      if (String(c.status ?? "") !== "paid" && c.updated_at) {
        console.log(`   virou "${c.status}" ${depoisDe(c.created_at, c.updated_at)} de nascer`)
      }
      if (c.canceled_at) console.log(`   cancelada em ${hora(c.canceled_at)}`)
      console.log(`   pedido ${p.id} · sessão ${p.code ?? "—"}`)
      /*
        O DESPEJO CRU quando nada explicou. Uma cobrança cancelada sem
        antifraude, sem código de banco e sem erro de gateway é justamente o
        caso que esta ferramenta não sabe ler — e adivinhar aqui seria
        repetir o erro da primeira versão. Melhor mostrar o que veio.
      */
      const explicou =
        t.antifraud_response?.status || t.acquirer_return_code || t.gateway_response?.code
      if (!explicou && Object.keys(t).length) {
        console.log(`   sem explicação nos campos conhecidos. A transação inteira:`)
        console.log(
          JSON.stringify(t, null, 2)
            .split("\n")
            .map((l) => `     ${l}`)
            .join("\n")
        )
      }
      console.log("")
    }
  }

  console.log("─".repeat(66))
  for (const [frase, quantas] of Object.entries(contagem).sort((a, b) => b[1] - a[1])) {
    console.log(`${String(quantas).padStart(3)}  ${frase}`)
  }

  const reprovadas = contagem["REPROVADA PELA ANÁLISE DE FRAUDE"] ?? 0
  const total = Object.values(contagem).reduce((s, n) => s + n, 0)
  console.log("")
  if (reprovadas && reprovadas === total) {
    console.log(
      "TODAS as compras no cartão foram reprovadas pela análise de fraude do Pagar.me.\n" +
        "Compradores diferentes, estados diferentes e cartões diferentes sendo\n" +
        "reprovados por igual não é coincidência de comprador: é a regra da conta.\n" +
        "Leve estes ids de cobrança pro suporte do Pagar.me e pergunte QUAL REGRA\n" +
        "reprovou cada um, e o que falta no cadastro da loja pra liberar."
    )
  } else if (reprovadas) {
    console.log(
      `${reprovadas} de ${total} compras no cartão foram reprovadas pela análise de fraude.\n` +
        "Leve estes ids de cobrança pro suporte do Pagar.me."
    )
  } else if (contagem["AUTORIZAÇÃO DESFEITA (alguém mandou cancelar)"]) {
    console.log(
      "O cartão foi AUTORIZADO e a autorização foi DESFEITA depois — e não foi a\n" +
        "análise de fraude, que não respondeu nada, nem o banco, que autorizou.\n" +
        "Desfazer autorização é uma chamada à API com a chave secreta. Quem tem a\n" +
        "chave é este backend: procure no log do Railway, na hora da compra, a\n" +
        "linha do checkout que não fechou — o Medusa desfaz o pagamento quando\n" +
        "não consegue criar o pedido depois de cobrar."
    )
  } else {
    console.log(
      "Nenhuma reprovação por análise de fraude no período — o que NÃO quer dizer\n" +
        "que a análise aprovou. Veja a linha 'antifraude' de cada compra: sem\n" +
        "resposta, ela não rodou, e o motivo está em outro lugar."
    )
  }
  console.log("")
}

main().catch((e) => {
  console.error(`\nNão deu pra perguntar ao Pagar.me: ${e.message}\n`)
  process.exit(1)
})
