import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { EsperaDoPagamento } from "@/components/checkout/espera"
import { Pix } from "@/components/checkout/pix"
import { ComprarDeNovo } from "@/components/conta/pecas"
import {
  feito,
  FotoDoItem,
  ForaDoAr,
  fraseDoCancelado,
  RastreioDoPacote,
  seSessaoAcabou,
  Situacao,
  textoDoPagamento,
  Trilha,
} from "@/components/conta/pedidos"
import { Triangulo } from "@/components/icones"
import { linkDoWhatsapp } from "@/lib/configuracoes"
import { rotuloDaEntrega } from "@/lib/conta-visivel"
import { emReais } from "@/lib/formato"
import { configuracoes } from "@/lib/medusa"
import { lerPedidoDaConta } from "@/lib/pedidos-da-conta"

/**
 * /conta/pedidos/<id> — um pedido.
 *
 * Cada bloco aparece só quando faz sentido: o Pix só enquanto está
 * pendente, o rastreio só depois de postado (um por pacote, com o caminho
 * que a transportadora contou), a linha do tempo só enquanto o pedido não
 * foi cancelado. A nota fiscal entra com a Bling (fase 5).
 *
 * O PIX PENDENTE É O MESMO DO OBRIGADO — o componente `<Pix>`, com os
 * mesmos textos, e a mesma espera que redesenha a página quando o
 * pagamento cai. Quem pagou pelo obrigado e quem paga pela conta vê a
 * mesma caixa. Ela vai dentro de um `.feito` porque o CSS dela foi escrito
 * pra lá (`checkout-loja.css`).
 *
 * O id vem do endereço, mas quem decide se o pedido aparece é a conta:
 * pedido de outra pessoa não vem do Medusa, e a tela diz que não achou.
 */
export const metadata: Metadata = {
  title: "Pedido",
}

export default function Pagina({ params }: PageProps<"/conta/pedidos/[id]">) {
  return (
    <section aria-labelledby="t-pedido">
      <Link className="voltar" href="/conta/pedidos">
        ← Pedidos
      </Link>
      <Suspense fallback={<p className="bloco">Buscando o pedido…</p>}>
        <Detalhe params={params} />
      </Suspense>
    </section>
  )
}

