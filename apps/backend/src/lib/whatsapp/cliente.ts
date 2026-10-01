import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { normalizarEmail } from "../../modules/codigo/regras"
import { lerFichaDoSite } from "../crm/ficha-do-site"
import { chaveDoTelefone } from "./regras"

/**
 * QUEM ESTÁ ESCREVENDO — o cliente da loja nova dono do número do WhatsApp.
 *
 * O número casa com o telefone que a pessoa digitou no checkout (o do
 * endereço de entrega ou o de cobrança do pedido) ou com o da conta (Meus
 * dados), pela `chaveDoTelefone`: o DDD e os 8 últimos dígitos.
 *
 * ┌─ POR QUE O NÚMERO BASTA ───────────────────────────────────────────────┐
 * │ A Meta só entrega a mensagem do WhatsApp daquele número: quem escreve  │
 * │ é quem tem o chip. Então o pedido feito com esse telefone é dessa      │
 * │ pessoa — a situação, o rastreio, o Pix e o "refazer" (que abre o       │
 * │ checkout já com o endereço dela). Quem escreve de OUTRO número (a      │
 * │ esposa que comprou) só vê a situação e o rastreio, e só com o número   │
 * │ do pedido e o e-mail da compra (`ferramentas.ts`, `ver_pedido`).       │
 * └────────────────────────────────────────────────────────────────────────┘
 */

export type ClienteDoWhatsapp = {
  /** O primeiro nome, como a pessoa escreveu no checkout ou na conta. */
  nome: string | null
  /** O e-mail do pedido mais novo (ou da conta) — é ele que acha a ficha e a Nuvemshop. */
  email: string | null
  clienteId: string | null
  /** Os pedidos da loja nova com este telefone, do mais novo pro mais velho. */
  pedidos: string[]
}

type Banco = {
  raw: (sql: string, bindings: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
}

const primeiroNome = (v: unknown) => {
  const n = typeof v === "string" ? v.trim().split(/\s+/)[0] : ""
  return n ? n.slice(0, 40) : null
}

/** O cliente deste número de WhatsApp, ou `null` quando a loja nova não conhece o número. */
export async function clientePeloTelefone(
  container: MedusaContainer,
  telefone: string
): Promise<ClienteDoWhatsapp | null> {
  const chave = chaveDoTelefone(telefone)
  if (!chave) return null
  const banco = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as unknown as Banco
  const final = chave.slice(-8)
  // O banco filtra pelo final (os 8 últimos); o DDD é conferido aqui, pela mesma chave.
  const [pedidos, contas] = await Promise.all([
    banco.raw(
      `select o.id, o.email, o.customer_id, a.first_name, a.phone, o.created_at
         from "order" o
         join order_address a on a.id = o.shipping_address_id or a.id = o.billing_address_id
        where o.deleted_at is null and o.is_draft_order = false and a.deleted_at is null
          and right(regexp_replace(coalesce(a.phone, ''), '[^0-9]', '', 'g'), 8) = ?
        order by o.created_at desc
        limit 60`,
      [final]
    ),
    banco.raw(
      `select id, email, first_name, phone from customer
        where deleted_at is null
          and right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 8) = ?
        order by created_at desc
        limit 5`,
      [final]
    ),
  ])
  const daChave = (l: Record<string, unknown>) => chaveDoTelefone(String(l.phone ?? "")) === chave
  const doNumero = pedidos.rows.filter(daChave)
  const conta = contas.rows.find(daChave)
  if (!doNumero.length && !conta) return null

  const ids = [...new Set(doNumero.map((l) => String(l.id)))].slice(0, 20)
  const ultimo = doNumero[0]
  const email = ultimo?.email ?? conta?.email
  return {
    nome: primeiroNome(ultimo?.first_name) ?? primeiroNome(conta?.first_name),
    email: typeof email === "string" && email.trim() ? normalizarEmail(email) : null,
    clienteId:
      (typeof ultimo?.customer_id === "string" && ultimo.customer_id) ||
      (typeof conta?.id === "string" ? conta.id : null),
    pedidos: ids,
  }
}

/* ── o que a loja sabe de quem escreve ──────────────────────────────────── */

const quantosDias = (d: number) => (d === 0 ? "hoje" : d === 1 ? "há 1 dia" : `há ${d} dias`)

/**
 * O RESUMO DO CLIENTE pro contexto da conversa — a mesma ficha do site
 * (`lerFichaDoSite`: as compras da loja nova e da Nuvemshop, o tratamento do
 * Fator, a reposição e o que combina). Sem endereço, CPF ou e-mail: o
 * atendente não tem o que repetir.
 */
export async function resumoDoCliente(
  container: MedusaContainer,
  cliente: ClienteDoWhatsapp,
  agora = new Date()
): Promise<string> {
  const linhas: string[] = []
  if (cliente.nome) linhas.push(`- Primeiro nome nas compras: ${cliente.nome}`)
  if (cliente.pedidos.length)
    linhas.push(
      `- ${cliente.pedidos.length} pedido(s) na loja nova com este telefone (a situação: ver_meus_pedidos).`
    )
  if (!cliente.email) return linhas.join("\n")

  const ficha = await lerFichaDoSite(container, cliente.email, agora)
  const handles = [...new Set([...ficha.compras, ...ficha.combina].map((x) => x.handle))]
  const { data } = handles.length
    ? await container.resolve(ContainerRegistrationKeys.QUERY).graph({
        entity: "product",
        fields: ["handle", "title"],
        filters: { handle: handles },
      })
    : { data: [] }
  const nome = new Map(
    (data as { handle: string; title?: string | null }[]).map((p) => [
      p.handle,
      p.title ?? p.handle,
    ])
  )
  if (ficha.compras.length)
    linhas.push(
      `- Já comprou: ${ficha.compras
        .slice(0, 6)
        .map((c) => `${nome.get(c.handle) ?? c.handle} (a última ${quantosDias(c.dias)})`)
        .join("; ")}`
    )
  if (ficha.tratamento)
    linhas.push(
      `- Está no dia ${ficha.tratamento.dia} do tratamento com o Fator (a meta é o dia ${ficha.tratamento.alvo})` +
        (ficha.tratamento.marco
          ? `; o próximo marco: ${ficha.tratamento.marco.quando}, ${ficha.tratamento.marco.titulo}.`
          : ".")
    )
  if (ficha.reposicao)
    linhas.push(
      `- Reposição: ${ficha.reposicao.titulo}. Se fizer sentido na conversa, ofereça refazer a compra (refazer_pedido).`
    )
  if (ficha.combina.length)
    linhas.push(
      `- Combina com o que já tem: ${ficha.combina
        .slice(0, 2)
        .map((c) => `${nome.get(c.handle) ?? c.handle} (${c.porque})`)
        .join("; ")}`
    )
  return linhas.join("\n")
}
