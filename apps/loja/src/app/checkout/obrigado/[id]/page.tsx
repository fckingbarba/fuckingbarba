import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { Suspense } from "react"
import { ConversaoDoGoogleAds } from "@/components/analytics/conversao-google-ads"
import { EsperaDoPagamento } from "@/components/checkout/espera"
import { Pix } from "@/components/checkout/pix"
import { MarcaDaTela } from "@/components/marca-da-tela"
import { Cadeado, EscudoCerto, Raio, Relogio, Triangulo } from "@/components/icones"
import { LogoCurta } from "@/components/marca"
import { RecarregaSacola } from "@/components/sacola/recarrega"
import type { PagamentoVisivel } from "@/lib/checkout-visivel"
import { emReais } from "@/lib/formato"
import { lerPedido } from "@/lib/pedido"
import { linkDoWhatsapp, whatsappNaTela } from "@/lib/configuracoes"
import { configuracoes } from "@/lib/medusa"
import { site } from "@/lib/site"
// Só no checkout e na conta, e não no globals.css: ver "O QUE NÃO MORA AQUI" lá.
import "@/estilos/telas/checkout-e-conta.css"

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
 * ENDEREÇO SÓ PRA QUEM COMPROU: o crachá do pedido (o cookie, com o carrinho
 * de onde ele nasceu) é que abre a versão completa — e quem confere o crachá
 * é o Medusa, que sem ele nem entrega o endereço (`lerPedido`). Sem crachá, a
 * página confirma que o pedido existe e não mostra dado pessoal nenhum — o id
 * é imprevisível, mas link vaza.
 *
 * ┌─ O PAGAMENTO MUDA A TELA INTEIRA ──────────────────────────────────────┐
 * │ Com o Pagar.me, "pedido recebido" pode querer dizer quatro coisas: o   │
 * │ Pix esperando (e aí o QR é a tela), o cartão em análise, pago, ou      │
 * │ cancelado porque o Pix venceu. O título, a frase e o "e agora?" saem   │
 * │ de `pagamento.estado` — que o Medusa responde, não esta tela. Enquanto │
 * │ o Pix não cai, `EsperaDoPagamento` pergunta de tempos em tempos e      │
 * │ redesenha quando muda.                                                 │
 * └────────────────────────────────────────────────────────────────────────┘
 */

type Cabeca = { Icone: typeof EscudoCerto; titulo: string; frase: string }

function cabecaDo(p: PagamentoVisivel): Cabeca {
  switch (p.estado) {
    case "aguardando":
      return {
        Icone: Relogio,
        titulo: "Falta só o Pix",
        frase:
          "Pague com o QR code ou o código abaixo. Assim que cair, o pedido entra na fila de envio.",
      }
    case "analise":
      return {
        Icone: Relogio,
        titulo: "Pagamento em análise",
        frase:
          "O cartão foi autorizado, e o valor fica só reservado até a conferência de segurança aprovar — costuma levar poucos minutos, e esta página muda sozinha.",
      }
    case "pago":
      return {
        Icone: EscudoCerto,
        titulo: "Pedido confirmado",
        frase: p.cartao
          ? `Pagamento aprovado no cartão ${p.cartao.bandeira} final ${p.cartao.final}` +
            (p.cartao.parcelas > 1 ? `, em ${p.cartao.parcelas}x sem juros` : "") +
            ". Já estamos separando o seu pedido."
          : "Pix recebido. Já estamos separando o seu pedido.",
      }
    case "cancelado":
      return {
        Icone: Triangulo,
        titulo: "Pedido cancelado",
        frase:
          "O pagamento não foi confirmado a tempo, e o pedido foi cancelado — os produtos voltaram pro estoque.",
      }
    default:
      return { Icone: EscudoCerto, titulo: "Pedido recebido", frase: "" }
  }
}

/**
 * O que acontece agora, na ordem em que acontece. Sem prazo que a loja ainda
 * não consegue cumprir: quem posta é gente, e o rastreio só existe depois da
 * postagem. "Seu código chega em 24h" aqui seria a primeira promessa
 * quebrada da relação.
 */
const PASSOS: Record<PagamentoVisivel["estado"], string[]> = {
  combinar: [
    "A gente confere o pedido e chama você pra acertar o pagamento.",
    "Com o pagamento acertado, a encomenda é separada e postada.",
    "O código de rastreio chega por e-mail assim que ela for postada.",
  ],
  aguardando: [
    "Pague o Pix pelo QR code ou pelo copia-e-cola, no app do seu banco.",
    "Assim que o banco confirmar, esta página muda sozinha e a encomenda entra na fila de separação.",
    "O código de rastreio chega por e-mail assim que ela for postada.",
  ],
  analise: [
    "O pagamento passa por uma conferência de segurança, que costuma levar poucos minutos. Até lá, nada é cobrado.",
    "Aprovado, o valor é cobrado e a encomenda entra na fila de separação. Se não for, a reserva é desfeita e nada é cobrado.",
    "O código de rastreio chega por e-mail assim que ela for postada.",
  ],
  pago: [
    "A encomenda entra na fila de separação.",
    "Ela é postada, e o prazo de entrega começa a contar daí.",
    "O código de rastreio chega por e-mail assim que ela for postada.",
  ],
  cancelado: ["Se ainda quiser os produtos, é só montar a sacola de novo — nada ficou pendente."],
}

