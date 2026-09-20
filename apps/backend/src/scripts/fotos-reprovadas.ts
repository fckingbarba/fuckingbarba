import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import { ondeEstou } from "./onde-estou"

/**
 * Tira do catálogo as fotos que não podem ir ao ar.
 *
 *   npm install && npm run backend:fotos
 *
 * ONDE ISSO ESCREVE: no banco do `DATABASE_URL` que estiver valendo — o de
 * `apps/backend/.env` quando roda da sua máquina, o da variável do serviço
 * quando roda no Railway. NÃO É O REPOSITÓRIO: dar push não muda catálogo
 * nenhum, este script precisa rodar apontando pro banco certo. A primeira
 * linha do log diz em qual banco ele está escrevendo, justamente pra essa
 * dúvida acabar antes da escrita.
 *
 * Pra mexer no catálogo que está no ar, as duas opções são: rodar da sua
 * máquina com o DATABASE_URL de produção no `.env`, ou rodar no próprio
 * Railway (Shell do serviço, de `.medusa/server`, com o arquivo já
 * compilado: `npx medusa exec ./src/scripts/fotos-reprovadas.js`).
 *
 * POR QUE ISTO EXISTE, E POR QUE NÃO É UM FILTRO NA LOJA:
 *
 * A galeria da PDP mostra o que o catálogo tem — é o que faz foto nova
 * aparecer no site sem deploy. Então foto que não pode aparecer não pode
 * estar no catálogo. Filtrar por URL no front esconderia o problema em vez de
 * resolver: a foto continuaria no admin, voltaria no primeiro relacionado,
 * no Open Graph, no feed do Google Shopping e no anúncio.
 *
 * ┌─ A FOTO 2 DO FATOR ────────────────────────────────────────────────────┐
 * │                                                                        │
 * │ É um "ANTES / DEPOIS" com DUAS PESSOAS DIFERENTES. Não é questão de    │
 * │ enquadramento: são dois rostos, dois cabelos, duas orelhas, dois       │
 * │ cenários (estúdio com camisa vermelha × banheiro com toalha).          │
 * │                                                                        │
 * │ Três riscos, do mais caro pro mais provável:                           │
 * │                                                                        │
 * │  1. META E GOOGLE proíbem antes/depois de aparência em anúncio, sem    │
 * │     exceção. Não rende advertência: rende conta de anúncios derrubada. │
 * │     Pra uma loja que vive de tráfego pago, é o risco mais caro que     │
 * │     existe nesta lista — e a foto do catálogo entra no feed sozinha.   │
 * │  2. CDC art. 37 §1º — antes/depois que não é a mesma pessoa é o        │
 * │     exemplo de manual de publicidade enganosa. Multa de Procon e ação  │
 * │     individual de qualquer cliente que comprou por causa dela.         │
 * │  3. LGPD art. 11 — imagem de pessoa identificável em contexto de       │
 * │     tratamento é dado sensível e precisa de consentimento registrado   │
 * │     PRA ESSE USO. Se as fotos vieram de banco de imagem ou da          │
 * │     internet, esse consentimento não existe.                           │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * UM ANTES/DEPOIS QUE PODE IR AO AR: mesma pessoa, mesmo ângulo, mesma luz,
 * sem filtro, com o intervalo escrito ("dia 0 / dia 90"), autorização de uso
 * assinada guardada, e legenda dizendo que o resultado varia. Vende mais que
 * esse — porque parece real.
 *
 * ISTO NÃO APAGA ARQUIVO: a imagem continua no Storage, e o registro dela no
 * Medusa também. O que muda é que ela deixa de estar pendurada no produto.
 * Desfazer é recolocar pelo admin. O consertar de verdade é tirar a peça de
 * onde ela nasce (Nuvemshop, banco de criativos), senão a próxima migração
 * de catálogo traz ela de volta.
 *
 * Roda quantas vezes quiser: foto que já saiu é pulada.
 */

