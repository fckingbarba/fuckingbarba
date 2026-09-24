import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { SoPara } from "@/components/area"
import { Cpf } from "@/components/cpf"
import { Icone } from "@/components/icones"
import { Status } from "@/components/pedidos"
import { Cabeca, ForaDoAr, SemAcesso } from "@/components/telas"
import { medusa } from "@/lib/medusa"
import { ehIdDePedido, reais, type DetalheDoPedido } from "@/lib/pedidos"

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  return { title: ehIdDePedido(id) ? "Pedido" : "Pedido não encontrado" }
}

/**
 * O PEDIDO INTEIRO — o caminho de seis passos, o que foi comprado, o
 * histórico, e do lado o pagamento, a entrega e o cliente. Tudo vem pronto
 * do backend (`GET /dashboard/pedidos/:id`); o CPF inteiro só pro dono.
 *
 * No celular vira uma coluna só, na ordem do que mais se procura: o
 * caminho, os itens, o pagamento, a entrega, o cliente e o histórico.
 */
export default function Pagina({ params }: Props) {
  return (
    <SoPara area="pedidos">
      <Pedido params={params} />
    </SoPara>
  )
}

const NIVEL_DA_FAIXA = { grave: "alerta", atencao: "relogio", info: "check" } as const

async function Pedido({ params }: Props) {
  const { id } = await params
  if (!ehIdDePedido(id)) return <NaoAchei />

  const r = await medusa(`/dashboard/pedidos/${id}`, { metodo: "GET", token: "sessao" })
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return <SemAcesso area="pedidos" />
  if (r.status === 404) return <NaoAchei />
  if (r.status !== 200) return <ForaDoAr />
  const p = r.corpo.pedido as DetalheDoPedido
  // O backend manda o documento inteiro só pro dono: sem ele, a tela avisa por quê.
  const escondido = Boolean(p.cliente.documento && !p.cliente.documento.inteiro)

  return (
    <div data-tela>
      <Cabeca
        voltar={{ href: "/pedidos", texto: "Pedidos" }}
        titulo={`Pedido #${p.numero}`}
        selo={<Status p={p} />}
        sub={`${p.quando} · ${p.cliente.nome} · ${reais(p.total)}`}
      />

      {p.faixas.map((f) => (
        <div key={f.titulo} className="faixa" data-nivel={f.nivel}>
          <Icone nome={NIVEL_DA_FAIXA[f.nivel]} />
          <div>
            <p className="faixa__titulo">{f.titulo}</p>
            <p>{f.texto}</p>
          </div>
        </div>
      ))}

      <div className="detalhe">
        <div>
          <section className="bloco">
            <div className="bloco__cabeca">
              <h2 className="bloco__titulo">O caminho do pedido</h2>
            </div>
            <ol className="caminho">
              {p.caminho.map((passo) => (
                <li
                  key={passo.nome}
                  data-feito={passo.estado === "feito" ? "" : undefined}
                  data-agora={passo.estado === "agora" ? "" : undefined}
                  data-erro={passo.estado === "erro" ? "" : undefined}
                >
                  {passo.nome}
                  {passo.texto ? <small>{passo.texto}</small> : null}
                </li>
              ))}
            </ol>
            {p.cancelado ? (
              <p className="pequeno suave" style={{ margin: "14px 0 0" }}>
                {p.cancelado}
              </p>
            ) : null}
          </section>

          <section className="bloco">
            <div className="bloco__cabeca">
              <h2 className="bloco__titulo">O que foi comprado</h2>
            </div>
            <ul className="itens">
              {p.itens.map((i, n) => (
                <li className="item" key={`${i.nome}-${n}`}>
                  <span className={`foto${i.imagem ? "" : " foto--vazia"}`}>
                    {i.imagem ? (
                      // eslint-disable-next-line @next/next/no-img-element -- foto do Medusa, de qualquer host
                      <img src={i.imagem} alt="" loading="lazy" />
                    ) : (
                      <Icone nome="produtos" />
                    )}
                  </span>
                  <div>
                    <p className="item__nome">{i.nome}</p>
                    <p className="item__un">
                      {i.quantidade} × {reais(i.unitario)}
                      {i.cheio ? ` · de ${reais(i.cheio)}` : ""}
                      {i.variante ? ` · ${i.variante}` : ""}
                      {i.sku ? ` · SKU ${i.sku}` : ""}
                    </p>
                  </div>
                  <span className="item__valor">{reais(i.total)}</span>
                </li>
              ))}
            </ul>
            <dl className="totais">
              <div>
                <dt>Produtos</dt>
                <dd>{reais(p.totais.produtos)}</dd>
              </div>
              {p.totais.cupons.map((c) => (
                <div className="verde" key={c.codigo}>
                  <dt>Cupom {c.codigo}</dt>
                  <dd>−{reais(c.valor)}</dd>
                </div>
              ))}
              <div className={p.totais.frete ? undefined : "verde"}>
                <dt>{p.totais.formaDeEntrega}</dt>
                <dd>{p.totais.frete ? reais(p.totais.frete) : "Grátis"}</dd>
              </div>
              <div className="total">
                <dt>Total</dt>
                <dd>{reais(p.totais.total)}</dd>
              </div>
            </dl>
          </section>

          <section className="bloco">
            <div className="bloco__cabeca">
              <h2 className="bloco__titulo">Histórico</h2>
              <span className="selo selo--auto">o que a loja fez, e quando</span>
            </div>
            <ul className="historico">
              {p.historico.map((e, n) => (
                <li key={`${e.em}-${n}`}>
                  <time dateTime={e.em}>{e.quando}</time>
                  <span>
                    {e.titulo}
                    {e.detalhe ? <small>{e.detalhe}</small> : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="detalhe__lado">
          <section className="bloco">
            <h2 className="rotulo">Pagamento</h2>
            <p className="info">
              <b>{p.pagamento.forma}</b>
              <small>{p.pagamento.detalhe}</small>
            </p>
            {p.nota ? (
              <dl className="pares" style={{ marginTop: 12 }}>
                <div>
                  <dt>Nota fiscal</dt>
                  <dd>{p.nota}</dd>
                </div>
              </dl>
            ) : null}
          </section>

          {p.entrega ? (
            <section className="bloco">
              <h2 className="rotulo">Entrega</h2>
              <p className="info">
                <b>{p.entrega.nome}</b>
                <br />
                {p.entrega.linha1}
                {p.entrega.linha2 ? (
                  <>
                    <br />
                    {p.entrega.linha2}
                  </>
                ) : null}
                <br />
                {p.entrega.cidadeUf} · {p.entrega.cep}
                <small>{p.entrega.forma}</small>
              </p>
              {p.entrega.frenet || p.entrega.rastreios.length ? (
                <dl className="pares" style={{ marginTop: 12 }}>
                  {p.entrega.frenet ? (
                    <div>
                      <dt>Na Frenet</dt>
                      <dd>{p.entrega.frenet}</dd>
                    </div>
                  ) : null}
                  {p.entrega.rastreios.map((r) => (
                    <div key={r.codigo}>
                      <dt>Rastreio</dt>
                      <dd className="num">
                        {r.url ? (
                          <a
                            className="link"
                            href={r.url}
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            {r.codigo}
                          </a>
                        ) : (
                          r.codigo
                        )}
                        <small className="suave" style={{ display: "block", fontWeight: 600 }}>
                          {r.texto}
                        </small>
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </section>
          ) : null}

          <section className="bloco">
            <h2 className="rotulo">Cliente</h2>
            <dl className="pares">
              <div>
                <dt>Nome</dt>
                <dd>{p.cliente.nome}</dd>
              </div>
              <div>
                <dt>E-mail</dt>
                <dd>{p.cliente.email}</dd>
              </div>
              {p.cliente.celular ? (
                <div>
                  <dt>Celular</dt>
                  <dd>{p.cliente.celular}</dd>
                </div>
              ) : null}
              {p.cliente.documento ? (
                <div>
                  <dt>{p.cliente.documento.tipo === "cpf" ? "CPF" : "CNPJ"}</dt>
                  <dd>
                    <Cpf
                      mascarado={p.cliente.documento.mascarado}
                      inteiro={p.cliente.documento.inteiro}
                    />
                  </dd>
                </div>
              ) : null}
              <div>
                <dt>Conta</dt>
                <dd>{p.cliente.conta ? "Tem conta na loja" : "Comprou sem conta"}</dd>
              </div>
            </dl>
            {escondido ? (
              <p className="pequeno suave" style={{ margin: "12px 0 0" }}>
                O documento inteiro só o dono vê.
              </p>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  )
}

function NaoAchei() {
  return (
    <div className="vazio" data-tela>
      <b>Pedido não encontrado</b>
      <Link className="link" href="/pedidos">
        Voltar pra lista
      </Link>
    </div>
  )
}
