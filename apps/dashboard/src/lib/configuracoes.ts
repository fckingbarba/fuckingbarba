import type { Papel } from "@/lib/equipe"

/**
 * AS CONFIGURAÇÕES, como vêm do Medusa (`GET /dashboard/configuracoes`,
 * montada em `apps/backend/src/lib/painel/configuracoes.ts`): o que está
 * gravado, pronto pros formulários, e o resto em frase.
 */

export type FormularioDaEmpresa = {
  razaoSocial: string
  cnpj: string
  endereco: string
  whatsapp: string
  email: string
  horario: string
  prazoDePostagem: string
}

export type ModoDoFrete = "nenhuma" | "gratis" | "fixo"
export type AlvoDoFrete = "mais-barata" | "todas"

export type FormularioDoFrete = {
  modo: ModoDoFrete
  piso: string
  preco: string
  alvo: AlvoDoFrete
}
export type FormularioDaEmergencia = { preco: string; prazo: string }

export type ChaveDaIntegracao =
  "ga4" | "googleAds" | "googleAdsCompra" | "metaPixel" | "clarity" | "tiktok"
export type FormularioDasIntegracoes = Record<ChaveDaIntegracao, string>
export type CampoDaIntegracao = {
  chave: ChaveDaIntegracao
  nome: string
  exemplo: string
  onde: string
}

export type LinhaDeStatus = { titulo: string; texto: string; ligado: boolean | null }
/** `pedidoId` nulo: a linha junta vários pedidos (a mesma queda, ou o que passou do teto). */
export type PendenciaDaNota = {
  pedidoId: string | null
  numero: number
  titulo: string
  texto: string
}

export type TelaDasConfiguracoes = {
  empresa: FormularioDaEmpresa & { emBranco: string[] }
  frete: FormularioDoFrete & { emergencia: FormularioDaEmergencia; frase: string }
  pagamento: LinhaDeStatus[]
  nota: {
    erp: {
      nome: string
      configurado: boolean
      conectado: boolean
      desde: string | null
      queda: string | null
    }
    janela: number
    janelas: { minutos: number; nome: string }[]
    pendencias: PendenciaDaNota[]
  }
  entrega: LinhaDeStatus[]
  emails: {
    remetente: string
    cliente: { nome: string; texto: string; saindo: boolean }[]
    equipe: { nome: string; texto: string; papeis: Papel[]; quem: string }[]
  }
  integracoes: {
    formulario: FormularioDasIntegracoes
    campos: CampoDaIntegracao[]
    compra: LinhaDeStatus[]
  }
}

/** As abas, na ordem do protótipo. */
export const ABAS = [
  { href: "/configuracoes/empresa", nome: "Dados da empresa" },
  { href: "/configuracoes/frete", nome: "Frete" },
  { href: "/configuracoes/pagamento", nome: "Pagamento" },
  { href: "/configuracoes/nota", nome: "Nota fiscal" },
  { href: "/configuracoes/entrega", nome: "Entrega" },
  { href: "/configuracoes/emails", nome: "E-mails" },
  { href: "/configuracoes/integracoes", nome: "Integrações" },
  { href: "/configuracoes/equipe", nome: "Equipe e acessos" },
] as const
