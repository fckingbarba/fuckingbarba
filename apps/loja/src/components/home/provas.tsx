import type { HttpTypes } from "@medusajs/types"
import Image from "next/image"
import Link from "next/link"
import { Estrelas } from "@/components/estrelas"
import { ANTES_E_DEPOIS, type AntesEDepois } from "@/conteudo/depoimentos"
import { emReais } from "@/lib/formato"
import { home, listarProdutos, porHandle, precosDe } from "@/lib/medusa"
import { ProvasCarrossel } from "./provas-carrossel"

/**
 * "Resultados reais": o carrossel de antes e depois.
 *
 * **Não aparece enquanto não houver depoimento com as duas fotos** em
 * `conteudo/depoimentos.ts` — o arquivo começa vazio e explica o porquê.
 * Aqui a exigência é ainda maior que na esteira: foto de rosto é dado
 * pessoal, e publicar sem autorização da pessoa é problema de LGPD além de
 * ser falta de respeito com quem confiou a imagem.
 *
 * Cada depoimento fecha com o produto que a pessoa usou, levando pra página
 * dele. Prova social que não leva ao produto é prova desperdiçada.
 */
export async function Provas() {
  const depoimentos = ANTES_E_DEPOIS.filter((d) => d.fotos?.antes && d.fotos?.depois)
  if (!depoimentos.length) return null

  const [produtos, { conteudo }] = await Promise.all([listarProdutos({ limite: 48 }), home()])
  const catalogo = porHandle(produtos)

  return (
    <section className="provas" aria-labelledby="provas-titulo">
      <div className="provas__wrap">
        <p className="provas__tag">{conteudo.provas.tag}</p>
        <h2 className="provas__titulo" id="provas-titulo">
          {conteudo.provas.titulo}
        </h2>
        <hr className="provas__risco" />

        <ProvasCarrossel total={depoimentos.length}>
          {depoimentos.map((d, i) => (
            <Depoimento
              key={`${d.nome}-${i}`}
              depoimento={d}
              produto={d.produtoHandle ? catalogo.get(d.produtoHandle) : undefined}
            />
          ))}
        </ProvasCarrossel>
      </div>
    </section>
  )
}

function Depoimento({
  depoimento,
  produto,
}: {
  depoimento: AntesEDepois
  produto?: HttpTypes.StoreProduct
}) {
  const precos = produto ? precosDe(produto) : null

  return (
    <figure className="depo">
      <div className="depo__midia">
        <span className="depo__uso">Uso contínuo</span>
        <div className="depo__fotos">
          <div className="depo__foto">
            <Image
              src={depoimento.fotos.antes}
              alt={`${depoimento.nome} antes de usar os produtos`}
              width={400}
              height={500}
              loading="lazy"
              sizes="(max-width: 700px) 45vw, 200px"
            />
          </div>
          <div className="depo__foto">
            <Image
              src={depoimento.fotos.depois}
              alt={`${depoimento.nome} depois do uso contínuo dos produtos`}
              width={400}
              height={500}
              loading="lazy"
              sizes="(max-width: 700px) 45vw, 200px"
            />
          </div>
        </div>
      </div>

      <figcaption className="depo__texto">
        <Estrelas nota={depoimento.nota} rotulo={`Avaliação ${depoimento.nota} de 5`} />
        <h3 className="depo__titulo">{depoimento.titulo}</h3>
        <blockquote className="depo__fala">
          <p>{depoimento.texto}</p>
        </blockquote>

        <div className="depo__autor">
          <span className="depo__avatar" aria-hidden="true">
            {depoimento.nome.slice(0, 1).toUpperCase()}
          </span>
          <span>
            <span className="depo__nome">{depoimento.nome}</span>
            {depoimento.local ? <span className="depo__local">{depoimento.local}</span> : null}
          </span>
          {depoimento.compraVerificada ? (
            <span className="depo__verificada">
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
                <path d="M9.15 19.55 1.75 12.15l1.6-1.6h2.5l3.3 3.3 8.5-8.5h2.5l1.6 1.6z" />
              </svg>{" "}
              Compra verificada
            </span>
          ) : null}
        </div>

        {produto && precos ? (
          <Link className="minicard" href={`/produtos/${produto.handle}`}>
            <span className="minicard__foto">
              {produto.thumbnail ? (
                <Image
                  src={produto.thumbnail}
                  alt=""
                  width={160}
                  height={160}
                  loading="lazy"
                  sizes="60px"
                />
              ) : null}
            </span>
            <span className="minicard__info">
              <span className="minicard__rotulo">Produto usado</span>
              <span className="minicard__nome">{produto.title}</span>
              <span className="minicard__precos">
                {precos.cheio != null ? (
                  <s className="minicard__de">{emReais(precos.cheio)}</s>
                ) : null}
                <span className="minicard__por">{emReais(precos.atual)}</span>
              </span>
            </span>
            <span className="minicard__seta" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M1.8 11.3 3 10.1h9.2l1.2-1.2V6.2l.9-.5 7.2 5.6v1.4l-7.2 5.6-.9-.5v-2.7l-1.2-1.2H3l-1.2-1.2z" />
              </svg>
            </span>
          </Link>
        ) : null}
      </figcaption>
    </figure>
  )
}