/**
 * A regra é sobre a FOTO, não sobre o produto — e essa distinção custou um
 * erro de verdade. Na primeira versão eu nomeava o produto junto, e rodei
 * logo depois do script dos kits: os kits nascem copiando as fotos do
 * produto base, então os dois kits do Fator já tinham herdado o antes/depois
 * quando esta limpeza rodou. Ela olhou só o produto que eu tinha listado,
 * disse "1 produto atualizado", e a foto continuou no catálogo em outros
 * dois lugares — os dois com página e com feed próprios.
 *
 * Foto reprovada é reprovada em qualquer produto. Então agora o script varre
 * o catálogo inteiro e não existe ordem errada de rodar: criar um kit novo
 * amanhã e rodar isto depois limpa o kit também.
 */
type Reprovada = {
  /** Pedaço do nome do arquivo que identifica a imagem, sem o timestamp. */
  contem: string
  motivo: string
}

const REPROVADAS: Reprovada[] = [
  {
    contem: "fator-de-crescimento-para-barba-2",
    motivo: "antes/depois com duas pessoas diferentes",
  },
]

/** Página da varredura. O catálogo é pequeno; o teto é contra laço infinito. */
const PAGINA = 200
const MAX_PAGINAS = 25

export default async function fotosReprovadas({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  ondeEstou(logger, "fotos")

  // O catálogo inteiro, de página em página: a foto pode estar pendurada em
  // qualquer produto, e é justamente o que eu não tinha previsto.
  const produtos: { id: string; handle: string; thumbnail?: string | null; urls: string[] }[] = []
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const { data } = await query.graph({
      entity: "product",
      fields: ["id", "handle", "thumbnail", "images.url"],
      pagination: { skip: pagina * PAGINA, take: PAGINA },
    })
    produtos.push(
      ...data.map((p) => ({
        id: p.id,
        handle: p.handle,
        thumbnail: p.thumbnail,
        urls: (p.images ?? []).flatMap((i) => (i?.url ? [i.url] : [])),
      }))
    )
    if (data.length < PAGINA) break
  }
  logger.info(`[fotos] ${produtos.length} produto(s) no catálogo`)

  const updates: { id: string; images: { url: string }[]; thumbnail?: string }[] = []
  let intactos = 0

  for (const produto of produtos) {
    const todas = produto.urls
    const ficam = todas.filter((url) => !REPROVADAS.some((r) => url.includes(r.contem)))

    if (ficam.length === todas.length) {
      intactos++
      continue
    }

    if (!ficam.length) {
      // Produto sem foto nenhuma é pior que produto com foto ruim: a vitrine
      // fica com um quadrado cinza e ninguém clica.
      logger.error(
        `[fotos] ${produto.handle}: as regras tirariam TODAS as fotos. ` +
          `Pulei — suba uma foto boa antes de rodar de novo.`
      )
      continue
    }

    const saindo = todas.filter((url) => !ficam.includes(url))
    updates.push({
      id: produto.id,
      images: ficam.map((url) => ({ url })),
      // Se a capa era justamente a que sai, a primeira que fica assume.
      ...(produto.thumbnail && saindo.includes(produto.thumbnail) ? { thumbnail: ficam[0] } : {}),
    })

    for (const url of saindo) {
      const motivo = REPROVADAS.find((r) => url.includes(r.contem))?.motivo ?? "reprovada"
      logger.info(`[fotos] ${produto.handle}: sai ${url.split("/").pop()} — ${motivo}`)
    }
  }

  if (!updates.length) {
    logger.info(`[fotos] nada a fazer — ${intactos} produto(s) já estão limpos`)
    return
  }

  await updateProductsWorkflow(container).run({ input: { products: updates } })
  logger.info(`[fotos] ${updates.length} produto(s) atualizado(s)`)
  logger.info(
    "[fotos] LEMBRE: o arquivo continua no Storage e na origem. " +
      "Tire da Nuvemshop e do banco de criativos também, senão volta."
  )
}
