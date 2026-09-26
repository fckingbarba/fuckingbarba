import type { Route } from "next"
import Link from "next/link"
import { Icone } from "@/components/icones"
import { Achados, SEM_VISITAS } from "@/components/marketing"
import {
  lerProdutosDoMarketing,
  type Periodo,
  type ProdutoNoMarketing,
  type Sinal,
} from "@/lib/marketing"
import { reais } from "@/lib/pedidos"

/**
 * OS PRODUTOS DO MARKETING — o que cada produto atrai, põe na sacola e vende,
 * com os sinais (esgotado, acabando, muita visita e pouca sacola). Os
 * desenhos são os do protótipo; os dados, do `GET /dashboard/marketing/produtos`.
 * Tocar num produto abre a página dele no painel.
 */

const INTEIRO = new Intl.NumberFormat("pt-BR")

/** O selo de cada sinal, com as cores de situação que o painel já usa. */
const SELO: Record<Sinal, [string, string]> = {
  esgotado: ["esgotado", "Esgotado"],
  acabando: ["pix", "Acabando"],
  "pouca-sacola": ["analise", "Muita visita, pouca sacola"],
  vendendo: ["publicado", "Vendendo"],
  "sem-venda": ["cancelado", "Sem venda no período"],
}

function Sinais({ sinais }: { sinais: Sinal[] }) {
  return (
    <span className="sinais">
      {sinais.map((s) => (
        <span className="status" data-s={SELO[s][0]} data-sinal={s} key={s}>
          {SELO[s][1]}
        </span>
      ))}
    </span>
  )
}

function Foto({ p }: { p: ProdutoNoMarketing }) {
  return (
    <span className={`foto${p.imagem ? "" : " foto--vazia"}`}>
      {p.imagem ? (
        // eslint-disable-next-line @next/next/no-img-element -- foto do Medusa, de qualquer host
        <img src={p.imagem} alt="" loading="lazy" />
      ) : (
        <Icone nome="produtos" />
      )}
    </span>
  )
}

/** Acima ou abaixo da média da loja: bom e ruim, só com visita que chegue pra dizer. */
function classeDaSacola(p: ProdutoNoMarketing, media: number | null) {
  if (p.sacola === null || media === null || (p.visitas ?? 0) < 30) return undefined
  if (p.sacola >= media * 1.25) return "bom"
  if (p.sacola <= media * 0.75) return "ruim"
  return undefined
}

export async function TelaDosProdutos({ periodo }: { periodo: Periodo }) {
  const r = await lerProdutosDoMarketing(periodo)
  if (!r)
    return (
      <p className="sem-dados">Não consegui falar com a loja agora. Recarregue daqui a pouco.</p>
    )
  const comVisita = r.produtos.filter((p) => (p.visitas ?? 0) >= 30 && p.sacola !== null)
  const media = comVisita.length
    ? comVisita.reduce((s, p) => s + p.sacola!, 0) / comVisita.length
    : null
  const pagina = (p: ProdutoNoMarketing) => `/produtos/${p.id}` as Route
  const sacola = (p: ProdutoNoMarketing) =>
    p.sacola === null ? (
      <span className="suave">—</span>
    ) : (
      <span className={classeDaSacola(p, media)}>{p.sacola}%</span>
    )
  const visitas = (p: ProdutoNoMarketing) =>
    p.visitas === null ? <span className="suave">—</span> : INTEIRO.format(p.visitas)

  return (
    <>
      {r.achado ? <Achados achados={[r.achado]} /> : null}
      {r.estado !== "ok" ? (
        <p className="sem-dados produtos__sem-google" data-sem-google={r.estado}>
          Sem as visitas e a sacola: {SEM_VISITAS[r.estado]}. O vendido e o estoque são da loja.
        </p>
      ) : null}
      <section className="bloco bloco--sem-pad" data-bloco="produtos">
        <div className="bloco__cabeca">
          <div>
            <h2 className="bloco__titulo">Produtos</h2>
            <p className="bloco__sub">
              Do que mais vendeu pro que menos. Toque num produto pra abrir a página dele no painel.
            </p>
          </div>
        </div>
        {r.produtos.length ? (
          <>
            <div className="tabela-rola" data-vira-cartao>
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th className="direita">Visitas</th>
                    <th className="direita">Pôs na sacola</th>
                    <th className="direita">Vendidos</th>
                    <th className="direita">Receita</th>
                    <th>Sinal</th>
                  </tr>
                </thead>
                <tbody>
                  {r.produtos.map((p) => (
                    <tr key={p.id} data-produto={p.id}>
                      <td>
                        <Link className="tabela__link com-foto" href={pagina(p)}>
                          <Foto p={p} />
                          <b>{p.nome}</b>
                        </Link>
                      </td>
                      <td className="direita num">{visitas(p)}</td>
                      <td className="direita num">{sacola(p)}</td>
                      <td className="direita num">{INTEIRO.format(p.vendidos)} un.</td>
                      <td className="direita num">
                        <b>{reais(p.receita)}</b>
                      </td>
                      <td>
                        <Sinais sinais={p.sinais} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="cartoes">
              {r.produtos.map((p) => (
                <Link className="cartao" key={p.id} href={pagina(p)} data-produto={p.id}>
                  <span className="cartao__linha">
                    <span className="com-foto">
                      <Foto p={p} />
                      <p className="cartao__titulo">{p.nome}</p>
                    </span>
                    <span className="cartao__valor">{reais(p.receita)}</span>
                  </span>
                  <p className="cartao__txt">
                    {p.visitas === null ? "—" : INTEIRO.format(p.visitas)} visitas · sacola{" "}
                    {p.sacola === null ? "—" : `${p.sacola}%`}
                  </p>
                  <p className="cartao__txt">{INTEIRO.format(p.vendidos)} vendidos</p>
                  <Sinais sinais={p.sinais} />
                </Link>
              ))}
            </div>
          </>
        ) : (
          <p className="sem-dados">Nenhum produto no site.</p>
        )}
      </section>
      <p className="pequeno suave">
        &ldquo;Pôs na sacola&rdquo;: de cada 100 vezes que a página do produto foi vista, quantas
        viraram sacola — do Google Analytics, só de quem aceitou os cookies. Os vendidos e a receita
        são os pedidos pagos da loja; o estoque, o que dá pra vender.
      </p>
    </>
  )
}
