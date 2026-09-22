# Estado do projeto — e o que vem a seguir

Atualizado em 21/09/2026, com o conserto do cache: a loja parou de guardar falha do Medusa como se
fosse o catálogo. Antes, no mesmo dia, os envios: o rastreio da Frenet chegando no pedido, na conta
e no e-mail do cliente, por um núcleo que não depende do parceiro. O AGENTS.md diz **como** trabalhar
aqui; este arquivo diz **onde** o projeto está. Leia os dois antes de começar e, ao terminar uma
tarefa, atualize este: o que mudou de estado, o que saiu da lista, o que entrou.

## No ar hoje

| Peça                          | Onde                                              | Estado                                                                      |
| ----------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------- |
| Loja (Next.js 16)             | Vercel — `fuckingbarba-loja.vercel.app`           | No ar, sem indexar. Domínio definitivo é a fase 6.                          |
| Backend (Medusa 2.21)         | Railway — serviço `@fuckingbarba/backend` + Redis | **Um serviço só, `WORKER_MODE=shared`** (ver abaixo).                       |
| Banco, imagens, Edge Function | Supabase (`us-east-1`)                            | `webhook-pagamento` publicada.                                              |
| Frete                         | Frenet                                            | Econômica e expressa; emergência R$ 20 / 7 dias úteis. Rastreio: a ligar.   |
| Pagamento                     | Pagar.me, **chave de produção**                   | Pix (30 min) e cartão em até 3x sem juros. Checkout aberto desde `a6165ae`. |

### O backend roda num serviço só

O README e o AGENTS descrevem o Medusa em dois serviços, server e worker. Em produção o worker nunca
foi criado, e com `WORKER_MODE=server` sozinho **nada de fundo rodava**: Pix pago não virava pedido
pago, a conciliação não existia, nenhum subscriber disparava. Hoje o único serviço roda os dois
papéis (`WORKER_MODE=shared`), o que dá conta do volume atual. Separar em dois serviços é quando o
volume pedir — e aí as variáveis do Pagar.me vão nos DOIS.

**Conexões com o banco.** O Medusa fala com o Supabase pelo pooler em modo sessão, que aceita
tantas conexões ao mesmo tempo quanto o **Pool Size** (Supabase → Database → Settings → Connection
pooling). Num deploy somam três: a versão no ar, a migração do pré-deploy e a versão nova subindo.
Com 15 (o padrão), o deploy de 21/09 falhou no pré-deploy com `EMAXCONNSESSION`; 30 dá folga (o
banco aceita 60). Se o erro voltar, é aqui.

### Como o pagamento ficou configurado

- **Railway:** `PAGARME_SECRET_KEY` (produção; permissão só "Pagamentos") e `MEDUSA_WEBHOOK_SEGREDO`.
- **Vercel:** `NEXT_PUBLIC_PAGARME_PUBLIC_KEY` (produção). Variável `NEXT_PUBLIC_` entra no build:
  trocou, é **redeploy sem cache**. E endereço de deploy com código no meio (`…-ael684m7o-…`) fica
  preso na versão dele — teste sempre no endereço fixo.
- **Pagar.me, modo produção:** webhook `order.paid` + `charge.paid`, 3 tentativas, para
  `https://<project-id>.supabase.co/functions/v1/webhook-pagamento?chave=…`. Teste e produção têm
  listas de webhook separadas; o do modo teste continua lá e não atrapalha.
- **Supabase (Edge Functions → Secrets):** `PAGARME_WEBHOOK_CHAVE` (a do `?chave=`),
  `MEDUSA_WEBHOOK_URL` (`https://<api>/hooks/payment/pagarme_pagarme`) e `MEDUSA_WEBHOOK_SEGREDO`
  (igual ao do Railway).
- **Região "Brasil"** cobrando pelo `pp_pagarme_pagarme`, conferida com a chave de produção pelo
  script (no shell do Railway: `cd apps/backend/.medusa/server && npx medusa exec ./src/scripts/pagamento.js`).
- **Domínio da loja no Pagar.me:** no sandbox o cartão tokenizou sem cadastro. Se um dia aparecer
  "Não consegui validar o cartão", é o primeiro suspeito.

O ensaio no sandbox passou inteiro: Pix confirmado pelo webhook em segundos (e pela conciliação,
quando o webhook estava errado), cartão aprovado em 3x, recusa com a frase certa, cancelamento no
admin estornando. Os pedidos de teste foram cancelados.

