# Estado do projeto — e o que vem a seguir

Atualizado em 22/09/2026, com o Pix vencido que prendia o estoque consertado (o #7 — ver o primeiro
achado da revisão do pagamento) e a Minha conta de pé na loja: endereços, meus dados, o checkout que
abre preenchido pra quem está na conta (e guarda o endereço da compra), e o "Minha conta" do
cabeçalho apontando pra ela. No mesmo dia, o estorno que o Pagar.me não faz (a conciliação confere,
avisa e pede de novo), a API de pedido fechada pra quem só tem o id e o e-mail de pedido confirmado
ligado; em 21/09, o conserto do cache e o rastreio da Frenet chegando no pedido, na conta e no
e-mail. O
AGENTS.md diz **como** trabalhar aqui; este arquivo diz **onde** o projeto está. Leia os dois antes
de começar e, ao terminar uma tarefa, atualize este: o que mudou de estado, o que saiu da lista, o
que entrou.

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
  listas de webhook separadas; a URL é a mesma nos dois.
- **Supabase (Edge Functions → Secrets):** `PAGARME_WEBHOOK_CHAVE` (a do `?chave=`),
  `MEDUSA_WEBHOOK_URL` (`https://<api>/hooks/payment/pagarme_pagarme`) e `MEDUSA_WEBHOOK_SEGREDO`
  (igual ao do Railway). **Publicar a função não é automático:** depois de qualquer mudança de
  segredo, `supabase functions deploy webhook-pagamento`. E `supabase functions list` vazio quer
  dizer que ela não está no ar — o Pagar.me recebe 404 em qualquer URL.
- **Como saber onde um webhook morreu**, pelo código que o painel do Pagar.me registra: **404** é a
  função não publicada (ou o project-ref errado); **401** é a `?chave=` diferente da
  `PAGARME_WEBHOOK_CHAVE`; **405** é GET em vez de POST — e serve como teste, porque a função
  responde 405 antes de olhar autenticação, sem gravar nada. Um **200** do painel não prova que
  chegou no Medusa: a função responde 200 mesmo sem repassar, de propósito. A prova do repasse é
  `loja.eventos_webhook` com `processado_em` preenchido; a do segredo é o log do Railway **não**
  trazer `[pagarme] aviso sem o segredo certo — ignorado`.
- **Reenvio (↻) de evento antigo no painel usa a URL de quando o evento nasceu**, não a atual: evento
  que falhou antes de a URL ser corrigida nunca passa. Não insista — a conciliação já cobriu o
  pagamento dele.
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
      o webhook respondeu 404.
- [x] **O webhook nunca tinha existido** (descoberto e resolvido em 22/09). A URL não era o
      problema: `supabase functions list` respondia `{"functions":[]}` — a função nunca foi
      publicada, e só a `PAGARME_WEBHOOK_CHAVE` estava nos secrets; faltavam `MEDUSA_WEBHOOK_URL` e
      `MEDUSA_WEBHOOK_SEGREDO`. Publicada a função, criados os três segredos (chave nova, e o
      segredo gerado de novo dos dois lados porque o do Railway não batia), o caminho
      Pagar.me → Supabase → Medusa foi conferido ponta a ponta: a função grava
      (`loja.eventos_webhook` começou no id 1), repassa, e o Railway não reclama mais do segredo.
      Desde 21/09 **todo pagamento vinha sendo confirmado só pela conciliação** — funciona, mas com
      até 5 minutos de atraso na tela de quem pagou.
- [ ] Trocar a URL do webhook no **modo teste** também: a chave antiga precisa morrer nos dois.
- [ ] Ver, no admin, o pedido da cobrança `ch_OrXNpVvU2zFjGwj3` (paga em 22/09 às 14:05, o último
      evento que morreu em 404). Foi resolvido pela conciliação; é só conferir que está certo.
- [ ] A prova final do webhook — o Pagar.me chamando a função sozinho — vem junto com a compra de
      teste no cartão, logo abaixo.
- [ ] O Pix do #6, cujo estorno falhou (ver o primeiro achado abaixo). **Depois do deploy de
      22/09, a conciliação confere ele sozinha:** se o dinheiro ainda não voltou, chega um e-mail
      ("O estorno do pedido #6 não saiu") e o pedido no admin ganha uma faixa vermelha, no fim da
      coluna principal, com "Tentar o estorno de novo" — é apertar, ou esperar as 6 horas da
      tentativa sozinha. Se você já estornou pelo painel do Pagar.me, ela só anota. O Medusa segue
      como Refunded; não mexer lá.
