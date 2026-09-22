import { Module } from "@medusajs/framework/utils"
import EnviosService from "./service"

/** O módulo dos envios — ver `src/lib/envios/nucleo.ts`, que é quem usa. */
export const ENVIOS = "envios"

export default Module(ENVIOS, { service: EnviosService })
