import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import CodigoDaEquipe from "./service"

export default ModuleProvider(Modules.AUTH, { services: [CodigoDaEquipe] })
