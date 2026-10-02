import Link from "next/link"
import { notFound } from "next/navigation"
import { FichaNaFoto } from "@/components/ficha/na-foto"
import { FaixaDaOferta, ProvedorDaOfertaNaPdp } from "@/components/oferta/na-pdp"
import { Compra } from "@/components/produto/compra"
import { Galeria, type Foto, type ItemDaGaleria } from "@/components/produto/galeria"
import { Migalhas, type Migalha } from "@/components/produto/migalhas"
import { VeNaPratica } from "@/components/produto/ve-na-pratica"
import { AVALIACOES } from "@/conteudo/depoimentos"
import { categoriaPrincipal } from "@/lib/categorias"
import {
  avaliacoesPublicadas,
  buscarProdutoPorHandle,
  escadaDeQuantidade,
  modeloDeRecomendacao,
  precosDe,
  temEstoque,
  vitrineDaSacola,
} from "@/lib/medusa"
import {
  modoDaCaixa,
  pdpDoProduto,
  produtosQueCombinam,
  videosDaFaixa,
  type ProdutoQueCombina,
} from "@/lib/pdp"
import { foraDaSugestao, ordenarParaAPagina } from "@/lib/recomendacao"
import { site } from "@/lib/site"

/**
 * A DOBRA — a primeira tela da página de produto.
 *
 * Migalhas, nome, galeria e a coluna de compra. É a única seção `fixo` da
 * PDP: sem ela não existe página de produto, e o painel que vier não pode
 * oferecer um olhinho pra desligar o botão de comprar numa sexta à noite.
 *
 * O `itemscope` de Product abre aqui e fecha aqui — preço, disponibilidade e
 * imagem precisam estar todos dentro dele pro Google montar o resultado rico
 * com preço. Por isso a coluna de compra é filha desta seção, e não uma
 * seção irmã: `itemprop` não atravessa o HTML, atravessa a árvore.
 *
 * A ORDEM DO HTML É A DO CELULAR: nome, foto, compra. O cliente precisa
 * saber o que é isso antes de olhar a embalagem, e cada pixel gasto antes do
 * preço empurra o botão pra fora da primeira tela. No desktop o grid devolve
 * o nome pro alto da coluna da direita. Quem navega por teclado ou leitor de
 * tela ouve na ordem do celular, que é a ordem que faz sentido lida.
 *
 * A OFERTA OCULTA (entrega 0240): quem veio pelo link de uma oferta com este
 * produto vê a faixa dela no alto e o preço dela na foto, na compra e na
 * barra fixa — no navegador, depois de abrir (`ProvedorDaOfertaNaPdp`). O
 * HTML daqui é o de todo mundo, e o do Google.
 */

