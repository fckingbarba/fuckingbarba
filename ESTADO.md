# Estado do projeto — e o que vem a seguir

Atualizado em 22/09/2026, com o Pix vencido que prendia o estoque consertado (o #7 — ver o primeiro
achado da revisão do pagamento) e a Minha conta de pé na loja: endereços, meus dados, o checkout que
abre preenchido pra quem está na conta (e guarda o endereço da compra), e o "Minha conta" do
cabeçalho apontando pra ela. No mesmo dia, o estorno que o Pagar.me não faz (a conciliação confere,
avisa e pede de novo), a API de pedido fechada pra quem só tem o id, o e-mail de pedido confirmado
ligado, as páginas de Contato e Dúvidas no lugar do `/em-breve`, a busca de verdade na lupa do
cabeçalho, o checkout mais enxuto (com o logo da bandeira no campo do cartão), a categoria
estática e o CI medindo a loja com produto; em 21/09, o conserto do cache e o rastreio da Frenet
chegando no pedido, na conta e no e-mail. O AGENTS.md diz **como** trabalhar aqui; este arquivo diz
**onde** o projeto está. Leia os dois antes de começar e, ao terminar uma tarefa, atualize este: o
que mudou de estado, o que saiu da lista, o que entrou.

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
- [x] O Pix do #6, cujo estorno tinha falhado: **o dinheiro voltou** (22/09). Era o único estorno
      pendente. O caminho que nasceu dessa falha continua de pé pro próximo — a conciliação confere
      todo estorno dos últimos 7 dias, avisa a equipe por e-mail, põe a faixa vermelha no admin e
      pede de novo de 6 em 6 horas (ver o achado do estorno mais abaixo). Nada a mexer no Medusa.
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
- [x] **Antifraude reprovando compra legítima: o Pagar.me respondeu (22/09), e não é defeito
      nosso.** A `ch_JdkpjxImnTx1GDej` foi reprovada por ser compra **com os dados do próprio
      titular da conta** — o Pagar.me lê isso como teste e barra por regra. As outras duas caíram
      na análise normal do antifraude, que é estatística (histórico do e-mail, dados da transação,
      comportamento de compra): nem o suporte consegue dizer qual regra pegou cada uma, e falso
      positivo acontece. A orientação deles é **seguir vendendo pra clientes de verdade** —
      conforme o histórico legítimo cresce, o antifraude se ajusta ao perfil da loja; se as
      recusas continuarem altas, dá pra pedir uma calibração. Ou seja: os 100% de reprovação eram
      o teste, não a conta. Teste de integração vai pro **sandbox**, nunca na chave de produção —
      é o que o `ferramentas/pagarme-falso.mjs` já faz, com cartão que aprova
      (`4000000000000010`), cartão que recusa (`4000000000000028`) e CPF que cai na antifraude
      (`11111111111`).
- [ ] Decidir o `auth_and_capture` — a conversa que travava essa decisão já aconteceu. Hoje a loja
      captura junto com a autorização, então quando o antifraude dá falso positivo o valor **sai e
      volta** na fatura de quem comprou de verdade. Autorizar primeiro e capturar depois da análise
      troca isso por "o valor nem saiu", que é melhor pro cliente — e o Pagar.me já avisou que falso
      positivo vai acontecer. O custo é um passo a mais no fluxo e uma janela em que o pedido existe
      com o dinheiro só reservado. Não é urgente; é uma escolha que antes estava travada e agora
      não está.
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
- [x] **A conta não diz mais "Cancelado antes do pagamento." pro cartão que foi e voltou** (22/09).
      Quando o antifraude reprova depois de capturar, o Medusa nunca registra pagamento nem
      estorno — mas a sessão guarda o que o Pagar.me devolveu (`estornado`, em centavos). A conta
      passou a ler isso também (`devolvidoNoPagarme`, em `apps/loja/src/lib/pagamento.ts`), igual
      ao e-mail de cancelamento: o pedido aparece como "Cancelado, com o pagamento estornado.", o
      pagamento como "Cartão … — estornado", e o detalhe diz que o valor pode aparecer nesta fatura
      ou na próxima.
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
      e-mail, horário e prazo de postagem. **Hoje nenhum está preenchido em produção**: o rodapé
      mostra "Entrar em contato" sem nada embaixo, e o `/contato` tem só o Instagram como canal
      (mais seis tarjas de pendente). Preenchido, tudo aparece sozinho — nada a mexer no código.
