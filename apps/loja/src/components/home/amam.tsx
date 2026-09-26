import { Estrelas } from "@/components/estrelas"
import { EsteiraDeAvaliacoes } from "@/components/home/esteira-de-avaliacoes"
import { AVALIACOES, TRECHOS, notaMedia, type Depoimento } from "@/conteudo/depoimentos"
import { semRepetidas } from "@/lib/avaliacoes"
import { home, listarProdutos, porHandle } from "@/lib/medusa"

/**
 * "Nossos clientes nos amam": a esteira de avaliações.
 *
 * **Não aparece enquanto não houver depoimento de verdade** em
 * `conteudo/depoimentos.ts` — avaliação ou trecho de entrevista.
 *
 * A esteira mostra até quatro de cada produto, sorteados a cada visita
 * (`esteira-de-avaliacoes.tsx`). A nota do topo é a média de TODAS as
 * avaliações publicadas — cada uma uma vez só, mesmo a que está em vários
 * produtos —, e não só das sorteadas: é a mesma conta em toda visita, e cada
 * avaliação que entra nela está na página do produto dela.
 *
 * TRECHO DE ENTREVISTA NÃO TEM NOTA, e não entra nela. Sem avaliação, o topo
 * diz o que a esteira mostra — "Trechos de entrevistas com clientes" — no
 * lugar da nota; e cada cartão de trecho diz o mesmo, no lugar do nome.
 *
 * O movimento é o mesmo da faixa de avisos: duas filas idênticas correndo
 * -50%, a cópia com `aria-hidden` pra não ser lida duas vezes, e a esteira
 * para quando sai da tela.
 *
 * Os TEXTOS não saem daqui: a esteira os busca sozinha quando a seção chega
 * perto (ver `esteira-de-avaliacoes.tsx`). Daqui vão só as fotos — mandar a
 * lista pronta punha os 160 trechos dentro do HTML de toda visita à home.
 */
export async function Amam() {
  const publicadas = semRepetidas(AVALIACOES)
  const trechos = semRepetidas(TRECHOS)
  const depoimentos: Depoimento[] = [...publicadas, ...trechos]
  if (!depoimentos.length) return null

  const media = notaMedia(publicadas)
  const [produtos, { conteudo }] = await Promise.all([listarProdutos({ limite: 48 }), home()])
  const catalogo = porHandle(produtos)

  // Só a foto de cada produto vai pro navegador — não o produto inteiro.
  const fotos: Record<string, string> = {}
  for (const { produtoHandle } of depoimentos) {
    const foto = produtoHandle ? catalogo.get(produtoHandle)?.thumbnail : null
    if (produtoHandle && foto) fotos[produtoHandle] = foto
  }

  return (
    <section className="amam" aria-labelledby="amam-titulo">
      <div className="amam__topo">
        <h2 className="amam__titulo" id="amam-titulo">
          {conteudo.amam.titulo}
        </h2>
        {media !== null ? (
          <p className="amam__nota">
            <Estrelas
              nota={media}
              rotulo={`Nota média ${formatar(media)} de 5, em ${publicadas.length} ${
                publicadas.length === 1 ? "avaliação publicada" : "avaliações publicadas"
              }`}
            />
            <span>
              <b>{formatar(media)}</b> estrelas nas avaliações publicadas aqui
            </span>
          </p>
        ) : (
          <p className="amam__nota">Trechos de entrevistas com clientes</p>
        )}
      </div>

      <EsteiraDeAvaliacoes fotos={fotos} />
    </section>
  )
}

function formatar(nota: number): string {
  return nota.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}