export async function Dobra({ handle }: { handle: string }) {
  const produto = await buscarProdutoPorHandle(handle)
  if (!produto) notFound()

  const { combinada, videos } = await pdpDoProduto(handle)
  const { degraus: escada, promocao, unitarios } = await escadaDeQuantidade(handle)
  // A nota das avaliações entra no Product pelo `itemref` (ver `avaliacoes.tsx`) —
  // só quando existe, pra referência não apontar pro nada.
  const temNota = [...(await avaliacoesPublicadas()), ...AVALIACOES].some(
    (a) => a.produtoHandle === handle
  )

  /*
    A CHAVE "KITS" DO ADMIN ESCONDE OS CARTÕES, NÃO O DESCONTO.

    O desconto por quantidade é do Medusa e vale em todo produto: quem põe
    2 no seletor paga o preço de 2, com ou sem cartão na tela. Então a
    escada inteira vai pra `Compra` — é dela que sai o preço de cada
    quantidade — e a chave só decide se a escolha "1, 2, 3 unidades"
    aparece.
  */
  const modo = modoDaCaixa(combinada)
  // Sem `modo` (o salvo antes dele), `kits: false` ainda esconde os cartões.
  const mostrarDegraus = modo === "unidades" && combinada.kits !== false

  /*
    A LINHA DE APOIO DO AVULSO vem do admin, e não do `subtitle` do produto.

    O `subtitle` do produto diz o que o PRODUTO é ("Crescimento, densidade e
    preenchimento"), e isso embaixo de "1 unidade" responde outra pergunta —
    em três linhas, num cartão de 150px. Os cartões de 2 e 3 dizem quanto se
    economiza, que é conta, não texto.
  */
  const degraus = combinada.notaDoAvulso
    ? escada.map((d) => (d.unidades === 1 ? { ...d, nota: combinada.notaDoAvulso! } : d))
    : escada

  /*
    Os produtos que combinam, pra caixa de compra. Vêm resolvidos aqui — a
    `Compra` roda no navegador e não fala com o Medusa.
  */
  /*
    UMA COISA OU OUTRA: com o "Leve junto" escolhido, os cartões saem (quem
    aumentar a quantidade no seletor continua com o desconto); com os
    cartões, o "Leve junto" não aparece. Até 2 produtos — a caixa é pequena.
  */
  const combinam =
    modo === "junto"
      ? await produtosQueCombinam((combinada.produtos ?? []).slice(0, 2), handle)
      : []
  /*
    OS QUE COMPLETAM O FRETE GRÁTIS (0208), na ordem em que a calculadora
    oferece: primeiro os do "Leve junto" (a loja escolheu), depois a vitrine
    da sacola na ordem do motor pra ESTE produto. Fora: o próprio, e peça de
    kit ou kit de peça (`foraDaSugestao`). Quem escolhe um só — o primeiro
    que sozinho fecha o que falta — é a calculadora, que sabe quanto falta.
    As duas leituras são as mesmas do layout, e cacheadas.
  */
  const [vitrine, modelo] = await Promise.all([vitrineDaSacola(), modeloDeRecomendacao()])
  const fora = foraDaSugestao(modelo, [handle])
  const daVitrine: ProdutoQueCombina[] = (
    modelo ? ordenarParaAPagina(vitrine, handle, modelo) : vitrine
  )
    .filter((v) => !fora.has(v.handle))
    .map((v) => ({
      handle: v.handle,
      nome: v.nome,
      foto: v.imagem,
      varianteId: v.varianteId,
      preco: v.preco,
    }))
  const jaTem = new Set(combinam.map((c) => c.varianteId))
  const completam = [...combinam, ...daVitrine.filter((v) => !jaTem.has(v.varianteId))]

  const precos = precosDe(produto)
  const variante = produto.variants?.[0]

  const fotos: Foto[] = (produto.images ?? []).flatMap((img) =>
    img?.url ? [{ url: img.url, alt: legenda(produto.title, produto.subtitle) }] : []
  )
  if (!fotos.length && produto.thumbnail) {
    fotos.push({ url: produto.thumbnail, alt: legenda(produto.title, produto.subtitle) })
  }
  /*
    A GALERIA É SÓ DE FOTOS. Os vídeos do painel vão pra faixa "Vê na
    prática", no fim da coluna de compra (pedido da loja em 24/09): no meio
    das fotos eles se misturavam com o produto e ficavam escondidos na
    última miniatura.
  */
  const itens: ItemDaGaleria[] = fotos.map((f) => ({ tipo: "foto", ...f }))

  // Em mais de uma categoria (o kit em Kits e em Barba), a trilha leva a principal.
  const categoria = categoriaPrincipal(produto)
  const trilha: Migalha<CaminhoDaTrilha>[] = [{ nome: "Início", href: "/" }]
  if (categoria?.handle && conhecida(categoria.handle)) {
    trilha.push({ nome: categoria.name, href: `/${categoria.handle}` })
  }
  trilha.push({ nome: produto.title })

  /*
   * O desconto do selo é calculado, nunca digitado: sai dos dois preços que
   * o Medusa devolve. Selo de "-40%" escrito à mão sobrevive ao fim da
   * promoção — e aí a foto anuncia um desconto que o preço ao lado não dá.
   */
  const desconto =
    precos?.cheio && precos.cheio > precos.atual
      ? Math.round((1 - precos.atual / precos.cheio) * 100)
      : null

  /*
   * O número da escassez só existe quando o Medusa controla o estoque desta
   * variante. Com `manage_inventory` desligado não há número nenhum pra
   * mostrar, e inventar um é o começo da página deixar de ser confiável. Com
   * venda sem estoque (`allow_backorder`) também não: o número não limita
   * nada, e com ele a caixa de compra se diria esgotada de um produto que
   * vende.
   */
  const estoque =
    variante?.manage_inventory &&
    !variante.allow_backorder &&
    typeof variante.inventory_quantity === "number"
      ? variante.inventory_quantity
      : null

  /*
   * ESGOTADO: a mesma conta da caixa de compra (`temEstoque` da variante,
   * que é o que a `Compra` recebe nos degraus). A caixa troca o botão pelo
   * avise-me; daqui saem o selo da foto e o atalho pros outros produtos da
   * mesma categoria — quem chegou aqui queria algo desse tipo.
   */
  const esgotado = variante ? !temEstoque(variante) : false
  const categoriaDaTrilha = trilha.length > 2 ? trilha[1] : null

  return (
    <ProvedorDaOfertaNaPdp produtoId={produto.id} precos={precos ?? null}>
      <FaixaDaOferta />
      <Migalhas trilha={trilha} />

      <section
        className="pdp"
        itemScope
        itemType="https://schema.org/Product"
        // A nota das avaliações mora na seção delas, mais embaixo
        // (`avaliacoes.tsx`), e entra no Product por aqui.
        itemRef={temNota ? "avaliacoes-nota" : undefined}
        aria-labelledby="produto-nome"
      >
        {variante?.sku ? <meta itemProp="sku" content={variante.sku} /> : null}
        <meta itemProp="brand" content={site.nome} />
        {produto.description ? <meta itemProp="description" content={produto.description} /> : null}

        <div className="pdp__wrap">
          <div className="pdp__cabeca">
            <h1 className="compra__nome" id="produto-nome" itemProp="name">
              {produto.title}
            </h1>
          </div>

          <Galeria
            itens={itens}
            alvo={legenda(produto.title, produto.subtitle)}
            desconto={desconto}
            esgotado={esgotado}
            noPe={<FichaNaFoto handle={produto.handle} />}
          />

          <div className="compra">
            <Compra
              nome={produto.title}
              foto={produto.thumbnail ?? fotos[0]?.url ?? null}
              degraus={degraus}
              combinam={combinam}
              completam={completam}
              precoCheio={precos?.cheio ?? null}
              estoque={estoque}
              mostrarDegraus={mostrarDegraus}
              promocao={promocao}
              unitarios={unitarios}
            />
            {esgotado ? (
              <p className="compra__outros">
                Enquanto isso,{" "}
                {categoriaDaTrilha?.href ? (
                  <Link href={categoriaDaTrilha.href}>
                    veja o que mais tem em {categoriaDaTrilha.nome}
                  </Link>
                ) : (
                  <Link href="/produtos">veja os outros produtos</Link>
                )}
                .
              </p>
            ) : null}
            <VeNaPratica
              videos={videosDaFaixa(videos)}
              produto={produto.title}
              item={
                degraus[0]
                  ? {
                      item_id: degraus[0].varianteId,
                      item_name: produto.title,
                      price: degraus[0].porUnidade,
                    }
                  : null
              }
            />
          </div>
        </div>
      </section>
    </ProvedorDaOfertaNaPdp>
  )
}

