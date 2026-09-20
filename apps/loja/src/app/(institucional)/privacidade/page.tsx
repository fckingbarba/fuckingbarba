import type { Metadata } from "next"
import Link from "next/link"
import { Abertura, Atualizado, Lista, P, Pendente, Secao, Titulo } from "@/components/institucional/texto"
import { contato, site } from "@/lib/site"

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
 * Supabase, GA4). Política genérica é pior que nenhuma: ela promete coisas
 * que o sistema não faz e esconde as que ele faz.
 *
 * DUAS COISAS QUE ESTA PÁGINA NÃO É: revisão de advogado, e definitiva. O que
 * ela é: verdadeira sobre o estado de hoje. Quando o Pagar.me, o e-mail
 * transacional e a transportadora entrarem, os terceiros mudam e este texto
 * muda junto — está anotado no README.
 */

const ATUALIZADO = "20 de setembro de 2026"

export default function Privacidade() {
  return (
    <>
      <Titulo>Política de privacidade</Titulo>

      <Abertura>
        A gente coleta o mínimo pra conseguir entregar seu pedido e falar com você sobre ele. Não
        vendemos seus dados, não repassamos pra anunciante e não guardamos o número do seu cartão —
        ele não passa nem pelo nosso servidor.
      </Abertura>

      <Secao titulo="Quem é o responsável">
        <P>
          {site.nome}, CNPJ <Pendente>CNPJ real pendente</Pendente>. Dúvida sobre seus dados, ou
          pedido pra apagá-los: <a href={`mailto:${contato.email}`}>{contato.email}</a> ou WhatsApp{" "}
          {contato.whatsapp.exibicao}.
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
          confirmação e o código de rastreio.
        </P>
        <P>
          <b>Se você assinar a newsletter</b>: só o e-mail. Dá pra sair em qualquer mensagem que a
          gente mandar.
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
            <b>Consentimento</b> — cookies de medição e a newsletter. Você escolhe, e pode voltar
            atrás a qualquer momento sem perder nada do resto.
          </li>
          <li>
            <b>Legítimo interesse</b> — segurança da loja e prevenção a fraude, sempre com o mínimo
            de dado possível.
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
          Os de medição (Google Analytics) só são criados se você clicar em aceitar na faixa. Se
          recusar, nenhum script de medição é carregado — não é um script que roda em silêncio. Pra
          mudar de ideia depois, é só apagar os cookies do site no seu navegador e responder de
          novo.
        </P>
      </Secao>

      <Secao titulo="Quem mais vê seus dados">
        <P>
          Só quem precisa ver pra loja funcionar, e cada um só a parte que lhe cabe:
        </P>
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
            <b>Google Analytics</b> — só se você aceitar, e só com dado de navegação.
          </li>
          <li>
            <b>Transportadora</b> — nome, endereço e telefone, pra entregar. Sem isso a encomenda
            não sai.
          </li>
        </Lista>
        <P>
          A gente não vende seus dados, não troca com parceiro e não usa pra montar público de
          anúncio.
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
          <a href={`mailto:${contato.email}`}>{contato.email}</a>.
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
