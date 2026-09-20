import Image from "next/image"
import { Raio } from "@/components/icones"
import { ANTES_E_DEPOIS } from "@/conteudo/depoimentos"

/**
 * ANTES E DEPOIS.
 *
 * A prova mais forte que este produto pode ter, e a mais fácil de fazer
 * errado. Por isso ela é a seção com a regra mais dura do arquivo inteiro:
 * SEM CASO CADASTRADO, NÃO RENDERIZA NADA. Nem título, nem moldura vazia,
 * nem "em breve".
 *
 * Os casos saem de `conteudo/depoimentos.ts` — o MESMO arquivo que alimenta
 * a home. Um cliente que mandou foto vale nos dois lugares, e duas listas
 * separadas é como uma delas acaba com um caso que a outra já tirou do ar.
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
 * num comentário. Enquanto ela estiver aqui dentro, é impossível publicar um
 * caso sem ela — que é exatamente o erro que Procon e CONAR olham primeiro.
 *
 * DOIS OU TRÊS CASOS BASTAM: mais que isso vira álbum e ninguém olha. E o
 * melhor caso não é o mais espetacular — é o mais parecido com quem está
 * lendo.
 */
const MAXIMO = 3

export function AntesDepois({ handle }: { handle: string }) {
  const casos = ANTES_E_DEPOIS.filter(
    (d) => d.produtoHandle === handle && d.fotos?.antes && d.fotos?.depois
  ).slice(0, MAXIMO)

  if (!casos.length) return null

  return (
    <section className="antesdepois" aria-labelledby="antesdepois-titulo">
      <div className="antesdepois__wrap">
        <h2 className="antesdepois__titulo" id="antesdepois-titulo">
          <Raio />
          Antes e depois, sem truque
        </h2>

        <div className="antesdepois__casos">
          {casos.map((caso) => (
            <figure className="caso" key={caso.fotos.antes}>
              <div className="caso__par">
                <div className="caso__lado">
                  <Image
                    src={caso.fotos.antes}
                    alt={`${caso.nome} antes do tratamento`}
                    width={600}
                    height={700}
                    loading="lazy"
                  />
                  <span className="caso__etiqueta">Antes · dia 0</span>
                </div>
                <div className="caso__lado">
                  <Image
                    src={caso.fotos.depois}
                    alt={`${caso.nome} depois do tratamento`}
                    width={600}
                    height={700}
                    loading="lazy"
                  />
                  <span className="caso__etiqueta caso__etiqueta--depois">Depois · dia 90</span>
                </div>
              </div>
            </figure>
          ))}
        </div>

        {/*
          Não saia daqui. Uma linha de texto contra uma multa — e contra a
          reclamação de quem comprou esperando a foto e não chegou lá.
        */}
        <p className="antesdepois__ressalva">
          Fotos de clientes reais, publicadas com autorização. Mesma pessoa, mesmo ângulo, sem
          filtro. O resultado varia de pessoa pra pessoa e depende de uso diário.
        </p>
      </div>
    </section>
  )
}