async function Detalhe({ params }: { params: PageProps<"/conta/pedidos/[id]">["params"] }) {
  const { id } = await params
  const leitura = await lerPedidoDaConta(id)
  seSessaoAcabou(leitura.estado)
  if (leitura.estado === "nao-achei") return <NaoAchei />
  if (leitura.estado !== "ok") return <ForaDoAr />

  const p = leitura.pedido
  const { atendimento } = await configuracoes()
  const zap = linkDoWhatsapp(atendimento.whatsapp)
  const pix = p.situacao === "pix" ? p.pagamento.pix : null
  /*
    A ESPERA CONTINUA COM O PIX VENCIDO. Não pra pagar — o QR não serve mais
    —, mas porque o que vem a seguir acontece sozinho, e a pessoa está
    olhando: a conciliação cancela o pedido nos próximos minutos, e a tela se
    redesenha com "Cancelado" quando isso chegar. A espera para no
    cancelamento (ver `EsperaDoPagamento`), e não no vencimento.
  */
  const esperando = p.situacao === "pix" || p.situacao === "vencido" || p.situacao === "analise"

  return (
    <>
      <div className="cabeca-tela">
        <div>
          <div className="titulo-status">
            <h1 id="t-pedido">Pedido #{p.numero}</h1>
            <Situacao situacao={p.situacao} />
          </div>
          <p className="cabeca-tela__sub">{feito(p)}</p>
        </div>
      </div>

      {esperando ? <EsperaDoPagamento pedidoId={p.id} ate={pix?.expiraEm ?? null} /> : null}

      <div className="detalhe">
        <div>
          {pix ? (
            <div className="feito" data-ativo="">
              <section className="bloco pix-pendente" aria-labelledby="t-pix">
                <h2 className="bloco__titulo" id="t-pix">
                  Falta só o Pix
                </h2>
                <p className="pix-pendente__frase">
                  Pague com o QR code ou o código abaixo. Assim que cair, o pedido entra na fila de
                  envio — e esta página muda sozinha.
                </p>
                <Pix
                  copiaECola={pix.copiaECola}
                  imagem={pix.imagem}
                  expiraEm={pix.expiraEm}
                  total={p.total}
                />
              </section>
            </div>
          ) : null}

          {p.situacao === "vencido" ? (
            <div className="bloco cancelado" data-vencido="">
              <Triangulo aria-hidden="true" />
              <p>
                <b>O Pix venceu</b>O código não aceita mais pagamento. O pedido vai ser cancelado e
                os produtos voltam pro estoque — se ainda quiser, é só comprar de novo.
              </p>
            </div>
          ) : null}

          {p.situacao === "cancelado" ? (
            <div className="bloco cancelado">
              <Triangulo aria-hidden="true" />
              <p>
                <b>Pedido cancelado</b>
                {fraseDoCancelado(p)}
              </p>
            </div>
          ) : (
            <section className="bloco" aria-label="Andamento">
              <Trilha p={p} />
              {p.rastreios.length ? (
                p.rastreios.map((r) => <RastreioDoPacote key={r.codigo} r={r} />)
              ) : p.situacao === "enviado" || p.situacao === "entregue" ? null : (
                <p className="rastreio__depois">
                  O código de rastreio aparece aqui quando a encomenda for postada.
                </p>
              )}
            </section>
          )}

          <section className="bloco" aria-labelledby="t-itens">
            <h2 className="bloco__titulo detalhe__titulo" id="t-itens">
              O que você comprou
            </h2>
            <ul className="itens">
              {p.itens.map((item) => (
                <li className="item" key={item.id}>
                  <FotoDoItem item={item} tamanho={54} qtd={item.quantidade} />
                  <span>
                    <h3 className="item__nome">{item.nome}</h3>
                    <p className="item__un">
                      {item.variante ? `${item.variante} · ` : ""}
                      {item.quantidade} × {emReais(item.precoUnitario)}
                    </p>
                  </span>
                  <span className="item__valor">{emReais(item.total)}</span>
                </li>
              ))}
            </ul>
            <dl className="totais">
              <div className="totais__linha">
                <dt>Produtos</dt>
                <dd>{emReais(p.subtotal)}</dd>
              </div>
              {p.desconto > 0 ? (
                <div className="totais__linha" data-desconto>
                  <dt>Desconto</dt>
                  <dd>−{emReais(p.desconto)}</dd>
                </div>
              ) : null}
              <div className="totais__linha">
                <dt>{rotuloDaEntrega(p.formaDeEntrega)}</dt>
                <dd data-gratis={p.frete === 0 ? "" : undefined}>
                  {p.frete === 0 ? "Grátis" : emReais(p.frete)}
                </dd>
              </div>
              <div className="totais__linha totais__total">
                <dt>Total</dt>
                <dd>{emReais(p.total)}</dd>
              </div>
            </dl>
            {p.situacao !== "pix" ? (
              <div className="acoes-pedido">
                <ComprarDeNovo pedidoId={p.id} />
              </div>
            ) : null}
          </section>
        </div>

        <div className="detalhe__lado">
          {p.entrega ? (
            <section className="bloco" aria-labelledby="t-entrega">
              <h2 className="rotulo" id="t-entrega">
                Pra onde vai
              </h2>
              <address className="info">
                {p.formaDeEntrega ? <b>{p.formaDeEntrega}</b> : null}
                {p.formaDeEntrega ? <br /> : null}
                {p.entrega.nome}
                <br />
                {p.entrega.linha1}
                {p.entrega.linha2 ? (
                  <>
                    <br />
                    {p.entrega.linha2}
                  </>
                ) : null}
                <br />
                {p.entrega.cidade}/{p.entrega.uf} · {p.entrega.cep}
              </address>
            </section>
          ) : null}
          <section className="bloco" aria-labelledby="t-pagamento">
            <h2 className="rotulo" id="t-pagamento">
              Pagamento
            </h2>
            <p className="info">{textoDoPagamento(p)}</p>
          </section>
          {zap ? (
            <p className="ajuda">
              Algum problema com o pedido?{" "}
              <a
                className="link"
                href={`${zap}?text=${encodeURIComponent(`Oi! É sobre o pedido #${p.numero}.`)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Chama no WhatsApp
              </a>{" "}
              — o número do pedido já vai junto.
            </p>
          ) : (
            <p className="ajuda">
              Guarde o número <b>#{p.numero}</b>: é por ele que a gente encontra seu pedido.
            </p>
          )}
          {p.situacao === "entregue" ? (
            <p className="ajuda">
              Quer trocar ou devolver?{" "}
              <Link className="link" href="/trocas">
                Veja como funciona
              </Link>{" "}
              — são 7 dias pra desistir, por lei.
            </p>
          ) : null}
        </div>
      </div>
    </>
  )
}

function NaoAchei() {
  return (
    <div className="bloco" role="alert">
      <h1 id="t-pedido">Não achei esse pedido</h1>
      <p>
        Ele não está nesta conta. Se foi feito com outro e-mail, entra com aquele e-mail pra ver.
      </p>
      <Link className="link" href="/conta/pedidos">
        Ver seus pedidos
      </Link>
    </div>
  )
}