- [x] Cartão real (22/09, pedido #9, R$ 62,58): **o antifraude do Pagar.me reprovou**. A Stone
      autorizou (`Approved`, código `0000`) e o `PagarmeAntifraud` respondeu `reproved` um minuto
      depois; como mandamos `auth_and_capture`, a cobrança foi capturada às 15:11 e cancelada às
      15:12 — o valor apareceu e sumiu da fatura. Daqui, tudo certo: o Medusa nunca registrou o
      pagamento (Paid Total R$ 0,00, selo **Canceled** e não _Refunded_) e a conciliação cancelou o
      #9, devolvendo o estoque. Nada a corrigir no código.
- [x] O teste com outras pessoas foi feito (22/09), e **a causa inocente morreu**. Três compras no
      cartão, três reprovações: `ch_JdkpjxImnTx1GDej` (Matheus, SC, Mastercard 8187, 15:11, desfeita
      em 4 s), `ch_GKqrWD7I3SpljEyz` (Marcelo, SC, Visa 4323, 15:42, 2 s) e `ch_56om91s84h28mbK9`
      (Anderson, SP, Mastercard 9684, 15:46, 6 s). Nas três o banco **autorizou** (`0000 — Approved`,
      com código de autorização) e a antifraude respondeu `reproved`. Pessoas, estados, bandeiras e
      cartões diferentes reprovando 100% não é perfil de comprador: é regra da conta. Quem levanta
      esses dados é `ferramentas/conferir-cartao.mjs` (só lê).
- [ ] **Antifraude reprovando compra legítima — o item mais urgente do pagamento.** Enquanto isso
      valer, nenhuma venda de cartão entra. Falar com o Pagar.me levando as três cobranças acima:
      **qual regra** reprovou cada uma, se o cadastro da conta está completo (domínio da loja
      informado) e qual é o valor mínimo configurado pra análise. Não mexer no `auth_and_capture`
      antes dessa conversa: capturar depois da análise trocaria "o valor foi e voltou" por "o valor
      nem saiu", o que é melhor pro cliente, mas não resolve a venda perdida.
- [x] **O e-mail de cancelamento ia mentir pro cartão reprovado, e isso foi corrigido no mesmo dia
      em que nasceu (22/09).** Na antifraude o dinheiro sai e volta sem o Medusa ver nada: não há
      `captured_at` e ninguém pediu estorno, então a decisão caía em "sem-cobranca" e o e-mail dizia
      _"Nada foi cobrado de você"_ pra quem tinha acabado de ver R$ 62,58 irem e voltarem no
      aplicativo do banco. Era o erro que o `capturado` existe pra evitar, entrando por outra porta.
      Agora a decisão também lê o `estornado` da cobrança (o `canceled_amount`/`refunded_amount` do
      Pagar.me, em centavos, que a sessão guarda): maior que zero é dinheiro que se mexeu, e o
      e-mail diz que está voltando. Com 100% dos cartões sendo reprovados, este caso era a regra e
      não a exceção.
- [ ] **Três pessoas já receberam a versão errada, antes da correção subir.** A varredura rodou às
      19:22 de 22/09 com o código antigo e mandou: `#7` e `#8` como "pix-vencido" (certo), `#10`
      como "estornado" (certo, era o Pix pago) e **`#9`, `#11` e `#12` como "sem-cobranca"** — as
      três compras no cartão reprovadas pela antifraude, as três dizendo "nada foi cobrado" pra
      quem viu o valor sair e voltar. Subir a correção **não reenvia**: o registro em
      `metadata.emails.cancelado` já está gravado nos três pedidos, e ele existe justamente pra
      ninguém receber duas vezes. Pra corrigir, só apagando o registro desses três à mão e deixando
      a varredura mandar de novo. Como são os amigos do teste, dá pra avisar por fora e deixar
      quieto — mas fica anotado que o que eles têm na caixa de entrada está errado.
- [ ] Frase da conta pro cartão reprovado depois do pedido nascer. Quando o antifraude responde na
      hora, a tela diz o certo (`RECUSAS.antifraude`, em `modules/pagarme/situacao.ts`); quando
      demora, o pedido nasce e é cancelado, e a conta mostra o genérico "Cancelado antes do
      pagamento." — pouco pra quem viu a cobrança ir e voltar no cartão. **O e-mail já não diz mais
      isso** (item acima); a tela da conta ainda diz.
- [x] Pix real de outra pessoa (22/09, pedido #10): pagou, a confirmação chegou — e ao cancelar e
      estornar **nenhum e-mail avisou o cliente**. O dinheiro saiu da conta dele e voltou sem uma
      palavra. Não era falha de envio: **o e-mail de pedido cancelado não existia** (nem o desenho,
      nem o gatilho). Escrito e ligado em 22/09 — ver "O e-mail de pedido cancelado sai", na Fase 5.
- [ ] Conferir o #10 no admin: o selo **Refunded** é o Medusa dizendo que PEDIU o estorno, não que
      ele aconteceu (foi exatamente assim no #6). Se a faixa vermelha do estorno estiver no fim da
      página, o dinheiro ainda não voltou.
- [ ] Depois do próximo deploy, cancelar um pedido de teste e conferir que o e-mail de cancelamento
      chega — as três versões (estornado, Pix vencido, cancelado antes do pagamento).
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

- [x] **Pix vencido não cancelava o pedido, e o estoque ficava preso** (visto no #7; resolvido em
      22/09). O pedido passou um dia em "Aguardando Pix" com a unidade reservada, e o log repetia,
      de 5 em 5 minutos, o 412 do `DELETE /charges/ch_…`: "This charge cannot be canceled because is
      pending". **O Pagar.me não cancela Pix pendente** — e Pix vencido continua `pending` lá, então
      o 412 não passava nunca; como o pedido só era cancelado DEPOIS do DELETE, nunca era. Agora
      ninguém manda DELETE em Pix pendente (nem a conciliação, nem o provedor, nem o subscriber de
      pedido cancelado). No lugar:
  - **Pix vencido:** cancela só o pedido aqui, e o estoque volta. Com os 10 minutos de folga de
    sempre, e relendo o pagamento antes — Pix pago no último minuto existe. O QR morre sozinho;
  - **pedido cancelado no admin com o Pix ainda valendo:** o QR continua pagável, e a sessão fica
    **vigiada**. Se a pessoa pagar, uma varredura nova (todo pedido cancelado dos últimos 7 dias)
    devolve o que entrou depois do cancelamento;
  - **cartão em análise** continua sendo cancelado lá; se vier 412, vira vigiado também;
  - **na conta**, o Pix que passou da hora deixou de dizer "Aguardando Pix": vira **"Pix vencido"**,
    com "O Pix venceu — o pedido vai ser cancelado" e "Ver pedido" no lugar de "Pagar o Pix". Quem
    estiver com a tela aberta vê a frase virar na hora, sem recarregar.
- [x] **Estorno de Pix que falha no Pagar.me não voltava pro Medusa** (visto no primeiro Pix real;
      resolvido em 22/09). Cancelar pedido pago no admin pede o estorno, o Pagar.me aceita
      ("Aguardando Cancelamento") e o Medusa marca Refunded na hora; se o estorno falha depois — o
      de Pix sai do **saldo disponível** —, a cobrança volta pra "Aprovada". Agora a conciliação
      confere todo estorno dos últimos 7 dias na cobrança, pelo dinheiro. Quando falha:
  - chega **um e-mail pra cada usuário do admin** ("O estorno do pedido #N não saiu"), com o valor
    e o código da cobrança pra achar no painel;
  - o pedido no admin mostra uma **faixa vermelha** com "Tentar o estorno de novo" — no fim da
    coluna principal, que é onde o Medusa 2.21 põe essas faixas; dá pra arrastar pro topo no
    ícone de controles do cabeçalho, e a escolha fica guardada;
  - estorno do pedido inteiro é **pedido de novo sozinho de 6 em 6 horas**, até 8 vezes; parcial,
    não (esse é pelo painel);
  - no log do Railway, as linhas `[estorno]`: o que falhou, o que foi pedido de novo, o que o
    Pagar.me confirmou.
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
- [x] **A API de pedido do Medusa mostrava endereço e CPF** a quem tivesse o id do pedido
      (22/09). O id está na URL da tela de obrigado e no link dos e-mails, e a chave publicável é
      pública. Agora o pedido inteiro só sai pra quem prova que é dono — o carrinho de onde ele
      nasceu, que a loja guarda no crachá de quem comprou, ou a conta dona; pra todo o resto, só o
      número e a situação. Na revisão apareceram mais duas portas, fechadas junto:
  - **o crachá da tela de obrigado era forjável**: era o próprio id do pedido, então bastava pôr um
    cookie `pedido=<id>` no navegador pra ver o endereço. Agora ele leva o carrinho, e quem confere
    é o Medusa;
  - **a troca de dono do Medusa** (`/store/orders/:id/transfer/request`): qualquer conta pedia a
    transferência de qualquer pedido e recebia o pedido inteiro na resposta. Fechada, junto com a
    devolução pela API (`POST /store/returns`), que também abria pelo id — a loja não usa nenhuma;
  - o efeito colateral, pequeno: quem comprou antes do deploy passa a ver a tela de obrigado sem os
    detalhes, mesmo no navegador da compra (o crachá antigo não tem o carrinho). Eles continuam na
    conta, entrando com o e-mail da compra.
- [x] **A tela de obrigado prometia e-mail que não saía** (22/09). O de pedido confirmado sai agora,
      uma vez por pedido pago (ver a fase 5), e a tela promete conforme o estado: pago, "enviamos os
      detalhes pra <e-mail>"; Pix esperando, "quando o Pix cair, a confirmação vai pra <e-mail>";
      cartão em análise, "com o pagamento aprovado, a confirmação vai pra <e-mail>"; cancelado ou
      pagamento a combinar, nada.
- [x] **O botão Check payment status não emite `payment.captured`** — continua não emitindo, mas o
      e-mail de confirmação já não depende dele (22/09): a varredura de 5 em 5 minutos acha o
      pagamento capturado sem evento e manda. A nota fiscal e o `purchase`, quando vierem, seguem o
      mesmo molde (ver a fase 5).
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
- [ ] Páginas que faltam — Blog, Contato e Dúvidas (hoje apontam pro `/em-breve`).
- [ ] **Minha conta**, em quatro partes (a quarta saiu da terceira). Protótipo aprovado:
      `apps/loja/ferramentas/porte/prototipo-conta.html`.
  - [x] 1. Entrar com código de 6 dígitos no e-mail, sem senha; o primeiro código cria a conta, e o
        cliente convidado de quem já comprou vira a conta (com os pedidos).
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
  - [x] 3. Endereços e meus dados (22/09), e o "Minha conta" do cabeçalho, do menu e do rodapé
        levando pra `/conta`. Endereços: o formulário do passo 2 do checkout (CEP primeiro), com
        principal, editar e excluir perguntando antes; o principal é o que o checkout abre.
        Meus dados: nome, celular, CPF ou CNPJ e as ofertas por e-mail e WhatsApp, que nascem
        desmarcadas e guardam a data do "sim". A visão geral ganhou os dois atalhos do pé.
  - [x] **O checkout conhece a conta** (22/09). Com a conta aberta, o carrinho passa pro nome dela
        e o que estiver vazio vem preenchido — o passo 1 de "Meus dados", o endereço principal —, então
        quem tem os dois cai direto na entrega. O pedido nasce na conta, e a compra deixa nela o
        endereço (principal, se for o primeiro) e o nome, celular e CPF que faltavam — só com a
        conta aberta: comprar sem entrar, com o e-mail de alguém, não escreve na conta dessa
        pessoa. **Sair leva a sacola junto** se ela já for da conta (senão a próxima pessoa do
        navegador compraria nela).
  - [ ] 4. Trocar o e-mail (código no e-mail novo; o de agora vale até confirmar) e excluir a conta.
        **O texto da exclusão precisa passar por quem cuida da parte jurídica** antes de ir ao ar
        — está no protótipo: "a gente apaga seus dados pessoais e sai da conta em todos os
        aparelhos; as notas fiscais continuam guardadas, como a lei manda".
  - [ ] **A política de privacidade não fala da conta** — os endereços e dados guardados, as
        ofertas por e-mail e WhatsApp com o consentimento, o cookie da sessão —, nem do Resend e do
        Pagar.me, que entraram depois dela. Vai junto do item 4, pela mesma revisão jurídica.
  - [ ] **As ofertas ainda não vão pra lugar nenhum:** a escolha fica no cliente do Medusa
        (`metadata.ofertas`, com a data), e nada manda oferta hoje. Quando a newsletter ou o
        WhatsApp de ofertas existirem, é de lá que sai a lista.
  - [ ] Achado de 22/09, **fora da conta aberta:** comprar SEM entrar, digitar um e-mail errado no
        passo 1 e depois corrigir pro e-mail de uma conta cria um cliente convidado novo, e o pedido
        não aparece na conta (o Medusa só liga à conta o carrinho que ainda não tinha cliente). Com a
        conta aberta isso não acontece mais — a troca de dono é pelo token. Pra quem compra sem
        entrar, dá pra juntar depois, no backend; é raro o bastante pra esperar.
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

- **O e-mail de pedido confirmado sai** (22/09), uma vez por pedido pago no Pagar.me: na hora em que
  o pagamento é capturado (Pix pelo aviso ou pela conciliação, cartão aprovado no checkout) ou pela
  varredura — o job `confirmar-pedidos`, de 5 em 5 minutos, nos minutos 2, 7, 12… —, que olha os
  pagamentos das últimas 24 horas e manda o que faltou. **No primeiro deploy**, ela manda a
  confirmação dos pedidos pagos nas 24 horas anteriores que ainda não foram postados (os postados
  ficam `dispensado`; cancelado não recebe). Como saber o que aconteceu:
  - no log do Railway, `[pedido] confirmação do #N pra r•••@…` é o e-mail que saiu. O que não saiu
    aparece como `[pedido] a confirmação do #N não saiu (…)` ou, na varredura,
    `[pedido] confirmações: … não saíram — #N (…)`, com o porquê entre parênteses ou na linha
    `[email]` logo antes; a rodada seguinte tenta de novo, e a chave de idempotência do Resend
    impede que saia duas vezes;
  - no admin, no JSON do pedido (fim da página), `metadata.emails.confirmado`: `email` (saiu, com o
    id do Resend), `dispensado` (não era pra sair: sem o Pagar.me, já postado ou sem e-mail) ou
    `recusado` (o Resend disse que o endereço não aceita e-mail — não se tenta mais).
- Nota fiscal (Bling) e `purchase` pro GA4 e pra Meta: o gancho é o mesmo do e-mail
  (`apps/backend/src/subscribers/pagamento-capturado.ts`), e o molde também — o
  `payment.captured` sozinho perde o "Check payment status" e pode sair duas vezes pro mesmo
  pagamento. Evento na hora, varredura embaixo, registro no pedido: `src/lib/confirmar-pedido.ts`
  é o exemplo.
- **O e-mail de pedido cancelado sai** (22/09), uma vez por pedido: no `order.canceled`, pelo
  `subscribers/pedido-cancelado.ts`, e pela mesma varredura de 5 em 5 minutos do `confirmar-pedidos`
  (últimas 24 horas). Ele diz três coisas diferentes, e a escolha está em `src/lib/avisar-cancelamento.ts`:
  **estornado** (houve pagamento capturado — "o valor está voltando", com o caminho de volta do Pix
  ou do cartão), **Pix vencido** (o QR passou da validade sem pagamento) e **cancelado antes do
  pagamento**. A pergunta é feita à CAPTURA, e não ao estorno: o admin cancela e estorna em dois
  cliques, o evento chega entre um e outro, e ler o estorno mandaria "nada foi cobrado" pra quem
  acabou de ver o dinheiro sair da conta. O registro fica em `metadata.emails.cancelado`, e o log é
  `[pedido] cancelamento do #N (motivo) pra m•••@…`.
  - **Por que ele existe:** o #10. Um Pix pago de verdade, cancelado e estornado no admin, e o
    cliente não recebeu uma palavra — viu o dinheiro sair e voltar sem explicação. O e-mail de
    confirmação existia desde o começo; este nunca tinha sido escrito.
  - **A ponta que fica:** Pix pago DEPOIS do cancelamento (o QR continua pagável até vencer — ver o
    #7). Na hora do cancelamento o `fecharCobrancasDoPedido` do subscriber pega o que já tinha
    entrado e avisa certo; o que cair mais tarde é estornado pela conciliação, mas o e-mail daquele
    pedido já saiu dizendo "nada foi cobrado" e o registro impede um segundo. É raro e é conhecido.
- Os e-mails do caminho da encomenda (`envio.ts`) já saem.
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
