import { frenet } from "../../modules/frenet/rastreio"
import type { ParceiroDeEntrega } from "./parceiro"

/**
 * OS PARCEIROS DE ENTREGA DA LOJA — a única lista que muda quando um entra
 * ou sai.
 *
 * Pra ligar um parceiro novo: escrever o tradutor dele (o contrato está em
 * `parceiro.ts`; a Frenet, em `src/modules/frenet/rastreio.ts`, é o modelo),
 * pôr aqui, e cadastrar no painel dele o aviso pra
 * `https://<api>/hooks/envio/<id>`.
 *
 * PRA TIRAR UM, ESPERE OS PACOTES DELE CHEGAREM: um parceiro fora desta
 * lista tem os avisos recusados (404), e os envios que ainda estão na rua
 * por ele param de andar na conta do cliente. Os dois convivem sem conflito
 * — cada envio guarda quem fala por ele.
 */
const LISTA: ParceiroDeEntrega[] = [frenet]

const POR_ID = new Map(LISTA.map((p) => [p.id, p]))

export function parceiroDeEntrega(id: string): ParceiroDeEntrega | null {
  return POR_ID.get(id) ?? null
}

/** Os que sabem responder "como está este pacote?" (`consultar`). */
export function parceirosQueConsultam(): ParceiroDeEntrega[] {
  return LISTA.filter((p) => typeof p.consultar === "function")
}
