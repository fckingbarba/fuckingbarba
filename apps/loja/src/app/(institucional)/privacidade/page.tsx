import type { Metadata } from "next"
import Link from "next/link"
import { MudarResposta } from "@/components/analytics/mudar-resposta"
import {
  Abertura,
  Atualizado,
  Dado,
  Lista,
  P,
  Secao,
  Titulo,
} from "@/components/institucional/texto"
import { whatsappNaTela } from "@/lib/configuracoes"
import { configuracoes } from "@/lib/medusa"
import { site } from "@/lib/site"

export const metadata: Metadata = {
  title: "Política de privacidade",
  description: `Como a ${site.nome} coleta, usa e protege seus dados.`,
  alternates: { canonical: "/privacidade" },
}

/**
 * POLÍTICA DE PRIVACIDADE — escrita em cima do que a loja FAZ, não de modelo.
 *
 * Cada dado listado aqui foi conferido no código: os campos vêm de
 * `components/checkout/contato.tsx` e `entrega.tsx`, os cookies de
 * `lib/carrinho.ts`, `lib/checkout.ts` e `components/analytics/`, e os
 * terceiros de quem a loja realmente chama (ViaCEP, Vercel, Railway,
 * Supabase, Pagar.me, Mercado Pago, Resend, Frenet, Bling, o Google Analytics e a
 * Microsoft Clarity (de quem não recusa os cookies, desde a 0166 e a 0171) e, só com o
 * aceite, Google Ads, Meta e TikTok — `components/analytics/tags.tsx` e
 * `apps/backend/src/lib/anuncios/`). O que a própria loja anota pro CRM, só
 * com o aceite, é `lib/anotar.ts` e `apps/backend/src/lib/crm/eventos.ts`
 * (o prazo de 13 meses é o job `limpar-o-crm`). Política genérica é pior que nenhuma:
 * ela promete coisas que o sistema não faz e esconde as que ele faz.
 *
 * DUAS COISAS QUE ESTA PÁGINA NÃO É: revisão de advogado, e definitiva. O que
 * ela é: verdadeira sobre o estado de hoje. Terceiro novo muda este texto
 * junto — e a versão da faixa de cookies (`VERSAO_DO_CONSENTIMENTO`), que
 * pergunta de novo antes de valer, como a última seção promete.
 */

const ATUALIZADO = "27 de setembro de 2026"

