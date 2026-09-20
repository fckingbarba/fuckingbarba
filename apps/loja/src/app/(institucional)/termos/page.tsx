import type { Metadata } from "next"
import Link from "next/link"
import { Abertura, Atualizado, Dado, Lista, P, Secao, Titulo } from "@/components/institucional/texto"
import { frasesDoFrete } from "@/lib/configuracoes"
import { configuracoes } from "@/lib/medusa"
import { site, PARCELAS_SEM_JUROS } from "@/lib/site"

export const metadata: Metadata = {
  title: "Termos de uso",
  description: `As regras de compra e uso da loja ${site.nome}.`,
  alternates: { canonical: "/termos" },
}

/**
 * TERMOS DE USO.
 *
 * A regra que guiou cada linha: SÓ PROMETER O QUE A LOJA CUMPRE. No Código de
 * Defesa do Consumidor (art. 30), oferta e informação suficientemente precisa
 * VINCULAM o fornecedor — o que está escrito aqui vira obrigação, não
 * enfeite. Por isso não tem prazo de entrega, não tem "satisfação garantida"
 * e não tem canal de atendimento que ninguém atende.
 *
 * O frete e os dados da empresa vêm das CONFIGURAÇÕES DO MEDUSA — a mesma
 * fonte que a faixa do topo, o carrinho e (quando o Frenet entrar) a cotação
 * usam. Número digitado à mão num documento que vincula sobreviveria à
 * próxima mudança de política e viraria promessa quebrada por escrito.
 *
 * E quando a política de frete for "nenhuma", a seção de entrega simplesmente
 * não fala de frete grátis: um termo de uso que promete frete grátis numa
 * loja que não dá é a pior versão possível deste arquivo.
 *
 * Isto não é revisão de advogado.
 */

const ATUALIZADO = "20 de setembro de 2026"

