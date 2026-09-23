import type { Route } from "next"
import { NOMES_DAS_BANDEIRAS } from "@/lib/cartao"
import { frasesDoFrete, pisoVale, type Configuracoes } from "@/lib/configuracoes"
import { emReais } from "@/lib/formato"
import { PARCELA_MINIMA, PARCELAS_SEM_JUROS } from "@/lib/site"

/**
 * AS DÚVIDAS DA LOJA — o que se pergunta antes de comprar (e logo depois).
 *
 * Só dúvida sobre a LOJA: pagamento, entrega, troca, conta. As de PRODUTO
 * ("em quanto tempo o Fator faz efeito?") moram em cada produto, editáveis
 * no admin (`conteudo/produto.ts`), porque a resposta muda de um produto pro
 * outro. Aqui só entra o que vale pra qualquer compra.
 *
 * ┌─ POR QUE ISTO É CÓDIGO, E NÃO TEXTO NO ADMIN ──────────────────────────┐
 * │ A resposta sobre frete é a POLÍTICA de frete, escrita por extenso. Se  │
 * │ ela fosse um texto solto no admin, o piso do frete grátis passaria a   │
 * │ existir em dois lugares — na política e na frase — e o dia em que um   │
 * │ mudasse sem o outro, a loja anunciaria um valor e cobraria outro. É    │
 * │ exatamente a divergência que `lib/configuracoes.ts` existe pra impedir │
 * │ (anúncio vincula, CDC art. 30). Então as respostas são uma FUNÇÃO das  │
 * │ configurações: muda a política no admin, muda a resposta junto.        │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ AS TRÊS REGRAS DAS RESPOSTAS ─────────────────────────────────────────┐
 * │ 1. SÓ O QUE A LOJA CUMPRE HOJE. Cada frase aqui foi conferida contra o │
 * │    código que faz aquilo acontecer — o e-mail de Pix vencido existe,   │
 * │    o rastreio aparece na conta, o cartão não passa pelo servidor. O    │
 * │    que ainda não existe não é prometido (ver a lista no fim).          │
 * │ 2. DADO QUE FALTA SOME A FRASE, NÃO VIRA TARJA. Sem política de        │
 * │    frete, a pergunta do frete grátis nem aparece; sem prazo de         │
 * │    postagem, a resposta do prazo fica só com a parte que vale sempre.  │
 * │    Tarja de "pendente" num FAQ iria parar no JSON-LD, que é o texto    │
 * │    que o Google mostra. Quem cobra o dado que falta é o /contato.      │
 * │ 3. NENHUMA RESPOSTA CITA UM CANAL. "Chama no WhatsApp" numa resposta   │
 * │    seria uma segunda lista de contatos pra manter — e a que o cliente  │
 * │    lê quando o número muda. Toda resposta que manda falar com a gente  │
 * │    aponta pro /contato, que é o único lugar que sabe os canais.        │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O LINK É UM PEDAÇO TIPADO, NÃO MARCAÇÃO NO TEXTO ─────────────────────┐
 * │ Parágrafo com link é uma lista de pedaços: texto, e `link(…)` com o    │
 * │ destino. O destino é `Route`, então o compilador confere cada um       │
 * │ contra as páginas que existem (`typedRoutes`) — um `[texto](/x)`       │
 * │ dentro da string só seria conferido quando alguém clicasse. O realce   │
 * │ continua `*assim*`, como no resto da loja. Nada de HTML: o JSON-LD sai │
 * │ destas mesmas strings, e HTML no meio iria parar no texto do Google.   │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * O QUE FICOU DE FORA DE PROPÓSITO, e entra quando passar a ser verdade:
 *   • nota fiscal — a emissão automática pela Bling é da fase 5; até lá,
 *     prometer "a nota chega no seu e-mail" seria prometer o que não sai;
 *   • os pedidos da loja antiga — o histórico da Nuvemshop ainda não foi
 *     importado pra conta, e só vai estar lá depois da virada;
 *   • prazo de resposta do atendimento — a loja não configura um, e "a
 *     gente responde em até 24h" é o tipo de frase que vincula.
 */

/** Um pedaço de parágrafo: texto (aceita `*realce*`) ou link pra uma página da loja. */
export type Trecho = string | { texto: string; para: Route }

