# Estado do projeto — e o que vem a seguir

Atualizado em 23/09/2026, à noite: **a fase 5 (Operação) está quase fechada** — o que falta está no
topo da seção 4. Em 23/09 o Bling foi conectado (estoque, catálogo e a nota fiscal, que sai 5
minutos depois do pagamento — ver 1c), e o token de parceiro da Frenet entrou no Railway, junto com
o `MEDUSA_BACKEND_URL` (ver 1b): o pedido pago passa a ir sozinho pro painel da Frenet. E o cartão
passou a ser cobrado só depois da análise de fraude — a compra legítima que ela barra não aparece
mais na fatura (ver 1). No fim do dia, ficou decidido o **painel próprio da loja**, em
`dashboard.fuckingbarba.com.br`, com o protótipo aprovado (ver 4.5). Em 22/09, o Pix vencido que prendia o estoque foi consertado (o #7 — ver o
primeiro achado da revisão do pagamento) e a Minha conta ficou de pé na loja: endereços, meus
dados, o checkout que abre preenchido pra quem está na conta (e guarda o endereço da compra), e o
"Minha conta" do cabeçalho apontando pra ela. No mesmo dia, o estorno que o Pagar.me não faz (a
conciliação confere, avisa e pede de novo), a API de pedido fechada pra quem só tem o id, o e-mail
de pedido confirmado ligado, as páginas de Contato e Dúvidas no lugar do `/em-breve`, a busca de
verdade na lupa do cabeçalho, o checkout mais enxuto (com o logo da bandeira no campo do cartão), a
categoria estática e o CI medindo a loja com produto; em 21/09, o conserto do cache e o rastreio da
Frenet chegando no pedido, na conta e no e-mail. O AGENTS.md diz **como** trabalhar aqui; este
arquivo diz **onde** o projeto está. Leia os dois antes de começar e, ao terminar uma tarefa,
atualize este: o que mudou de estado, o que saiu da lista, o que entrou.

## No ar hoje

| Peça                          | Onde                                              | Estado                                                                      |
| ----------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------- |
| Loja (Next.js 16)             | Vercel — `fuckingbarba-loja.vercel.app`           | No ar, sem indexar. Domínio definitivo é a fase 6.                          |
| Backend (Medusa 2.21)         | Railway — serviço `@fuckingbarba/backend` + Redis | **Um serviço só, `WORKER_MODE=shared`** (ver abaixo).                       |
| Banco, imagens, Edge Function | Supabase (`us-east-1`)                            | `webhook-pagamento` publicada.                                              |
| Frete                         | Frenet                                            | Econômica e expressa; emergência R$ 20 / 7 dias úteis. Rastreio no ar (1b). |
| Pagamento                     | Pagar.me, **chave de produção**                   | Pix (30 min) e cartão em até 3x sem juros. Checkout aberto desde `a6165ae`. |
| Nota fiscal e estoque         | Bling                                             | Conectado em 23/09. A nota sai 5 minutos depois do pagamento (ver 1c).      |

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
- [x] **A Stone ajustou a análise de fraude (23/09, à noite).** A Stone Digital respondeu por
      e-mail que ajustou a análise "ao modelo de negócio" da loja, valendo dali em diante — sem
      garantia de aprovar tudo; se as recusas continuarem, eles acompanham. A prova é uma compra no
      cartão de alguém de fora: compra com os dados do titular da conta continua barrada por regra
      (a resposta de 22/09, acima).
- [x] **O cartão só é cobrado depois da análise de fraude** (decidido e feito em 23/09). Antes, a
      loja cobrava junto com a autorização (`auth_and_capture`), e quando a análise reprovava uma
      compra de verdade o valor saía e voltava na fatura. Agora:
  - na compra, o cartão só é **autorizado**: o valor fica reservado no limite, fora da fatura;
  - a loja espera uns segundos pela análise. Aprovada, cobra na hora e o pedido nasce pago;
    reprovada, a tela pede outro cartão ou o Pix, e nada foi cobrado;
  - se a análise demorar mais que isso, o pedido nasce **"Pagamento em análise"** (a tela e a conta
    já diziam isso), e a loja cobra sozinha quando ela aprovar — pelo aviso do Pagar.me, em
    segundos, ou pela conciliação, em até 5 minutos. Reprovada depois, o pedido é cancelado, a
    reserva desfeita, e o e-mail diz que nada foi cobrado;
  - nota, Bling e Frenet continuam andando só com o pedido **cobrado**;
  - a análise manual (uma pessoa do Pagar.me, em até 48 horas úteis) cabe nos **5 dias** que a
    autorização vale; passados 3, o log avisa. Sem resposta nenhuma da análise em 10 minutos, a
    loja cobra assim mesmo, com uma linha no log — senão a venda morreria com a autorização;
  - a tela de obrigado e as Dúvidas ("Meu cartão foi recusado") explicam a reserva.
- [ ] **Depois do deploy — você:** no painel do Pagar.me, no webhook que já existe (o de
      `order.paid` e `charge.paid`, a mesma URL), marque também o evento
      **`charge.antifraud_approved`** — no modo produção e no modo teste. Sem ele tudo funciona,
      só que a cobrança do cartão que ficou em análise espera a conciliação (até 5 minutos) em vez
      de sair em segundos.
