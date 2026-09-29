import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { normalizarEmail } from "../../modules/codigo/regras"
import { CRM } from "../../modules/crm"
import type CrmService from "../../modules/crm/service"
import { pedidoDaBase, pedidoDaPessoa } from "../painel/crm"
import { lerTodosOsClientes } from "../painel/ler"
import { totalDo, type PedidoCru } from "../painel/pedido"
import type { PessoaDaPrevisao } from "../painel/previsao"
import { lerAjustesGuardados } from "./ajustes"
import { etiquetasDaPessoa } from "./etiquetas"
import { leituraDaRodada, type LeituraDaRodada } from "./leitura"
import { daEquipe } from "./motor"
import { juntar } from "./nuvemshop"
import { previsaoDaPessoa, type PedidoDaPrevisao } from "./previsao"

/**
 * A PREVISÃO DE TODO MUNDO QUE COMPROU (entrega 0220) — o que a aba Previsão
 * do CRM lê: os pedidos das duas lojas (a leitura da rodada, a mesma dos
 * fluxos, com a base da Nuvemshop da memória), o total de cada pedido da loja
 * nova, o último clique e a última visita de cada e-mail, e os Ajustes do
 * CRM. Sem a equipe.
 */
export async function previsoesDeTodos(
  container: MedusaContainer,
  agora: Date = new Date(),
  leitura: LeituraDaRodada = leituraDaRodada(container)
): Promise<PessoaDaPrevisao[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const [daLoja, daBase, sinais, metadata, totais, clientes, equipe] = await Promise.all([
    leitura.pedidosDaLoja(),
    leitura.pedidosDaBase(),
    leitura.sinaisDeTodos(),
    leitura.metadataDaLoja(),
    query
      .graph({
        entity: "order",
        fields: ["id", "total", "credit_line_total"],
        filters: { is_draft_order: false },
        pagination: { take: 5000 },
      })
      .then(
        (r) =>
          new Map(
            (r.data as unknown as PedidoCru[]).map((o) => [o.id, totalDo(o)] as [string, number])
          )
      ),
    lerTodosOsClientes(container),
    daEquipe(container),
  ])
  const { dias, regras } = lerAjustesGuardados(metadata)
  const porEmail = new Map<string, PedidoDaPrevisao[]>()
  for (const o of daLoja) {
    const email = normalizarEmail(o.email)
    if (email) juntar(porEmail, email, { ...pedidoDaPessoa(o), total: totais.get(o.id) ?? 0 })
  }
  for (const p of daBase) {
    const email = normalizarEmail(p.email)
    if (email) juntar(porEmail, email, pedidoDaBase(p))
  }
  const cliente = new Map<string, { id: string; nome: string | null }>()
  for (const c of clientes) {
    const email = normalizarEmail(c.email)
    if (email && !cliente.has(email))
      cliente.set(email, { id: c.id, nome: c.first_name?.trim() || null })
  }
  const pessoas: PessoaDaPrevisao[] = []
  for (const [email, pedidos] of porEmail) {
    if (equipe.has(email)) continue
    const s = sinais.get(email)
    const etiquetas = etiquetasDaPessoa({
      pedidos,
      sinais: {
        ultimoClique: s?.ultimoClique ?? null,
        ultimaVisita: s?.ultimaVisita ?? null,
        newsletterDesde: null,
      },
      agora,
      dias,
      regras,
    })
    const previsao = previsaoDaPessoa({ pedidos, etiquetas, agora, regras })
    if (!previsao) continue
    const c = cliente.get(email)
    pessoas.push({ email, nome: c?.nome ?? null, clienteId: c?.id ?? null, previsao })
  }
  // Os nomes de quem só comprou na Nuvemshop, da base.
  const semNome = pessoas.filter((p) => !p.nome).map((p) => p.email)
  if (semNome.length) {
    const nomes = await container.resolve<CrmService>(CRM).nomesDaBase(semNome)
    for (const p of pessoas) if (!p.nome) p.nome = nomes.get(p.email)?.split(/\s+/)[0] ?? null
  }
  return pessoas
}