**Socorro manual:** pedido parado em "Awaiting" com o dinheiro já no Pagar.me → no admin, dentro do
pedido, **Check payment status**. Ele pergunta ao Pagar.me e registra. A conciliação faz o mesmo
sozinha a cada 5 minutos; se nem ela resolver, o log com `[conciliação]` diz o motivo.

## Próximos passos

### 1. Fechar o pagamento — você

- [x] Pix real (21/09, pedido #6, R$ 62,58): cobrou e confirmou sozinho — pela conciliação, porque
      o webhook de produção respondeu 404 (URL diferente da do modo teste).
- [ ] Webhook de produção com a mesma URL do de teste, e os eventos com Falha reenviados (↻) até
      voltarem 200.
- [ ] Estornar pelo painel do Pagar.me o Pix do #6 — o estorno pedido pelo admin falhou (ver o
      primeiro achado abaixo). O Medusa já está como Refunded; não mexer lá.
- [ ] Uma compra real pequena no cartão, cancelando em seguida.
- [x] Promoção do bump em produção (21/09): o `promocoes.js` no shell do Railway respondeu
      "BUMP-OLEO **criada**" — ela nunca tinha existido lá, e era isso que fazia o "Só nessa tela"
      marcar e desmarcar. Se um dia o bump voltar a dizer "Não deu pra incluir a oferta agora", o
      log da Vercel diz o motivo (linha `[checkout] bump marcar`); rodar o script de novo só
      atualiza.
- [ ] Olhar se algum pedido de teste de antes de 21/09 saiu com um óleo que ninguém pediu: sem a
      promoção, o clique no bump deixava o óleo no carrinho **a preço cheio**, fora da tela.

### 1b. Ligar o rastreio da Frenet — você

O código já está no ar depois do deploy; falta a Frenet mandar os avisos. Até lá, o "Mark as
shipped" com o código continua valendo sozinho: o cliente recebe o e-mail "a caminho" com o código,
e a conta mostra o rastreio.

- [x] **Railway:** `FRENET_WEBHOOK_TOKEN` criado no serviço do backend (21/09) e conferido: a rota
      responde 401 sem a chave e 200 ("ignorado") com ela. Se um dia sumir, nenhum aviso entra (e o
      log diz `[envio] Frenet: aviso recusado — FRENET_WEBHOOK_TOKEN não configurado`).
- [ ] **Frenet:** pedido enviado ao suporte em 21/09 — o webhook **"Atualização de Tracking"** da
      conta apontando pra `https://<api do Railway>/hooks/envio/frenet`, com o cabeçalho de segurança
      `x-webhook-token` = o valor acima (é o TOKEN_NAME/TOKEN_VALUE da documentação deles). **Falta a
      resposta:** o cadastro feito, e se o `OrderId` do aviso leva o número do pedido. Se só
      aceitarem a URL: `…/hooks/envio/frenet?chave=<o valor>`. O outro webhook deles (status do
      pedido/carteira) não precisa — se vier, é ignorado.
- [ ] **No painel da Frenet, ao gerar a etiqueta:** pôr o número do pedido da loja (o `#` da conta e
      do admin) no campo de pedido. É por ele que o aviso acha o pedido sozinho. Sem ele, o aviso
      fica guardado e se liga quando o código for cadastrado no pedido ("Mark as shipped").
- [ ] Quando o primeiro aviso chegar, o log do Railway mostra
      `[envio] Frenet: <código> → postado (pedido …)`, e o pedido vira "Shipped" no admin com a
      etiqueta.

Dois cuidados. **A conta da Frenet é a mesma da Nuvemshop:** se o webhook valer pra conta inteira,
os pedidos de lá também vão avisar. Eles ficam guardados sem dono (não batem com pedido nenhum) e
não mexem em nada — mas, se um número de lá coincidir com um número daqui, o aviso cai no pedido
errado. Hoje os daqui são poucos e os de lá, altos; quando a numeração daqui passar a seguir a de lá
(o item da numeração, abaixo), a coincidência deixa de existir. **O e-mail sai uma vez por
momento** (a caminho, saiu pra entrega, esperando retirada, entregue); atraso, devolução e extravio
aparecem na conta e no log, sem e-mail automático — esses a loja conversa com o cliente.

### 2. Achados da revisão do pagamento — Claude Code