- [ ] **Na primeira compra de verdade no cartão**, o log do Railway deve trazer
      `[pagarme] or_… cobrado (… centavos) depois de a análise de fraude aprovar`. Se vier
      `sem resposta da análise de fraude em 10 minutos`, a análise não está chegando onde a loja
      procura (`antifraud_response`) — é caso pro Claude Code olhar, com o `conferir-cartao.mjs`.
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
- [ ] **A oferta do checkout virou do motor de recomendação (23/09), com 10% em qualquer
      produto.** Depois do deploy, o job `bumps` cria as promoções na hora cheia seguinte (no
      minuto 23) e desliga o `BUMP-OLEO` antigo; até lá, o checkout fica sem a caixinha — e não
      com uma caixinha que marca e desmarca. Pra não esperar, no shell do Railway:
      `cd apps/backend/.medusa/server && npx medusa exec ./src/scripts/promocoes.js` (responde
      "[bumps] 6 criada(s) … 1 desligada(s)"). Precisa do `REVALIDAR_SEGREDO` no Railway, que já
      existe (é o mesmo da revalidação).

### 1b. O rastreio da Frenet — você

**A Frenet respondeu em 23/09:** o aviso "Atualização de Tracking" só sai pros pedidos da
plataforma onde ele foi cadastrado — os que entram pela API de pedidos deles. **A etiqueta gerada
à mão no painel não avisa ninguém**, e o número digitado nela vai como nota fiscal, não como
pedido. Então, do jeito que a loja trabalha hoje, aviso nunca vai chegar.

**Por isso a loja passou a PERGUNTAR (23/09):** de hora em hora, pra cada pacote a caminho, o
backend consulta a Frenet (`POST /tracking/trackinginfo`, com o token da loja) e o pedido anda
sozinho — em trânsito, saiu pra entrega, entregue —, com os e-mails de sempre. A consulta pede o
serviço da entrega junto com o código: o pedido passou a guardar o da cotação na hora em que a
pessoa escolhe a entrega. Pra rodar na hora: `POST /admin/envios/consultar`.

**E o caminho da Nuvemshop está pronto, desligado (23/09):** com o token de PARCEIRO da Frenet, o
pedido pago entra sozinho no painel dela — endereço, itens e o serviço que o cliente escolheu —
como **FB-<número>** (o prefixo separa dos pedidos da Nuvemshop, que seguem na mesma conta). Quem
despacha só gera a etiqueta e posta; o aviso de rastreio volta, o pedido vira "enviado" e o
cliente recebe o "a caminho". Ninguém digita código nem marca nada. Pedido cancelado sai do
painel. O código: `apps/backend/src/lib/envios/registro.ts` (quando e quais) e
`apps/backend/src/modules/frenet/pedidos.ts` (o formato deles). Cada pedido leva o endereço do
aviso dele, assinado (`TrackingNotificationUrl`) — não depende de o webhook da conta valer pra
plataforma nova.

- [x] **O token de parceiro chegou e está no Railway** (23/09): a Frenet mandou, e você pôs o
      `FRENET_PARCEIRO_TOKEN` no serviço do backend. No mesmo dia entrou o `MEDUSA_BACKEND_URL`,
      que **não existia**: sem ele, os e-mails pra equipe (os do Bling, o do estorno que falhou)
      saíam sem o botão pro admin, e o pedido registrado na Frenet iria sem o endereço do aviso
      dele. O `FRENET_TOKEN` e o `FRENET_WEBHOOK_TOKEN` já estavam lá.
- [ ] **Conferir que o registro ligou, e o primeiro pedido pago depois dele:**
  - no log do Railway, a linha `[envio] registro de pedidos na Frenet ligado`, que diz desde
    quando ele vale. Ela sai na primeira rodada com o token — a varredura é de 10 em 10 minutos, e
    um pagamento também dispara. Se ela não aparecer, a variável não chegou no serviço no ar (no
    Railway, variável nova só entra no serviço com um deploy);
  - o registro vale pros pedidos **pagos dali em diante** (com 10 minutos de folga). Os pagos antes
    seguem pela etiqueta feita à mão — senão o mesmo pacote apareceria duas vezes no painel;
  - o primeiro aparece no painel como FB-<número> depois que a nota sai (com o Bling conectado, o
    registro espera a nota e leva o número e a chave dela), com o serviço escolhido. **A caixa vai
    como palpite** (o peso das variantes e os produtos empilhados, nunca menor que 16×11×2 cm) —
    corrigir no painel se a caixa de verdade for outra;
  - se a Frenet recusar um pedido (um endereço que ela não aceita, por exemplo), o log diz
    `[envio] o #N não entrou no painel da Frenet, e não vou tentar de novo` — esse vai à mão. Frenet
    fora do ar não é recusa: a varredura tenta de novo sozinha. Pra rodar a varredura na hora:
    `POST /admin/envios/registrar`;
  - **não criar envio no admin** pros pedidos que estão no painel: pedido com envio criado à mão
    fica fora do registro (é o sinal de que alguém já está cuidando dele).