- [ ] Catálogo da Nuvemshop (fase 2). **Com ele importado, conferir o teto:** a `/produtos` lista
      até 48 produtos, e a busca vê exatamente essa lista (`apps/loja/src/lib/busca.ts`). Os quinze
      da Nuvemshop cabem com folga; passando de 48, a `/produtos` precisa de paginação e a busca vai
      pro backend, com o acento resolvido lá.
- [x] **Contato e Dúvidas no ar** (22/09), no lugar do `/em-breve` — o rodapé já leva pras duas. O
      `/contato` mostra os canais que o admin tiver (WhatsApp, e-mail, horário) e os dados da
      empresa, com a tarja de pendente no que falta; o Instagram entra sempre, porque é da marca.
      O `/duvidas` tem 15 perguntas sobre a loja (16 quando há política de frete), montadas das
      configurações em `apps/loja/src/conteudo/duvidas.ts`: mudou a política no admin, mudou a
      resposta. Nenhuma resposta cita canal (todas mandam pro `/contato`), e o que a loja ainda não
      cumpre ficou de fora — a lista está no fim do arquivo. O `conferir-links` confere as duas e
      que o JSON-LD das dúvidas é exatamente o que a tela mostra.
- [x] **A busca funciona** (22/09): a lupa do cabeçalho leva pro `/busca?q=…` em vez do
      `/em-breve`. Acha sem acento ("oleo" → Óleo), em qualquer ordem ("barba oleo"), com plural
      ("oleos") e palavra pela metade ("fat" → Fator); o título pesa mais que a categoria, que pesa
      mais que a descrição. A peneira é na loja e não no Medusa — o `q` de lá é um `ILIKE` que erra
      as três primeiras — e o porquê está no topo de `apps/loja/src/lib/busca.ts`. A página fica fora
      do Google (`noindex`) e do sitemap, e o `conferir-links` busca um produto de verdade pelo
      endereço dele, sem acento.
- [x] **O "Blog" saiu do rodapé** (22/09) até o blog existir — o conteúdo é o da Nuvemshop, que vem
      com a migração.
- [x] **O "Carrinho" do menu do celular abre a sacola** (22/09), como o ícone do cabeçalho — levava
      pro `/em-breve` com a sacola já funcionando. Sem JavaScript, o link vai pro checkout. Com isso,
      nenhum link de navegação leva mais pro `/em-breve`.
- [x] **O que o site promete sobre envio sai do admin** (22/09). O passo 3 dizia "Envio imediato", o
      resumo "Enviamos em até 1 dia útil" (os dois na mesma tela, discordando) e o card de produto
      alternava "Frete grátis" com "Envio imediato". Agora o passo 3 e o resumo dizem "Postagem em
      <prazo de postagem do admin>", e somem enquanto ele estiver vazio; o card ficou só com a
      política de frete. "Suporte no WhatsApp" também só aparece com um WhatsApp configurado. **Hoje,
      em produção, nenhum dos dois está preenchido** — o passo 3 mostra só "Compra segura".
- [x] **O checkout mais enxuto, por escolha da loja** (22/09): saíram o "7 dias pra trocar ou
      devolver" do resumo, a lista de bandeiras embaixo do cartão e a explicação "Estes campos não
      passam pelo servidor da loja…". O caminho do cartão não mudou (campos sem `name`, token do
      Pagar.me) — só não é mais texto na tela. A desistência continua publicada onde a lei pede
      (Decreto 7.962/2013, art. 5º): o `/trocas`, no rodapé de toda página, e as Dúvidas.
