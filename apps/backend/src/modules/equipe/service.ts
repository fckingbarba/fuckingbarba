import { MedusaService } from "@medusajs/framework/utils"
import { Acesso } from "./models/acesso"
import { Membro } from "./models/membro"
import { PapelDaEquipe } from "./models/papel"
import { Registro } from "./models/registro"

/**
 * `listMembros`, `createMembros`, `updateMembros`, `createRegistros`,
 * `listAcessos`… — o Medusa gera, a partir da chave no plural, como nos
 * outros módulos. Por isso buscar UM pelo id também é `retrieveMembros(id)`:
 * com a chave no singular, o inglês do Medusa faria "Membroes". Os papéis
 * que o dono cria são `listPapeisCriados`, `createPapeisCriados`… — com a
 * chave "Papeis", o tipo do Medusa faria "Papeises" (e o código, "Papeis").
 */
export default class EquipeService extends MedusaService({
  Membros: Membro,
  Registros: Registro,
  Acessos: Acesso,
  PapeisCriados: PapelDaEquipe,
}) {}
