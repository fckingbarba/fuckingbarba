import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { BotaoDoPedido } from "@/components/acoes-do-pedido"
import { SoPara } from "@/components/area"
import { CopiarPix, WhatsappDoPedido } from "@/components/contato-do-pedido"
import { Cpf } from "@/components/cpf"
import { Icone } from "@/components/icones"
import { Status } from "@/components/pedidos"
import { Cabeca, ForaDoAr, SemAcesso } from "@/components/telas"
import { Ajuda, Faixa, Forma, Pilula, Sigla } from "@/components/visual"
import { ler } from "@/lib/medusa"
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
 * No celular vira uma coluna só, na ordem do que mais se procura: o que
 * fazer, o caminho, os itens, o pagamento, a entrega, o cliente e o
 * histórico.
 *
 * OS BOTÕES — "Emitir a nota agora" (no "O que fazer"), "Tentar a nota de
 * novo" e "Tentar o estorno de novo" (dentro da faixa do problema) — vêm do
 * backend só quando o papel pode apertar e o pedido está no estado deles.
 *
 * MAIS VISUAL (0155) — a faixa mostra o título e as etiquetas curtas; a
 * explicação inteira vai no "?". O pagamento tem o ícone, e o cliente a sigla.
 *
 * O PIX ESPERANDO (0247) — o "O que fazer" traz o código do Pix pra copiar e
 * o WhatsApp do cliente com a mensagem pronta; o WhatsApp também fica no
 * bloco do cliente, em todo pedido com celular (pra quem abre os contatos).
 */
export default async function Pagina({ params }: Props) {
  const { id } = await params
  // A leitura sai junto com a pergunta de quem é (a resposta fica no `cache`).
  if (ehIdDePedido(id)) void ler(`/dashboard/pedidos/${id}`)
  return (
    <SoPara area="pedidos">
      <Pedido params={params} />
    </SoPara>
  )
}

async function Pedido({ params }: Props) {
  const { id } = await params
  if (!ehIdDePedido(id)) return <NaoAchei />

  const r = await ler(`/dashboard/pedidos/${id}`)
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
        <Faixa
          key={f.titulo}
          nivel={f.nivel}
          titulo={f.titulo}
          etiquetas={f.etiquetas}
          extra={
            f.rodape ? (
              <Pilula icone="cadeado" suave>
                {f.rodape}
              </Pilula>
            ) : null
          }
          ajuda={f.texto}
          acoes={
            f.botao ? (
              <BotaoDoPedido
                id={p.id}
                acao={f.botao}
                rotulo={f.botao === "nota" ? "Tentar a nota de novo" : undefined}
                estilo={f.botao === "estorno" ? "btn--perigo" : "btn--contorno"}
              />
            ) : null
          }
        />
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
          {p.acoes.nota === "agora" ? (
            <section className="bloco" data-acoes>
              <h2 className="rotulo">O que fazer</h2>
              <div className="acoes-lado">
                <BotaoDoPedido id={p.id} acao="nota" estilo="btn--bloco" />
                {p.acoes.saiAs ? (
                  // A hora à vista; o porquê (e o "nunca à mão no Bling") no "?".
                  <div className="acoes-lado__hora">
                    <Pilula icone="relogio">sai sozinha às {p.acoes.saiAs}</Pilula>
                    {p.acoes.dica ? <Ajuda>{p.acoes.dica}</Ajuda> : null}
                  </div>
                ) : p.acoes.dica ? (
                  <p className="pequeno suave acoes-lado__dica">{p.acoes.dica}</p>
                ) : null}
              </div>
            </section>
          ) : null}

          {p.pagamento.pix ? (
            <section className="bloco" data-acoes data-pix-esperando>
              <h2 className="rotulo">O que fazer</h2>
              <div className="acoes-lado">
                <CopiarPix id={p.id} codigo={p.pagamento.pix.codigo} />
                {p.cliente.whatsapp ? (
                  <WhatsappDoPedido id={p.id} link={p.cliente.whatsapp} estilo="btn--bloco" />
                ) : null}
                <p className="pequeno suave acoes-lado__dica" data-dica-pix>
                  Mande o código numa mensagem só dele: o cliente segura em cima, copia e cola no
                  Pix do banco.
                </p>
              </div>
            </section>
          ) : null}

          <section className="bloco">
            <h2 className="rotulo">Pagamento</h2>
            <div className="info com-icone">
              {p.pagamento.tipo ? <Forma forma={p.pagamento.tipo} /> : null}
              <span>
                <b>{p.pagamento.forma}</b>
                <small>{p.pagamento.detalhe}</small>
              </span>
            </div>
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
            <div className="pessoa pessoa--grande">
              <Sigla nome={p.cliente.nome} />
              <span>
                <b>{p.cliente.nome}</b>
                {p.cliente.conta ? (
                  <Pilula icone="check" data-conta="sim">
                    Tem conta na loja
                  </Pilula>
                ) : (
                  <Pilula icone="clientes" suave data-conta="nao">
                    Comprou sem conta
                  </Pilula>
                )}
              </span>
            </div>
            <dl className="pares">
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
            </dl>
            {p.cliente.whatsapp ? (
              <p style={{ margin: "12px 0 0" }}>
                <WhatsappDoPedido id={p.id} link={p.cliente.whatsapp} />
              </p>
            ) : null}
            {escondido ? (
              <p style={{ margin: "12px 0 0" }}>
                <Pilula icone="cadeado" suave>
                  O documento inteiro só o dono vê.
                </Pilula>
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