- [x] **O "7 dias pra desistir" saiu também da vitrine** (23/09), pelo mesmo motivo do checkout:
      a esteira de avisos, os selos do rodapé, o fecho da home, as garantias da caixa de compra e a
      linha do pedido entregue na conta. Nas Dúvidas ficou UMA resposta ("Posso desistir da
      compra?"), curta, com o artigo do CDC e o link pro `/trocas` — o Decreto 7.962 pede o direito
      de arrependimento informado com clareza, e é ali, no `/trocas` e no rodapé, que ele fica. As
      garantias da caixa de compra viraram três; a que sobra na última linha ocupa a linha inteira.
- [x] **A lista do celular de 23/09**, conferida numa loja local em computador e celular:
  - A faixa de cima do Safari no iPhone (a da hora) abre **preta**; era menta até a pessoa rolar.
    O Safari 26 ignora o `theme-color` e pinta a faixa com o fundo do body, então o body virou
    preto e o fundo que se vê é pintado por baixo (`--fundo-da-pagina`, no `globals.css`). O
    `theme-color` também é preto, pro Chrome do Android. **Conferir no iPhone**: aqui não há
    simulador de iPhone.
  - O checkout ocupa a largura do celular — ficava com uns 280px no meio da tela, com cinza sobrando
    dos lados (a margem automática encolhia a página até o tamanho do conteúdo). O carregamento tem
    a cara da página: título, os três passos, os campos e a barra do resumo, no lugar das duas tiras
    brancas estreitas.
  - A sacola não abre mais com "Não consegui falar com a loja agora": a atualização automática do
    frete, quando falha (aba aberta de antes de uma atualização do site, Frenet demorando), fica
    quieta e deixa o CEP e o "Calcular" à mão; o recado só aparece se a pessoa clicar e der errado.
  - PDP: a quantidade só muda pelo − e pelo + (não é mais campo); a economia virou texto do lado do
    riscado, "Economiza R$ …", sem etiqueta; a foto ampliada abre no centro (o reset do Tailwind
    tirava a margem que centraliza o `<dialog>`).
  - O "Comprar" dos cards (vitrine, categorias, relacionados), do Alta Performance e o "Comprar
    agora" do banner põem uma unidade na sacola e abrem a gaveta, sem sair da página. Produto com
    variação pra escolher, ou sem estoque, continua levando pra página dele.
  - Sem zoom ao tocar num campo no iPhone: os campos já têm 16px no celular, e o viewport ganha
    `maximum-scale=1` só no iPhone e no iPad — lá a pinça continua funcionando; no Android o mesmo
    atributo travaria a pinça, e por isso não vale pra todos.
- [x] **A terceira lista de 23/09** (conferida numa loja local, no computador e no celular):
  - O card da vitrine não perde mais a borda esquerda com o mouse em cima: ele sobe 4px, e o
    carrossel, que rola, cortava o que saía dele. O trilho ganhou respiro (`colecao.css`).
  - Os logos das bandeiras são os **oficiais** (Visa, Mastercard, Amex, Elo e Hipercard), no rodapé
    e no campo do cartão, em arquivo (`public/bandeiras/`, do projeto payment-icons, MPL-2.0), com
    os cantos retos da marca. O Pix do passo 3 é o símbolo oficial do Banco Central, no verde-água
    do manual.
  - O passo 3 do checkout ficou sem a faixa "Compra segura". A faixa só volta com prazo de postagem
    ou WhatsApp preenchidos no admin (as duas frases que sobraram nela).
  - **"Leva junto" na sacola**, como no protótipo: até três produtos que ainda não estão na sacola,
    com foto, preço e "+ Adicionar". Faltando valor pro frete grátis, o mais barato que fecha a
    conta vem primeiro, com a etiqueta "Libera o frete grátis". Só entram produtos de uma variação,
    com preço e estoque.
- [x] **O logo da bandeira aparece no fim do campo do número do cartão** (22/09), no lugar da
      etiqueta de texto. A detecção (`apps/loja/src/lib/cartao.ts`) agora usa as faixas de seis
      dígitos da Elo e da Hipercard, e conhece as bandeiras que a loja não aceita (Diners,
      Discover, JCB) — antes, todo Visa começando com 4011 era chamado de Elo, e um Discover
      ganharia o logo da Elo. Enquanto o número ainda pode ser de duas bandeiras, nenhum logo
      aparece: na prática, Visa no segundo ou terceiro dígito, Elo e Hipercard no sexto. Os logos
      são SVG desenhados na loja (`components/bandeira.tsx`).
- [x] **O campo do número do cartão perdia o foco no primeiro dígito** (achado e resolvido em 22/09).
      O espaço da bandeira entrava e saía da tela junto com ela, e o `Campo` trocava o input de
      lugar — o React montava outro, e quem digitava perdia o cursor bem quando a bandeira aparecia
      (o mesmo bug que o CEP já tinha tido). Agora o espaço fica sempre montado, vazio até a
      bandeira. O `conferir-checkout` digita tecla por tecla e confere o foco.
- [x] **O CI mede a loja com produto — e passa** (22/09). Sem Medusa no CI, o build saía com o
      catálogo vazio e o Lighthouse media um `/barba` "sem produto": o CLS de 0,09 era o rodapé
      pulando quando o esqueleto dava lugar ao aviso de vazio, e o LCP de 3,2s era o texto desse
      aviso. (O PR #6 não tinha piorado nada: o run "verde" de antes dele tinha os mesmos números;
      passou porque o CI fica com a melhor de duas medições, e uma escapou do pulo.) Agora o job sobe
      `apps/loja/ferramentas/medusa-falso.mjs` — só leitura, os seis produtos de verdade, fotos
      desenhadas na hora — e mede a grade de verdade: CLS 0, LCP 2,86s no `/barba` e 2,93s na home,
      desempenho 0,95. Medindo com produto, ele achou um problema real que o vazio escondia: a grade
      pulava do `h1` pro `h3` (o nome do card), e a acessibilidade dava 0,98 — ganhou um `h2`
      "Produtos" só pra leitor de tela.
- [x] **A categoria virou página estática** (22/09). Ler o `?ordem=` a tornava dinâmica (esqueleto,
      streaming, rodapé pulando, LCP atrás dos scripts). Agora `/barba` é a relevância e o
      `proxy.ts` troca `/barba?ordem=barato` por `/barba/ordem/barato`, gerada no build, sem mudar o
      endereço; o mesmo pra `/produtos`. De brinde, a categoria e a lista inteira passaram a
      funcionar com JavaScript desligado — a PDP continua precisando dele (README da loja).
- [x] **Os selos de "Compra segura" do rodapé redesenhados** (22/09) — e o motivo de estarem feios:
      a etiqueta "Principal" dos endereços da conta também se chamava `.selo`, e o CSS da conta,
      carregado depois, vencia (`inline-block`, maiúsculas, borda). O rodapé nunca tinha mostrado o
      desenho dele. Agora são `selos__item`: sem borda (a borda com chanfro quebrava nos cantos),
      ícone numa caixinha menta. Ao lado de "Cartão em até 3x sem juros", os logos das cinco
      bandeiras — os mesmos do campo do cartão, da mesma lista.
- [x] **O zoom do iPhone ao tocar num campo** (22/09): a busca do cabeçalho, o CEP da sacola, o CEP
      da página de produto, o e-mail de novidades e o "ordenar por" tinham letra abaixo de 16px, e o
      Safari dava zoom na página inteira. Agora 16px em tela de toque; no computador, nada mudou.
- [x] **LCP abaixo de 2,5s** (22/09). O PageSpeed do Google media a produção em 2,2s na home e
      2,5s no `/barba` — no limite. **O CSS de uma tela só saiu do `globals.css`**: toda página
      baixava ~35 KB de CSS antes de pintar, e menos da metade era dela (o resto era PDP, checkout
      e conta). Agora cada uma importa o seu por `src/estilos/telas/`; as migalhas ganharam
      `migalhas.css` (sai do `agrupa-pdp.py`) porque aparecem na categoria e na busca. Conferido
      regra por regra contra o HTML de cada página, e por print antes/depois em 23 páginas,
      celular e computador, com sacola, menu e busca abertos. **O logo do rodapé virou arquivo**
      (`public/marca/logo-completa.svg`, carregado quando aparece): eram 18 KB de desenho no HTML de
      toda página, duas vezes. **A foto principal** (banner, galeria, primeiro card da grade) pede
      prioridade alta de verdade — o `priority` do Next 16 só punha um preload de prioridade
      baixa. E **o CI mede por HTTP/2, como a Vercel entrega** (`ferramentas/https-local.mjs`), e
      reprova LCP acima de 2,5s (era 3,0s): em HTTP/1.1 ele somava meio segundo que a produção não
      tem. Com o Medusa falso, em HTTP/2: home 2,41 → 2,18s; `/barba` 2,26 → 2,11s; PDP 2,48 →
      2,18s.
- [x] **O preço da PDP: o que se paga vem primeiro** (22/09). Grande na frente, o "de" riscado
      depois e, ao lado, o selo "Economizou R$ 25,00" — a diferença entre os dois preços do
      Medusa, e só quando existe o riscado — que, com o desconto por quantidade (abaixo), vale pra
      qualquer quantidade: o cheio da unidade vezes quantas. O selo é o do protótipo, que tinha
      saído dele; o CSS continuava lá. Em 23/09 virou texto, "Economiza R$ 25,00", sem etiqueta.
- [x] **Desconto por quantidade no lugar dos kits** (22/09): "2 unidades" é o MESMO produto com
      quantidade 2 — um SKU, um estoque —, e vale pra todo produto: 4% a menos levando 2, 6%
      levando 3 ou mais, arredondado pra baixo até o ",90" (no de 3, o ",90" que divide em
      centavos: o Fator fica R$ 152,90 e R$ 222,90). Quem cobra é o Medusa, pela quantidade da
      linha — ao adicionar, ao mudar na sacola, no checkout —, com a lista "Desconto por
      quantidade" que o job `precos-por-quantidade` refaz de 15 em 15 minutos a partir do preço
      atual (mudou o preço no admin, as faixas acompanham). A PDP pergunta os preços em
      `/store/precos-por-quantidade`, que usa a mesma conta do carrinho. Na tela: "Quantas
      unidades", e os cartões e o seletor de quantidade são a mesma coisa (clicar em "2 unidades"
      põe 2 no seletor; 4 ou 5 pagam o preço do de 3). Testado de ponta a ponta num Medusa local:
      o carrinho cobra exatamente o que a página mostra. Os textos dos kits ("Dois meses de
      tratamento…") saíram com eles; os cartões dizem quanto se economiza.
- [ ] **Aposentar os dois kits do Fator** (produtos "Kit 2/3 frascos"), que a página não usa mais:
      no admin, mudar os dois pra Rascunho — ou, no Shell do Railway, de `.medusa/server`,
      `npx medusa exec ./src/scripts/precos-por-quantidade.js` (faz as faixas e passa os kits pra
      rascunho). Publicados eles não aparecem em lugar nenhum da loja; é só arrumação.
- [x] **A PDP parou de pular, e sai pronta do build** (22/09). CLS 0,45 → 0: a página inteira vinha
      por streaming atrás de um esqueleto da altura da dobra, e o rodapé aparecia logo embaixo e era
      empurrado quando as seções chegavam. Agora os produtos do catálogo são pré-renderizados
      (`generateStaticParams`) e a página não tem mais `<Suspense>` — com ele, até a página estática
      saía em duas etapas, e o React 19 segura a troca em lotes de 300 ms (LCP de 2,55s). Handle fora
      da lista é montado na hora, inteiro, e o que não existe responde 404 de verdade (antes era 200
      com noindex). Junto, os dois reprovados de acessibilidade da PDP: o contraste do preço "de"
      (opacidade 0,5 → 0,7 na fonte do `pdp.css`: 3:1 → 5,3:1) e o selo "-31%" dentro do botão da
      foto, que agora é `aria-hidden` (o desconto já está no preço). A PDP entrou no Lighthouse do
      CI. Com o Medusa falso: LCP 2,48 → 2,18s, desempenho 0,77 → 0,99, acessibilidade 0,96 → 1.
- [x] **A newsletter do rodapé guarda de verdade** (23/09). Antes o envio era interceptado e a
      pessoa era avisada de que nada tinha sido guardado. Agora o e-mail vai pro Medusa (módulo
      `newsletter`) com a data do consentimento e a origem, e aparece no admin em **Newsletter**:
      a lista, o botão **Baixar CSV** (abre certo no Excel) e **Remover** pra quem pedir pra sair —
      remover apaga, como a Política de Privacidade promete. Mesma resposta pra quem já estava na
      lista (o formulário não revela quem é cliente) e limite por IP contra robô. Testado de ponta a
      ponta num Medusa local. Quando houver ferramenta de e-mail marketing, é importar o CSV dela.
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
  - [x] 4a. **Trocar o e-mail** (23/09), em Meus dados: o "Trocar" do lado do e-mail pede o
        endereço novo e manda o código de 6 dígitos pra ELE — até o código voltar certo, o de agora
        continua valendo. A troca muda a chave de entrar e o cliente juntos, e a sessão segue aberta;
        o endereço antigo recebe um aviso ("seu e-mail mudou", com o novo escrito e sem link). E-mail
        que já é de outra conta não entra — e a tela só diz isso depois do código certo, pra troca
        não virar um jeito de descobrir quem é cliente. Até 5 códigos de troca por hora por conta.
        Os pedidos já feitos continuam com o e-mail da compra. Testado de ponta a ponta num Medusa
        local (29 checagens novas no conferidor da conta, seção 15b).
  - [ ] 4b. Excluir a conta. **O texto da exclusão precisa passar por quem cuida da parte
        jurídica** antes de ir ao ar — está no protótipo: "a gente apaga seus dados pessoais e sai
        da conta em todos os aparelhos; as notas fiscais continuam guardadas, como a lei manda".
  - [ ] **Devolver uma conta trocada sem o dono** (alguém com a conta aberta num aparelho esquecido
        troca pro e-mail dele): o aviso chega no endereço antigo, mas desfazer hoje é pelo banco — o
        admin do Medusa muda o e-mail do cliente, não a chave de entrar (a identidade `codigo`). Se
        um dia acontecer, é uma ação no admin.
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
        virada, com os últimos pedidos. Quando entrar, as Dúvidas podem responder "comprei na loja
        antiga, cadê meu pedido?" — hoje não respondem, de propósito (`conteudo/duvidas.ts`).
  - [ ] Numeração: decidido que os pedidos novos começam depois do último da Nuvemshop (nada de dois
        "#28"). **Falta você dizer o número** do pedido mais recente de lá.
- [ ] O checkout não pede mais aceite das regras de troca (a linha embaixo do botão de pagar saiu
      no enxugamento de 21/09), e desde 22/09 também não fala mais em desistência. As regras seguem
      publicadas no `/trocas`, com link no rodapé.
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
  é o exemplo. Com a nota saindo, a pergunta "recebo nota fiscal?" entra nas Dúvidas
  (`apps/loja/src/conteudo/duvidas.ts`) — antes disso, ela prometeria o que não sai.
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
