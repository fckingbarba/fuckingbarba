import type { Metadata } from "next"
import Link from "next/link"
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
 * Supabase, Pagar.me, Resend, Frenet, Bling e, só com o aceite, Google,
 * Meta, TikTok e Microsoft Clarity — `components/analytics/tags.tsx` e
 * `apps/backend/src/lib/anuncios/`). Política genérica é pior que nenhuma:
 * ela promete coisas que o sistema não faz e esconde as que ele faz.
 *
 * DUAS COISAS QUE ESTA PÁGINA NÃO É: revisão de advogado, e definitiva. O que
 * ela é: verdadeira sobre o estado de hoje. Terceiro novo muda este texto
 * junto — e a versão da faixa de cookies (`VERSAO_DO_CONSENTIMENTO`), que
 * pergunta de novo antes de valer, como a última seção promete.
 */

const ATUALIZADO = "25 de setembro de 2026"

export default async function Privacidade() {
  const { empresa, atendimento } = await configuracoes()
  const email = atendimento.email

  return (
    <>
      <Titulo>Política de privacidade</Titulo>

      <Abertura>
        A gente coleta o mínimo pra conseguir entregar seu pedido e falar com você sobre ele. Não
        vendemos seus dados e não guardamos o número do seu cartão — ele não passa nem pelo nosso
        servidor. Medição e anúncio, só se você aceitar os cookies.
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
          confirmação e o código de rastreio. Se você deixar uma compra no meio do caminho, a gente
          pode te chamar no WhatsApp, uma pessoa da loja, pra ver se ficou alguma dúvida — é só
          responder que não quer, e a gente não chama mais.
        </P>
        <P>
          <b>Se você assinar a newsletter</b>: só o e-mail. Dá pra sair em qualquer mensagem que a
          gente mandar.
        </P>
        <P>
          <b>Se você aceitar os cookies</b>: as páginas e os produtos que você vê, o que entra e sai
          da sacola e o caminho do checkout. Na compra, junto do valor e dos produtos, vão os
          códigos desses cookies — e, pra Meta e pro TikTok, o IP e o navegador. É o que diz pra
          cada um que a compra veio de um anúncio dele.
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
            <b>Consentimento</b> — cookies de medição e anúncio, o aviso da compra pras plataformas
            de anúncio e a newsletter. Você escolhe, e pode voltar atrás a qualquer momento sem
            perder nada do resto.
          </li>
          <li>
            <b>Legítimo interesse</b> — segurança da loja e prevenção a fraude, e a mensagem no
            WhatsApp sobre uma compra que você deixou no meio, sempre com o mínimo de dado possível.
          </li>
        </Lista>
      </Secao>

      <Secao titulo="Cookies">
        <P>
          Três são necessários e não dependem de você aceitar, porque sem eles a loja não funciona:
          um guarda sua sacola entre uma página e outra, um lembra que aquele pedido foi feito neste
          navegador (é o que impede um link encaminhado de mostrar o endereço de outra pessoa), e um
          guarda a sua resposta sobre os cookies — pra não perguntar de novo toda visita.
        </P>
        <P>
          Os de medição e anúncio — Google Analytics, Google Ads, Meta (Facebook e Instagram),
          TikTok e Microsoft Clarity — só são criados se você clicar em aceitar na faixa. Se
          recusar, nenhum desses scripts é carregado — não é um script que roda em silêncio — e a
          sua compra também não é avisada a ninguém. Pra mudar de ideia depois, é só apagar os
          cookies do site no seu navegador e responder de novo.
        </P>
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
            <b>Resend</b> — manda os e-mails da loja: o seu e-mail e o que vai escrito neles.
          </li>
          <li>
            <b>Frenet e a transportadora</b> — o CEP pra cotar o frete; nome, endereço e telefone
            pra entregar. Sem isso a encomenda não sai.
          </li>
          <li>
            <b>Bling</b> — emite a nota fiscal: nome, CPF ou CNPJ, endereço e o que você comprou.
          </li>
        </Lista>
        <P>Só se você aceitar os cookies, pra medir e pra anúncio:</P>
        <Lista>
          <li>
            <b>Google</b> (Analytics e Ads), <b>Meta</b> (Facebook e Instagram) e <b>TikTok</b> — o
            que você vê e põe na sacola e, na compra, o valor, os produtos e os códigos dos cookies.
            A Meta e o TikTok recebem também o seu e-mail e o telefone, embaralhados (em hash): eles
            só conseguem comparar com os que já têm, não ler.
          </li>
          <li>
            <b>Microsoft Clarity</b> — a gravação de como a página é usada, com os seus dados
            cobertos.
          </li>
        </Lista>
        <P>
          A gente não vende seus dados. Com o seu aceite, o Google, a Meta e o TikTok podem usar o
          que você viu e comprou pra medir os anúncios e mostrar anúncios da loja pra você. Sem o
          aceite, não.
        </P>
      </Secao>

      <Secao titulo="Por quanto tempo">
        <P>
          Dados de venda ficam <b>cinco anos</b>, que é o que a legislação fiscal e o Código de
          Defesa do Consumidor exigem de quem vende. E-mail de newsletter fica até você pedir pra
          sair. Cookies de medição duram no máximo dois anos; os necessários somem quando a sessão
          acaba, menos o da sacola e o da sua resposta sobre cookies.
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
