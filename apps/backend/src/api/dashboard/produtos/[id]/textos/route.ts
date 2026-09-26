import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { exigirArea, type PedidoDaEquipe } from "../../../../../lib/equipe/acesso"
import { MARCA_DO_NOME, nomeNoErp, temNomeDaLoja } from "../../../../../lib/erp/marcas"
import { anotar } from "../../../../../lib/painel/anotar"
import { mudarPdp, mudarProduto } from "../../../../../lib/painel/gravar-produto"
import { lerCategorias } from "../../../../../lib/painel/ler-produtos"
import { lerNome, mudancaDoNome } from "../../../../../lib/painel/produtos"
import { LIMITE_DA_DESCRICAO, lerSeo } from "../../../../../lib/pdp"

/** A linha embaixo do nome: curta, uma frase. */
const LIMITE_DO_SUBTITULO = 120

/**
 * POST /dashboard/produtos/:id/textos — `{ nome, subtitulo, categoriaId,
 * descricaoGoogle }`: o nome da loja, o subtítulo (a linha embaixo do nome),
 * a categoria do produto e o que o Google mostra embaixo do nome (a `meta
 * description`, no `fb_pdp.seo`; vazia, a loja usa o começo da descrição). A
 * descrição vem do Bling e não se muda aqui. Dono e marketing. Sem
 * `descricaoGoogle` no corpo, ela não muda.
 *
 * O NOME é o da loja: mudado aqui, ele ganha a marca `fb_nome`, e a
 * importação do Bling não troca mais (o Bling segue com o dele — a nota, os
 * marketplaces). Mandar o nome igual ao do Bling tira a marca. Sem `nome` no
 * corpo, o nome não muda.
 *
 * RESPOSTAS: 200 `{ lojaAvisada }`; 400 `nome_vazio`, `nome_longo`,
 * `subtitulo_longo`, `descricao_longa` ou `categoria_invalida`; 404
 * `nao_encontrado`.
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const pedido = req as PedidoDaEquipe
  if (!exigirArea(pedido, res, "editarProdutos")) return

  const corpo = (req.body ?? {}) as {
    nome?: unknown
    subtitulo?: unknown
    categoriaId?: unknown
    descricaoGoogle?: unknown
  }
  let nome: string | null = null
  if (corpo.nome !== undefined) {
    const lido = lerNome(corpo.nome)
    if (!lido.ok) {
      res.status(400).json({ message: lido.motivo })
      return
    }
    nome = lido.nome
  }
  const subtitulo =
    typeof corpo.subtitulo === "string" ? corpo.subtitulo.replace(/\s+/g, " ").trim() : ""
  if (subtitulo.length > LIMITE_DO_SUBTITULO) {
    res.status(400).json({ message: "subtitulo_longo" })
    return
  }
  const descricaoGoogle =
    corpo.descricaoGoogle === undefined
      ? undefined
      : typeof corpo.descricaoGoogle === "string"
        ? corpo.descricaoGoogle.replace(/\s+/g, " ").trim()
        : ""
  if (descricaoGoogle && descricaoGoogle.length > LIMITE_DA_DESCRICAO) {
    res.status(400).json({ message: "descricao_longa" })
    return
  }
  const categoriaId =
    typeof corpo.categoriaId === "string" && corpo.categoriaId ? corpo.categoriaId : null
  if (categoriaId && !(await lerCategorias(req.scope)).some((c) => c.id === categoriaId)) {
    res.status(400).json({ message: "categoria_invalida" })
    return
  }
  // Decidido dentro da trava do produto: o nome de agora e as marcas de agora.
  let nomeNovo: string | null = null
  const r = await mudarProduto(req.scope, req.params.id, (atual) => {
    const doNome =
      nome === null
        ? null
        : mudancaDoNome(nome, {
            titulo: atual.titulo,
            nomeDaLoja: temNomeDaLoja(atual.metadata),
            nomeNoBling: nomeNoErp(atual.metadata),
          })
    nomeNovo = doNome?.titulo ?? null
    return {
      subtitle: subtitulo || null,
      category_ids: categoriaId ? [categoriaId] : [],
      ...(doNome
        ? {
            title: doNome.titulo,
            // Chave vazia o Medusa apaga: é assim que a marca sai.
            metadata: {
              [MARCA_DO_NOME]: doNome.marca
                ? { em: new Date().toISOString(), por: pedido.membro.id }
                : "",
            },
          }
        : {}),
    }
  })
  if (!r.ok) {
    res.status(404).json({ message: r.motivo })
    return
  }
  let lojaAvisada = r.lojaAvisada
  if (descricaoGoogle !== undefined) {
    const d = await mudarPdp(req.scope, req.params.id, (pdp) => {
      // Vazia, sai: a loja volta pro começo da descrição do Bling.
      const seo = lerSeo({ descricao: descricaoGoogle })
      const semSeo = { ...pdp }
      delete semSeo.seo
      return { ok: true, pdp: seo ? { ...semSeo, seo } : semSeo }
    })
    if (d.ok) lojaAvisada = lojaAvisada && d.lojaAvisada
  }
  await anotar(pedido, "editou-textos", req.params.id, {
    categoria: categoriaId,
    ...(nomeNovo ? { nome: nomeNovo } : {}),
  })
  res.json({ lojaAvisada })
}
