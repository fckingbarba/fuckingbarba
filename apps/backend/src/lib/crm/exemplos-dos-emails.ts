import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { whatsappDaLoja } from "../atendimento"
import { precosDasVariantes } from "../avise-me"
import { lerConfiguracoes } from "../configuracoes"
import {
  exemplosDoCrm,
  PRODUTOS_DOS_EXEMPLOS,
  type EmailDoCrm,
  type ExemploDoCrm,
  type ProdutoDoCrm,
} from "../emails/crm"
import { urlDaLoja } from "../emails/moldura"
import { dia } from "../painel/formato"
import { tokenDeSair } from "./sair"

/**
 * OS EXEMPLOS DO MODELO, PRA QUEM ESTÁ NO PAINEL — com os produtos, os
 * preços, a empresa e o WhatsApp de verdade da loja, e o link de sair da
 * lista do e-mail de quem pediu (o teste vai pra ele). É o que a aba
 * E-mails do CRM mostra e o que o "Mandar pra mim" manda.
 *
 * Sem o `LOJA_URL`, nenhum link teria pra onde ir: volta vazio, e a tela diz.
 */

/** Os links de sair da lista pra um e-mail: a página da loja e o clique único do backend. */
export function linksDeSair(loja: string, email: string): EmailDoCrm["sair"] {
  const t = tokenDeSair(email)
  const backend = (process.env.MEDUSA_BACKEND_URL ?? "").trim().replace(/\/+$/, "")
  return {
    pagina: `${loja}/sair/${t}`,
    umClique: /^https:\/\//.test(backend) ? `${backend}/crm/sair?t=${t}` : null,
  }
}

async function produtosDosExemplos(container: MedusaContainer): Promise<Map<string, ProdutoDoCrm>> {
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "product",
    fields: ["id", "title", "handle", "thumbnail", "variants.id"],
    filters: { handle: [...PRODUTOS_DOS_EXEMPLOS], status: "published" },
  })
  const produtos = data as {
    title?: string | null
    handle: string
    thumbnail?: string | null
    variants?: { id: string }[] | null
  }[]
  const variantes = produtos.flatMap((p) => (p.variants?.[0]?.id ? [p.variants[0].id] : []))
  const precos = await precosDasVariantes(container, variantes)
  return new Map(
    produtos.map((p) => {
      const preco = p.variants?.[0]?.id ? precos.get(p.variants[0].id) : undefined
      return [
        p.handle,
        {
          nome: (p.title ?? "").trim() || p.handle,
          handle: p.handle,
          imagem: p.thumbnail ?? null,
          preco: preco?.preco ?? null,
          precoCheio: preco?.precoCheio ?? null,
        },
      ]
    })
  )
}

export async function exemplosParaAEquipe(
  container: MedusaContainer,
  membro: { email: string; nome: string },
  agora = new Date()
): Promise<{ loja: string | null; exemplos: ExemploDoCrm[] }> {
  const loja = urlDaLoja()
  if (!loja) return { loja: null, exemplos: [] }
  const [produtos, whatsapp, lojas] = await Promise.all([
    produtosDosExemplos(container),
    whatsappDaLoja(container),
    container.resolve(Modules.STORE).listStores({}, { select: ["metadata"], take: 1 }),
  ])
  const { empresa } = lerConfiguracoes(lojas[0]?.metadata)
  return {
    loja,
    exemplos: exemplosDoCrm({
      para: membro.email,
      nome: membro.nome.trim().split(/\s+/)[0] || null,
      sair: linksDeSair(loja, membro.email),
      loja: { url: loja, whatsapp, empresa: empresa.razaoSocial, cnpj: empresa.cnpj },
      produtos,
      acabaEm: dia(new Date(agora.getTime() + 5 * 24 * 60 * 60 * 1000)),
    }),
  }
}
