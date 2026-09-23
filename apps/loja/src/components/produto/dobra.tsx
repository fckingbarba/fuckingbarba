import { notFound } from "next/navigation"
import { Compra } from "@/components/produto/compra"
import { Galeria, type Foto } from "@/components/produto/galeria"
import { Migalhas, type Migalha } from "@/components/produto/migalhas"
import { buscarProdutoPorHandle, escadaDeQuantidade, precosDe } from "@/lib/medusa"
import { pdpDoProduto, produtosQueCombinam } from "@/lib/pdp"
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
 */

export async function Dobra({ handle }: { handle: string }) {
  const produto = await buscarProdutoPorHandle(handle)
  if (!produto) notFound()

  const { combinada } = await pdpDoProduto(handle)
  const escada = await escadaDeQuantidade(handle)

  /*
    A CHAVE "KITS" DO ADMIN ESCONDE OS CARTÕES, NÃO O DESCONTO.

    O desconto por quantidade é do Medusa e vale em todo produto: quem põe
    2 no seletor paga o preço de 2, com ou sem cartão na tela. Então a
    escada inteira vai pra `Compra` — é dela que sai o preço de cada
    quantidade — e a chave só decide se a escolha "1, 2, 3 unidades"
    aparece.
  */
  const mostrarDegraus = combinada.kits !== false

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
  const combinam = await produtosQueCombinam(combinada.produtos ?? [], handle)
  const precos = precosDe(produto)
  const variante = produto.variants?.[0]

  const fotos: Foto[] = (produto.images ?? []).flatMap((img) =>
    img?.url ? [{ url: img.url, alt: legenda(produto.title, produto.subtitle) }] : []
  )
  if (!fotos.length && produto.thumbnail) {
    fotos.push({ url: produto.thumbnail, alt: legenda(produto.title, produto.subtitle) })
  }

  const categoria = produto.categories?.[0]
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
   * mostrar, e inventar um é o começo da página deixar de ser confiável.
   */
  const estoque =
    variante?.manage_inventory && typeof variante.inventory_quantity === "number"
      ? variante.inventory_quantity
      : null

  return (
    <>
      <Migalhas trilha={trilha} />

      <section
        className="pdp"
        itemScope
        itemType="https://schema.org/Product"
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
            fotos={fotos}
            alvo={legenda(produto.title, produto.subtitle)}
            desconto={desconto}
          />

          <div className="compra">
            <Compra
              nome={produto.title}
              foto={produto.thumbnail ?? fotos[0]?.url ?? null}
              degraus={degraus}
              combinam={combinam}
              precoCheio={precos?.cheio ?? null}
              estoque={estoque}
              mostrarDegraus={mostrarDegraus}
            />
          </div>
        </div>
      </section>
    </>
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