- [ ] **Estorno de Pix que falha no Pagar.me não volta pro Medusa** (visto no primeiro Pix real).
      Cancelar pedido pago no admin pede o estorno; o Pagar.me aceita ("Aguardando Cancelamento") e
      o Medusa marca Refunded. Se o estorno falha depois — o de Pix exige **saldo atual** na conta, e
      Pix que acabou de entrar pode ainda não estar nele —, a cobrança volta pra "Aprovada" e ninguém
      fica sabendo: o cliente sem o dinheiro, o admin dizendo que devolveu. Falta a conciliação
      conferir no Pagar.me os estornos dos últimos dias e avisar (ou tentar de novo quando houver
      saldo). Até lá: todo estorno de Pix pelo admin se confere no painel.
- [x] **A loja guardava falha em cache** (21/09). As leituras do Medusa devolviam `null` ou lista
      vazia quando ele não respondia, dentro do `"use cache"`: com o Medusa fora por instantes e as
      tags derrubadas, a home ficava sem produto, as categorias "sem produto agora" e o produto que
      ninguém tinha aberto virava 404 — e tudo isso continuava assim depois de o Medusa voltar.
      Agora a leitura lança, e erro não entra em cache nenhum: a página no ar fica com a última
      versão boa, a que não estava pronta mostra **"Essa página não carregou"** com "Tentar de
      novo", e a sacola não se perde num clique com o Medusa fora. Cada pedido tem prazo (8 s) e
      nova chance (no build, uns 40 s de insistência, que cobrem o Railway reiniciando).
      Na prática, pra você: **build da Vercel que falhar com `[medusa] …` no log é o Railway fora na
      hora do deploy** — a versão anterior continua no ar; quando ele voltar, Redeploy. E a tela
      "não carregou" na loja tem a mesma linha `[medusa] <o quê>: <motivo>` no log da Vercel.
      De quebra: o build deixou de reaproveitar respostas do Medusa de um build anterior (dois
      deploys com menos de 15 minutos entre eles subiam a loja com o catálogo do primeiro), e o
      sitemap passou a ter a data de cada produto.
- [ ] **A API de pedido do Medusa mostra endereço e CPF** a quem tiver o id do pedido
      (`GET /store/orders/:id`). A tela de obrigado esconde; a API, não. Um middleware em
      `apps/backend/src/api/middlewares.ts` limitando os campos resolve.
- [ ] **A tela de obrigado promete e-mail que não sai:** "enviamos os detalhes pra <e-mail>". (O
      "código de rastreio chega por e-mail" já sai, com os envios.) O de pedido confirmado já está
      desenhado (`apps/backend/src/lib/emails/pedido-confirmado.ts`); falta ligar — ver a fase 5.
- [ ] **O botão Check payment status não emite `payment.captured`.** Hoje não muda nada; na fase 5
      (nota fiscal, e-mail, `purchase`) esse caminho também precisa disparar.
- [ ] **Documentação do deploy:** README e AGENTS ainda descrevem server + worker. Acertar quando
      decidir se produção fica em `shared`.

### 3. Pendências da loja

- [ ] Medidas reais das caixas (vêm da Bling) no lugar da `CAIXA_PROVISORIA` 10×5×8 em
      `apps/backend/src/scripts/medidas.ts`.
- [ ] Rua e número da origem (CEP 89036370) em `apps/backend/src/scripts/origem.ts`, pra etiqueta.
- [ ] Apagar os dois rascunhos duplicados de óleo no admin.
- [ ] Dados reais da empresa no admin, em Configurações: CNPJ, razão social, endereço, WhatsApp,
      e-mail, horário e prazo de postagem.
