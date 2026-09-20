import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { Suspense } from "react"
import { Cadeado, EscudoCerto, Raio } from "@/components/icones"
import { RecarregaSacola } from "@/components/sacola/recarrega"
import { emReais } from "@/lib/formato"
import { ehDeQuemComprou, lerPedido } from "@/lib/pedido"
import { linkDoWhatsapp, whatsappNaTela } from "@/lib/configuracoes"
import { configuracoes } from "@/lib/medusa"
import { site } from "@/lib/site"

/**
 * /checkout/obrigado/<id> — a única tela que a pessoa vai reler.
 *
 * O QUE ELA PRECISA SABER, NESTA ORDEM: deu certo; qual é o número do pedido;
 * o que foi comprado e quanto custou; pra onde vai; e o que acontece agora.
 * "Obrigado pela preferência" não responde nenhuma dessas.
 *
 * É ROTA PRÓPRIA, e não a `div` escondida do protótipo: assim recarregar
 * funciona, o link pode ser salvo, e o botão voltar do navegador não devolve
 * a pessoa pro formulário de um pedido que já foi feito.
 *
 * TUDO É LIDO DO MEDUSA, não recebido da tela anterior. O redirecionamento
 * carrega só o id — se esta página desenhasse o que o checkout tinha na mão,
 * ela mostraria o que a loja ACHA que foi cobrado, e não o que foi.
 *
 * ENDEREÇO SÓ PRA QUEM COMPROU: o cookie do pedido é que abre a versão
 * completa. Sem ele, a página confirma que o pedido existe e não mostra dado
 * pessoal nenhum — o id é imprevisível, mas link vaza.
 */

export const metadata: Metadata = {
  title: "Pedido confirmado",
  robots: { index: false, follow: false },
}

type Props = PageProps<"/checkout/obrigado/[id]">

/**
 * A promessa dos `params` é repassada SEM `await` aqui e aguardada lá dentro,
 * dentro do `<Suspense>`. Esperar nesta função faria a página inteira esperar,
 * e a casca deixaria de sair na hora.
 */
export default function Pagina({ params }: Props) {
  return (
    <>
      <header className="topo">
        <div className="topo__wrap">
          <Link className="topo__logo" href="/" aria-label={`${site.nome} — voltar pra loja`}>
            <Raio aria-hidden="true" />
            {site.nome}
          </Link>
          <p className="topo__seguro">
            <Cadeado aria-hidden="true" />
            <span>Checkout seguro</span>
          </p>
          <Link className="topo__voltar" href="/">
            Voltar pra loja
          </Link>
        </div>
      </header>

      <main className="obrigado" id="conteudo">
        <Suspense fallback={<p className="bloco">Buscando seu pedido…</p>}>
          <Conteudo params={params} />
        </Suspense>
      </main>
    </>
  )
}