/**
 * O texto alternativo da foto. Descreve o que se vê, não o que se vende:
 * leitor de tela lendo "compre já o melhor produto" no lugar de "frasco de
 * 30 ml com conta-gotas" não ajuda ninguém, e o Google trata como spam.
 *
 * Enquanto as fotos não tiverem legenda própria no admin, o nome e o
 * subtítulo do produto são a melhor aproximação que existe — e são melhores
 * que `alt=""`, que diz ao leitor de tela pra ignorar a foto.
 */
function legenda(titulo: string, subtitulo?: string | null): string {
  return subtitulo ? `${titulo} — ${subtitulo}` : titulo
}

type HandleDeCategoria = (typeof site.categorias)[number]["handle"]

/** Os dois caminhos que a trilha de uma PDP sabe montar. */
type CaminhoDaTrilha = "/" | `/${HandleDeCategoria}`

const CATEGORIAS = new Set<string>(site.categorias.map((c) => c.handle))

/**
 * Só vira link a categoria que tem rota de primeiro nível. As outras (as de
 * organização interna do admin) continuam aparecendo no texto da trilha, mas
 * sem link — migalha que leva a 404 é pior que migalha sem link.
 *
 * É type guard, e não um booleano qualquer, pra que o `/${handle}` depois
 * dela seja um caminho que o compilador reconhece. Sem isso o jeito de
 * calar o erro seria um `as Route`, que é precisamente desligar a checagem
 * no ponto onde ela serve.
 */
function conhecida(handle: string): handle is HandleDeCategoria {
  return CATEGORIAS.has(handle)
}
