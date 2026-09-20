import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { Suspense } from "react"
import { Raio } from "@/components/icones"
import { RecarregaSacola } from "@/components/sacola/recarrega"
import { emReais } from "@/lib/formato"
import { ehDeQuemComprou, lerPedido } from "@/lib/pedido"
import { contato } from "@/lib/site"

/**
 * /checkout/obrigado/<id> — a única tela que a pessoa vai reler.
 *
 * O QUE ELA PRECISA SABER, NESTA ORDEM: deu certo; qual é o número do pedido;
 * o que foi comprado e quanto custou; pra onde vai; e o que acontece agora.
 * "Obrigado pela preferência" não responde nenhuma dessas.
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
    <main className="obrigado" id="conteudo">
      <div className="obrigado__wrap">
        <Suspense fallback={<p className="obrigado__carregando">Buscando seu pedido…</p>}>
          <Conteudo params={params} />
        </Suspense>
      </div>
    </main>
  )
}

async function Conteudo({ params }: { params: Props["params"] }) {
  const { id } = await params
  const pedido = await lerPedido(id)

  if (!pedido) {
    return (
      <div className="obrigado__nada">
        <h1>Não achei esse pedido</h1>
        <p>
          Confere o link, ou procura o e-mail de confirmação. Se você acabou de comprar e caiu aqui,
          chama a gente no WhatsApp com o horário da compra que a gente encontra.
        </p>
        <Link className="btn" href="/">
          Voltar pra loja
        </Link>
      </div>
    )
  }

  const meu = await ehDeQuemComprou(pedido.id)

  return (
    <>
      {/* A compra acabou: o contador do cabeçalho precisa saber. */}
      <RecarregaSacola />

      <header className="obrigado__cabeca">
        <span className="obrigado__selo" aria-hidden="true">
          <Raio />
        </span>
        <h1>Pedido feito</h1>
        <p className="obrigado__numero">
          Número <b>#{pedido.numero}</b>
        </p>
      </header>

      {!meu ? (
        // Pedido existe, mas quem está olhando não é quem comprou.
        <p className="obrigado__privado">
          Esse pedido existe. Os detalhes só aparecem pra quem fez a compra, no mesmo navegador — é
          o que impede que um link encaminhado mostre o endereço de alguém.
        </p>
      ) : (
        <>
          <p className="obrigado__email">
            Mandamos a confirmação pra <b>{pedido.email}</b>. Se não chegar em alguns minutos, dá
            uma olhada no spam.
          </p>

          <section className="obrigado__bloco" aria-labelledby="ob-itens">
            <h2 id="ob-itens">O que você comprou</h2>
            <ul className="obrigado__itens">
              {pedido.itens.map((item) => (
                <li key={item.id}>
                  <span className="obrigado__foto">
                    {item.imagem ? (
                      <Image src={item.imagem} alt="" width={56} height={56} sizes="56px" />
                    ) : null}
                  </span>
                  <span className="obrigado__nome">
                    {item.nome}
                    <small>
                      {item.quantidade} × {emReais(item.precoUnitario)}
                    </small>
                  </span>
                  <span className="obrigado__valor">{emReais(item.total)}</span>
                </li>
              ))}
            </ul>

            <dl className="obrigado__contas">
              <div>
                <dt>Produtos</dt>
                <dd>{emReais(pedido.subtotal)}</dd>
              </div>
              {pedido.desconto > 0 ? (
                <div>
                  <dt>Desconto</dt>
                  <dd>−{emReais(pedido.desconto)}</dd>
                </div>
              ) : null}
              <div>
                <dt>Entrega{pedido.formaDeEntrega ? ` · ${pedido.formaDeEntrega}` : ""}</dt>
                <dd>{pedido.frete === 0 ? "Grátis" : emReais(pedido.frete)}</dd>
              </div>
              <div className="obrigado__total">
                <dt>Total</dt>
                <dd>{emReais(pedido.total)}</dd>
              </div>
            </dl>
          </section>

          {pedido.entrega ? (
            <section className="obrigado__bloco" aria-labelledby="ob-entrega">
              <h2 id="ob-entrega">Pra onde vai</h2>
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
      )}

      <section className="obrigado__bloco obrigado__agora" aria-labelledby="ob-agora">
        <h2 id="ob-agora">E agora?</h2>
        {/* Sem promessa de prazo que a loja ainda não consegue cumprir: quem
            posta é gente, e o rastreio só existe depois da postagem. Dizer
            "seu código chega em 24h" aqui seria a primeira promessa quebrada
            da relação. */}
        <ol className="obrigado__passos">
          <li>A gente confere o pedido e chama você pra acertar o pagamento.</li>
          <li>Com o pagamento acertado, a encomenda é separada e postada.</li>
          <li>O código de rastreio chega por e-mail assim que ela for postada.</li>
        </ol>
        <p className="obrigado__ajuda">
          Qualquer coisa, chama no WhatsApp{" "}
          <a href={`https://wa.me/${contato.whatsapp.numero}`} rel="noopener">
            {contato.whatsapp.exibicao}
          </a>{" "}
          com o número <b>#{pedido.numero}</b>.
        </p>
      </section>

      <p className="obrigado__volta">
        <Link href="/">Voltar pra loja</Link>
      </p>
    </>
  )
}