- [ ] **Os pedidos pagos antes de o registro ligar** seguem como antes: depois de gerar a etiqueta
      no painel, copiar o código de rastreio pro pedido no admin do Medusa — criar o envio do
      pedido e marcar como enviado ("Mark as shipped") com o código. É isso que avisa o cliente ("a
      caminho") e põe o pacote na consulta de hora em hora.
- [x] **Railway:** `FRENET_WEBHOOK_TOKEN` criado no serviço do backend (21/09) e conferido: a rota
      responde 401 sem a chave e 200 ("ignorado") com ela. Continua valendo — é a porta dos avisos
      no dia em que os pedidos entrarem pela API de pedidos, e é dela que sai a assinatura do
      endereço do aviso de cada pedido.
- [x] **Frenet:** o webhook de rastreio foi cadastrado (resposta de 23/09), mas só vale pros pedidos
      da plataforma — ver acima.
- [ ] Pedidos de antes de 23/09 não guardaram o serviço da entrega: pra eles, o código dos Correios
      é consultado pelo PAC. Se o log mostrar `[envio] … pacote(s) sem resposta do parceiro` com
      "Serviço", é esse número (`PAC`, em `apps/backend/src/modules/frenet/rastreio.ts`).

Dois cuidados. **A conta da Frenet é a mesma da Nuvemshop:** a Frenet confirmou que o aviso da
loja própria não mexe na integração da Nuvemshop, que continua recebendo o rastreio dela — e, como
o aviso só vale pros pedidos da plataforma, os de lá não chegam aqui. **O e-mail sai uma vez por
momento** (a caminho, saiu pra entrega, esperando retirada, entregue); atraso, devolução e extravio
aparecem na conta e no log, sem e-mail automático — esses a loja conversa com o cliente.

### 1c. O Bling (estoque e nota fiscal) — você

**Pronto no código, desligado até conectar (23/09).** Decidido com você: o Bling manda no estoque
(entrada, produção e perda são lançadas nele, e a loja só copia o saldo); o pedido de venda vai pro
Bling quando o pagamento cai, e a nota **5 minutos depois** (a janela de cancelamento), direto pra
SEFAZ, e segue junto do pedido pro painel da Frenet; e nota autorizada de pedido cancelado vira
e-mail pra equipe, porque **a API do Bling não cancela NF-e** (a rota não existe — conferido de novo
em 23/09) — é no painel do Bling, em até 24 horas da autorização (Santa Catarina).

Como funciona, em uma linha cada:

- **Estoque:** a cada 5 minutos, e alguns segundos depois de cada aviso do Bling, a loja lê o saldo
  de cada SKU e copia. O pedido que já está no Bling não é descontado duas vezes. SKU que o Bling
  não tem fica como está, e a tela ERP do admin diz qual.
- **Nota:** pago o pedido, a loja acha (ou cria) o cliente pelo CPF e cria o pedido de venda
  **FB-<número>** na hora. Quando a janela fecha, gera a NF-e dele e manda pra SEFAZ, sem o e-mail
  do Bling pro cliente. A natureza de operação, o CFOP e os impostos são os da conta do Bling.
  Autorizada, a nota vai junto do pedido pro painel da Frenet (quando o token de parceiro chegar).
- **A janela de cancelamento (decidida em 23/09):** como o Bling não deixa cancelar nota pela API,
  a nota espera **5 minutos** depois do pagamento (começou em 2 horas; no mesmo dia, você baixou
  pra 5). Na prática sai entre 5 e 10 minutos depois, porque a varredura é de 5 em 5. Cancelado
  nesse meio-tempo, a loja cancela o pedido de venda no Bling sozinha — sem nota pra cancelar e sem
  e-mail; depois, a nota é cancelada à mão no Bling (o e-mail avisa) e o pedido de venda vai
  sozinho. Na tela ERP, **"Quando a nota sai"** muda a espera (na hora, 5, 15 ou 30 minutos, 1, 2
  ou 4 horas; vale também pra quem já está esperando), lista os pedidos esperando e tem **"Emitir
  agora"** pro que precisa despachar antes.
  A etiqueta da Frenet espera a nota. Não emita a nota à mão no Bling, senão ela sai duas vezes.
- **Deu errado:** nota rejeitada, pedido sem CPF, produto que o Bling não tem — um e-mail pra
  equipe, e a pendência na tela ERP. Nota corrigida e reenviada no Bling, a loja percebe sozinha.
  A nota de que a loja desistiu (o CPF faltava) tem o botão **"Tentar de novo"** na tela ERP, pra
  depois de alguém corrigir o pedido.
- **Cliente que o Bling já tinha:** a nota usa o cadastro do Bling (pelo CPF), e a loja atualiza
  esse cadastro com quem comprou agora: nome, endereço, e-mail — inclusive o "e-mail pra nota
  fiscal" — e telefone. Na primeira compra de teste (23/09) a nota saiu com o e-mail e o telefone
  de outra pessoa, de um cadastro antigo com o mesmo CPF; a loja não mexia nesses dois. Se o Bling
  recusar a atualização, a nota sai com o cadastro que está lá e a equipe recebe "Confira a nota
  do pedido #N". O "$" dos pedidos da Nuvemshop é da integração nativa do Bling com a loja
  virtual; o pedido da loja nova não tem (a loja guarda o número e a chave da nota do lado dela).
- **Falta permissão no app (403):** o Bling responde "sem permissão" quando o app não tem o escopo
  do recurso. Foi o que aconteceu no primeiro pedido de verdade (#14, 23/09): o pedido de venda
  nem chegou a ser criado — com todas as leituras liberadas: o app lia o cliente e não podia
  criar. A tela ERP tem **"Conferir as permissões"**, que diz qual escopo falta, pra ler e pra
  gravar;
  a nota fica esperando (não desiste), a equipe recebe um e-mail dizendo o escopo, e depois de
  marcar no app e **"Conectar de novo"** a loja tenta sozinha. Não emita à mão, senão a nota sai
  duas vezes.
- **Cancelado:** dentro da janela (ou com a nota ainda não autorizada), a loja cancela o pedido de
  venda no Bling, e apaga a nota pendente se houver. Com nota autorizada, o e-mail diz qual
  cancelar e até que horas; **cancelada a nota no Bling, a loja cancela o pedido de venda
  sozinha**, em até 5 minutos (o Bling deixa o pedido "Atendido" quando gera a nota, e cancelar a
  nota não mexe nele — foi o FB-15, em 23/09). Se o Bling recusar cancelar o pedido de venda, a
  equipe recebe "Cancele no Bling o pedido #N", a tela ERP mostra a pendência, e a loja segue
  tentando.
- **Pedidos de antes:** as notas automáticas valem pros pedidos pagos **depois da primeira
  conexão**. Os de antes seguem com a nota feita à mão, pra não sair nota em dobro.
- **Produtos (a importação, decidida em 23/09):** o Bling passa a mandar no catálogo do site —
  nome, descrição, preço, peso, medidas, fotos e quais produtos existem. Na tela ERP, "Importar
  produtos do Bling" abre uma **prévia**: cada produto ativo do Bling, o que acontece com ele no
  site, e os produtos do site que saem. Nada muda até "Trocar os produtos".
  - **Mesmo SKU:** o produto do site é reescrito no lugar, com o endereço e as categorias de hoje.
    Saem o subtítulo, os textos da página e o "de/por"; o preço passa a ser o do Bling. (Reescrito,
    e não apagado e recriado: o Medusa não apaga produto com pedido esperando envio, e assim a
    sacola de quem está comprando e os pedidos em andamento continuam valendo.)
  - **SKU que o site não tem:** entra em rascunho, sem categoria, pra alguém revisar e publicar.
  - **Sai do site:** o que nenhum produto marcado substitui (a prévia lista, e dá pra manter um).
    Com pedido esperando envio, vira rascunho em vez de sair.
  - Campo vazio no Bling (foto, peso, medidas, descrição) não apaga o do site. Sem preço ou sem
    SKU, o produto não entra. As fotos são copiadas pro Supabase Storage (o link do Bling vence).
  - A descrição do Bling vai pro Google e pra busca da loja: a página do produto não tem bloco de
    descrição. O desconto por quantidade e as ofertas do checkout se refazem na hora.
  - **Rodar de novo** (mudou preço ou nome no Bling): o "do zero" é só da primeira vez. Depois,
    muda nome, descrição, preço, peso e medidas; o subtítulo, os textos, as promoções e as fotos
    que a equipe pôs ficam.
- **Endereços e fotos da Nuvemshop (23/09):** na tela ERP, "Endereços e fotos da Nuvemshop" lê a
  loja antiga no ar (o mapa do site e a página de cada produto, sem senha) e casa pelo SKU. Cada
  produto daqui fica com o **mesmo endereço** de lá (`/produtos/<slug>` — o link que circula
  continua valendo quando o domínio vier) e com as **fotos da vitrine** de lá, copiadas pro
  Supabase Storage; o que está sem categoria ganha a de lá. A importação do Bling não troca mais
  essas fotos.

- [ ] **Conferir no Bling, antes de conectar** (com o contador, no que for fiscal):
  - certificado **A1** instalado (emitir pelo servidor exige o A1);
  - a natureza de operação **padrão de venda** com CFOP e tributação certos;
  - a NF-e em **produção**, não em homologação;
  - **o mesmo SKU** nos dois lados (FBOL01, FBKIT01…) — é por ele que a loja acha o produto;
  - as formas de pagamento **Pix** (tipo 17) e **cartão de crédito** (tipo 3) ativas pra
    recebimento. Sem elas, vale a forma padrão da conta.
- [x] **Criar o app privado:** Central de Extensões → Área do Integrador → Criar aplicativo.
  - URL de redirecionamento: `https://<api do Railway>/hooks/erp/bling/autorizado`;
  - escopos: produtos, estoques, contatos, pedidos de venda, notas fiscais (NF-e), formas de
    pagamento, situações e dados da empresa. **Mudar escopo depois revoga o acesso** — aí é
    conectar de novo;
  - webhooks (recomendado): servidor `https://<api do Railway>/hooks/erp/bling`, com os recursos
    de estoque e de nota fiscal. Sem eles, o estoque anda de 5 em 5 minutos, e a nota que
    demora na SEFAZ é buscada pela varredura.
- [x] **Railway:** `BLING_CLIENT_ID` e `BLING_CLIENT_SECRET` (os dois da aba "Informações do app").
      O deploy cria as duas tabelas do ERP sozinho.
- [x] **Conectar:** admin → ERP → "Conectar o Bling", entrando com o usuário administrador do
      Bling. A tela mostra a empresa, desde quando as notas saem e a primeira sincronização.
      Conectado em 23/09; a primeira sincronização atualizou 6 produtos.
- [x] **Trazer os produtos do Bling:** admin → ERP → "Importar produtos do Bling". Na prévia,
      desmarque insumo e embalagem e confira preço, peso, medidas e fotos. Troque num horário de
      pouco movimento: quem tiver na sacola um produto que sai vê o item indisponível. Feito em
      23/09.
- [ ] **Endereços e fotos da Nuvemshop:** admin → ERP → "Endereços e fotos da Nuvemshop". Confira
      na prévia o endereço de cada um (o de lá) e as fotos, e traga.
- [ ] **Publicar os rascunhos novos do Bling:** os produtos que o site não tinha entraram em
      rascunho, sem categoria. No admin, em Produtos, revise cada um, ponha a categoria e publique
      os que forem de vender — de preferência depois das fotos da Nuvemshop, logo acima.
- [ ] **Conferir o primeiro pedido pago de verdade:** FB-<número> no Bling, a nota autorizada, o
      estoque — e, agora com o token, o pedido no painel da Frenet (ver 1b). É a prova que fecha a
      fase 5 (ver a seção 4). O FB-15, de teste, já saiu com a nota autorizada (23/09).
- [x] **Cancelar à mão, no Bling, a nota do FB-15** — feito em 23/09, por volta das 21h (NF-e
      003321, do pedido de teste; o pedido já estava cancelado no admin).
- [ ] **Conferir no Bling que o pedido de venda 3336 (o do FB-15) virou "Cancelado".** Cancelada a
      nota, a loja cancela o pedido de venda sozinha em até 5 minutos — a varredura olha os pedidos
      cancelados dos últimos 7 dias. Se ele continuar "Atendido", é caso pro Claude Code.
- [ ] **O #14 foi cancelado?** A pendência dele na tela ERP ("A loja desistiu de emitir") sumiu
      sem explicação. Ela some quando o pedido é cancelado, ou quando alguém manda tentar de novo e
      a nota sai. Falta você dizer se ele foi cancelado; se não foi, conferir no Bling se o FB-14
      tem nota.

Dois cuidados. **O limite da API é da conta** (3 chamadas por segundo, somando a integração da
Nuvemshop): a loja faz no máximo 2,5, e espera e tenta de novo quando o Bling pede. **Desde abril
de 2026, pedido criado pela API conta no volume do plano do Bling** — vale olhar o plano.

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
- [x] **Duas escritas no `metadata` do mesmo pedido, no mesmo instante, apagavam uma à outra**
      (achado em 23/09 rodando o `conferir-pagamento`, consertado no mesmo dia). O Medusa lê o
      `metadata`, mistura na memória e grava a coluna inteira, sem trava: no #467 local, a oferta
      do checkout (`fb_bump`, gravada logo depois da compra) apagou o registro do e-mail de
      confirmação gravado uns 10 ms antes, e a varredura seguinte "mandou" de novo — a chave de
      idempotência do Resend segurou o e-mail repetido, e ninguém recebeu dois. O mesmo podia
      acontecer com o `fb_parceiro` (o pedido em dobro no painel da Frenet) e com o `estornos`.
      Agora todo registro no metadata do pedido passa por uma porta só
      (`apps/backend/src/lib/metadata-do-pedido.ts`): uma trava por pedido, a mesma pra todos, o
      metadata relido dentro dela e só a chave de quem grava indo pro Medusa. Contra o Medusa e o
      Postgres locais, cinco escritas juntas no mesmo pedido, 20 vezes: direto, 80 das 100 se
      perderam; pela porta, nenhuma. Nada a fazer depois do deploy. Fica de fora o JSON do pedido
      editado à mão no admin do Medusa, que grava pelo caminho do próprio Medusa: não edite o
      metadata de um pedido que ainda está andando (pagamento, cancelamento, envio).

### 3. Pendências da loja

- [ ] Medidas reais das caixas (vêm da Bling) no lugar da `CAIXA_PROVISORIA` 10×5×8 em
      `apps/backend/src/scripts/medidas.ts`.
- [ ] Rua e número da origem (CEP 89036370) em `apps/backend/src/scripts/origem.ts`, pra etiqueta.
- [ ] Apagar os dois rascunhos duplicados de óleo no admin.
- [ ] **O "Leve junto" da caixa de compra da PDP vai ser escolha do admin, por produto, e
      exclusiva com os cartões de quantidade** (o "order bump" da PDP): ou um, ou o outro — os dois
      juntos deixam a caixa grande demais (decidido em 23/09, pra fazer depois). Hoje as duas
      coisas são independentes no widget da PDP (a chave "kits" e a lista de produtos que
      combinam), e o Leve junto só aparece com produtos escolhidos — nenhum tem, então não aparece
      em lugar nenhum. Quando for feito, os produtos dele podem sair do motor de recomendação, como
      nos outros cross-sells, e o admin só decide qual dos dois a caixa mostra.
- [x] **O frete da sacola cotava duas vezes com 2 ou mais unidades** (achado e consertado em
      23/09). A rota `/store/frete` declarava à Frenet o valor cheio (2 × R$ 49,90 = R$ 99,80) e o
      Medusa, o valor com o desconto por quantidade (R$ 94,90): perguntas diferentes, duas cotações
      onde o `cotar` devia juntar numa. E não era só o centavo do seguro — o frete grátis da lista
      era decidido sobre o valor cheio: num teste local com piso de R$ 139,90, 3 shampoos
      (R$ 138,90 no carrinho, R$ 149,70 cheios) apareciam "Grátis" na gaveta com o pé cobrando
      R$ 23,70. Agora, quando a sacola manda o `cart_id`, a rota lê o valor e os itens do CARRINHO,
      pelas mesmas funções do provider (`somaDosProdutos` e `itensPraCotar`, no `client.ts`), e o
      valor fecha no centavo (3 × R$ 46,30 dava 138,89999999999998, abaixo de um piso de
      R$ 138,90). O `client.unit.spec.ts` trava a pergunta igual.
- [x] **A calculadora da PDP somava o preço cheio** com 2 ou mais unidades (visto e consertado
      junto, em 23/09). Sem carrinho, a rota somava o preço de uma unidade: 3 shampoos declaravam
      R$ 149,70 e decidiam o frete grátis por esse valor, com o carrinho cobrando R$ 138,90 — com
      piso de R$ 139,90, a PDP dizia "Grátis" e o checkout cobrava o frete (e oferta vincula, art. 30
      do CDC). Agora a rota monta as linhas que o carrinho teria: a mesma variante numa linha só, e
      o preço pedido com a quantidade (`calculated_price` com `quantity`, que é como o Medusa
      escolhe a faixa). `conferir-frete` 70/70; as cinco conferências novas (parte 8½, com o piso
      entre a faixa e o cheio, pela sacola e pela PDP) falham no código de antes.
- [x] **Home: a seção "O cuidado que impõe presença" ficou enxuta, e aceita vídeo** (23/09).
  - O texto caiu de quatro parágrafos e dois gritos pra dois parágrafos e um grito, e tudo —
    título, texto, números e o botão — foi pro lado da foto. A seção foi de 759 pra 525px no
    computador e de 1247 pra 903px no celular (com um vídeo em pé: 640 e 1102px).
  - **O vídeo sobe pelo admin**, em Configurações da loja → Home → "Vídeo da história da marca".
    Entra no lugar da foto, e a foto vira a capa até ele começar. Toca sozinho e sem som quando a
    pessoa chega na seção (e só baixa aí), em loop, com botão de pausar — e de ligar o som,
    quando o vídeo tem som. MP4, de preferência em pé; .MOV do iPhone é recusado com o aviso de
    exportar como MP4. "Tirar o vídeo" volta a foto.
  - O `conferir-configuracoes` voltou a passar: lia a tela uma vez só, e a primeira visita
    depois de salvar no admin ainda vem com a versão velha (a loja refaz a página no fundo). E
    parou de apagar o frete de emergência ao restaurar a política.
  - [ ] Subir o vídeo quando ele existir, e conferir no celular.
  - [ ] Conferir os números da seção: "2016", "+1M clientes impactados" e "BR presença nacional"
        estão marcados como CONFERIR desde o protótipo (`apps/loja/src/conteudo/home.ts`), junto
        do "+1.000.000 clientes satisfeitos" do bloco do meio. Se o +1M for alcance nas redes, e
        não cliente, o rótulo precisa dizer isso.
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
  - E a segunda lista, da PDP: os cartões de quantidade apareciam **sem nenhum marcado** depois de
    ir de uma PDP pra outra pelo site (o Next guarda a PDP anterior escondida no documento, e os
    rádios das duas tinham o mesmo nome — viravam um grupo só; agora o nome é de cada página, e o
    campo do CEP também tem id próprio). A "rotina" não mostra mais "Na sacola." (a gaveta que abre
    já diz). O frasco genérico da comparação tem o tamanho da foto do produto. Nas garantias da
    caixa de compra saiu a ressalva "Vale na opção de entrega mais barata" (a calculadora, a sacola
    e o checkout mostram o preço de cada entrega) e entrou **"Envio imediato · Pronta entrega"**, só
    com estoque — quatro garantias, dois por dois.
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
- [x] **Os cross-sells viraram um motor de recomendação** (23/09) — o "Leva junto" da sacola, os
      chips do frete grátis e a oferta do checkout, e o carrossel da página do produto —, sem nada
      pra escolher no admin. O que aparece depende do que está na sacola:
  - **De onde sai a escolha:** dos pedidos (quem comprou A, quantas vezes levou B junto) e,
    enquanto há pouco pedido, do que a loja já diz — a rotina da PDP (a do Fator junta shampoo e
    óleo) e a categoria. A rotina vale como dez pedidos: com poucos ela guia, com muitos os pedidos
    mandam.
  - **O kit não briga com as peças:** quem tem o Kit Completo na sacola não recebe shampoo, balm
    nem óleo, e quem tem uma peça não recebe o kit.
  - **"Leva junto":** até três, na ordem do motor; quem sozinho fecha o frete grátis ganha peso e a
    etiqueta. Com o Fator na sacola: shampoo, óleo e o kit ("Libera o frete grátis"). Sem o motor
    (Medusa fora do ar), vale a regra de antes.
  - **Chips do frete grátis** (passo 2 do checkout): até três que sozinhos fecham o que falta, na
    ordem do motor e com o preço perto do pedido. Com balm e fator na sacola, faltando R$ 6,10:
    antes, shampoo, spray e o kit de R$ 99,90 (que já traz um balm); agora, shampoo, óleo e spray.
  - **Carrossel "Quem leva este, leva junto"** da página do produto: na ordem do motor (antes,
    mesma categoria primeiro). Na página do kit, as peças dele vão pro fim — e não somem.
  - **A oferta do checkout:** 10% (era 20% só no óleo), em qualquer produto — cada um tem a própria
    promoção no Medusa, com código assinado (um código adivinhável seria 10% em tudo pela API).
    Nunca oferece o que já está no pedido (antes, quem levava o óleo ficava sem oferta), prefere
    produto barato perto do valor do pedido, e a frase diz por quê, só com o que dá pra provar:
    "Combina com Fator de Crescimento para Barba — só nessa tela, com 10% de desconto."
  - **Ela aprende:** cada pedido guarda o que foi oferecido e se foi aceito; o que é aceito mais
    aparece mais. Um carrinho em dez vê o segundo colocado, pro motor descobrir se outro produto
    seria mais aceito. A mesma pessoa vê sempre a mesma oferta (o sorteio é pelo carrinho).
  - Conferido numa loja local: `conferir-checkout` 118/118 (a oferta, o desconto cobrado pelo
    Medusa, a promoção desligada e o registro no pedido), `conferir-promocoes` 18/18,
    `conferir-recomendacao` 39/39 e os 192 testes do backend. O `conferir-checkout` voltou a rodar
    até o fim: clicava no rádio escondido da forma de pagamento, esperava o resumo aberto no
    celular (ele nasce fechado desde 22/09) e tropeçava na cópia escondida que o streaming deixa
    por um instante.
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
- [x] **Chave repetida nos cartões de quantidade da PDP** (achada e consertada em 23/09). Desde o
      desconto por quantidade (o item acima), os cartões "1, 2 e 3 unidades" são a MESMA variante,
      e cada um usava a variante como chave do React: três chaves iguais. No `next dev` eram dois
      erros no console em toda PDP com os cartões, no computador e no celular — o que reprovava o
      "nenhum erro no console" do `conferir-checkout`. Em produção não há aviso, mas chave repetida
      deixa o React trocar ou perder um cartão quando a lista muda. Agora a chave é a quantidade.
  - As outras listas com a variante na chave foram conferidas. O "Leve junto" da caixa de compra,
    o "Leva junto" da sacola e os chips do frete grátis no checkout não repetem: um item por
    produto (e o "Leve junto" já sai do admin e do backend sem repetido).
  - **A rotina repetia.** Os handles dela são digitados no admin, e repetir um — ou pôr o próprio
    produto — virava outro cartão da mesma variante, com as caixinhas marcando juntas: a cópia do
    produto da página nascia marcada, e desmarcá-la desmarcava o fixo; "Levar a rotina" mandava a
    variante duas vezes. Agora cada produto aparece uma vez só (`components/produto/rotina.tsx`).
  - O `conferir-pdp` passou a olhar o console e a rotina repetida — as três checagens novas falham
    no código de antes. E a da ressalva "vale na opção de entrega mais barata" foi pras Dúvidas:
    ela falhava desde que a ressalva saiu da caixa de compra, a pedido da loja (23/09).
  - Conferido numa loja local: `conferir-pdp` 50/50 (quatro rodadas), `conferir-checkout` 118/118
    (três) e `conferir-links` 26/26.
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
        antiga, cadê meu pedido?" — hoje não respondem, de propósito (`conteudo/duvidas.ts`). E o
        motor de recomendação passa a aprender com anos de pedidos, em vez de começar do zero.
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

**Onde está (23/09):** das sete fases do doc de arquitetura, da 1 à 4 estão prontas (o que sobrou
delas está nas listas acima), e a 5 — Operação — está quase fechada. Ela fecha quando **um pedido
de verdade sair com nota, etiqueta e rastreio sem ninguém tocar nele**: o primeiro pago depois do
token da Frenet é esse teste (ver 1b e 1c). Falta:

- **no código:** o e-mail de carrinho abandonado e o evento de compra (`purchase`) pro Google e pra
  Meta;
- **da sua parte:** os dados da empresa no admin (todos vazios em produção — seção 3), publicar os
  rascunhos novos do Bling (1c), o número do último pedido da Nuvemshop e a revisão jurídica da
  exclusão de conta e da política de privacidade (esses dois estão na Minha conta, seção 3).

O que já está de pé:

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
- **A nota fiscal pelo Bling está pronta** (23/09, ver 1c): o pedido de venda na hora, a nota
  depois da janela de cancelamento (5 minutos), varredura de 5 em 5 minutos embaixo, registro na
  tabela `erp_nota`. Quando ela estiver saindo de verdade, a pergunta
  "recebo nota fiscal?" entra nas Dúvidas (`apps/loja/src/conteudo/duvidas.ts`) e o bloco "Nota
  fiscal" na página do pedido da conta (o protótipo já tem) — antes disso, prometeriam o que não
  sai. O `purchase` pro GA4 e pra Meta segue pendente, no mesmo gancho
  (`apps/backend/src/subscribers/pagamento-capturado.ts`) e no mesmo molde.
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
  `apps/backend/src/lib/envios/parceiro.ts`). Os dois primeiros desta lista saíram em 23/09 — a
  consulta do rastreio de hora em hora e o pedido pago indo sozinho pro painel da Frenet (ver 1b).
  Sobram:
  - avisar a LOJA de extravio e devolução (e-mail ou um bloco no admin com a linha do tempo) —
    hoje é o log (`[envio]`) e o painel da Frenet;
  - o "entregue + pedido de avaliação" sete dias depois, do doc de arquitetura — um assinante do
    `envio.mudou`;
  - limpar envios sem dono antigos, se a conta da Frenet seguir avisando os da Nuvemshop.

### 4.5. O painel próprio da loja (dashboard)

**Decidido em 23/09.** A loja ganha um painel próprio, com a cara do site, no lugar do admin do
Medusa no dia a dia. Três motivos: a experiência do admin do Medusa é ruim; vai ter gente de
marketing e de operação, com níveis de acesso diferentes; e precisa funcionar no celular. O admin
do Medusa continua no ar, pro dono, como reserva.

- **Endereço:** `dashboard.fuckingbarba.com.br`, separado da loja — o login da equipe não se
  mistura com o dos clientes, o Google não indexa e um erro no painel não derruba a loja. É um app
  novo no monorepo (`apps/dashboard`, Next.js, com o design da loja), falando com o Medusa por
  rotas próprias. Da sua parte, na hora: criar o endereço `dashboard` onde o domínio está
  registrado (o Claude Code manda o passo a passo).
- **Entrar:** e-mail e um código de 6 dígitos, sem senha — igual à conta do cliente, mas numa
  identidade própria da equipe (nem a do cliente, nem a do admin do Medusa). O primeiro acesso é o
  do dono; ele convida o resto; cada pessoa entra com o próprio e-mail; tirou da equipe, o acesso
  cai na hora. No celular, "Adicionar à tela de início" deixa um ícone que abre como aplicativo.
- **Papéis:** Dono, Operação e Marketing. **A permissão vale no servidor**: cada rota confere o
  papel antes de responder, e o que o papel não vê (CPF inteiro, telefone, endereço) nem sai do
  servidor — esconder botão não é permissão. O Medusa 2.21 tem controle de papéis ainda
  experimental (`MEDUSA_FF_RBAC`, desligado): avaliar antes de escolher entre ele e rotas
  próprias. Toda mudança fica registrada, com nome e hora.
- **O protótipo:** `apps/loja/ferramentas/porte/prototipo-painel.html` — abre no navegador, sem
  internet (e está publicado, privado, em
  <https://claude.ai/artifact/5peAY5NUDWrwtE1rZpdhqP>). A barra de cima troca o papel ("Ver
  como") e pula de tela. Os pedidos, clientes e números são exemplo; as regras (Pix, nota,
  desconto por quantidade, jobs, e-mails, o que vem do Bling) são as de verdade, conferidas no
  código. O comentário do topo do arquivo diz o que o porte precisa, tela por tela.

O que o protótipo tem, aprovado em 23/09:

- **Início:** o que precisa de você hoje, as vendas e as **visitas do dia** (do GA4 — conferir se
  o `NEXT_PUBLIC_GA4_ID` está ligado na Vercel; quem recusa os cookies fica fora da conta).
- **Pedidos:** o caminho de cada um (pagamento → nota → Frenet → entrega) e o que travou.
- **Produtos:** fotos **e vídeos** (MP4 ou WebM), textos, e as seções da página com **nomes que
  servem pra qualquer produto** e o título do site editável por produto; cada seção com imagem de
  fundo em **duas versões, computador e celular** (PNG ou WebP). A **caixa de compra** da página
  mostra uma coisa **ou** outra, no mesmo lugar abaixo do preço: os cartões "Quantas unidades" (o
  order bump da página) ou o "Leve junto" (o cross-sell, 2 produtos). O topo da página é fixo e
  não se edita.
- **Layout da home:** as seções editáveis, o **banner principal com até 5 slides**, e nada vai pro
  site sem "Publicar".
- **Carrinhos abandonados:** **5 e-mails** — 1 hora, 1 dia, 2 dias (com cupom), 3 dias (o cupom
  vence amanhã) e 5 dias (última chamada) —, só e-mail por enquanto, com os textos editáveis e a
  prévia.
- **Cupons, Clientes e Newsletter, Configurações e Equipe.**
- **Observabilidade:** os problemas abertos em frase, com o que fazer; as integrações; os 8 jobs
  com a última rodada; a velocidade do site.
- **Marketing** (funil, canais, produtos, ofertas, clientes por estado, pagamento e frete) está
  **escondido** por enquanto — volta mais pra frente.

Em aberto:

- [ ] Aceitar JPG nas imagens também (a foto do celular quase sempre é JPG), convertendo pra WebP
      na subida? O pedido foi PNG e WebP.
- [ ] Confirmar a ordem do desenvolvimento, logo abaixo.

A ordem proposta, uma entrega pequena por vez:

1. **A base:** `apps/dashboard`, o login por código, os papéis no servidor, a casca (menu,
   celular) e o deploy com o endereço.
2. **Pedidos e Início:** primeiro só leitura; depois as ações que já existem no admin (emitir a
   nota agora, tentar o estorno de novo).
3. **Produtos:** textos, seções e fundos (o `fb_pdp` que já existe), a caixa de compra e os vídeos.
4. **Home:** a fonte da home no metadata da loja (hoje é código), o banner com slides e o
   "Publicar".
5. **Carrinho abandonado:** os 5 e-mails — é também o item de código que falta na fase 5.
6. **Cupons, clientes, newsletter, configurações e equipe.**
7. **Observabilidade:** guardar numa tabela o que hoje só vai pro log.

## Como seguir no Claude Code

- O operacional está no AGENTS.md: comandos, os onze conferidores (contra o Medusa local, com
  Frenet, Pagar.me, Resend e Bling falsos) e as regras. Rode os conferidores antes de subir.
- O que mexe em produção — variável, painel, script no Railway — quem faz é você; o Claude Code
  prepara e diz o comando.
- Chave nunca passa pela conversa. Cuidado com texto copiado de painel: o link pode levar o valor
  escondido. Pra mostrar uma tela, print.
