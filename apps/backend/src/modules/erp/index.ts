import { Module } from "@medusajs/framework/utils"
import ErpService from "./service"

/** O módulo do ERP — ver `src/lib/erp/`, que é quem usa. */
export const ERP = "erp"

export default Module(ERP, { service: ErpService })
