import Image from "next/image"
import { Raio, Relogio } from "@/components/icones"
import { VideoDoProduto } from "@/components/produto/video"
import { Realce } from "@/components/realce"
import { conteudoDaPdp } from "@/conteudo/produto"
import { buscarProdutoPorHandle } from "@/lib/medusa"

/**
 * COMO FUNCIONA + MODO DE USO, lado a lado.
 *
 * As duas caixas são uma seção só porque respondem a mesma pergunta em
 * sequência: "o que isso faz" e "o que eu faço com isso". Separadas em duas
 * seções, a segunda perde o contexto da primeira.
 *
 * Sem título de seção (`aria-label` no lugar de `aria-labelledby`): cada
 * caixa tem o próprio `<h2>`, e um terceiro título por cima só pra dizer
 * "informações" seria ruído.
 *
 * O MODO DE USO É ARGUMENTO DE VENDA, não manual. "Não enxágue" e "depois do
 * banho" são as duas instruções que mais mudam o resultado — e a dica do
 * banho existe pra criar hábito, que é o que impede de esquecer no dia 20.
 * Quem não esquece, vê resultado; quem vê resultado, recompra.
 *
 * COM VÍDEO (o painel, "Vídeo do modo de uso"), ele entra no lugar da foto
 * do modo de uso: mudo, em loop, e só quando a caixa aparece na tela.
 */
export async function Funciona({ handle }: { handle: string }) {
  const c = (await conteudoDaPdp(handle)).funciona
  if (!c) return null

  const [como, uso] = await Promise.all([
    buscarProdutoPorHandle(c.comoFotoDe),
    buscarProdutoPorHandle(c.usoFotoDe),
  ])

  const fotoComo = como?.images?.[1]?.url ?? como?.thumbnail ?? null
  const fotoUso = uso?.images?.[1]?.url ?? uso?.thumbnail ?? null

  return (
    <section className="funciona" aria-label={`${c.comoTitulo} e ${c.usoTitulo.toLowerCase()}`}>
      <div className="funciona__wrap">
        <div className="funciona__caixa">
          <h2>
            <Raio />
            {c.comoTitulo}
          </h2>

          {fotoComo ? (
            <div className="funciona__foto">
              <Image
                src={fotoComo}
                alt="Textura do produto FuckingBarba saindo do frasco"
                width={900}
                height={600}
                loading="lazy"
              />
            </div>
          ) : null}

          {c.comoTexto.map((p) => (
            <p key={p}>
              <Realce texto={p} />
            </p>
          ))}
        </div>

        <div className="funciona__caixa">
          <h2>
            <Relogio />
            {c.usoTitulo}
          </h2>

          {c.usoVideo ? (
            <div className="funciona__foto funciona__foto--video">
              <VideoDoProduto
                video={c.usoVideo}
                rotulo={`Vídeo: ${c.usoTitulo}`}
                enquadrar="cover"
              />
            </div>
          ) : fotoUso ? (
            <div className="funciona__foto">
              <Image
                src={fotoUso}
                alt="Produto FuckingBarba sendo aplicado na mão"
                width={900}
                height={600}
                loading="lazy"
              />
            </div>
          ) : null}

          <ol className="funciona__passos">
            {c.usoPassos.map((passo) => (
              /*
                O <span> não é enfeite: o <li> é grade de duas colunas
                (número | texto), e um <strong> solto no meio da frase vira
                célula própria e cai por cima do número do passo.
              */
              <li key={passo}>
                <span>
                  <Realce texto={passo} />
                </span>
              </li>
            ))}
          </ol>

          {c.dica ? (
            <p className="funciona__dica">
              <Raio />
              <span>
                <Realce texto={c.dica} />
              </span>
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