- [ ] Catálogo da Nuvemshop (fase 2).
- [ ] Páginas que faltam — Blog, Contato, Dúvidas, Minha conta (hoje apontam pro `/em-breve`).
- [ ] **Minha conta**, em três partes. Protótipo aprovado:
      `apps/loja/ferramentas/porte/prototipo-conta.html`.
  - [x] 1. Entrar com código de 6 dígitos no e-mail, sem senha; o primeiro código cria a conta, e o
        cliente convidado de quem já comprou vira a conta (com os pedidos). `/conta` ainda sem
        link na loja — o "Minha conta" do cabeçalho segue no `/em-breve` até a parte 3.
  - [x] **Resend no ar** (21/09): domínio verificado (DNS na GoDaddy: TXT `resend._domainkey`,
        CNAME `send` e `rsend` — o site e o e-mail do Google não mudaram), chave só de envio no
        Railway, e o código chegou na caixa de entrada com a logo. Se um código não chegar, o log do
        Railway diz por quê (linha `[email]`).
  - [x] 2. Visão geral (em andamento e comprar de novo), a lista de pedidos e o pedido: selo do
        estado, linha do tempo, rastreio, o Pix pendente (a caixa do obrigado, que muda sozinha
        quando cai), totais e "comprar de novo". Pedidos lidos da conta, nunca pelo id solto.
  - [x] O rastreio na conta: a situação do pacote, o caminho que a transportadora contou e os
        e-mails de cada momento (ver 1b e "Envios" no AGENTS.md). Postar pelo admin ("Mark as
        shipped" com o código) continua valendo, com ou sem o aviso da Frenet.
  - [ ] 3. Endereços e meus dados — e aí o link do cabeçalho troca o `/em-breve` por `/conta`.
  - [ ] Histórico da Nuvemshop na conta: junto da importação do catálogo (fase 2), e de novo na
        virada, com os últimos pedidos.
  - [ ] Numeração: decidido que os pedidos novos começam depois do último da Nuvemshop (nada de dois
        "#28"). **Falta você dizer o número** do pedido mais recente de lá.
- [ ] O checkout não pede mais aceite das regras de troca (a linha embaixo do botão de pagar saiu
      no enxugamento de 21/09). As regras seguem publicadas no `/trocas`, com link no rodapé. Se
      quiser o aceite de volta sem texto novo: o "7 dias pra trocar ou devolver" da faixa do passo
      3 vira link pro `/trocas`.
- [ ] Troca de domínio (fase 6). O que depende do endereço da loja: `NEXT_PUBLIC_SITE_URL` na
      Vercel, `STORE_CORS`/`AUTH_CORS` e `LOJA_URL` (revalidação, logo e links dos e-mails) no
      Railway, `SITE_ORIGENS` no Supabase, a indexação, e o domínio no Pagar.me se ele passar a
      exigir.

### 4. Fase 5

- E-mails transacionais — o Resend já está ligado (`apps/backend/src/lib/email.ts`, que manda o
  código de acesso) —, nota fiscal (Bling) e `purchase` pro GA4 e pra Meta. O gancho é
  `apps/backend/src/subscribers/pagamento-capturado.ts` — idempotente, porque o evento pode sair
  duas vezes pro mesmo pagamento.
- A moldura dos e-mails existe (`apps/backend/src/lib/emails/moldura.ts`), e o de pedido
  confirmado está desenhado e testado, sem ligar. O botão dele leva a `/conta/pedidos/<id>`, que
  já existe — dá pra ligar. Os do caminho da encomenda (`envio.ts`) já saem. Falta desenhar o de
  Pix vencido.
- E-mail de "seu Pix venceu": a conciliação já cancela o pedido e devolve o estoque; falta avisar.
- **Envios — o que o desenho já tem lugar pra receber** (o contrato do parceiro está em
  `apps/backend/src/lib/envios/parceiro.ts`):
  - consultar o rastreio de tempos em tempos (`consultar`), a rede de segurança do aviso que se
    perde — na Frenet, pede o código do serviço cotado, que o pedido ainda não guarda. O primeiro
    passo é o provedor gravar no pedido o serviço escolhido no checkout;
  - mandar o pedido pago pro painel da Frenet sozinho, pra etiqueta sair sem digitar
    (`registrarPedido`, no `pagamento-capturado.ts`) — a API de pedidos dela exige o token de
    parceiro, que sai de uma homologação com o time de parcerias;
  - avisar a LOJA de extravio e devolução (e-mail ou um bloco no admin com a linha do tempo) —
    hoje é o log (`[envio]`) e o painel da Frenet;
  - o "entregue + pedido de avaliação" sete dias depois, do doc de arquitetura — um assinante do
    `envio.mudou`;
  - limpar envios sem dono antigos, se a conta da Frenet seguir avisando os da Nuvemshop.

## Como seguir no Claude Code

- O operacional está no AGENTS.md: comandos, os dez conferidores (contra o Medusa local, com Frenet,
  Pagar.me e Resend falsos) e as regras. Rode os conferidores antes de subir.
- O que mexe em produção — variável, painel, script no Railway — quem faz é você; o Claude Code
  prepara e diz o comando.
- Chave nunca passa pela conversa. Cuidado com texto copiado de painel: o link pode levar o valor
  escondido. Pra mostrar uma tela, print.