/** Um parágrafo: texto corrido, ou pedaços quando tem link no meio. */
export type Paragrafo = string | readonly Trecho[]

export type Duvida = { pergunta: string; resposta: Paragrafo[] }

export type GrupoDeDuvidas = {
  /** Âncora do assunto (`/duvidas#entrega`). É endereço: não renomeie. */
  id: string
  titulo: string
  duvidas: Duvida[]
}

const link = (texto: string, para: Route): Trecho => ({ texto, para })

/** O mesmo parágrafo sem marcação nenhuma — é o que vai pro JSON-LD. */
export function textoPuro(p: Paragrafo): string {
  const pedacos = typeof p === "string" ? [p] : p
  return pedacos
    .map((t) => (typeof t === "string" ? t : t.texto))
    .join("")
    .replaceAll("*", "")
}

export function duvidasDaLoja({ frete, atendimento }: Configuracoes): GrupoDeDuvidas[] {
  const frases = frasesDoFrete(frete)
  // As mesmas que o campo do cartão reconhece (`lib/cartao.ts`): a lista que a
  // resposta dá e a que o checkout aceita não têm como divergir.
  const bandeiras = new Intl.ListFormat("pt-BR").format(Object.values(NOMES_DAS_BANDEIRAS))
  const falaComAGente = link("Fala com a gente", "/contato")

  /*
    A pergunta muda com o modo: "frete fixo de R$ 9,90" não é frete grátis,
    e responder "Tem frete grátis?" com um preço é o tipo de resposta que a
    pessoa lê como "sim" e descobre o contrário no checkout.
  */
  const duvidaDoFrete: Duvida[] = frases
    ? [
        {
          pergunta: frete.modo === "gratis" ? "Tem frete grátis?" : "Tem promoção de frete?",
          resposta: [
            `${frases.completa}.${frases.nota ? ` ${frases.nota}` : ""}`,
            ...(pisoVale(frete)
              ? [
                  "*A partir* quer dizer que um pedido de exatamente esse valor já conta. A sacola mostra quanto falta pra chegar lá.",
                ]
              : []),
          ],
        },
      ]
    : []

  return [
    {
      id: "pagamento",
      titulo: "Pagamento",
      duvidas: [
        {
          pergunta: "Quais são as formas de pagamento?",
          resposta: [
            `Pix ou cartão de crédito (${bandeiras}) — boleto não. No cartão, dá pra parcelar em até *${PARCELAS_SEM_JUROS}x sem juros*, com parcela mínima de ${emReais(PARCELA_MINIMA)}.`,
          ],
        },
        {
          pergunta: "Como funciona o pagamento no Pix?",
          resposta: [
            "Ao fechar o pedido, aparecem o QR code e o código copia e cola — é só pagar no app do seu banco. O Pix tem validade, e o tempo que falta aparece embaixo do QR code.",
            "Assim que o banco confirma, a tela do pedido muda sozinha e o e-mail de confirmação sai.",
          ],
        },
        {
          pergunta: "O Pix venceu antes de eu pagar. E agora?",
          resposta: [
            "O pedido é cancelado sozinho, os produtos voltam pro estoque e você recebe um e-mail avisando. Nada foi cobrado.",
            "Ainda quer os produtos? É só fazer o pedido de novo — um Pix novo nasce na hora.",
          ],
        },
        {
          pergunta: "Paguei o Pix e o pedido não confirmou.",
          resposta: [
            [
              "O Pix costuma confirmar em segundos, mas às vezes leva alguns minutos. Se passar de 15 minutos e nada, ",
              link("fala com a gente", "/contato"),
              " com o número do pedido — ele aparece na tela logo depois de fechar a compra. Sem o número também dá: a gente acha pelo e-mail que você usou.",
            ],
          ],
        },
        {
          pergunta: "Meu cartão foi recusado. O que aconteceu?",
          resposta: [
            "Quem recusa é o banco do cartão ou a análise de segurança do pagamento, e nem a gente fica sabendo o motivo exato. Recusado, o pedido não segue: dá pra tentar de novo com outro cartão ou pagar no Pix.",
            "Às vezes o valor chega a aparecer no app do banco e some logo depois — é a análise desfazendo a cobrança. O estorno é automático e pode aparecer nesta fatura ou na próxima.",
          ],
        },
        {
          pergunta: "É seguro pagar com cartão aqui?",
          resposta: [
            "O número do cartão não passa pelo nosso servidor e não fica guardado com a gente: ele vai direto do seu navegador pro Pagar.me, que processa o pagamento. Do nosso lado, só aparecem a bandeira e os quatro últimos dígitos.",
          ],
        },
        {
          pergunta: "Onde eu uso o cupom de desconto?",
          resposta: [
            "No checkout, no resumo do pedido: clica em *Tem cupom de desconto?*, digita o código e aplica. O desconto entra no total na hora.",
          ],
        },
      ],
    },
    {
      id: "entrega",
      titulo: "Entrega",
      duvidas: [
        {
          pergunta: "Vocês entregam na minha cidade?",
          resposta: [
            "A gente envia pra todo o Brasil. Pra ver o valor e o prazo pro seu endereço, é só digitar o CEP na página do produto, na sacola ou no checkout.",
          ],
        },
        ...duvidaDoFrete,
        {
          pergunta: "Qual é o prazo de entrega?",
          resposta: [
            "Depende do CEP e da opção de entrega que você escolher. O prazo de cada opção aparece no checkout, antes de você pagar, e conta a partir da postagem.",
            ...(atendimento.prazoDePostagem
              ? [
                  `Entre o pagamento confirmado e a postagem: ${atendimento.prazoDePostagem}. No Pix, esse tempo começa quando o banco confirma.`,
                ]
              : []),
          ],
        },
        {
          pergunta: "Como eu acompanho o meu pedido?",
          resposta: [
            [
              "Quando a encomenda é postada, o código de rastreio vai pro seu e-mail. Ele também fica na ",
              link("Minha conta", "/conta/pedidos"),
              ", em Pedidos — é só entrar com o mesmo e-mail da compra.",
            ],
          ],
        },
      ],
    },
    {
      id: "trocas",
      titulo: "Trocas e devoluções",
      duvidas: [
        {
          pergunta: "Posso desistir da compra?",
          resposta: [
            [
              "Pode, dentro do prazo do art. 49 do Código de Defesa do Consumidor. As condições e o passo a passo estão na ",
              link("política de entrega, troca e devolução", "/trocas"),
              ".",
            ],
          ],
        },
        {
          pergunta: "O produto veio com defeito ou errado.",
          resposta: [
            [
              falaComAGente,
              " em até *30 dias* do recebimento, com o número do pedido e uma foto. A gente troca por outro igual ou devolve o dinheiro, como você preferir — e o frete das duas pontas é por nossa conta.",
            ],
          ],
        },
        {
          pergunta: "Dá pra cancelar um pedido que eu acabei de fazer?",
          resposta: [
            [
              "Dá. ",
              falaComAGente,
              " o quanto antes, com o número do pedido. Se ele ainda não foi postado, a gente cancela e devolve o valor: o Pix volta pra conta que pagou, e no cartão o estorno aparece nesta fatura ou na próxima.",
            ],
            [
              "Pix que você ainda não pagou nem precisa disso: ele vence e o pedido se cancela sozinho. E se a encomenda já foi postada, veja a ",
              link("política de troca e devolução", "/trocas"),
              ".",
            ],
          ],
        },
      ],
    },
    {
      id: "conta",
      titulo: "Minha conta",
      duvidas: [
        {
          pergunta: "Preciso criar uma conta pra comprar?",
          resposta: [
            [
              "Não: dá pra comprar só com o e-mail. Se depois quiser ver tudo num lugar só, entre na ",
              link("Minha conta", "/conta"),
              " com o mesmo e-mail da compra — a conta junta os pedidos feitos com ele.",
            ],
          ],
        },
        {
          pergunta: "Qual é a minha senha?",
          resposta: [
            "Não tem senha. Você digita o e-mail, a gente manda um código de acesso, e é só digitar o código na tela.",
            "Não chegou? Confere o spam e as outras abas da caixa de entrada. O código vale por pouco tempo — se passar, dá pra pedir outro na mesma tela.",
          ],
        },
      ],
    },
  ]
}
