import { bling } from "../../modules/bling/erp"
import type { ErpDaLoja } from "./contrato"

/**
 * O ERP DA LOJA — a única lista que muda quando um entra ou sai.
 *
 * UM SÓ LIGADO POR VEZ: a nota de um pedido sai de UM lugar, senão sai duas
 * vezes. Vale o primeiro da lista que estiver configurado (as variáveis do
 * app no ambiente). Pra trocar: escrever o tradutor do novo (o do Bling, em
 * `src/modules/bling/`, é o modelo), pôr aqui, tirar as variáveis do velho.
 * As notas já emitidas guardam de qual ERP vieram (`erp_nota.erp`).
 */
const LISTA: ErpDaLoja[] = [bling]

export function erpDaLoja(): ErpDaLoja | null {
  return LISTA.find((e) => e.configurado()) ?? null
}

/** O que a tela do admin mostra: o ligado, ou o primeiro da lista (pra dizer o que falta configurar). */
export function erpDaTela(): ErpDaLoja {
  return erpDaLoja() ?? LISTA[0]!
}

export function erpPorId(id: string): ErpDaLoja | null {
  return LISTA.find((e) => e.id === id) ?? null
}
