import { MedusaService } from "@medusajs/framework/utils"
import { Membro } from "./models/membro"
import { Registro } from "./models/registro"

/**
 * `listMembros`, `createMembros`, `updateMembros`, `createRegistros`… — o
 * Medusa gera, a partir da chave no plural, como nos outros módulos. Por
 * isso buscar UM pelo id também é `retrieveMembros(id)`: com a chave no
 * singular, o inglês do Medusa faria "Membroes".
 */
export default class EquipeService extends MedusaService({
  Membros: Membro,
  Registros: Registro,
}) {}