/**
 * O que a linha do número promete sobre o e-mail, em cada estado.
 *
 * A confirmação sai quando o pagamento é capturado (o backend manda:
 * `apps/backend/src/lib/confirmar-pedido.ts`). Então só o pago diz que já
 * mandou; o Pix esperando e o cartão em análise dizem QUANDO vai; cancelado
 * e "a combinar" não prometem e-mail nenhum — eles não recebem.
 */
const SOBRE_O_EMAIL: Partial<Record<PagamentoVisivel["estado"], string>> = {
  pago: "enviamos os detalhes pra",
  aguardando: "quando o Pix cair, a confirmação vai pra",
  analise: "com o pagamento aprovado, a confirmação vai pra",
}

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
      {/* Some o cabeçalho da loja e o grosso do rodapé; o pé dele fica —
          `checkout-loja.css`. */}
      <MarcaDaTela tela="obrigado" />

      <header className="topo">
        <div className="topo__wrap">
          {/* A marca, sozinha — a mesma do topo do checkout e da loja. */}
          <Link className="topo__logo" href="/" aria-label={`${site.nome} — voltar pra loja`}>
            <LogoCurta aria-hidden="true" />
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

      {/* Na gravação da Clarity, os dados do pedido ficam cobertos. */}
      <main className="obrigado" id="conteudo" data-clarity-mask="true">
        <Suspense fallback={<p className="bloco">Buscando seu pedido…</p>}>
          <Conteudo params={params} />
        </Suspense>
      </main>
    </>
  )
}

async function Conteudo({ params }: { params: Props["params"] }) {
  const { id } = await params
  const leitura = await lerPedido(id)

  if (!leitura) {
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

  const { pedido, meu } = leitura
  const { atendimento, integracoes } = await configuracoes()
  // "AW-123/rótulo": a conversão de compra do Google Ads, quando o pagamento entrou.
  const conversao =
    integracoes.googleAds && integracoes.googleAdsCompra
      ? `${integracoes.googleAds}/${integracoes.googleAdsCompra}`
      : null
  const zap = linkDoWhatsapp(atendimento.whatsapp)
  const { pagamento } = pedido
  const { Icone, titulo, frase } = cabecaDo(pagamento)
  const esperando = pagamento.estado === "aguardando" || pagamento.estado === "analise"
  const sobreOEmail = SOBRE_O_EMAIL[pagamento.estado]

  return (
    <>
      {/* A compra acabou: o contador do cabeçalho precisa saber. */}
      <RecarregaSacola />
      {meu && conversao && pagamento.estado === "pago" ? (
        <ConversaoDoGoogleAds envio={conversao} pedido={{ id: pedido.id, total: pedido.total }} />
      ) : null}

      <div className="feito" data-ativo="" data-pagamento={pagamento.estado}>
        <div className="bloco">
          <Icone className="feito__ico" aria-hidden="true" />
          <h1>{titulo}</h1>
          <p>
            Número <b>#{pedido.numero}</b>
            {meu && sobreOEmail ? (
              <>
                {` · ${sobreOEmail} `}
                <b>{pedido.email}</b>
              </>
            ) : null}
          </p>
          {meu && frase ? <p className="feito__frase">{frase}</p> : null}
          {/* O QR só pra quem comprou, como o resto dos detalhes: pagar o Pix
              de outra pessoa não prejudica ninguém, mas o link encaminhado
              não precisa mostrar o valor nem o nome da loja no código. */}
          {meu && pagamento.estado === "aguardando" && pagamento.pix ? (
            <Pix
              copiaECola={pagamento.pix.copiaECola}
              imagem={pagamento.pix.imagem}
              expiraEm={pagamento.pix.expiraEm}
              total={pedido.total}
            />
          ) : null}
          {!meu ? (
            <p>
              Os detalhes só aparecem pra quem fez a compra, no mesmo navegador — é o que impede que
              um link encaminhado mostre o endereço de alguém.
            </p>
          ) : null}
        </div>
      </div>

      {meu && esperando ? (
        <EsperaDoPagamento pedidoId={pedido.id} ate={pagamento.pix?.expiraEm ?? null} />
      ) : null}

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
        <ol className="obrigado__passos">
          {PASSOS[pagamento.estado].map((passo) => (
            <li key={passo}>{passo}</li>
          ))}
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
