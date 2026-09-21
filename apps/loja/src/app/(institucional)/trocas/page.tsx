import type { Metadata } from "next"
import Link from "next/link"
import { Abertura, Atualizado, Dado, Lista, P, Pendente, Secao, Titulo } from "@/components/institucional/texto"
import { frasesDoFrete } from "@/lib/configuracoes"
import { configuracoes } from "@/lib/medusa"
import { site } from "@/lib/site"

export const metadata: Metadata = {
  title: "Entrega, trocas e devoluções",
  description: `Como funciona a entrega, e como trocar ou devolver um produto ${site.nome}.`,
  alternates: { canonical: "/trocas" },
}

/**
 * ENTREGA, TROCAS E DEVOLUÇÕES.
 *
 * Esta página não é opcional: é onde estão publicadas as regras de entrega,
 * troca e devolução que valem pra toda compra, e é pra ela que o rodapé
 * aponta. O checkout pedia aceite dela numa linha em letras miúdas embaixo
 * do botão de pagar; a linha saiu (21/09/2026) pra enxugar a tela, e ficou o
 * "7 dias pra trocar ou devolver" da faixa do passo 3. Enquanto ela era um
 * rascunho com tarja de "em redação", o checkout pedia aceite de um
 * documento que não existia — o que, num eventual desentendimento, é o
 * mesmo que não ter regra nenhuma.
 *
 * Os prazos aqui são os da LEI (art. 49 e art. 26 do CDC), que a loja cumpre
 * por obrigação. O que depende de política da casa — quanto tempo a gente
 * leva pra postar, quem paga o frete da devolução por arrependimento — está
 * marcado como pendente em vez de chutado: no CDC, o que está escrito vincula.
 */

const ATUALIZADO = "20 de setembro de 2026"

export default async function Trocas() {
  const { frete, atendimento } = await configuracoes()
  const frases = frasesDoFrete(frete)

  return (
    <>
      <Titulo>Entrega, trocas e devoluções</Titulo>

      <Abertura>
        Resumo: você tem 7 dias pra desistir sem justificar e 30 dias pra reclamar de defeito. Nos
        dois casos é o mesmo primeiro passo — chamar no WhatsApp com o número do pedido.
      </Abertura>

      <Secao titulo="Entrega">
        <P>
          A gente envia pra todo o Brasil. O valor e o prazo aparecem no checkout depois que você
          digita o CEP.
          {frases ? (
            <>
              {" "}
              {frases.completa} — <b>a partir</b>, ou seja, um pedido de exatamente esse valor já
              tem o benefício.{frases.nota ? ` ${frases.nota}` : ""}
            </>
          ) : null}
        </P>
        <P>
          <b>O prazo começa na postagem, não na compra.</b> Entre o pagamento confirmado e a
          postagem tem o tempo de separar e despachar:{" "}
          <Dado valor={atendimento.prazoDePostagem} falta="prazo de postagem pendente" />.
          O código de rastreio vai pro seu e-mail assim que a encomenda for postada.
        </P>
        <P>
          Se a encomenda voltar por endereço errado ou por ninguém ter recebido depois das
          tentativas dos Correios, a gente avisa. O reenvio tem novo custo de frete; se preferir
          cancelar, o valor do produto volta integralmente.
        </P>
      </Secao>

      <Secao titulo="Desistiu? 7 dias, sem precisar explicar">
        <P>
          Compra pela internet dá direito a <b>7 dias corridos</b> contados do recebimento pra
          desistir, sem justificativa nenhuma. É o art. 49 do Código de Defesa do Consumidor, e vale
          mesmo que você tenha aberto a caixa pra conferir o produto.
        </P>
        <P>
          O produto precisa voltar em condição de ser vendido de novo: com a embalagem, sem uso
          além do necessário pra conferir. Frasco de cosmético usado pela metade não se enquadra
          aqui — nesse caso, se o problema for o produto em si, o caminho é o de defeito, logo
          abaixo.
        </P>
        <P>
          Devolvido, a gente reembolsa <b>o valor integral, incluindo o frete que você pagou</b>,
          pelo mesmo meio do pagamento, em até 10 dias depois de a encomenda chegar aqui. Cartão
          pode levar mais uma ou duas faturas pra aparecer — isso é prazo da operadora, não nosso.
        </P>
        <P>
          Quem paga o frete de volta: <Pendente>política de frete da devolução pendente</Pendente>.
        </P>
      </Secao>

      <Secao titulo="Veio com defeito ou errado">
        <P>
          Produto com defeito, vazado, violado, vencido ou diferente do que você pediu: chama a
          gente em até <b>30 dias</b> do recebimento (art. 26 do CDC, para produto não durável).
          Manda foto — resolve muito mais rápido do que descrever.
        </P>
        <P>
          A gente troca por outro igual ou devolve o dinheiro, do jeito que você preferir. Nesse
          caso <b>o frete das duas pontas é por nossa conta</b>: o erro foi nosso.
        </P>
      </Secao>

      <Secao titulo="Como pedir, na prática">
        <Lista>
          <li>
            Chama no WhatsApp <Dado valor={atendimento.whatsapp} falta="WhatsApp pendente" /> ou
            manda e-mail pra <Dado valor={atendimento.email} falta="e-mail pendente" />, com o{" "}
            <b>número do pedido</b> e o motivo. Foto, se for defeito.
          </li>
          <li>A gente responde com as instruções e, quando for o caso, o código de postagem.</li>
          <li>Você posta. Guarda o comprovante — é ele que prova que a encomenda saiu.</li>
          <li>Chegou aqui e conferido, o reembolso ou a troca sai nos prazos acima.</li>
        </Lista>
        <P>
          Sem número de pedido também dá: a gente acha pelo e-mail ou pelo CPF da compra.
        </P>
      </Secao>

      <Secao titulo="O que não dá pra devolver">
        <Lista>
          <li>produto usado além do necessário pra conferir, fora do caso de defeito;</li>
          <li>produto sem a embalagem, quando ela é parte do que foi vendido;</li>
          <li>pedido fora dos prazos acima — 7 dias pra desistência, 30 pra defeito.</li>
        </Lista>
        <P>
          Se você acha que o seu caso é exceção, fala com a gente assim mesmo. Prazo é o mínimo que
          a lei garante, não o máximo que a gente topa fazer.
        </P>
      </Secao>

      <Secao titulo="Mais">
        <P>
          Veja também os <Link href="/termos">termos de uso</Link> e a{" "}
          <Link href="/privacidade">política de privacidade</Link>.
        </P>
      </Secao>

      <Atualizado em={ATUALIZADO} />
    </>
  )
}