export default async function Privacidade() {
  const { empresa, atendimento } = await configuracoes()
  const email = atendimento.email

  return (
    <>
      <Titulo>Política de privacidade</Titulo>

      <Abertura>
        A gente coleta o mínimo pra conseguir entregar seu pedido e falar com você sobre ele. Não
        vendemos seus dados e não guardamos o número do seu cartão — ele não passa nem pelo nosso
        servidor. O Google Analytics e a Microsoft Clarity medem as visitas de quem não recusar os
        cookies; o anúncio e o que a loja anota do que você faz nela, só se você aceitar.
      </Abertura>

      <Secao titulo="Quem é o responsável">
        <P>
          <Dado valor={empresa.razaoSocial} falta="razão social pendente" />, CNPJ{" "}
          <Dado valor={empresa.cnpj} falta="CNPJ pendente" />. Dúvida sobre seus dados, ou pedido
          pra apagá-los: <Dado valor={email} falta="e-mail pendente" /> ou WhatsApp{" "}
          <Dado valor={whatsappNaTela(atendimento.whatsapp)} falta="WhatsApp pendente" />.
        </P>
      </Secao>

      <Secao titulo="O que a gente coleta, e por quê">
        <P>
          <b>Pra fechar o pedido</b> (você digita no checkout): nome e sobrenome, e-mail, telefone,
          CPF ou CNPJ, e o endereço de entrega — CEP, rua, número, complemento, bairro, cidade e
          estado.
        </P>
        <P>
          O CPF não é curiosidade nossa: sem ele não sai nota fiscal, e nota fiscal é obrigação de
          quem vende. O telefone é pro caso de a entrega dar problema, e o e-mail é por onde vai a
          confirmação e o código de rastreio. Se você deixar uma compra no meio do caminho (o
          checkout, ou um Pix que não foi pago), a gente manda até quatro e-mails lembrando dela nos
          dois dias seguintes — um deles com um desconto só seu. Se for a sacola, e a loja já souber
          quem você é (você aceitou os cookies e já entrou na conta, assinou a newsletter ou comprou
          antes), são até cinco, nos cinco dias seguintes. E uma pessoa da loja pode te chamar no
          WhatsApp pra ver se ficou alguma dúvida. Todo e-mail tem o link &ldquo;Sair da
          lista&rdquo;, e no WhatsApp é só responder que não quer: a gente não manda mais.
        </P>
        <P>
          <b>Se você assinar a newsletter</b>: só o e-mail. Dá pra sair em qualquer mensagem que a
          gente mandar.
        </P>
        <P>
          <b>Se você se cadastrar no pop-up da primeira compra</b>: o nome, o e-mail e a página em
          que você estava. Em troca vem um cupom de desconto só seu, que vale na primeira compra, e
          você entra na lista das ofertas, como na newsletter. O nome é pro &ldquo;Oi&rdquo; dos
          e-mails, e a página, pra gente falar do que te interessa. Dá pra sair em qualquer
          mensagem.
        </P>
        <P>
          <b>Se você pedir aviso de um produto esgotado</b> (o &ldquo;avise-me quando chegar&rdquo;,
          na página dele): o e-mail e o produto. Sai um e-mail só, quando ele voltar pro estoque — e
          aí o seu endereço sai da lista de espera. Não é a newsletter: não vem mais nada depois.
        </P>
        <P>
          <b>Se você avaliar um produto</b> (a página que abre pelo e-mail que a gente manda um dia
          depois da entrega, um por compra): o nome que você escolher, a nota e o texto, ligados ao
          pedido. Depois que a loja lê, o nome, a nota e o texto aparecem no site, na página do
          produto — o número do pedido e o seu e-mail, não.
        </P>
        <P>
          <b>Se você não recusar os cookies</b>: o Google Analytics conta a visita — as páginas e os
          produtos que você vê, o que entra e sai da sacola e o caminho do checkout —, ligada a um
          código aleatório do cookie dele, sem o seu nome, e-mail ou telefone. Na compra, vão pra
          ele o valor, os produtos e esse código; e a loja guarda no pedido o navegador da compra,
          pra saber se ela veio do celular ou do computador. E a Microsoft Clarity grava como a
          página é usada (mais embaixo, em Cookies), pra gente ver onde a loja atrapalha.
        </P>
        <P>
          <b>Se você aceitar os cookies</b>: o mesmo vai também pro Google Ads, pra Meta e pro
          TikTok, com os códigos dos cookies deles — e, pra Meta e pro TikTok, o IP e o navegador. É
          o que diz pra cada um que a compra veio de um anúncio dele.
        </P>
        <P>
          <b>O que a própria loja anota, também só se você aceitar</b>: de onde você chegou (o site
          ou a campanha do link), os produtos que viu, o que entrou e saiu da sacola e os passos do
          checkout — ligado a um código aleatório deste navegador, guardado num cookie da loja.
          Quando você entra na conta, deixa o e-mail no checkout ou assina a newsletter, o que foi
          anotado passa a ficar ligado ao seu e-mail. É o que deixa a loja lembrar o que interessa
          pra você. E-mail de oferta continua dependendo do seu sim a ele, separado deste.
        </P>
        <P>
          <b>Se você já comprou na loja antiga</b> (a FuckingBarba na Nuvemshop): vieram com você o
          seu e-mail, o primeiro nome, os pedidos e os carrinhos que ficaram no meio (datas,
          produtos e valores) e a sua escolha sobre receber ofertas. É o que deixa a loja saber
          quando o seu produto está acabando. CPF, telefone, endereço e dados do cartão da loja
          antiga não vieram, e e-mail de oferta só vai pra quem tinha aceitado lá.
        </P>
        <P>
          <b>Quando você tenta pagar com cartão</b>: pra barrar robô testando cartão roubado, a loja
          anota cada tentativa — a sacola, o valor, se passou, e um código tirado do seu IP (não o
          IP), que só serve pra contar as tentativas da mesma pessoa.
        </P>
        <P>
          <b>O que a gente NÃO coleta:</b> número de cartão, validade e CVV. Esses campos, quando
          existirem, ficam no seu navegador e vão direto pro processador de pagamento — o servidor
          da loja não recebe, não registra e não teria como guardar.
        </P>
      </Secao>

      <Secao titulo="Com que base legal (LGPD)">
        <Lista>
          <li>
            <b>Execução de contrato</b> — nome, endereço, telefone e e-mail: sem eles não há como
            entregar o que você comprou.
          </li>
          <li>
            <b>Obrigação legal</b> — CPF ou CNPJ e os dados da venda, que a legislação fiscal manda
            guardar.
          </li>
          <li>
            <b>Consentimento</b> — os cookies de anúncio, o que a loja anota do que você faz nela, o
            aviso da compra pras plataformas de anúncio, a newsletter, o aviso de produto esgotado e
            a avaliação que você manda pro site. Você escolhe, e pode voltar atrás a qualquer
            momento sem perder nada do resto. A medição das visitas — a contagem do Google Analytics
            e a gravação da Microsoft Clarity — é por legítimo interesse: saber quantas pessoas a
            loja recebe e onde ela atrapalha, sem o seu nome, e-mail ou telefone. Ela para quando
            você recusa os cookies.
          </li>
          <li>
            <b>Legítimo interesse</b> — segurança da loja e prevenção a fraude, os e-mails e a
            mensagem no WhatsApp sobre uma compra que você deixou no meio, o e-mail que pergunta o
            que você achou de uma compra (um por compra) e saber se os e-mails da loja chegam e são
            abertos, sempre com o mínimo de dado possível.
          </li>
        </Lista>
      </Secao>

      <Secao titulo="Cookies">
        <P>
          Os necessários não dependem de você aceitar, porque sem eles a loja não funciona: um
          guarda sua sacola entre uma página e outra, um lembra que aquele pedido foi feito neste
          navegador (é o que impede um link encaminhado de mostrar o endereço de outra pessoa), um
          guarda a sua resposta sobre os cookies — pra não perguntar de novo toda visita — e, se
          você entrar na sua conta, um lembra que é você. Os links dos nossos e-mails também usam
          um, só no que eles abrem: o cupom que espera o checkout, a avaliação do pedido e o sair da
          lista. E dois lembram só a sua escolha sobre o pop-up da primeira compra: se você fechou
          ou já se cadastrou, e se já comprou neste navegador — pra ele não aparecer de novo.
        </P>
        <P>
          Os do Google Analytics e da Microsoft Clarity medem as visitas desde a primeira página,
          com um código aleatório e sem nada de anúncio. Os de anúncio — Google Ads, Meta (Facebook
          e Instagram) e TikTok — e o da própria loja, com o código deste navegador, só são criados
          se você clicar em aceitar na faixa. Se clicar em “Só o necessário”, o Google Analytics e a
          Clarity param e os cookies deles são apagados, nenhum dos outros scripts é carregado — não
          é um script que roda em silêncio —, a loja não anota nada, e a sua compra também não é
          avisada a ninguém.
        </P>
        <P>
          Pra mudar de ideia depois, é só a faixa perguntar de novo. Se agora você disser não, o
          Google Analytics e a Clarity param e a loja apaga o que anotou deste navegador.
        </P>
        <MudarResposta />
        <P>
          A Microsoft Clarity grava como a página é usada — cliques, rolagem, o movimento na tela —
          pra gente ver onde a loja atrapalha. O que você digita e os seus dados no checkout e na
          sua conta ficam cobertos na gravação.
        </P>
      </Secao>

      <Secao titulo="Quem mais vê seus dados">
        <P>Pra loja funcionar, cada um só a parte que lhe cabe:</P>
        <Lista>
          <li>
            <b>Vercel</b> (hospedagem do site) e <b>Railway</b> (onde ficam os pedidos) — guardam os
            dados do pedido pra que a loja possa consultá-los.
          </li>
          <li>
            <b>Supabase</b> — banco e arquivos da loja.
          </li>
          <li>
            <b>ViaCEP</b> — quando você digita o CEP, o número do CEP (só ele) é enviado pra esse
            serviço público pra preencher rua, bairro e cidade automaticamente. Nome, e-mail e
            documento não vão junto.
          </li>
          <li>
            <b>Pagar.me</b> — o pagamento: nome, CPF ou CNPJ, e-mail, telefone, endereço e o IP da
            compra, pra cobrar e pra análise de fraude. O número do cartão vai do seu navegador
            direto pra eles.
          </li>
          <li>
            <b>Mercado Pago</b> — o Pix, quando o Pagar.me não consegue gerar o seu: nome, CPF ou
            CNPJ e e-mail, pra gerar o Pix e confirmar o pagamento.
          </li>
          <li>
            <b>Resend</b> — manda os e-mails da loja: o seu e-mail e o que vai escrito neles. E
            conta pra loja se cada e-mail chegou, se foi aberto e em que link você clicou — sem o
            seu IP.
          </li>
          <li>
            <b>Frenet e a transportadora</b> — o CEP pra cotar o frete; nome, endereço e telefone
            pra entregar. Sem isso a encomenda não sai.
          </li>
          <li>
            <b>Bling</b> — emite a nota fiscal: nome, CPF ou CNPJ, endereço e o que você comprou.
          </li>
        </Lista>
        <P>Pra contar as visitas, se você não recusar os cookies:</P>
        <Lista>
          <li>
            <b>Google Analytics</b> — o que você vê e põe na sacola e, na compra, o valor, os
            produtos e o código do cookie dele. Sem o seu nome, e-mail ou telefone.
          </li>
          <li>
            <b>Microsoft Clarity</b> — a gravação de como a página é usada, com os seus dados
            cobertos.
          </li>
        </Lista>
        <P>Só se você aceitar os cookies, pra anúncio:</P>
        <Lista>
          <li>
            <b>Google Ads</b>, <b>Meta</b> (Facebook e Instagram) e <b>TikTok</b> — o que você vê e
            põe na sacola e, na compra, o valor, os produtos e os códigos dos cookies. A Meta e o
            TikTok recebem também o seu e-mail e o telefone, embaralhados (em hash): eles só
            conseguem comparar com os que já têm, não ler.
          </li>
        </Lista>
        <P>
          A gente não vende seus dados. Com o seu aceite, o Google, a Meta, o TikTok e a Microsoft
          podem usar o que você viu e comprou pra medir os anúncios e mostrar anúncios da loja pra
          você. Sem o aceite, não.
        </P>
      </Secao>

      <Secao titulo="Por quanto tempo">
        <P>
          Dados de venda ficam <b>cinco anos</b>, que é o que a legislação fiscal e o Código de
          Defesa do Consumidor exigem de quem vende. E-mail de newsletter (e o nome e a página, se
          vieram do pop-up) fica até você pedir pra sair. O do aviso de produto esgotado fica até o
          aviso sair — ou seis meses, se o produto não voltar. A avaliação que você mandou fica até
          você pedir pra apagar. O registro das tentativas de pagar com cartão fica 30 dias. O que a
          loja anota do que você faz nela, e o que ela sabe dos e-mails que mandou (se chegaram, se
          foram abertos), fica <b>13 meses</b> e depois é apagado. Cookies de medição duram no
          máximo dois anos, e o código deste navegador, um ano; os necessários somem quando a sessão
          acaba, menos o da sacola, o da sua resposta sobre cookies e os do pop-up da primeira
          compra (um ano).
        </P>
      </Secao>

      <Secao titulo="Seus direitos">
        <P>
          A LGPD te dá o direito de saber o que a gente tem sobre você, corrigir o que estiver
          errado, pedir uma cópia, pedir a exclusão, retirar um consentimento que você deu e saber
          com quem a gente compartilhou. Pra exercer qualquer um deles, escreve pra{" "}
          <Dado valor={email} falta="e-mail pendente" />.
        </P>
        <P>
          A gente responde em até 15 dias. Se algum dado não puder ser apagado — os da nota fiscal,
          por exemplo, que a lei manda guardar —, a resposta vai dizer qual, e por quê, em vez de
          simplesmente ignorar o pedido.
        </P>
        <P>
          Você também pode reclamar diretamente à ANPD, a Autoridade Nacional de Proteção de Dados.
        </P>
      </Secao>

      <Secao titulo="Menores de 18 anos">
        <P>
          A loja é pra maiores de 18. A gente não coleta dado de menor de propósito; se isso
          acontecer por engano, avisa pela gente que apagamos.
        </P>
      </Secao>

      <Secao titulo="Quando esta política mudar">
        <P>
          Mudou, a data lá embaixo muda junto. Se a mudança for daquelas que afetam você de verdade
          — um terceiro novo, uma finalidade nova —, a gente avisa no site antes de valer. Leia
          também os <Link href="/termos">termos de uso</Link> e a{" "}
          <Link href="/trocas">política de entrega, troca e devolução</Link>.
        </P>
      </Secao>

      <Atualizado em={ATUALIZADO} />
    </>
  )
}
