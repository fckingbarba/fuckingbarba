import type { Metadata, Route } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { SoPara } from "@/components/area"
import { Cpf } from "@/components/cpf"
import { Status } from "@/components/pedidos"
import { Cabeca, ForaDoAr, SemAcesso } from "@/components/telas"
import { ehIdDeCliente, type FichaDoCliente, vezes } from "@/lib/clientes"
import { lerMembro } from "@/lib/eu"
import { medusa } from "@/lib/medusa"
import { reais } from "@/lib/pedidos"

export const metadata: Metadata = { title: "Cliente" }

type Params = Promise<{ id: string }>

/**
 * A FICHA DO CLIENTE — os dados, as ofertas que ele aceitou (na conta e na
 * newsletter, com onde e desde quando) e os pedidos. Vem pronta do backend
 * (`GET /dashboard/clientes/:id`), já cortada pro papel: o marketing recebe
 * só o e-mail, as ofertas e o resumo dos pedidos; o CPF inteiro, só o dono.
 *
 * A ficha junta a mesma pessoa dos dois cadastros do Medusa (o convidado de
 * cada checkout e a conta). É aqui que o CRM vai pôr as etiquetas de cada
 * cliente (a etapa, o engajamento, a próxima compra) — num bloco a mais.
 */
export default function Pagina({ params }: { params: Params }) {
  return (
    <SoPara area="clientes">
      <Ficha params={params} />
    </SoPara>
  )
}

async function Ficha({ params }: { params: Params }) {
  const { id } = await params
  if (!ehIdDeCliente(id)) notFound()
  const [r, leitura] = await Promise.all([
    medusa(`/dashboard/clientes/${id}`, { metodo: "GET", token: "sessao" }),
    lerMembro(),
  ])
  if (r.status === 401)
    redirect(`/sair?motivo=${r.corpo.message === "fora_da_equipe" ? "fora" : "expirou"}`)
  if (r.status === 403) return <SemAcesso area="clientes" />
  if (r.status === 404) notFound()
  if (r.status !== 200 || leitura.estado !== "ok") return <ForaDoAr />
  const c = (r.corpo as { cliente: FichaDoCliente }).cliente
  const dono = leitura.membro.papel === "dono"

  return (
    <div data-tela data-ficha={c.id}>
      <Cabeca
        voltar={{ href: "/clientes", texto: "Clientes" }}
        titulo={c.nome}
        sub={`${c.conta ? "Tem conta na loja" : "Comprou sem conta"} · cliente desde ${c.desde}`}
      />
      <div className="duas">
        <div>
          <section className="bloco" data-dados>
            <h2 className="rotulo">Dados</h2>
            <dl className="pares">
              <div>
                <dt>E-mail</dt>
                <dd>{c.email}</dd>
              </div>
              {c.dados ? (
                <>
                  <div>
                    <dt>Celular</dt>
                    <dd>{c.dados.celular ?? <span className="suave">não informado</span>}</dd>
                  </div>
                  <div>
                    <dt>{c.dados.documento?.tipo === "cnpj" ? "CNPJ" : "CPF"}</dt>
                    <dd>
                      {c.dados.documento ? (
                        <Cpf
                          mascarado={c.dados.documento.mascarado}
                          inteiro={c.dados.documento.inteiro}
                        />
                      ) : (
                        <span className="suave">não informado</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Endereço</dt>
                    <dd>
                      {c.dados.endereco ?? <span className="suave">nenhum pedido com entrega</span>}
                    </dd>
                  </div>
                </>
              ) : null}
            </dl>
            {c.dados && !dono && c.dados.documento ? (
              <p className="pequeno suave" style={{ margin: "12px 0 0" }}>
                O documento inteiro só o dono vê.
              </p>
            ) : null}
            {dono ? (
              <div className="form-acoes">
                <span className="pequeno suave">
                  Pedido de exclusão (LGPD): depois da revisão jurídica.
                </span>
                <button type="button" className="btn btn--fantasma" disabled>
                  Excluir dados
                </button>
              </div>
            ) : null}
          </section>

          <section className="bloco" data-ofertas>
            <h2 className="rotulo">Ofertas</h2>
            {c.ofertas.length ? (
              <dl className="pares">
                {c.ofertas.map((o) => (
                  <div key={`${o.canal}-${o.onde}`}>
                    <dt>{o.canal}</dt>
                    <dd>
                      Aceitou {o.onde}, desde {o.desde}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="pequeno suave" style={{ margin: 0 }}>
                Não aceita receber ofertas — nem por e-mail, nem por WhatsApp. Os e-mails de pedido
                chegam do mesmo jeito.
              </p>
            )}
          </section>
        </div>

        <section className="bloco" data-pedidos-do-cliente>
          <h2 className="rotulo">Pedidos</h2>
          {c.pedidos ? (
            c.pedidos.length ? (
              <>
                <p className="pequeno suave" style={{ margin: "0 0 10px" }}>
                  {vezes(c.resumo.pedidos, "pedido", "pedidos")}
                  {c.resumo.gastou ? `, ${reais(c.resumo.gastou)} pagos` : ", nenhum pago"}.
                </p>
                <div className="mini">
                  {c.pedidos.map((p) => (
                    <Link key={p.id} href={`/pedidos/${p.id}` as Route}>
                      <span>
                        <p className="mini__titulo">#{p.numero}</p>
                        <p className="mini__txt">
                          {p.quando} · {p.itens}
                        </p>
                      </span>
                      <span style={{ display: "grid", justifyItems: "end", gap: 4 }}>
                        <span className="num" style={{ fontWeight: 800 }}>
                          {reais(p.total)}
                        </span>
                        <Status p={p} />
                      </span>
                    </Link>
                  ))}
                </div>
              </>
            ) : (
              <p className="pequeno suave" style={{ margin: 0 }}>
                Nenhum pedido ainda: tem conta, mas não comprou.
              </p>
            )
          ) : (
            <p className="pequeno suave" style={{ margin: 0 }}>
              {vezes(c.resumo.pedidos, "pedido", "pedidos")},{" "}
              {c.resumo.gastou ? `${reais(c.resumo.gastou)} pagos` : "nenhum pago"}. O detalhe fica
              com a operação.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