export default async function Termos() {
  const { frete, empresa, atendimento } = await configuracoes()
  const frases = frasesDoFrete(frete)

  return (
    <>
      <Titulo>Termos de uso</Titulo>

      <Abertura>
        Estas são as regras de comprar na {site.nome}. Estão em português claro de propósito: termo
        que ninguém entende não protege ninguém, nem você nem a gente.
      </Abertura>

      <Secao titulo="Quem vende">
        <P>
          <Dado valor={empresa.razaoSocial} falta="razão social pendente" />, CNPJ{" "}
          <Dado valor={empresa.cnpj} falta="CNPJ pendente" />,{" "}
          <Dado valor={empresa.endereco} falta="endereço pendente" />. Contato:{" "}
          <Dado valor={atendimento.email} falta="e-mail pendente" /> e WhatsApp{" "}
          <Dado valor={atendimento.whatsapp} falta="WhatsApp pendente" />.{" "}
          {atendimento.horario?.join(" ") ?? ""}
        </P>
      </Secao>

      <Secao titulo="Ao usar a loja, você concorda">
        <P>
          Navegar e comprar aqui significa aceitar estes termos e a{" "}
          <Link href="/privacidade">política de privacidade</Link>. Se não concordar com alguma
          parte, não finalize a compra — e, se quiser, fala com a gente antes.
        </P>
        <P>
          A loja é pra maiores de 18 anos. Se você tem menos, precisa de um responsável fazendo a
          compra.
        </P>
      </Secao>

      <Secao titulo="Preço, oferta e erro de sistema">
        <P>
          O preço que aparece na tela é o que vale, e vale até o pedido ser fechado. Mudança de
          preço não afeta pedido que já foi feito.
        </P>
        <P>
          Se um preço sair errado por falha evidente de sistema — um produto de R$ 79,90 aparecendo
          por R$ 0,79, por exemplo —, a gente avisa você antes de qualquer coisa e devolve o valor
          integral se você já tiver pago. A gente não vai despachar cobrando a diferença nem fingir
          que o pedido nunca existiu.
        </P>
        <P>
          Promoção tem prazo e quantidade, e as duas coisas aparecem na página quando existirem.
          Cupom não some no caixa: se ele valia quando você aplicou, ele vale.
        </P>
      </Secao>

      <Secao titulo="Estoque">
        <P>
          A gente mostra o estoque que o sistema tem. Pode acontecer de dois pedidos disputarem a
          última unidade; nesse caso a gente fala com você e devolve o valor integral, sem
          enrolação e sem crédito forçado na loja.
        </P>
      </Secao>

      <Secao titulo="Pagamento">
        <P>
          Parcelamos em até {PARCELAS_SEM_JUROS}x sem juros no cartão. O pedido só é separado
          depois do pagamento confirmado.
        </P>
        <P>
          Os dados do cartão não passam pelo servidor da loja: eles vão do seu navegador direto pro
          processador de pagamento. A gente não vê, não guarda e não teria como recuperar.
        </P>
      </Secao>

      <Secao titulo="Entrega">
        <P>
          A gente entrega em todo o Brasil. O valor aparece no checkout depois do CEP.
          {frases ? (
            <>
              {" "}
              {frases.completa} — <b>a partir</b>, ou seja, um pedido de exatamente esse valor já
              tem o benefício.{frases.nota ? ` ${frases.nota}` : ""}
            </>
          ) : null}
        </P>
        <P>
          O prazo que aparece no checkout é o prazo do transportador, contado a partir da postagem,
          e não da compra. Assim que a encomenda for postada, o código de rastreio vai pro seu
          e-mail. Atraso do transportador, greve e evento fora do nosso alcance a gente não
          controla — mas continua sendo com a gente que você fala, e a gente corre atrás.
        </P>
        <P>
          O endereço é o que você digitou. Endereço errado ou incompleto faz a encomenda voltar, e
          o reenvio tem novo custo de frete.
        </P>
      </Secao>

      <Secao titulo="Desistência, troca e devolução">
        <P>
          Você tem <b>7 dias corridos</b> a partir do recebimento pra desistir da compra, sem
          precisar justificar — é o art. 49 do Código de Defesa do Consumidor. Produto com defeito é
          outra coisa, e tem prazo próprio. O passo a passo dos dois casos está na{" "}
          <Link href="/trocas">política de entrega, troca e devolução</Link>, que faz parte destes
          termos.
        </P>
      </Secao>

      <Secao titulo="Como usar os produtos">
        <P>
          São cosméticos de uso externo. Leia o rótulo, não use em pele ferida e pare se aparecer
          irritação. Resultado varia de pessoa pra pessoa: o que está escrito nas páginas de
          produto é o efeito esperado no uso normal, não uma garantia de resultado igual pra todo
          mundo.
        </P>
        <P>
          Nada aqui é conselho médico. Se você tem alergia, condição de pele ou está em tratamento,
          fala com um profissional antes.
        </P>
      </Secao>

      <Secao titulo="Conta e uso da loja">
        <P>
          Os dados que você informa precisam ser verdadeiros — é com eles que a encomenda chega e a
          nota é emitida. O que não pode:
        </P>
        <Lista>
          <li>usar a loja pra fraude, ou com dado de outra pessoa;</li>
          <li>raspar o site em massa, ou tentar derrubá-lo;</li>
          <li>revender como se fosse revendedor autorizado, sem acordo com a gente.</li>
        </Lista>
        <P>
          Nesses casos a gente pode cancelar o pedido e bloquear o acesso. Se houver valor pago, ele
          volta.
        </P>
      </Secao>

      <Secao titulo="O que é nosso">
        <P>
          A marca {site.nome}, o logotipo, os textos, as fotos e o desenho do site são nossos. Dá
          pra compartilhar link à vontade. Copiar o conteúdo pra usar comercialmente, não — pra isso
          é só pedir.
        </P>
      </Secao>

      <Secao titulo="Responsabilidade">
        <P>
          A gente responde pelo que vende, na forma do Código de Defesa do Consumidor. O que está
          fora do nosso alcance — a sua internet, o seu navegador, o uso do produto fora do que diz
          o rótulo — não está coberto.
        </P>
        <P>
          O site pode sair do ar pra manutenção ou por falha de um serviço de terceiro. A gente
          tenta que seja raro e curto, e pedido já pago não se perde por causa disso.
        </P>
      </Secao>

      <Secao titulo="Mudanças, lei e foro">
        <P>
          Estes termos podem mudar; a data da última alteração está aí embaixo, e a versão que vale
          pro seu pedido é a que estava no ar quando você comprou.
        </P>
        <P>
          Vale a lei brasileira. Problema que não se resolva no conversado pode ir pro Juizado
          Especial ou pro foro do seu domicílio, como o Código de Defesa do Consumidor permite.
          Antes disso, a gente prefere resolver no WhatsApp — quase sempre dá.
        </P>
      </Secao>

      <Atualizado em={ATUALIZADO} />
    </>
  )
}
