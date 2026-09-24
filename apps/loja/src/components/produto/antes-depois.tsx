import Image from "next/image"
import { Raio } from "@/components/icones"
import { casosDoProduto, conteudoDaPdp, RESSALVA_DO_ANTES_E_DEPOIS } from "@/conteudo/produto"

/**
 * ANTES E DEPOIS.
 *
 * A prova mais forte que este produto pode ter, e a mais fácil de fazer
 * errado. Por isso ela é a seção com a regra mais dura do arquivo inteiro:
 * SEM CASO CADASTRADO, NÃO RENDERIZA NADA. Nem título, nem moldura vazia,
 * nem "em breve".
 *
 * Os casos são do PRODUTO: cadastrados no painel (Produtos → a página →
 * "Antes e depois"), com a autorização por escrito da pessoa marcada — sem
 * ela o painel não grava. Produto sem caso no painel ainda olha
 * `conteudo/depoimentos.ts`, o arquivo de antes (vazio hoje). A "Prova
 * social" da home lê os mesmos casos (`casosDoProduto`): um caso vale nos
 * dois lugares, e não em duas listas.
 *
 * ┌─ O QUE UM CASO PRECISA TER PRA PODER SUBIR ────────────────────────────┐
 * │  1. MESMA PESSOA nas duas fotos. Antes/depois com pessoas diferentes é │
 * │     o exemplo de manual do art. 37 §1º do CDC — e é o que está no ar   │
 * │     na Nuvemshop hoje.                                                 │
 * │  2. Mesmo ângulo, mesma luz, sem filtro e sem retoque.                 │
 * │  3. O intervalo escrito na foto ("dia 0" / "dia 90") — é o que a       │
 * │     etiqueta faz, e é o que impede o "depois" de ser de outro mês.     │
 * │  4. AUTORIZAÇÃO DE USO assinada, guardada. LGPD art. 11: aparência em  │
 * │     contexto de tratamento é dado sensível, e "mandou no WhatsApp" não │
 * │     é autorização pra publicar.                                        │
 * │                                                                        │
 * │  E lembre: no SITE pode. Em ANÚNCIO não — Meta e Google proíbem        │
 * │  antes/depois de aparência sem exceção, e isso não rende advertência,  │
 * │  rende conta de anúncios derrubada.                                    │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * A RESSALVA DE "RESULTADO VARIA" É PARTE DO COMPONENTE, não um lembrete
 * num comentário (`RESSALVA_DO_ANTES_E_DEPOIS`, a mesma da home). Enquanto
 * ela estiver aqui dentro, é impossível publicar um caso sem ela — que é
 * exatamente o erro que Procon e CONAR olham primeiro.
 *
 * DOIS OU TRÊS CASOS BASTAM: mais que isso vira álbum e ninguém olha. E o
 * melhor caso não é o mais espetacular — é o mais parecido com quem está
 * lendo.
 */
const MAXIMO = 3
const TITULO = "Antes e depois, sem truque"

export async function AntesDepois({ handle }: { handle: string }) {
  const conteudo = await conteudoDaPdp(handle)
  const casos = casosDoProduto(handle, conteudo).slice(0, MAXIMO)

  if (!casos.length) return null

  return (
    <section className="antesdepois" aria-labelledby="antesdepois-titulo">
      <div className="antesdepois__wrap">
        <h2 className="antesdepois__titulo" id="antesdepois-titulo">
          <Raio />
          {conteudo.antesDepois?.titulo ?? TITULO}
        </h2>

        <div className="antesdepois__casos">
          {casos.map((caso) => (
            <figure className="caso" key={caso.antes}>
              <div className="caso__par">
                <div className="caso__lado">
                  <Image
                    src={caso.antes}
                    alt={`${caso.nome}, antes`}
                    width={600}
                    height={700}
                    sizes="(min-width: 860px) 300px, 50vw"
                    loading="lazy"
                  />
                  <span className="caso__etiqueta">Antes</span>
                </div>
                <div className="caso__lado">
                  <Image
                    src={caso.depois}
                    alt={`${caso.nome}, depois de ${caso.tempo} de uso`}
                    width={600}
                    height={700}
                    sizes="(min-width: 860px) 300px, 50vw"
                    loading="lazy"
                  />
                  <span className="caso__etiqueta caso__etiqueta--depois">
                    Depois · {caso.tempo}
                  </span>
                </div>
              </div>
              <figcaption className="caso__pe">
                <p className="caso__quem">
                  {caso.nome} <span>· {caso.tempo} de uso</span>
                </p>
                {caso.texto ? <p className="caso__fala">“{caso.texto}”</p> : null}
              </figcaption>
            </figure>
          ))}
        </div>

        {/*
          Não saia daqui. Uma linha de texto contra uma multa — e contra a
          reclamação de quem comprou esperando a foto e não chegou lá.
        */}
        <p className="antesdepois__aviso">{RESSALVA_DO_ANTES_E_DEPOIS}</p>
      </div>
    </section>
  )
}