async function Conteudo({ params }: { params: Props["params"] }) {
  const { id } = await params
  const pedido = await lerPedido(id)

  if (!pedido) {
    return (
      <div className="bloco">
        <h1>Não achei esse pedido</h1>
        <p>
          Confere o link, ou procura o e-mail de confirmação. Se você acabou de comprar e caiu aqui,
          chama a gente no WhatsApp com o horário da compra que a gente encontra.
        </p>
        <Link className="btn" href="/">
          Voltar pra loja
          <Raio className="btn__bolt" />
        </Link>
      </div>
    )
  }

  const meu = await ehDeQuemComprou(pedido.id)
  const { atendimento } = await configuracoes()
  const zap = linkDoWhatsapp(atendimento.whatsapp)

  return (
    <>
      {/* A compra acabou: o contador do cabeçalho precisa saber. */}
      <RecarregaSacola />

      <div className="feito" data-ativo="">
        <div className="bloco">
          <EscudoCerto className="feito__ico" aria-hidden="true" />
          <h1>Pedido recebido</h1>
          <p>
            Número <b>#{pedido.numero}</b>
            {meu ? (
              <>
                {" · enviamos os detalhes pra "}
                <b>{pedido.email}</b>
              </>
            ) : null}
          </p>
          {!meu ? (
            <p>
              Os detalhes só aparecem pra quem fez a compra, no mesmo navegador — é o que impede que
              um link encaminhado mostre o endereço de alguém.
            </p>
          ) : null}
        </div>
      </div>

      {meu ? (
        <>
          <section className="bloco" aria-labelledby="ob-itens">
            <h2 className="bloco__titulo" id="ob-itens">
              O que você comprou
            </h2>
            <ul className="itens">
              {pedido.itens.map((item) => (
                <li className="item" key={item.id}>
                  <span className="item__foto">
                    {item.imagem ? (
                      <Image src={item.imagem} alt="" width={54} height={54} sizes="54px" />
                    ) : null}
                    <span className="item__qtd" aria-hidden="true">
                      {item.quantidade}
                    </span>
                  </span>
                  <span>
                    <h3 className="item__nome">{item.nome}</h3>
                    <p className="item__un">
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
                <dd>{emReais(pedido.subtotal)}</dd>
              </div>
              <div className="totais__linha" data-desconto hidden={pedido.desconto <= 0}>
                <dt>Desconto</dt>
                <dd>−{emReais(pedido.desconto)}</dd>
              </div>
              <div className="totais__linha">
                <dt>Entrega{pedido.formaDeEntrega ? ` · ${pedido.formaDeEntrega}` : ""}</dt>
                <dd data-gratis={pedido.frete === 0 ? "" : undefined}>
                  {pedido.frete === 0 ? "Grátis" : emReais(pedido.frete)}
                </dd>
              </div>
              <div className="totais__linha totais__total">
                <dt>Total</dt>
                <dd>{emReais(pedido.total)}</dd>
              </div>
            </dl>
          </section>

          {pedido.entrega ? (
            <section className="bloco" aria-labelledby="ob-entrega">
              <h2 className="bloco__titulo" id="ob-entrega">
                Pra onde vai
              </h2>
              <address className="obrigado__endereco">
                {pedido.entrega.nome}
                <br />
                {pedido.entrega.linha1}
                {pedido.entrega.linha2 ? (
                  <>
                    <br />
                    {pedido.entrega.linha2}
                  </>
                ) : null}
                <br />
                {pedido.entrega.cidade}/{pedido.entrega.uf} · {pedido.entrega.cep}
              </address>
            </section>
          ) : null}
        </>
      ) : null}

      <section className="bloco" aria-labelledby="ob-agora">
        <h2 className="bloco__titulo" id="ob-agora">
          E agora?
        </h2>
        {/* Sem promessa de prazo que a loja ainda não consegue cumprir: quem
            posta é gente, e o rastreio só existe depois da postagem. Dizer
            "seu código chega em 24h" aqui seria a primeira promessa quebrada
            da relação. */}
        <ol className="obrigado__passos">
          <li>A gente confere o pedido e chama você pra acertar o pagamento.</li>
          <li>Com o pagamento acertado, a encomenda é separada e postada.</li>
          <li>O código de rastreio chega por e-mail assim que ela for postada.</li>
        </ol>
        {/* Sem WhatsApp configurado, a frase muda em vez de oferecer um
            número que não atende — que é o pior lugar possível pra isso,
            logo depois de a pessoa ter pagado. */}
        <p className="obrigado__ajuda">
          {zap ? (
            <>
              Qualquer coisa, chama no WhatsApp{" "}
              <a href={zap} rel="noopener">
                {whatsappNaTela(atendimento.whatsapp)}
              </a>{" "}
              com o número <b>#{pedido.numero}</b>.
            </>
          ) : (
            <>
              Guarde o número <b>#{pedido.numero}</b>: é por ele que a gente encontra seu pedido.
            </>
          )}
        </p>
      </section>
    </>
  )
}
