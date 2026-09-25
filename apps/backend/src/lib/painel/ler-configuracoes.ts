import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { CHAVE_NO_METADATA, lerConfiguracoes, type Configuracoes } from "../configuracoes"
import { remetenteDosEmails } from "../email"
import { situacaoDaConexao } from "../erp/conexao"
import { erpDaTela } from "../erp/erps"
import { notasEsperando, pendenciasDasNotas } from "../erp/notas"
import { HORAS_ENTRE_TENTATIVAS, TENTATIVAS } from "../estornos"
import { mudarMetadataDaLoja } from "../metadata-da-loja"
import { avisarALoja } from "../revalidar"
import { EQUIPE } from "../../modules/equipe"
import type EquipeService from "../../modules/equipe/service"
import { registraPedidos } from "../../modules/frenet/pedidos"
import { PARCELA_MINIMA_CENTAVOS, PARCELAS_MAXIMAS } from "../../modules/pagarme/pedido"
import {
  pendenciasEmFrase,
  telaDasConfiguracoes,
  type MembroParaAviso,
  type TelaDasConfiguracoes,
} from "./configuracoes"

/**
 * O QUE A TELA DAS CONFIGURAÇÕES LÊ, e como ela grava (`gravarConfiguracoes`).
 * A regra está em `configuracoes.ts`, ao lado; aqui é o banco.
 */

export async function lerTelaDasConfiguracoes(
  container: MedusaContainer,
  agora = new Date()
): Promise<TelaDasConfiguracoes> {
  const erp = erpDaTela()
  const [lojas, conexao, membros, usuarios] = await Promise.all([
    container.resolve(Modules.STORE).listStores({}, { select: ["metadata"], take: 1 }),
    situacaoDaConexao(container, erp),
    container
      .resolve<EquipeService>(EQUIPE)
      .listMembros(
        { situacao: "ativo" },
        { select: ["nome", "email", "papel", "situacao"], take: 200 }
      ),
    container
      .resolve(Modules.USER)
      .listUsers({}, { select: ["email"], take: 20 })
      .catch(() => []),
  ])
  // As mesmas pendências da tela do ERP no admin (só com a conexão de pé).
  const [pendencias, esperando] = conexao.conectado
    ? await Promise.all([
        pendenciasDasNotas(container, erp, agora),
        notasEsperando(container, erp, agora),
      ])
    : [[], []]

  const pix = Number(process.env.PAGARME_PIX_MINUTOS || 30)
  return telaDasConfiguracoes({
    configuracoes: lerConfiguracoes(lojas[0]?.metadata),
    pagamento: {
      configurado: Boolean(process.env.PAGARME_SECRET_KEY),
      pixMinutos: Number.isInteger(pix) && pix >= 5 ? pix : 30,
      parcelas: PARCELAS_MAXIMAS,
      parcelaMinima: PARCELA_MINIMA_CENTAVOS / 100,
      estornos: { horas: HORAS_ENTRE_TENTATIVAS, tentativas: TENTATIVAS },
    },
    erp: {
      nome: erp.nome,
      configurado: conexao.configurado,
      conectado: conexao.conectado,
      conectadoEm: conexao.conectadoEm,
      queda: conexao.queda,
      janela: conexao.janelaDaNota,
    },
    pendencias: pendenciasEmFrase(pendencias, esperando, agora),
    entrega: { cotacao: Boolean(process.env.FRENET_TOKEN), painel: registraPedidos() },
    membros: membros as unknown as MembroParaAviso[],
    usuariosDoAdmin: usuarios.map((u) => u.email).filter(Boolean) as string[],
    remetente: remetenteDosEmails(),
  })
}

/**
 * Grava uma parte das configurações (a empresa, o frete, a emergência) sem
 * mexer nas outras: dentro da trava do metadata da loja, lendo o que está lá
 * agora. Depois avisa a loja pra derrubar o cache — o rodapé e o frete mudam
 * em segundos. `false` quando o Medusa não tem loja.
 */
export async function gravarConfiguracoes(
  container: MedusaContainer,
  mudar: (atual: Configuracoes) => Partial<Configuracoes>
): Promise<{ gravou: boolean; lojaAvisada: boolean }> {
  const gravou = await mudarMetadataDaLoja(container, (metadata) => {
    const atual = lerConfiguracoes(metadata)
    return { gravar: { [CHAVE_NO_METADATA]: { ...atual, ...mudar(atual) } }, resultado: true }
  })
  if (!gravou) return { gravou: false, lojaAvisada: false }
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const aviso = await avisarALoja(["configuracoes"], logger, "seconds")
  return { gravou: true, lojaAvisada: aviso.avisou }
}
