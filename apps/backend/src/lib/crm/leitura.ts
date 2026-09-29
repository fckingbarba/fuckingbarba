import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { CRM } from "../../modules/crm"
import type CrmService from "../../modules/crm/service"
import type { PedidoLidoDaBase } from "../painel/crm"
import { pedidosParaAsEtiquetas } from "../painel/ler"
import type { PedidoCru } from "../painel/pedido"

/**
 * A LEITURA DA RODADA (entrega 0199) — o que os fluxos medidos em dias
 * (estreia, reposição, jornada e resgate) leem do banco, lido UMA vez por
 * rodada do motor e dividido entre eles. Antes, cada fluxo ligado relia tudo
 * sozinho, de 5 em 5 minutos: os pedidos da loja nova com os itens e a base
 * inteira da Nuvemshop — com os quatro ligados, a mesma leitura quatro vezes.
 *
 * Quem chama sem uma (a tela dos Fluxos, o "Mandar pra mim") ganha uma nova:
 * o resultado é o mesmo, só não divide.
 *
 * ┌─ A BASE DA NUVEMSHOP FICA NA MEMÓRIA ──────────────────────────────────┐
 * │ Ela só muda quando alguém manda os arquivos de novo (CRM → Base, que   │
 * │ grava `updated_at` em toda linha). Cada rodada pergunta só a VERSÃO    │
 * │ dela (quantos pedidos e a última mudança: uma linha — `versaoDaBase`)  │
 * │ e relê quando ela muda. Vale também com dois processos (server e       │
 * │ worker): cada um confere a versão no banco, sem aviso entre eles.      │
 * │                                                                         │
 * │ Quem lê não pode mexer no que recebe: a lista é a mesma pra todos      │
 * │ (`pedidoDaBase` e `pedidoDaPessoa` montam objetos novos — é assim que  │
 * │ os fluxos usam).                                                       │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

export type PessoaDaEstreiaLida = { email: string; nome: string | null; desde: Date | null }
export type SinaisDaPessoa = { ultimoClique: Date | null; ultimaVisita: Date | null }

export type LeituraDaRodada = {
  /** Todos os pedidos da loja nova, com o que as etiquetas usam (`pedidosParaAsEtiquetas`). */
  pedidosDaLoja(): Promise<PedidoCru[]>
  /** Todos os pedidos da base da Nuvemshop — da memória, enquanto a versão não mudar. */
  pedidosDaBase(): Promise<PedidoLidoDaBase[]>
  /** As pessoas da base que aceitam ofertas. */
  pessoasDaEstreia(): Promise<PessoaDaEstreiaLida[]>
  /** O último clique e a última visita de cada e-mail. */
  sinaisDeTodos(): Promise<Map<string, SinaisDaPessoa>>
  /** O metadata da loja (os Ajustes do CRM moram nele). */
  metadataDaLoja(): Promise<Record<string, unknown> | null>
}

/** De onde a leitura tira cada coisa — o banco, na rodada; o teste passa as suas. */
export type FontesDaLeitura = {
  pedidosDaLoja(): Promise<PedidoCru[]>
  pedidosDaBase(): Promise<PedidoLidoDaBase[]>
  versaoDaBase(): Promise<string>
  pessoasDaEstreia(): Promise<PessoaDaEstreiaLida[]>
  sinaisDeTodos(): Promise<Map<string, SinaisDaPessoa>>
  metadataDaLoja(): Promise<Record<string, unknown> | null>
}

/** Cada pergunta sai uma vez: quem chega depois recebe a mesma resposta (ou o mesmo erro). */
function umaVez<T>(ler: () => Promise<T>): () => Promise<T> {
  let lendo: Promise<T> | null = null
  return () => (lendo ??= ler())
}

let baseGuardada: { versao: string; pedidos: Promise<PedidoLidoDaBase[]> } | null = null

/** A base da memória, se a versão do banco ainda é a mesma; senão, lida de novo. */
async function baseDaMemoria(fontes: FontesDaLeitura): Promise<PedidoLidoDaBase[]> {
  const versao = await fontes.versaoDaBase()
  if (baseGuardada?.versao === versao) return baseGuardada.pedidos
  const pedidos = fontes.pedidosDaBase()
  const guardada = { versao, pedidos }
  baseGuardada = guardada
  // A leitura que falhou não fica: a próxima rodada tenta de novo.
  pedidos.catch(() => {
    if (baseGuardada === guardada) baseGuardada = null
  })
  return pedidos
}

/** Pros testes: esquece a base guardada. */
export function esquecerABaseGuardada() {
  baseGuardada = null
}

export function novaLeitura(fontes: FontesDaLeitura): LeituraDaRodada {
  return {
    pedidosDaLoja: umaVez(() => fontes.pedidosDaLoja()),
    pedidosDaBase: umaVez(() => baseDaMemoria(fontes)),
    pessoasDaEstreia: umaVez(() => fontes.pessoasDaEstreia()),
    sinaisDeTodos: umaVez(() => fontes.sinaisDeTodos()),
    metadataDaLoja: umaVez(() => fontes.metadataDaLoja()),
  }
}

/** A leitura de uma rodada, tirando tudo do banco do Medusa e do módulo do CRM. */
export function leituraDaRodada(container: MedusaContainer): LeituraDaRodada {
  const crm = () => container.resolve<CrmService>(CRM)
  return novaLeitura({
    pedidosDaLoja: () => pedidosParaAsEtiquetas(container),
    pedidosDaBase: () => crm().pedidosDaBase(),
    versaoDaBase: () => crm().versaoDaBase(),
    pessoasDaEstreia: () => crm().pessoasDaEstreia(),
    sinaisDeTodos: () => crm().sinaisDeTodos(),
    metadataDaLoja: async () => {
      const [loja] = await container
        .resolve(Modules.STORE)
        .listStores({}, { select: ["metadata"], take: 1 })
      return (loja?.metadata as Record<string, unknown> | null | undefined) ?? null
    },
  })
}
