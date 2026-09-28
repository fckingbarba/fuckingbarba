# Estado do projeto — e o que vem a seguir

Atualizado em 23/09/2026, à noite: **a fase 5 (Operação) está quase fechada** — o que falta está no
topo da seção 4. Em 23/09 o Bling foi conectado (estoque, catálogo e a nota fiscal, que sai 5
minutos depois do pagamento — ver 1c), e o token de parceiro da Frenet entrou no Railway, junto com
o `MEDUSA_BACKEND_URL` (ver 1b): o pedido pago passa a ir sozinho pro painel da Frenet. E o cartão
passou a ser cobrado só depois da análise de fraude — a compra legítima que ela barra não aparece
mais na fatura (ver 1). No fim do dia, ficou decidido o **painel próprio da loja**, em
`dashboard.fuckingbarba.com.br`, com o protótipo aprovado. Em 24/09 as três primeiras fases dele
entraram no ar (entrar por código, os papéis e a equipe; o Início e os pedidos; os produtos, com
fotos, vídeos e as seções da página), e a fase 4 começou: a home, com rascunho e "Publicar" (ver
4.5). Em 22/09, o Pix vencido que prendia o estoque foi consertado (o #7 — ver o
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
| Loja (Next.js 16)             | Vercel — `www.fuckingbarba.com.br`                | **No ar e indexável desde a virada, 27/09.** A Vercel antiga leva pro www.  |
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
- [x] **Depois do deploy — você:** no painel do Pagar.me, no webhook que já existe (o de
      `order.paid` e `charge.paid`, a mesma URL), marque também o evento
      **`charge.antifraud_approved`**. Sem ele tudo funciona, só que a cobrança do cartão que
      ficou em análise espera a conciliação (até 5 minutos) em vez de sair em segundos. **Feito no
      modo produção em 25/09.**
- [ ] O mesmo no **modo teste** do Pagar.me, pra os testes andarem como a produção.
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
    `[envio] o #N não entrou no painel da Frenet, e não vou tentar de novo`, e o pedido no painel
    mostra o motivo, com o botão **"Mandar pra Frenet de novo"** (desde 25/09, entrega 0095) — ou
    vai à mão. Frenet fora do ar não é recusa: a varredura tenta de novo sozinha. Pra rodar a
    varredura na hora: `POST /admin/envios/registrar`;
  - **o primeiro foi o #19 (25/09), e a Frenet recusou por um erro NOSSO**: a loja mandava a caixa
    (`Volumes`) como lista, e a documentação dela pede um objeto. Consertado na entrega 0095;
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
- **Passou de 3 dias sem a nota sair** (o Bling fora do ar ou desconectado esse tempo todo): a loja
  para de tentar sozinha — alguém pode ter feito a nota à mão nesse meio-tempo — e avisa: o pedido
  fica com "A nota não sai sozinha · 3 dias sem nota" no painel, e a equipe recebe um e-mail.
  Confira no Bling se a nota já existe; se não, "Tentar de novo" (desde a 0175).
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
    que a equipe pôs ficam. **O nome dado no painel também fica** (desde a 0099, em qualquer
    importação): o Bling segue com o nome dele, e a loja com o dela.
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
      **Em 25/09 eram nove.** Oito são os da loja antiga que faltam na nova (o link deles dá "página
      não encontrada" até sair do rascunho): Kit 3x e Kit 6x Fator, Kit Essencial, Kit Hidratação,
      Kit Shampoo Duplo, Kit Fator + Shampoo e as Pastas Modeladoras Brilho e Matte (FBKIT06,
      FBKIT07, FBKIT02, FBKIT04, FBKIT03, FBKIT08, FBPBR01, FBPMT01) — já com as fotos e a categoria
      de lá: é Painel → Produtos → Rascunhos → **Publicar no site**, e depois admin → ERP → Estoque
      → **Sincronizar agora** (rascunho não puxa estoque). O nono, o Kit Dupla Performance
      (FBKIT10), não existia na loja antiga e está sem foto: fica em rascunho até ter.
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
- [x] Dados reais da empresa no painel, em Configurações → Dados da empresa (desde a entrega 0093;
      o admin segue de reserva): CNPJ, razão social, endereço, WhatsApp, e-mail, horário e prazo de
      postagem. **Preenchidos em 25/09** — o rodapé e o `/contato` da loja já mostram tudo.
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
      quantidade" que o job `precos-por-quantidade` refaz de minuto em minuto (era de 15 em 15 até
      24/09 — ver a investigação da sacola e do checkout, abaixo) a partir do preço atual (mudou o
      preço no admin, as faixas acompanham). A PDP pergunta os preços em
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
- [x] **O aviso do React que aparecia às vezes no `conferir-pdp`** (investigado em 24/09). Em
      umas 2 de cada 10 rodadas, só quando ele rodava logo depois dos conferidores do painel, o
      "nenhum erro no console" caía com "Can't perform a React state update on a component that
      hasn't mounted yet". **Não era da loja** (nem da caixa de compra, nem da sacola, nem da
      galeria): o `conferir-produtos` publica e apaga um produto; com `cacheComponents`, o `next dev`
      percebe que a lista do `generateStaticParams` da PDP mudou e manda `staticParamsChanged` pra
      toda aba aberta, que se recarrega (`hmrRefresh`). Caindo no meio da hidratação da primeira
      PDP, quem ainda não montou é o roteador do próprio Next — a pilha inteira, capturada no
      navegador: `hmrRefresh` → `dispatchAppRouterAction` → `nextDispatch` (use-action-queue) →
      `startTransition` → `dispatchOptimisticSetState`. Em produção não existe: sem websocket não
      há recarga, e o aviso é só de desenvolvimento. O `conferir-pdp` e o `conferir-checkout`
      descontam esse aviso SÓ quando ele sai colado numa mensagem de recarga do `next dev`, na
      aba que a recebeu (`ferramentas/recarga-do-dev.mjs`); sem a mensagem, continua reprovando.
  - Conferido numa loja local, nove rodadas completas (os cinco do painel e depois o de PDP e o
    de checkout; as três últimas já com a #52 e a #53, e a última também com a #54):
    `conferir-pdp` 55/55 e `conferir-checkout` 118/118 nas nove — em quatro o aviso veio sozinho
    e foi descontado. E uma prova à parte, com as mensagens de verdade do `next dev`: o aviso
    colado na mensagem é descontado; o segundo na mesma mensagem, o de uma aba sem mensagem, o de
    3 s depois e outro aviso qualquer continuam contando.
- [x] **O "a pessoa sai da lista" que falhava às vezes no `conferir-entrar`** (painel, investigado
      em 24/09). Em umas 3 de cada 10 rodadas completas, só essa checagem caía (59/60), e as de
      logo depois — a pessoa volta pro "entrar", o token de 30 dias não abre mais nada — passavam.
      **Não era a lista do painel ficando velha:** o conferidor contava as linhas no instante em
      que o aviso "saiu da equipe" aparecia, e esse aviso sempre chega ANTES da lista refeita. A
      resposta da ação traz o resultado primeiro, e o aviso entra na hora; a página refeita pelo
      `revalidatePath` entra numa segunda renderização, a da transição do roteador. Medido dentro
      da página, em 25 remoções no `next dev`: o aviso veio antes em todas, e a linha saiu 10 a
      27 ms depois (com o navegador 6× mais lento, 71 a 105 ms) — em todas, sem recarregar. O
      conferidor agora espera a linha sair (até 10 s) antes de contar: se a lista ficasse velha
      de verdade, ele continua reprovando.
  - Conferido numa pilha local (Medusa 9074, painel 3174): com a CPU do navegador 6× mais lenta
    só na remoção, o conferidor de antes falhou em 3 de 5 rodadas e o novo passou nas 5; sem a
    lentidão, o novo deu 60/60 em 15 rodadas (as três últimas já com a #56).
- [x] **O "a fila é a da API" que falhava às vezes no `conferir-pedidos`** (painel, investigado
      em 24/09). No banco local da 0061, só essa checagem caía (68/69): três vezes em onze
      rodadas, duas dentro da rodada completa e uma com ele sozinho. **Não era o Início, nem job
      mexendo nos pedidos, nem sobra do `conferir-entrar`: era o relógio.** O título "Cartão em
      análise há 11 min — #11" traz a idade contada na hora em que o backend responde, e o
      conferidor lia a API e depois a tela — dois pedidos, 0,1 a 0,5 s um do outro. Cada rodada
      deixa um cartão parado em análise no banco local; com dezenas deles, algum vira o minuto
      entre as duas leituras. Pego com as listas impressas: 42 itens iguais menos um — a API,
      lida 50 ms antes de o #11 virar o minuto, com "há 11 min", e a tela com "há 12 min". O
      conferidor agora compara a fila sem a idade (confere só que ela está lá, no formato do
      `duracao`), e a falha diz o item que difere em vez da lista inteira da tela.
  - Conferido numa pilha local (Medusa 9083, painel 3183) com 30 cartões semeados em análise,
    como no banco da 0061. Com a virada do minuto forçada entre as duas leituras, o conferidor
    de antes falhou em 5 de 5 rodadas e o novo passou nas 5 — nas 10, a lista sem a máscara
    mostrou a idade virada. Sem forçar, 14 rodadas do `conferir-entrar` seguido do novo: 69/69
    nas 14, e em 2 delas a idade virou entre a API e a tela (o de antes teria falhado). E três
    rodadas completas dos sete conferidores do painel, todas verdes (entrar 60, pedidos 69, ações
    32, visitas 41, produtos 92, home 76, clientes 37).
- [x] **O "nenhum erro no console" que falhava às vezes no `conferir-clientes`** (painel,
      investigado em 25/09). Em 2 de 3 voltas, com o backend da main e com o da 0088, só essa
      checagem caía (36/37), com "Failed to execute 'measure' on 'Performance': 'Ficha' cannot have
      a negative time stamp." — sempre na visita do marketing à ficha de quem não aceitou ofertas,
      que dá 404 de propósito. **Não era a ficha nem o painel: era o relógio do `next dev`, mais uma
      trava que falta no React.** Em desenvolvimento, o React desenha os componentes do servidor
      no painel de desempenho do navegador. O servidor manda, pelo websocket do HMR, a hora em que
      começou a página, no relógio do processo Node, e o navegador conta dali. O Node anda pelo
      relógio monotônico desde que subiu, e o do sistema vai sendo acertado: um processo Node
      novo, medido por 30 minutos, foi ficando 1 ms por minuto atrás do relógio do sistema e
      depois pulou 68 ms de uma vez; dois `next dev` de três horas estavam 300 a 380 ms atrás do
      navegador. Com o servidor atrás, a ficha "termina antes de a página começar". O componente
      que terminou bem, o React pula; o que deu erro (o `notFound()` da ficha) ou foi abortado,
      ele mede mesmo assim, e o `performance.measure` lança (react/react#37561, com as PRs #37563 e
      #37572 abertas; vercel/next.js#99032). Lança uns 100 ms depois de a página carregar: se o
      conferidor já saiu dela, não sai nada — por isso o "às vezes". Em produção não existe: o
      cliente de produção do React nem tem esse código. Os conferidores do painel e o da conta
      descontam esse erro (`apps/loja/ferramentas/relogio-do-dev.mjs`, ligado no `pecas.mjs` e no
      `novaAba` do `conferir-conta`) só com a frase exata, a pilha inteira no cliente de RSC do
      React, o servidor tendo dito que começou ANTES da página, e um por página carregada; o que
      foi descontado sai numa linha no fim.
  - Provado com o relógio do Node atrasado de propósito (um `--require` no `NODE_OPTIONS` do
    `next dev` que troca o `performance.timeOrigin` por um menor): 3 s atrás, o erro em 4 de 4
    visitas à ficha (o fim dela em −2.556 ms; o começo, o React trava em 0); 250 ms atrás, em 7 de
    8 (escapou a primeira, que o servidor demorou pra montar); com o relógio certo, em nenhuma
    (6 de 6). O `conferir-clientes` de antes, com 3 s: 36/37, a mesma frase. O painel em
    `next build` + `next start`, com os mesmos 3 s atrás: nenhuma medida do React na página e o
    `conferir-clientes` 37/37. E uma prova à parte do desconto, com páginas de verdade: o erro do
    React é descontado; a mesma frase lançada pela página, antes ou depois dele, conta; a frase e
    a pilha de verdade do React numa página com o relógio certo não são descontadas. No log do
    `next dev` da 0088, 4 das 11 visitas à ficha 404 tinham dado o erro.
  - Conferido numa pilha local (Medusa 9091, painel 3191, loja 3091): três rodadas completas dos
    nove conferidores do painel, todas verdes e sem nada descontado (entrar 60, pedidos 77, ações
    32, visitas 41, produtos 92, home 76, clientes 37, cupons 25, observabilidade 33); com o
    relógio do painel 3 s atrás, o `conferir-clientes` passou em 4 de 4 (37/37); na volta em que
    o erro veio, descontou um ("pelo menos 2927 ms atrás"), e nas outras saiu da ficha antes.
  - Na loja, o mesmo erro sai com componentes "[Prerender]" (MenuDaConta e Miolo no
    `conferir-conta`, 4 em 5 rodadas com o `next dev` de uma hora, visto pela sessão da 0089;
    Conteudo no checkout). O `conferir-conta` ganhou o mesmo desconto, a pedido dela. Com a
    loja 3 s atrás, o de antes deu 208/209 (as duas frases, Miolo e MenuDaConta); o novo,
    209/209, com as duas descontadas; com o relógio certo, 209/209 sem nada descontado. E, no
    `next dev`, a telemetria da loja (0090) conta esse erro como da loja — é script da mesma
    origem. Em produção, nada disso existe.
- [x] **A faixa de cookies ficava embaixo da barra de compra** (visto pela loja no celular, em
      25/09, logo depois das integrações). Na PDP do celular a barra "Comprar" aparece de cara, e
      os botões "Só o necessário" e "Aceitar" ficavam atrás dela: a barra tem z-index 60, e a
      faixa, 50. No computador, o mesmo depois de rolar. No checkout do celular era o contrário:
      a faixa cobria o "Continuar" da barra do total. Agora a faixa fica em cima da barra que
      estiver presa no pé da tela (cada barra diz a altura, `lib/use-pe-da-tela.ts`), sobe e desce
      junto com ela, e no celular ficou menor e mais discreta: de 185 pra 122 px, letra de 12 px e
      os dois botões numa linha só (o "Só o necessário" quebrava em duas).
  - Conferido numa loja local com o Google e a Meta ligados, como em produção: o
    `conferir-integracoes` do painel ganhou a seção "A faixa e as barras do pé da tela" (5
    checagens: PDP no celular e no computador, checkout no celular, o tamanho no celular e a faixa
    descendo quando a barra some) — 29/29; no código de antes, 4 das 5 falham. Fotos em
    `next build` + `next start` com o `ferramentas/retrato-consentimento.mjs` (novo). E o
    `conferir-pdp` e o `conferir-checkout` da loja passaram.
- [x] **Os nomes dos produtos cabem em 2 linhas na página** (pedido da loja em 25/09). Os nomes
      vinham do Bling com 43 a 88 letras ("Fator de Crescimento para Barba 30ml — Crescimento,
      Densidade e Preenchimento da Barba") e o título da PDP dava 4 linhas no celular e até 7 no
      computador. Agora o NOME É DA LOJA: editável no painel (Produtos → Textos, com o aviso de
      quando passa de 2 linhas), e a importação do Bling não troca mais o nome editado — o Bling
      segue com o dele (a nota, os marketplaces, que ele usa só pro estoque). "Usar o do Bling"
      devolve. O título da PDP no computador tem teto de 38 px (era 42). Os 7 nomes, aprovados por
      ele, entram sozinhos no deploy (`migration-scripts/nomes-curtos-na-loja.ts`, com a marca):
  - Balm Modelador para Barba 90g · Óleo para Barba 30ml · Shampoo para Barba 120ml · Kit
    Completo para Barba · Spray Modelador Matte para Cabelo · Fator de Crescimento para Barba
    30ml · Kit 2x Fator de Crescimento. Medidos com a fonte da loja: no máximo 2 linhas de 360 a
    1440 px. Os dois kits encurtaram mais pra caber com os 38 px, e o spray ganhou "para Cabelo"
    (a descrição diz que é pra cabelo).
  - SEO: no Google, o título da aba tinha 84 a 103 letras e saía cortado, sem a marca; agora tem
    35 a 51, inteiro, com "· FuckingBarba" no fim. O que a pessoa busca abre cada nome; as
    frases de benefício continuam nas seções e na descrição; os endereços não mudam.
  - Conferido numa pilha local: `conferir-produtos` 101/101 (9 novas: o aviso das 2 linhas,
    salvar, a página e a aba com o nome, o histórico, os recusados, "Usar o do Bling");
    `conferir-erp` com a importação que mantém o nome e a prévia que avisa (as 2 novas passam; as
    9 checagens de e-mail pra equipe falham igual na main neste banco — o conferidor procura os
    avisos no e-mail do admin, e desde a 0093 eles vão pra equipe do painel); a migração rodada
    no banco local (6 de 6 com a marca); 9 testes novos no backend; a rodada completa
    dos 12 conferidores do painel verde, e o `conferir-pdp` da loja 55/55.
- [x] **Investigação da sacola e do checkout** (24/09, a pedido da loja). Quatro revisões do
      código em paralelo e compras de verdade numa loja local: 15 problemas reais, nenhum de
      cobrança em dobro. A entrega 0077 consertou os de dinheiro e de endereço, cada um com
      checagem nova no `conferir-checkout` (que falha no código de antes):
  - **O cartão cobrava um total diferente do botão** — "Pagar R$ 73,60" e R$ 128,50 cobrados, com
    um item posto por outra aba. Agora o `finalizar` confere o total que a tela mostrou.
  - **Trocar o CEP na sacola mantinha o número da rua antiga** ("Praça Pio X, 1578 — apto 12",
    no Rio) e o checkout pulava pro pagamento. Agora o CEP novo leva o número e o complemento, e o
    checkout volta pro passo 2 (`comCepNovo`).
  - **Confirmar o passo 2 com o CEP ainda sendo buscado** gravava o CEP novo com a rua e a cidade
    do antigo. O botão trava durante a busca, e o servidor recusa CEP de outra cidade.
  - **Promoção que acabava deixava 2 e 3 unidades no preço dela** até o job de 15 minutos (2 óleos
    por R$ 104,90 com 1 a R$ 79,90), e nada avisava a loja de preço mudado no admin. O job roda de
    minuto em minuto e avisa a loja quando os preços ou as datas das promoções mudam.
  - **A "Entrega expressa" cobrada era o mesmo serviço da econômica grátis** quando a mais barata
    é também a mais rápida. Agora o grátis vale nas duas, e a tela mostra uma só.
  - **Cupom cadastrado em minúsculas nunca aplicava** (a loja punha em maiúsculas).
- [x] **A sacola e o checkout mais resistentes** (entrega 0081, 24/09 — a "entrega B" da
      investigação). Cada item com checagem no `conferir-checkout` (e o laço no
      `conferir-pagamento`), que falha no código de antes:
  - **Sem internet por um instante**, o "+" da sacola derrubava o site inteiro ("Essa página não
    carregou"), e o "Adicionar à sacola", a página. Agora toda ação chamada do navegador passa
    pelo `semQueda` (`lib/rede.ts`): a tela diz que a conexão caiu e fica de pé — a sacola, os
    botões de comprar, os passos do checkout e o pagar.
  - **Com o Medusa reiniciando** (todo deploy do backend), a sacola aparecia vazia, sem recado, e
    quem pusesse tudo de novo ficava com o dobro. Agora ela fica com o que mostrava e diz que não
    conseguiu falar com a loja; o contador não inventa um zero, e a gaveta diz "Não consegui abrir
    sua sacola", com "Tentar de novo". O checkout, com o Medusa fora, diz que não carregou — não
    que a sacola está vazia.
  - **A gaveta mostrava a sacola de antes** da oferta marcada no checkout. Agora ela relê toda vez
    que abre (por `GET /api/sacola`, fora da fila das ações), e o contador acompanha na saída do
    checkout.
  - **O produto que esgota no meio do checkout** virava "espera um minuto e clica em pagar de
    novo" pra sempre. Agora o pedido desce até o que tem, e a frase diz o que mudou e o total
    novo; nada é cobrado.
  - **A segunda aba** dizia "nada foi cobrado, tenta de novo" com o pedido já feito na primeira.
    Agora ela vai pro mesmo pedido.
  - **A resposta da compra perdida, com o pagamento recusado depois**, deixava o `/checkout` e o
    `/checkout/retomar` mandando um pro outro sem fim (71 idas em 8 segundos). Agora o pedido se
    acha pela rota nova `/store/pedido-do-carrinho/:id` (o `complete` de novo não serve com o
    pagamento cancelado), e o retomar sem pedido volta com um recado que não manda pra lá de novo.
  - **E-mail com mais de 64 caracteres** travava o pagamento sem dizer por quê. O passo 1 recusa,
    com o motivo (é o limite do Pagar.me).
  - Ficou de fora, pra outra hora: as telas da CONTA (entrar, código, dados, endereços) ainda caem
    na tela de erro se a internet cair no meio do envio — não é sacola nem checkout.
- [ ] **Decisão da loja:** o piso do frete grátis vale sobre o valor PAGO (com cupom e oferta) ou
      sobre o CHEIO? Hoje o Medusa decide pelo cheio e o checkout mostra "faltam R$ X" pelo pago —
      com um cupom de 10%, a tela diz "Faltam R$ 7,07" ao lado da entrega "Grátis".
- [x] **Pagamento, os casos raros** (entrega 0083, 24/09 — a "entrega C" da investigação). Lidos no
      código por uma revisão, reproduzidos no Pagar.me falso e conferidos no `conferir-pagamento`:
  - **O Pix pago com o pedido já cancelado** era estornado direto no Pagar.me, sem nada no Medusa —
    se o estorno falhasse (o Pix recém-pago, fora do saldo), o dinheiro ficava com a loja, calado.
    Agora ele é registrado no pedido cancelado e devolvido pelo Medusa, e o estorno é conferido
    como os outros: faixa vermelha no admin, e-mail pra equipe, nova tentativa.
  - **O "Check status" do admin junto com o aviso do Pagar.me** (ou a conciliação) estornava um
    pedido pago, que seguia pro envio. Agora o botão espera a vez dele, na mesma trava do aviso.
  - **O cartão em análise de um pedido cancelado** era cobrado quando a análise aprovava depois
    (o valor aparecia e sumia da fatura). Agora ele nunca é cobrado: a reserva é desfeita.
  - **O pedido ficava "aguardando" pra sempre, com o estoque preso**, quando o pagamento terminava
    recusado fora da conciliação (o "Check status" num cartão reprovado). Agora a conciliação
    cancela, e o estoque volta.
  - E dois ainda mais raros: o pagamento registrado NO MEIO do cancelamento agora também volta; e a
    autorização que parou no meio (o processo caiu) vira pagamento do pedido, ou o cancela.
- [x] **O e-mail do Pix pago depois do cancelamento** (entrega 0086, 25/09). Cancelar um pedido
      não mata o QR do Pix, e quem paga depois recebia o dinheiro de volta calado — o último
      e-mail dizia "Nada foi cobrado de você". Agora, logo depois da devolução, sai
      **"Pedido #N: devolvemos o seu Pix"**: o que aconteceu (o pedido foi cancelado antes de ser
      pago, e o Pix entrou depois), o valor e o caminho de volta, e o convite pra refazer o pedido.
      Só pra quem ouviu "nada foi cobrado"; quem recebeu o "cancelado e estornado" já sabe do
      dinheiro. De quebra: o e-mail de cancelado e estornado mostrava "Total R$ 0,00" (o Medusa
      grava a devolução como crédito e zera o total); agora mostra o que foi pago.
- [x] **O total do pedido cancelado com desconto, na Minha conta e na tela de obrigado** (entrega
      0089, 25/09). O pedido com cupom ou com a oferta do checkout, pago e depois cancelado,
      aparecia com o valor de ANTES do desconto: no banco local, cobrado R$ 153,01 e mostrado
      R$ 158,50, logo abaixo do "Desconto −R$ 5,49". Agora a lista de pedidos, o pedido aberto e a
      tela de obrigado mostram o que foi cobrado — a mesma conta do painel (entrega 0088) e do
      e-mail de cancelamento (0086). O `conferir-conta` ganhou um pedido pago com a oferta e
      cancelado, e compara o total de cada pedido com o que o Pagar.me cobrou; com o código de
      antes, as quatro checagens do total falham. Nada a configurar depois do deploy.
- [x] **PDP, "Quem leva este, leva junto": o raio e o botão** (entrega 0100, 25/09, pedido da
      loja). No fundo menta da seção, o "Comprar" dos cards era menta também e sumia; agora é
      amarelo (com o mouse em cima, continua escuro com letra branca). O raio do título, que era
      amarelo, ficou na cor do texto. Só nessa seção: a "Alta Performance" da home, de fundo
      branco, continua como era. A regra mora na fonte do CSS da PDP
      (`ferramentas/porte/pdp-partes/estilo.css`, que gera o `pdp-relacionados.css`).
- [x] **A esteira de avaliações da home sorteia a cada visita** (entrega 0109, 26/09, pedido da
      loja). "Nossos clientes nos amam" mostra até 4 avaliações de cada produto, sorteadas de novo
      a cada visita, com os produtos misturados — antes entravam todas, repetidas três vezes. A
      mesma avaliação posta em vários produtos (a do Fator nos kits) aparece uma vez só, e conta
      uma vez só na nota média e no "em N avaliações". A esteira anda no ritmo do protótipo com
      qualquer número de avaliações (antes, quanto mais avaliação, mais rápido ela corria). Só
      aparece com avaliação publicada em `conteudo/depoimentos.ts`.
- [x] **Os trechos das entrevistas com clientes, no lugar da PR #90** (entrega 0111, 26/09). As
      160 frases entram como "Entrevista com cliente": sem nome, sem estrela, sem selo de compra
      verificada, e fora da nota média e do Google — na esteira da home e na seção "O que diz quem
      usou" de cada produto (20 por produto; as do Fator só no Fator, sem as cópias nos quatro
      kits; o exemplo do André B., que estava na lista, ficou de fora). A PR #90 publicava as
      mesmas frases como avaliação, e a home dela media 0,54 no Lighthouse do CI (1.470 cartões,
      2,2 s de bloqueio). Agora a esteira desenha os cartões só quando a seção chega perto da tela,
      com a foto no tamanho da caixa: no teste igual ao do CI, rodado aqui, a home ficou em 0,97,
      com 10–25 ms de bloqueio. Na página do produto, a seção ganhou a grade do protótipo (a lista
      saía sem estilo) e mostra o texto inteiro. Falta fechar a PR #90.
  - [x] **Folga pro LCP da home no Lighthouse do CI.** Feito na entrega 0117 (item logo abaixo).
- [x] **A home abre mais rápido no celular, e o teste mede a home de verdade** (entrega 0117,
      26/09). O teste de velocidade do CI media uma home sem banner — a primeira coisa que o
      cliente vê na loja — e mesmo assim estava no limite (2,56 s na main, reprovando; o máximo é
      2,5 s). Com o banner, dava 2,8 s. Agora o teste tem banner (uma arte que pesa o mesmo que a
      do Kit Premium), e a home mede **2,26 s** em todas as rodadas. Quatro mudanças, nenhuma
      visível:
      - **o banner ficou quase um terço mais leve**: a arte sai em qualidade 60, e não 75. Lado a
        lado, ampliado duas vezes, não dá pra ver diferença — nem nas letras miúdas dos rótulos. No
        celular, de 57 pra 40 KB (num celular de tela boa, de 76 pra 56 KB); no computador, de 95
        pra 68 KB;
      - **os raios de enfeite** (no aviso do topo, nas ofertas, nos benefícios, no bloco escuro, no
        "sobre" e no rodapé) viraram recorte no CSS, e não imagem — no mesmo formato e lugar, pixel
        a pixel. Como imagem, eles atrasavam a fonte no teste e custavam 0,2 s;
      - **os 160 trechos das entrevistas** não vão mais dentro da página: a esteira busca os textos
        quando a pessoa chega perto dela. A página da home ficou 17% menor (de 28 pra 23 KB);
      - **o estilo da categoria, da busca e das páginas de texto** saiu do pacote que toda página
        baixa antes de aparecer: cada uma carrega o seu.
      A categoria (/barba) e a página do produto também ficaram mais rápidas no teste (2,18 → 2,10 s
      e 2,33 → 2,26 s).
  - [ ] **Mais folga pro LCP da home.** O teste simula um 4G lento que baixa uma coisa de cada vez,
        em degraus de 0,15 s, e a home ficou logo abaixo de um degrau: se o HTML ou o CSS dela
        crescerem 1,2 KB (comprimidos), ela pula pra 2,56 s e reprova (ver o AGENTS.md, perto do
        Lighthouse). A PR #99 (rodapé) soma 0,35 KB e ainda cabe. Pra folga de verdade, é aliviar
        o JavaScript da primeira tela: a home baixa o código da página do produto (a calculadora
        de frete, a galeria, a rotina e os vídeos — uns 6,5 KB comprimidos), porque as duas
        páginas montam as seções pelo mesmo registro; separar esse registro por página, mais
        carregar a medida de velocidade (a telemetria) depois da página pronta e tirar o logo do
        JavaScript, deixa a home passando mesmo depois desse degrau (2,41 s no simulador). É
        trabalho à parte.
- [x] **Duas fileiras na esteira da home, a listra de cima amarela e três depoimentos na página do
      produto** (entrega 0120, 26/09, pedido da loja). "Nossos clientes nos amam" ficou como o
      protótipo: duas fileiras, a de cima correndo pra esquerda e a de baixo pra direita, um pouco
      mais devagar (7,5 s e 9,5 s por cartão; com o mouse em cima, as duas param). São os mesmos
      até 4 por produto da 0109, repartidos entre as duas — hoje, 16 cartões em cada, dois de cada
      produto. A listra no alto da seção era preta e branca (veio assim do protótipo); agora é
      preta e amarela, como a das outras seções, e o protótipo mudou junto. Na página do produto,
      "O que diz quem usou" mostra 3 depoimentos sorteados a cada visita, e não mais os 20: o HTML
      sai com três (o que lê quem abre sem JavaScript, e o Google), e o navegador sorteia os da
      visita logo depois. Nada a configurar depois do deploy.
- [x] **O contador das Ofertas relâmpago mostra as horas até o fim** (entrega 0141, 26/09, pedido
      da loja, com o print das 23:44: "a hora tem que aparecer sempre, nem que seja 0"). Na última
      hora do dia, a caixa de Horas sumia e o contador encolhia de três caixas pra duas bem quando
      fica amarelo. Agora ela fica, com 00 (às 23:44:51, 00 · 15 · 09), e o contador tem a mesma
      largura o dia inteiro. Numa tela de 1024 px, o botão "Aproveitar ofertas" já ficava na
      segunda linha o dia todo e só subia na última hora; agora fica embaixo sempre. Conferido por
      foto, com o relógio do navegador parado às 14:25, às 23:44 e às 23:59:58, no computador, em
      1024 px e no celular. O HTML da home sai igual. Nada a configurar depois do deploy.
- [x] **O conferidor do ERP procurava o aviso da equipe na caixa errada** (entrega 0101, 25/09).
      Desde as Configurações (entrega 0093), o e-mail da equipe — a nota que não saiu, a nota pra
      conferir ou pra cancelar, o Bling caído — vai pra quem está no painel com o papel que
      resolve, e o dono recebe todos. O `conferir-erp` seguia procurando esses e-mails na caixa do
      admin do Medusa: em todo banco local com gente no painel, 9 checagens falhavam, com o código
      da main e com o de qualquer entrega. A loja estava certa — no log, cada aviso saiu pro dono.
      Agora ele lê a caixa do dono do painel ou, num banco sem ninguém no painel, a do admin, como
      antes. Só o conferidor mudou: nada muda na loja, e nada a configurar.
- [x] **O conferidor do pagamento procurava o aviso do estorno na caixa errada** (entrega 0121,
      26/09). O mesmo caso da 0101, no `conferir-pagamento`: o e-mail "O estorno do pedido #N não
      saiu" vai pro dono do painel desde as Configurações (entrega 0093), e o conferidor o
      procurava na caixa do admin do Medusa. Em todo banco local com gente no painel, 2 checagens
      falhavam ("quem tem acesso ao admin recebe UM e-mail" e "com o valor e a cobrança"), com a
      loja certa — o aviso tinha saído, um só, pro dono. Agora ele lê a caixa do dono do painel
      ou, num banco sem ninguém no painel, a do admin, como antes. Nenhum outro conferidor procura
      aviso da equipe no admin (o do painel já lia a caixa do dono). Só o conferidor mudou: nada
      muda na loja, e nada a configurar.
- [x] **O teste do bilhete de vídeo caía 1 vez em 64** (entrega 0131, 26/09). No
      `videos.unit.spec.ts`, o "mexido, com outra chave ou vencido: não vale" estragava a
      assinatura trocando a primeira letra por "x". O bilhete leva um `n` sorteado, e a assinatura
      muda junto: quando ela já começava com "x", a "estragada" era a mesma, e o `lerEnvio` a
      aceitava — com razão. Agora a letra trocada é sempre outra. Provado com o `n` forçado a dar
      assinatura com "x" na frente: o teste de antes falha, o novo passa. Só o teste mudou: nada
      muda na loja, e nada a configurar.
- [x] **O teste do cofre do ERP caía 1 vez em 256** (entrega 0144, 27/09, visto na validação
      da 0139). No `erp.unit.spec.ts`, o "com outro segredo, de outro ERP, ou adulterado, não
      abre" estragava o texto cifrado trocando as duas últimas letras do base64 por "AA" (ou
      "BB", se ele terminava em "A"). O vetor é sorteado, e o texto muda junto: quando terminava
      em "BA", o "BB" dava o mesmo byte — a última letra leva bits de sobra, que a leitura
      ignora —, e o `abrir` o aceitava, com razão. Agora o teste inverte um bit no meio dos bytes.
      Provado com o vetor forçado: o teste de antes falha, o novo passa; em 102.400 vetores, a
      troca antiga furou 407 vezes, a nova nenhuma. Só o teste mudou: nada muda na loja, e nada a
      configurar.
- [x] **O conferidor do Marketing lia o aviso da meta tarde** (entrega 0143, 27/09, visto na
      validação da 0139). No `conferir-marketing`, "Mudar a meta, 15.000 e Enter" esperava o bloco
      da meta mostrar o valor novo e só depois lia o aviso "Meta do mês salva". Mas o aviso entra
      logo (uns 70 ms depois do Enter) e some em 6 s, e o bloco vem com a página refeita: 2,4 a 4 s
      com a máquina leve; com ela carregada (várias sessões ao mesmo tempo), depois dos 6 s — e a
      checagem falhava sem bug nenhum, igual na main. Agora o conferidor pega o texto do aviso
      quando ele entra, e só depois espera o bloco. Provado segurando no Medusa, por 7 s, a leitura
      do Resumo que vem logo depois do "Mudar a meta" (o que a máquina carregada fazia): o
      conferidor de antes falhou 8 em 8, o novo passou 8 em 8. A CPU lenta no navegador não
      reproduz: ela atrasa junto o relógio do aviso. Só o conferidor mudou: nada muda no painel, e
      nada a configurar.
- [x] **Mais cinco conferidores do painel liam o aviso de baixo tarde** (entrega 0147, 27/09, o
      mesmo caso da 0143). O `conferir-cupons` e o `conferir-promocoes` ("criado/criada pela
      gaveta"), o `conferir-integracoes` (o trecho do TikTok colado pela tela), o
      `conferir-clientes` (o Leo sai da newsletter) e o `conferir-configuracoes` (a janela da
      nota) liam a frase do aviso só depois de esperar a tela refeita — a linha nova, o campo, a
      linha que sai — ou de uma chamada à API; com a máquina carregada, ela chega depois dos 6 s
      do aviso, e a checagem falhava sem bug nenhum. Agora a peça `avisoDoClique` (`pecas.mjs`)
      faz o clique e devolve a frase do aviso quando ele entra, e só depois vem a espera da tela.
      Ela também não confunde o aviso anterior saindo (que muda o `data-vez`) com o novo: na
      chave dos cupons e das promoções, o aviso do "criado" saía antes de a pausa voltar, a espera
      soltava, e o conferidor lia o Medusa antes da pausa. Provado com um proxy na frente do
      Medusa, só pro painel, que segura por 7 s a leitura da página refeita (na janela da nota,
      também a chamada do conferidor) ou a própria pausa da chave: em sete casos, o conferidor de
      antes falhou 4 em 4 em cada um, só na checagem do aviso, e o novo passou 4 em 4, inteiro.
      O `conferir-observabilidade` e o `conferir-entrar` já liam o aviso na hora. Só os
      conferidores mudaram: nada muda no painel, e nada a configurar.
- [x] **A sacola responde no clique** (entrega 0104, 26/09, pedido da loja: "adicionar ou remover
      do carrinho está demorando"). Medido na produção: adicionar levava 1,3 s (2,4 s o primeiro,
      que cria o carrinho), o "+" 1,1 s e remover 0,9 s — quase tudo no Medusa, que refaz o
      carrinho inteiro a cada escrita (umas cem idas e voltas ao banco; uma leitura simples custa
      60 ms). Agora a gaveta abre no clique com o produto (a foto, o nome e o preço que a página já
      mostrava) e o total esmaece até o Medusa responder; os botões de "+" e "−" não travam mais, e
      os cliques seguidos se juntam (três "+" são duas idas, não três); e cada clique faz uma ida
      ao Medusa em vez de duas — a primeira compra, que criava o carrinho vazio e depois punha o
      item, agora cria já com ele. Vale na página do produto, no "Comprar" da vitrine, na rotina e
      no "Leva junto" da gaveta. O `conferir-checkout` ganhou "A sacola responde no clique" (6
      checagens, com as ações seguradas 1,5 s; com o código de antes, 4 falham) e deixou de usar o
      balm como item "por fora" quando o balm é a própria oferta (num banco sem pedidos, é — e
      tirar o extra tirava a oferta junto). Nada a configurar depois do deploy.
- [x] **O rodapé do celular virou sanfona** (entrega 0118, 26/09, pedido da loja, com o print de
      outra loja: "o nosso fica muito longo"). No celular, Links úteis, Políticas, Entrar em
      contato, Compra segura e Formas de pagamento viram linhas que abrem no toque (o "+" vira
      "−"); a newsletter, a logo com as redes e a linha do CNPJ seguem abertas. O rodapé caiu de
      1.617 px (duas telas de rolagem) pra 1.018. No computador e no tablet nada muda — a foto do
      rodapé no computador saiu idêntica, byte a byte. É `<details>`, sem JavaScript: abre antes
      de a página hidratar, e o que está fechado segue no HTML (o Google lê igual). Safari de
      computador anterior ao 18.4 mostra a sanfona também lá (funciona, só não fica em coluna
      aberta). Lighthouse: acessibilidade e SEO 100, e o LCP da home não muda — medido no próprio
      simulador, somando só os bytes da mudança (0,1 KB de HTML e 0,24 KB de CSS). Mas a home fica
      com 43,3 dos 43,8 KB que cabem nas duas primeiras voltas da conexão (ver o AGENTS.md, perto
      do Lighthouse): sobra menos de meio KB pra próxima mudança que pese em toda página. Nada a
      configurar depois do deploy.
- [x] **A listra preta e amarela no alto das seções da página do produto** (entrega 0153, 27/09,
      pedido da loja, com o print da listra). Na PDP, só os Benefícios, a faixa com foto e os
      produtos relacionados abriam com ela; agora Antes e depois, Linha do tempo, Rotina, Como
      funciona, Comparação, Pra quem é, Perguntas frequentes e Avaliações também — a mesma listra
      das seções da home, no espaço que já existia no alto de cada seção: nada muda de lugar. A
      regra mora na fonte do CSS da PDP (`ferramentas/porte/pdp-partes/estilo.css`), e os
      `pdp-*.css` saíram do `agrupa-pdp.py`. Conferido por foto na PDP do Fator no ar, com o CSS
      novo só no navegador do teste, no celular e no computador: as 8 seções com a listra, nenhuma
      seção muda de altura nem de lugar, nenhum erro. A PDP fica 0,12 KB (comprimido) mais pesada;
      a home não muda. Nada a configurar depois do deploy.
- [ ] **Pagamento, o que a revisão achou e ficou pra depois** (baixo risco, sem dinheiro preso):
  - estorno ou contestação feitos do lado do Pagar.me depois do pagamento (pelo painel deles,
    chargeback) não são percebidos: o pedido segue pago, pro envio.
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
        ofertas por e-mail e WhatsApp com o consentimento, o cookie da sessão. (O Resend, o
        Pagar.me, a Frenet e o Bling entraram nela em 25/09, com as integrações de anúncio — entrega
        0094.) Vai junto do item 4, pela mesma revisão jurídica. Desde
        25/09, cabe também uma linha sobre a medida da velocidade e dos erros da loja (fase 7,
        parte 2 do painel): anônima, sem cookie e sem identificar ninguém.
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
  - [x] Numeração: decidido que os pedidos novos começam depois do último da Nuvemshop (nada de dois
        "#28"). O último de lá foi o **#3194** (27/09, 11h, pelo arquivo de vendas); a loja nova
        numera do **#3301** em diante, com folga pro que a Nuvemshop ainda receber até o domínio
        virar (entrega 0159, `migration-scripts/numeracao-depois-da-nuvemshop.ts`, roda uma vez no
        deploy e nunca volta a sequência).
- [ ] O checkout não pede mais aceite das regras de troca (a linha embaixo do botão de pagar saiu
      no enxugamento de 21/09), e desde 22/09 também não fala mais em desistência. As regras seguem
      publicadas no `/trocas`, com link no rodapé.
- [ ] **Os preços, antes da virada — você.** A loja nova usa o preço do Bling, e em 25/09 ele
      estava acima do que a Nuvemshop cobra hoje em todos os produtos: a Nuvemshop mostra um
      "de/por", e a promoção não veio na importação do Bling (23/09). Com a promoção no painel
      (entregas 0098 e 0102), é pôr o "por" de hoje no **Promocional** de cada um — Painel → Produtos.
      O "por" de cada um na Nuvemshop, em 25/09: Óleo R$ 54,90 · Balm R$ 53,90 · Shampoo R$ 49,90 ·
      Spray Matte R$ 49,90 · Fator R$ 79,90 · Kit Completo R$ 99,90 · Kit 2x Fator R$ 149,90 · Kit 3x
      Fator R$ 222,90 · Kit 6x Fator R$ 410,90 · Pastas Matte e Brilho R$ 59,90 · Kit Shampoo Duplo
      R$ 89,90 · Kit Hidratação R$ 99,90 · Kit Essencial R$ 99,90 · Kit Fator + Shampoo R$ 109,90.
      E o "de" riscado de lá, pra quem quiser o mesmo no **Preço**: Óleo R$ 79,90 · Balm R$ 78,90 ·
      Shampoo R$ 72,40 · Spray Matte R$ 119,90 · Fator R$ 133,20 · Kit Completo R$ 189,90 · Kit 2x
      Fator R$ 255,70 · Kit 3x Fator R$ 363,70 · Kit 6x Fator R$ 695,40 · Pastas R$ 74,90 · Kit
      Shampoo Duplo R$ 140,40 · Kit Hidratação R$ 144,80 · Kit Essencial R$ 140,80 · Kit Fator +
      Shampoo R$ 183,20. Se os preços do Bling forem de propósito, é só não pôr.
- [x] **Os endereços antigos que não são de produto — Claude Code.** Feito em 26/09 (entrega
      0125): os endereços do mapa do site da Nuvemshop (15 produtos, e 15 páginas e categorias),
      mais a busca, o carrinho e a conta de lá, levam à página certa da loja nova (ver a seção da
      0125, no fim). Os produtos têm o mesmo endereço nas duas lojas, e os 15 estão publicados.
- [x] **Os cupons da Nuvemshop, de novo na virada — Claude Code.** Não precisou: ele confirmou, na
      virada (27/09), que nenhum cupom foi criado lá depois de 26/09. A cópia é a lista de 26/09
      (entrega 0126): cupom criado lá depois disso não está aqui, e o de 1 uso que alguém gastar lá
      até a virada ainda vale uma vez aqui. Na véspera, a lista de lá de novo e uma migração nova só
      com o que mudou (esta já rodou).
- [x] Troca de domínio (fase 6) — **feita em 27/09** (ver "A virada do domínio", no fim). O que
      dependia do endereço da loja: `NEXT_PUBLIC_SITE_URL` na
      Vercel, `STORE_CORS`/`AUTH_CORS` e `LOJA_URL` (revalidação, logo e links dos e-mails) no
      Railway (ele também diz ao Marketing de que endereço contar as visitas), `SITE_ORIGENS` no
      Supabase, a indexação, o domínio no Pagar.me se ele passar a exigir, e o catálogo no Merchant
      Center e na Meta (ver a seção da 0134). Logo depois da troca,
      o Claude Code roda o `conferir-enderecos-antigos.mjs` contra o domínio: todo endereço da loja
      antiga tem que abrir. E, nas semanas seguintes, o cartão "página que não existe" da
      Observabilidade mostra o link antigo que ainda faltar (vindo de fora).
      O checkup de 26/09 (entrega 0136) juntou o que mais precisa, no dia:
      - `NEXT_PUBLIC_SITE_URL=https://www.fuckingbarba.com.br` — com o www (é o endereço que o
        Google já tem, o da Nuvemshop) e sem barra no fim — junto com `SITE_INDEXAVEL=true` SÓ em
        Production, e Redeploy sem cache (as duas entram no build).
      - Vercel → Domains: o www como principal, a raiz levando pro www, e o
        `fuckingbarba-loja.vercel.app` levando pro www também.
      - `LOJA_URL` no Railway = o endereço final, que não redireciona (o aviso de preço e estoque é um
        POST; num redirect ele vira GET e a loja para de atualizar). `STORE_CORS`/`AUTH_CORS` com os
        domínios exatos, sem o `https://*.vercel.app`.
      - DNS na GoDaddy: trocar SÓ o `@` e o `www`. O MX do Google (o e-mail), o `resend._domainkey`,
        o `send`, o SPF, o DMARC, o `google-site-verification` e o CNAME `dashboard` ficam como
        estão — sem eles param os e-mails de pedido e os códigos de entrar. Não trocar os
        nameservers.
      - Apagar a `NEXT_PUBLIC_LOJA_ATUAL_URL` na Vercel (ainda é o `www.SUALOJA.com.br` de exemplo).
      - Search Console: o sitemap novo (`https://www.fuckingbarba.com.br/sitemap.xml`), e o Claude
        Code roda o `conferir-links.mjs` contra o domínio (o robots contra o sitemap).
      - Uma compra real no cartão de outra pessoa logo depois da troca.

### 4. Fase 5

**Onde está (23/09):** das sete fases do doc de arquitetura, da 1 à 4 estão prontas (o que sobrou
delas está nas listas acima), e a 5 — Operação — está quase fechada. Ela fecha quando **um pedido
de verdade sair com nota, etiqueta e rastreio sem ninguém tocar nele**: o primeiro pago depois do
token da Frenet é esse teste (ver 1b e 1c). Falta:

- **no código:** os e-mails de carrinho abandonado (a lista no painel, com o passo em que cada
  pessoa parou e o botão do WhatsApp, saiu em 25/09, na entrega 0096; o evento de compra pro
  Google, a Meta e o TikTok, na 0094);
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
  sai. O `purchase` pro GA4, a Meta e o TikTok sai desde 25/09 (entrega 0094), no mesmo gancho
  (`apps/backend/src/subscribers/pagamento-capturado.ts`) e na mesma varredura.
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
  - **O Pix pago DEPOIS do cancelamento** (o QR continua pagável até vencer — ver o #7). Na hora
    do cancelamento o `fecharCobrancasDoPedido` do subscriber pega o que já tinha entrado e avisa
    certo. O que cai mais tarde é devolvido pela conciliação — e, desde 25/09 (entrega 0086), ganha
    o segundo e-mail, "Pedido #N: devolvemos o seu Pix" (`src/lib/avisar-devolucao.ts`, registro
    em `metadata.emails.devolvido`, log `[pedido] o pagamento de R$ X que entrou no #N depois do
    cancelamento foi devolvido`). Antes, o dinheiro voltava calado depois do "nada foi cobrado".
- Os e-mails do caminho da encomenda (`envio.ts`) já saem.
- **Envios — o que o desenho já tem lugar pra receber** (o contrato do parceiro está em
  `apps/backend/src/lib/envios/parceiro.ts`). Os dois primeiros desta lista saíram em 23/09 — a
  consulta do rastreio de hora em hora e o pedido pago indo sozinho pro painel da Frenet (ver 1b).
  Sobram:
  - avisar a LOJA de extravio e devolução (e-mail ou um bloco no admin com a linha do tempo) —
    hoje é o log (`[envio]`) e o painel da Frenet;
  - ~~o "entregue + pedido de avaliação" sete dias depois~~ — feito na entrega 0152, UM dia
    depois (pedido dele), pela rodada de hora em hora `pedir-avaliacoes` e não por assinante do
    `envio.mudou` (ver "Avaliações de verdade", no fim da 4.5);
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
  servidor — esconder botão não é permissão. Decidido na fase 1: rotas próprias (`/dashboard/*`)
  e uma tabela só de quem abre o quê (`ACESSO_PADRAO`, no backend, com o que o dono muda na tela
  da equipe desde a 0139); o controle de papéis do Medusa 2.21
  segue experimental (`MEDUSA_FF_RBAC`, desligado) e ficou de fora. Toda mudança fica registrada,
  com nome e hora.
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
  não se edita. E o **preço e o promocional** (o "de/por"), direto na lista (desde 25/09, entregas
  0098 e 0102).
- **Layout da home:** as seções editáveis, o **banner principal com até 5 slides**, a **barra de
  avisos do topo** (desde 26/09, entrega 0119), e nada vai pro site sem "Publicar".
- **Carrinhos abandonados:** a lista — quem parou, em que passo do checkout, e o botão pra chamar
  no WhatsApp (pronta em 25/09, entrega 0096). Depois, **5 e-mails** — 1 hora, 1 dia, 2 dias (com
  cupom), 3 dias (o cupom vence amanhã) e 5 dias (última chamada) —, com os textos editáveis e a
  prévia.
- **Cupons, Clientes e Newsletter, Configurações e Equipe.**
- **Observabilidade:** os problemas abertos em frase, com o que fazer; as integrações; os jobs
  com a última rodada; a velocidade do site.
- **Marketing** (resumo, funil, canais, produtos, ofertas, clientes por estado, pagamento e frete)
  ficou escondido de início e voltou em quatro partes em 26/09: o Resumo e a meta do mês (entrega
  0108), o Funil e os Canais (0110), os Produtos e as Ofertas (0113), e os Clientes e o Pagamento e
  frete (0115). Com o "O que os dados dizem" do Resumo (0122), o Marketing do protótipo está
  inteiro no painel.

Em aberto:

- [x] Aceitar JPG nas imagens também (a foto do celular quase sempre é JPG), convertendo pra WebP
      na subida? **Sim (24/09):** JPG, PNG e WebP; a loja guarda sempre em WebP.
- [x] Confirmar a ordem do desenvolvimento, logo abaixo — confirmada em 23/09.

A ordem proposta, uma entrega pequena por vez:

1. **A base:** `apps/dashboard`, o login por código, os papéis no servidor, a casca (menu,
   celular) e o deploy com o endereço.
2. **Pedidos e Início:** primeiro só leitura; depois as ações que já existem no admin (emitir a
   nota agora, tentar o estorno de novo).
3. **Produtos:** textos, seções e fundos (o `fb_pdp` que já existe), a caixa de compra e os vídeos.
4. **Home:** a fonte da home no metadata da loja (hoje é código), o banner com slides e o
   "Publicar".
5. **Carrinho abandonado:** a lista, com o passo e o WhatsApp (feita em 25/09, entrega 0096); os
   5 e-mails ficaram pra depois — são também o item de código que falta na fase 5.
6. **Cupons, clientes, newsletter, configurações e equipe.**
7. **Observabilidade:** guardar numa tabela o que hoje só vai pro log.

**Fase 1, a base — no ar desde 24/09 (entrega 0059, PR #43).** O painel entra por código no
e-mail, só pra quem é da equipe (quem não é ouve a mesma resposta e não recebe nada); o primeiro
dono é o e-mail do `DASHBOARD_DONO_EMAIL`, no Railway; o dono convida (o convite chega por e-mail e
vale 7 dias), muda o papel e tira da equipe — e o acesso cai no clique seguinte, mesmo com o
painel aberto. A casca é a do protótipo, no computador e no celular; as áreas que ainda não têm
tela dizem o que vão ter e em que fase chegam. Conferido de ponta a ponta pelo
`apps/dashboard/ferramentas/conferir-entrar.mjs` (60 checagens). O técnico está no AGENTS.md
("O painel da loja").

Depois do deploy — **você**, uma vez (feito em 24/09: o dono já entrou):

- [x] **Railway** (o backend): em Variables, `DASHBOARD_DONO_EMAIL` = o seu e-mail, o que você vai
      usar pra entrar, e `DASHBOARD_URL` = `https://dashboard.fuckingbarba.com.br`. As tabelas da
      equipe nascem sozinhas no pré-deploy.
- [x] **Vercel**: um projeto novo, do mesmo repositório, com Root Directory `apps/dashboard`. Nas
      variáveis: `MEDUSA_BACKEND_URL` (o mesmo endereço do Railway que a loja usa) e
      `REVALIDAR_SEGREDO` (o mesmo valor do Railway e da loja — sem ele, o painel não fala com o
      Medusa).
- [x] **O endereço**: no projeto novo da Vercel, Settings → Domains → `dashboard.fuckingbarba.com.br`.
      A Vercel mostra um registro CNAME; ele vai no DNS da GoDaddy (onde já estão os do Resend).
- [x] **Entrar**: abrir `dashboard.fuckingbarba.com.br`, digitar o e-mail do `DASHBOARD_DONO_EMAIL`
      e o código que chega. Depois, Configurações → Equipe e acessos → Convidar pessoa.

**Fase 2, parte 1: Pedidos e Início, só leitura — pronta em 24/09 (entrega 0060).** O Início
mostra o que precisa de alguém hoje (os pedidos pra despachar e por quê, nota com problema,
estorno que falhou — esse só pro dono —, cartão em análise), as vendas pagas de hoje e da semana,
o gráfico dos 7 dias, os pedidos do dia e os mais vendidos. Pedidos: a lista com busca e as fitas
de filtro, e o pedido inteiro — o caminho de seis passos (pedido feito, pagamento, nota, Frenet,
enviado, entregue), o que foi comprado, o histórico, o pagamento, a entrega e o cliente. O CPF
inteiro só o dono vê (e abre mascarado, até pra ele); o marketing não vê pedido nem nome de
cliente — só os números e os mais vendidos. Conferido pelo
`apps/dashboard/ferramentas/conferir-pedidos.mjs` (69 checagens, com um pedido de cada jeito).

- [x] **Parte 2:** as ações e as visitas — logo abaixo.

**Fase 2, parte 2: as ações do pedido e as visitas — pronta em 24/09 (entrega 0061).** No pedido:
"Emitir a nota agora" (a nota esperando a janela, pro pedido que precisa sair antes) e "Tentar a
nota de novo" (a que a loja desistiu de emitir, depois de alguém corrigir o que faltava), pro dono
e pra operação; "Tentar o estorno de novo", **só pro dono** — a operação vê a faixa, com "Estorno é
com o dono". Cada clique fica no histórico do pedido com o nome de quem apertou e no que deu, e o
estorno que falhou e depois saiu vira faixa verde. No Início, as **visitas do dia**, do Google
Analytics: o número pra todos ("−5% que ontem até as 9h"); pro dono e o marketing, o bloco com a
hora a hora, quem está no site agora, de onde vieram, os produtos mais vistos e quantas viraram
pedido pago ontem. Se o Google demorar ou cair, o resto do Início aparece do mesmo jeito.

**O Google soma as visitas com horas de atraso** (4 ou mais, na conta comum do Analytics): o
número de hoje é o que ele já somou, e o "no site agora" é na hora. No primeiro dia ligado (24/09)
a comparação com ontem deu "−92%" num dia normal — hoje incompleto contra ontem inteiro. Corrigido
na entrega 0062: a comparação é só nas horas que o Google já somou hoje, a tela diz até que hora,
e o fuso é o da propriedade do Analytics. De quebra: o
pedido estornado mostrava total R$ 0,00 (o Medusa desconta o estorno) — agora mostra o total que
foi feito. Conferido pelos `conferir-acoes.mjs` (32 checagens) e `conferir-visitas.mjs` (36).

Depois do deploy — **você**, pra ligar as visitas (as ações não precisam de nada) — **feito em
24/09**: uma conta de serviço só pra isso (no projeto "fuckingbarba" do Google Cloud, separada da
do Firebase, que é de administrador), Leitor na propriedade, as duas variáveis no Railway e o
`NEXT_PUBLIC_GA4_ID` na loja. Qual propriedade: a do GA4 que a loja já usa (a do `G-CS3QPK0QHL`, a
da Nuvemshop) — assim o histórico continua quando o endereço passar pra loja nova.

- [x] **Google Cloud** (console.cloud.google.com, com o e-mail dono do Analytics): crie um projeto
      (ex.: "fuckingbarba-painel"). Em "APIs e serviços" → "Biblioteca", procure **Google
      Analytics Data API** e clique em **Ativar**.
- [x] **A conta que só lê**: "IAM e administrador" → "Contas de serviço" → "Criar conta de
      serviço", nome `painel-ga4`, e "Concluir" (não precisa dar papel nenhum). Abra a conta →
      aba "Chaves" → "Adicionar chave" → "Criar nova chave" → **JSON**. Baixa um arquivo `.json`:
      ele é uma SENHA — não mande pra ninguém, nem pra conversa. (Se o Google disser que a criação
      de chave está bloqueada pela organização, me mande um print da tela.)
- [x] **No Analytics** (analytics.google.com): Administrador (a engrenagem) → "Gerenciamento de
      acesso à propriedade" → "+" → "Adicionar usuários" → cole o e-mail da conta de serviço
      (termina em `.iam.gserviceaccount.com`), papel **Leitor**, desmarque "Notificar" →
      "Adicionar". Ainda no Administrador → "Detalhes da propriedade": copie o **ID da
      propriedade** (só números — não é o `G-…`) e confira o fuso: **Brasília**.
- [x] **Railway** (o backend), em Variables, onde está o `DASHBOARD_DONO_EMAIL`:
      `GA4_PROPERTY_ID` = o número; `GA4_CREDENCIAIS` = abra o `.json` no TextEdit, copie TUDO e
      cole no valor. Salve (o Railway sobe de novo sozinho). Depois, apague o `.json` dos
      Downloads e da lixeira.
- [x] **Vercel, no projeto da LOJA** (não no do painel): hoje a loja nova não manda visita
      nenhuma pro Google — falta o `NEXT_PUBLIC_GA4_ID`. Em Settings → Environment Variables,
      `NEXT_PUBLIC_GA4_ID` = `G-CS3QPK0QHL`, e um Redeploy. Com ele, a loja passa a mostrar o aviso
      de cookies (é ele que decide quem entra na conta). Sem ele, o painel mostra só as visitas
      que o site da Nuvemshop ainda manda.
- [x] **Conferir**: abra o Início do painel. No lugar de "o Google Analytics ainda não está ligado"
      aparece o número de visitas de hoje. Se aparecer "o Google recusou a leitura", o e-mail da
      conta não está como Leitor na propriedade, ou a API não foi ativada no projeto.

**Fase 3, parte 1: Produtos — pronta em 24/09 (entrega 0063).** Em Produtos: a lista (preço e
estoque do Bling, só pra ver; as fitas No site, Rascunhos e Esgotados) e a página de cada produto.
Nela, pro marketing e pro dono — a operação vê, sem mexer:

- **A página do produto, seção por seção**, na ordem do site: ligar, desligar, subir e descer
  valem na hora. "Editar" abre o texto da seção e a **imagem de fundo**: uma pro computador e
  outra pro celular, em JPG, PNG ou WebP (a loja guarda sempre em WebP, no tamanho certo e sem a
  localização que a foto do celular carrega). Cada quadro tem o formato da seção no site, com o
  véu da cor dela por cima: o que aparece no quadro é o que aparece na página. Seção pela metade
  não salva, e a tela diz o que falta. O topo (fotos, preço e compra) é fixo.
- **A caixa de compra**: "Quantas unidades" (com a linha opcional embaixo de "1 unidade") ou "Leve
  junto" (até 2 produtos), com a prévia de como fica.
- **Subtítulo e categoria.** Nome, descrição, preço, peso e estoque vêm do Bling e só aparecem.
- **Publicar** o produto novo que chega do Bling em rascunho (sem foto ou sem categoria, a tela
  pergunta antes).
- **O que a equipe mudou**: cada mudança, com o nome de quem fez.

O quadro "Página do produto" do admin do Medusa agora só aponta pro painel.

**O tamanho certo de cada foto de fundo**, em pixels — a medida da seção na loja, com o texto de
hoje (o painel mostra em cima de cada quadro):

| Seção | Computador | Celular |
| --- | --- | --- |
| Benefícios | 2880 × 890 | 1170 × 1644 |
| Linha do tempo | 2880 × 820 | 1170 × 2448 |
| Rotina com outros produtos | 2880 × 1010 | 1170 × 2568 |
| Como funciona e modo de uso | 2880 × 1542 | 1170 × 3273 |
| Comparação | 2880 × 796 | 1170 × 1821 |
| Pra quem é | 2880 × 768 | 1170 × 1614 |
| Perguntas frequentes | 2880 × 1342 | 1170 × 2232 |

O assunto da foto vai no meio, um pouco acima do centro: a loja corta o que sobra nas bordas. Com
mais texto a seção cresce, e o corte muda um pouco. Foto em outra proporção também serve — o painel
diz quanto dela fica de fora. A faixa com foto não tem fundo (ela já usa a foto de um produto).

Na loja, de quebra: a foto de fundo passa pelo otimizador de imagem (cada tela baixa o tamanho
dela, e só quando chega perto) e troca pela do celular no ponto em que cada seção vira uma coluna;
o título dos "Produtos relacionados" é editável; e uma pergunta das Dúvidas com `</script>` não
quebra mais a página. Conferido pelo `conferir-produtos.mjs` (62 checagens, com a loja rodando) e
pelo `conferir-pdp.mjs` da loja (54).

Depois do deploy — **nada a fazer**: não tem variável nova (o backend ganhou o `sharp`, que o
Railway instala sozinho).

- [x] **Parte 2:** as fotos e os vídeos da galeria, o vídeo do "modo de uso" e os casos de antes e
      depois — logo abaixo.

**Fase 3, parte 2: a galeria com vídeo, o vídeo do modo de uso e o antes e depois — pronta em 24/09
(entrega 0064).** Na página do produto, no painel (marketing e dono; a operação vê):

- **Galeria de fotos** (o topo da página): subir foto, pôr em ordem e tirar — cada clique vale na
  hora. A capa é sempre a primeira foto: é ela que vai pra vitrine, pro Google e pro link no
  WhatsApp. Mexeu nas fotos aqui, trazer o catálogo do Bling (ou da Nuvemshop) de novo não troca
  mais as fotos daquele produto.
- **Vê na prática** (os vídeos — FORA da galeria desde 24/09, entrega 0071; antes o vídeo entrava
  no meio das fotos, escondido na última miniatura): no painel, uma caixa própria; na loja, a faixa
  do protótipo, embaixo da caixa de compra. Cada vídeo vira um cartão em pé, com o nome (opcional,
  até 40 letras: "Como aplicar", "A textura") e a duração; quem clica abre o vídeo numa janela, com
  som e os controles (fecha no X, no Esc ou clicando fora). Até 4 vídeos, na ordem do painel. O
  vídeo sobe direto pro servidor da loja, com a barra de progresso.
- **Vídeo do modo de uso**: na seção "Como funciona e modo de uso", ele entra no lugar da foto do
  modo de uso.
- **Antes e depois**: até 3 casos por produto — nome, tempo de uso, a foto de antes, a de depois e
  o que a pessoa disse. **Só grava com a caixinha da autorização por escrito marcada** (LGPD:
  "mandou no WhatsApp" não é autorização). A ressalva "o resultado varia" vai sempre junto na
  página. No site pode; em anúncio (Meta, Google), antes e depois não pode.

**O tamanho certo de cada um** (o painel mostra junto de cada quadro):

| O quê | Tamanho ideal |
| --- | --- |
| Foto da galeria | 1200 × 1200 px, quadrada |
| Vídeo do Vê na prática | 1080 × 1920 px, em pé (9:16), como o do celular — quadrado ou deitado toca inteiro na janela, com faixa escura |
| Vídeo do modo de uso | 1920 × 1080 px, deitado (16:9) |
| Foto de antes e de depois | 900 × 1050 px, em pé (6 × 7) |

Foto: JPG, PNG ou WebP. Vídeo: MP4 ou WebM, até 50 MB e, de preferência, até 30 segundos (acima
de 20 MB ele pesa pra quem abre no celular). O .MOV do iPhone não toca em todo navegador: exporte
como MP4 antes. Conferido pelo `conferir-produtos.mjs` (agora 89 checagens, com a galeria, o Vê na
prática — na loja também: a faixa depois da caixa de compra, a janela que abre e o Esc que fecha —
e os casos).

Depois do deploy — **nada a fazer**: não tem variável nova.

**Fase 4, parte 1: a home sai do código — pronta em 24/09 (entrega 0070).** Em "Layout da home",
pro marketing e pro dono (a operação não abre):

- **As 11 seções da home, na ordem do site:** ligar, desligar, subir e descer. O bloco escuro (o
  título da home pro Google) é fixo e fica no meio da página: quem desce passa por cima dele.
- **"Editar" abre o texto de cada seção:** o banner (chapéu, título, o texto do botão e o produto
  da campanha), a barra de vantagens (as duas escritas à mão; frete e parcelamento entram
  sozinhos), os títulos das faixas, o bloco escuro, os produtos do palco "Alta performance" (pelo
  menos 2, com o texto de cada um), a história da marca (os parágrafos, a frase em destaque, os
  números e a foto) e a última chamada. Seção pela metade não salva, e a tela diz o que falta.
  "Voltar ao texto original" põe de volta o texto de fábrica.
- **Rascunho e "Publicar":** tudo o que se mexe vai pro rascunho, e a loja continua mostrando a
  home de antes. A faixa amarela diz quantas mudanças estão esperando, e quais. "Publicar" manda
  pro site, que muda em segundos; "Desfazer as mudanças" joga o rascunho fora, e o site não muda.
- **O que a equipe mudou:** cada mudança, com o nome de quem fez.

Até alguém publicar, a home é a "de fábrica": o mesmo texto que já estava no ar. Antes de publicar,
confira as afirmações que o painel marca: "+1.000.000 clientes satisfeitos", "Aprovado em estudo
interno", o ano de fundação e o "+1M clientes impactados". O vídeo da história da marca continua
subindo no admin (Configurações da loja → Home) até a parte 3. Conferido pelo `conferir-home.mjs`
(43 checagens).

Depois do deploy — **nada a fazer**: não tem variável nova.

- [x] **Parte 2:** as imagens — logo abaixo.

**Fase 4, parte 2: o banner com carrossel e as fotos da home — pronta em 24/09 (entrega 0073).** No
"Layout da home" do painel:

- **Banner principal com até 5 slides**, que passam sozinhos (a cada 5, 7 ou 10 segundos, ou só
  quando a pessoa troca). **Cada slide é só a arte** (desde a entrega 0076, logo abaixo): a imagem
  ocupa o banner inteiro, com o texto dentro dela — **as mesmas artes da Nuvemshop servem**: 1920 ×
  700 no computador e 800 × 1000 (ou 1080 × 1350) no celular. A loja mostra a arte inteira, sem
  cortar. O slide leva pro produto escolhido, ou pra vitrine. A "Descrição da arte" é pra quem não
  enxerga e pro Google: escreva o que a arte diz.
- **Foto de fundo** no bloco escuro ("Fórmulas de alta performance…"), no carrossel de coleção, na
  Alta performance, na vitrine e no "Sobre a marca" — computador e celular, com o véu da cor da
  seção por cima, como na página do produto.
- **Foto própria na "Última chamada"** (computador e celular), com o degradê escuro por cima. Sem
  ela, continua a foto do produto.

Tudo vai pro rascunho, como os textos: o site muda no "Publicar".

Na loja: o carrossel troca sozinho, para de vez quando a pessoa mexe (toca, arrasta, aperta uma
seta ou uma bolinha), espera com o mouse em cima e não troca fora da tela. Quem pediu menos
movimento no celular ou no computador não vê troca nenhuma. A arte do primeiro slide baixa na
frente de tudo (é o que o Google mede); a do próximo, só dois segundos antes de aparecer.

**O tamanho certo de cada foto**, em pixels — a medida da seção na loja, com o texto e o catálogo
de hoje (o painel mostra em cima de cada quadro):

| Onde | Computador | Celular |
| --- | --- | --- |
| Arte do slide do banner | 1920 × 630 | 1080 × 1275 (ou 820 × 968) |
| Bloco escuro de marca | 2880 × 996 | 1170 × 1743 |
| Carrossel de coleção | 2880 × 1503 | 1170 × 2136 |
| Alta performance | 2880 × 939 | 1170 × 2867 |
| Vitrine | 2880 × 2462 | 1170 × 4108 |
| Sobre a marca | 2880 × 1049 | 1170 × 2710 |
| Foto da última chamada | 2880 × 984 | 1170 × 1184 |

A vitrine cresce com o catálogo, e o corte da foto dela muda junto. Conferido pelo
`conferir-home.mjs` (58 checagens, com as imagens, o carrossel e o fundo no navegador).

Depois do deploy — **nada a fazer**: não tem variável nova.

**O banner só com imagem — pronto em 24/09 (entrega 0076).** A pedido: sai o banner montado pela
loja (o painel amarelo com o chapéu, o título, o preço e o botão "Comprar agora"). Cada slide é só a
arte, com a descrição e pra onde leva. **Sem arte publicada, a home não tem banner** e começa na
barra de vantagens — é como ela fica no ar logo depois do deploy, até você publicar a primeira arte.

De quebra, um defeito da parte 1: depois do "Publicar", **a ordem e o liga/desliga das seções às
vezes não acompanhavam** — o texto mudava no site e a ordem ficava a velha, por dias. Corrigido (e
valia também pra ordem das seções da página do produto).

**Arrastar e soltar as fotos no painel — pronto em 24/09 (entrega 0078).** Em todo lugar do painel
que sobe foto ou vídeo — o fundo das seções (produto e home), as artes do banner, a foto da última
chamada, a galeria, o Vê na prática, as fotos de antes e depois e o vídeo do modo de uso —, dá pra
arrastar o arquivo do computador e soltar em cima do quadro: ele acende ("Solte aqui") e o arquivo
sobe como se tivesse sido escolhido, com as mesmas conferências. Solto em cima de uma foto que já
está lá, troca. Um arquivo por vez: com vários, sobe o primeiro e o quadro avisa. Solto fora de um
quadro, não acontece nada — antes, o navegador abria a foto no lugar do painel e perdia o que
estava sem salvar na gaveta. Conferido pelo `conferir-produtos.mjs` (92 checagens) e pelo
`conferir-home.mjs` (60), que agora também cobra a foto do celular do bloco escuro chegando no
celular.

Depois do deploy — **nada a fazer**.

- [x] **Parte 3:** o vídeo da história da marca no painel (hoje ele sobe no admin) e a "Prova
      social" com os casos de antes e depois das páginas dos produtos — logo abaixo.

**Parte 3: o vídeo da história e a prova social — pronto em 24/09 (entrega 0080).**

- **O vídeo da história da marca mudou pro painel.** Fica em Layout da home → Sobre a marca →
  Editar, no campo "Vídeo da história". Ele sobe como o vídeo do modo de uso: dá pra arrastar, a
  capa é um quadro do começo e o limite é de 50 MB. Vai pro rascunho e entra no site no
  "Publicar", como o resto da home. Pode ser em pé ou deitado, que a seção se ajeita. Sem vídeo, a
  seção mostra a foto do produto escolhido.
- **O vídeo que está no ar vem sozinho.** O deploy leva pro painel o vídeo que foi subido no admin
  (Configurações da loja → Home), no publicado e no rascunho. O site não muda, e o painel já abre
  com ele. A tela do admin agora só avisa que o vídeo mora no painel.
- **A "Prova social" da home mostra os casos das páginas dos produtos.** São os mesmos do "Antes e
  depois" de cada produto, com a autorização por escrito. A home não tem lista própria: um caso
  vale na página do produto e na home. Ela mostra até 8 casos, alternando os produtos. Cada cartão
  leva pro produto que a pessoa usou e vem com a ressalva de que o resultado varia. **Sem caso
  nenhum, a seção não aparece.**
- No painel, a gaveta da Prova social mostra de onde vêm os casos: cada produto, com a foto do
  "depois". A lista diz quantos casos há ("3 casos", "sem casos").
- De quebra, no celular o cartão do antes e depois vazava pro lado quando o nome do produto era
  comprido. Ele nunca tinha aparecido na loja; agora cabe na tela.

Conferido pelo `conferir-home.mjs` (76 checagens). Entre elas: o vídeo antigo do admin não volta
por baixo quando a home não tem vídeo, e o caso que sai do produto some da home. A migração foi
rodada no banco local: trouxe o vídeo pro publicado e pro rascunho, e rodada de novo não mexeu em
nada.

Depois do deploy — **nada a configurar.** Pra testar, espere uns 10 minutos (o Railway sobe o
backend novo):

1. Painel → Layout da home → Sobre a marca → Editar. O vídeo de hoje já tem que estar lá.
2. A Prova social só aparece no site quando algum produto tiver caso: Produtos → o produto → Antes e
   depois. Depois de salvar o caso, a home mostra ele em segundos.

**Fase 6, parte 1: Clientes — pronto em 24/09 (entrega 0082).** A fase 6 começa pelos clientes, a
pedido.

- **A lista:** quem já comprou ou tem conta na loja, com quantos pedidos, quanto gastou (só o que
  foi pago), a cidade e se aceita ofertas. A busca é por nome ou e-mail. Quando a mesma pessoa tem
  dois cadastros no Medusa (o de uma compra sem conta e o da conta), ela aparece numa linha só.
- **A ficha:** e-mail, celular, CPF (inteiro só pro dono, no clique), endereço, as ofertas que a
  pessoa aceitou (onde e desde quando) e os pedidos dela.
- **A aba Newsletter:** quem aceitou receber ofertas por e-mail, juntando a newsletter do rodapé e
  a caixa de "Meus dados" da conta. Tem os números, o link pra ficha de quem é cliente, "Baixar
  CSV" e "Tirar". Tirar apaga de verdade, dos dois lugares; a caixa do WhatsApp fica.
- **Quem vê o quê:**
  - o dono vê tudo;
  - a operação não vê a aba Newsletter e vê o CPF mascarado;
  - o marketing só vê quem aceitou ofertas, e sem cidade, celular, CPF, endereço e pedidos.
- O pedido de exclusão de dados (LGPD) aparece na ficha, desligado, esperando a revisão jurídica.
- O Início do marketing agora conta o mesmo número da aba (rodapé e conta juntos) e leva pra ela.
- A ficha tem lugar pras etiquetas do CRM (o plano "Ciclo da Barba"), quando ele chegar.

Conferido pelo `conferir-clientes.mjs` (37 checagens, novo).

Depois do deploy — **nada a configurar.**

**Fase 6, parte 2: Cupons e descontos — pronto em 24/09 (entrega 0085).**

- **Cupom novo pelo painel:** Cupons e descontos → Novo cupom. Você escolhe:
  - o código, que é o que a pessoa digita (o painel grava em maiúsculas; na loja, tanto faz);
  - o tipo: % do pedido ou R$ fixo;
  - o pedido mínimo, contado nos produtos, sem o frete — a mesma conta do frete grátis;
  - até quando vale (até o fim do dia, no horário de Brasília);
  - o limite de usos no total;
  - "uma vez por cliente" e "só na primeira compra", pelo e-mail da compra.
- A gaveta mostra a frase do cupom antes de criar. Criou, já vale no checkout.
- **Quem confere é a loja, não a tela.** O mínimo, a data, o limite e o "uma vez" são conferidos
  no carrinho, a cada mudança. Se a pessoa tira um produto e fica abaixo do mínimo, o cupom sai
  sozinho. Se ela digita o cupom antes do e-mail, a loja confere de novo quando o e-mail chega.
  Cupom recusado diz "Esse cupom não vale pra este pedido."
- **A lista:** cada cupom em frase, os usos ("23 de 100 usos"), quanto deu de desconto, quanto
  vendeu em pedidos pagos e a situação: valendo, pausado, vencido ou esgotado. A chave pausa e liga
  na hora. Vencido e esgotado não têm chave: pra valer de novo, crie outro cupom. Os cupons que já
  existiam no Medusa aparecem também.
- **Os descontos automáticos**, embaixo, em frase: o desconto por quantidade, a oferta do checkout
  (com em quantos pedidos pagos ela entrou nos últimos 7 dias) e o frete grátis de hoje.
- **Quem vê:** o dono e o marketing. Criar, pausar e ligar fica no registro da equipe.

Ficou pra depois:

- [x] O cupom de **frete grátis**: feito na entrega 0128 (ver "Cupons do jeito da Nuvemshop", no
      fim) — o resumo, o e-mail e a conta mostram o frete grátis sem repetir o desconto.
- [ ] O botão **"Mudar"** do desconto por quantidade: as faixas ainda mudam só no código.

Conferido pelo `conferir-cupons.mjs` (25 checagens, novo).

Depois do deploy — **nada a configurar.**

**Fase 7, parte 1: Observabilidade — pronto em 25/09 (entrega 0087).** A saúde da loja num lugar só,
em frase, com o que fazer. A parte 2 (o site) vem depois.

- **Os problemas:** a tela junta o que quebrou.
  - Nos pedidos: o estorno que não saiu (só o dono vê, como no Início), a nota travada, o pedido que
    a Frenet recusou e o pacote que não chegou.
  - A conexão com o Bling caída, e a rotina automática que está falhando ou parou.
  - E o que aconteceu e passou: a cotação do frete que falhou, o e-mail que não saiu, o Pagar.me e
    o Bling que não responderam. Um cartão por dia, contando as vezes.
- **Dois tipos de problema:**
  - os que dependem de um estado da loja (o estorno, a nota, o Bling, as rotinas) **saem sozinhos**
    quando forem resolvidos. A loja confere de 5 em 5 minutos, e na hora em que alguém abre a tela;
  - os que aconteceram e passaram ficam até alguém **marcar como visto**. Se acontecer de novo
    depois disso, o cartão volta. Quem marcou fica registrado.
- **O número vermelho no menu** diz quantos problemas graves estão abertos.
- **As integrações:** a loja, o Medusa, o Pagar.me, o Bling, a Frenet, o Resend e o Google, cada um
  com o último sinal ("14 e-mails hoje · 1 não saiu", "Último aviso hoje, 21:08").
- **As rotinas automáticas:** as 9 que a loja faz sozinha — quando rodaram, quanto levaram, se deram
  certo e a próxima. Se todas pararem, a tela avisa e diz o que fazer: reiniciar o Medusa no
  Railway.
- **Quem vê:** o dono e a operação. O marketing não vê a área.
- Nada de dado de cliente fica guardado: o e-mail vai mascarado, e o código de acesso, coberto.

Ficou pra parte 2:

- [x] As páginas que não existem (404) e os erros no navegador, mandados pela loja — parte 2.
- [x] A velocidade medida nas visitas de verdade: carregar, responder ao toque, não pular na tela —
      parte 2.
- [x] O "site no ar" dos últimos 30 dias — parte 2.
- [x] Quem é avisado por e-mail, por papel — com as Configurações (entrega 0093): a nota vai pra
      operação e o dono; o Bling e o estorno, pro dono.

Conferido pelo `conferir-observabilidade.mjs` (27 checagens, novo).

Depois do deploy — **nada a configurar.** O Railway cria as tabelas sozinho. Nos primeiros minutos,
as rotinas de hora em hora aparecem como "Ainda não rodou"; as outras entram na primeira rodada.

**O total do pedido no painel é o cobrado — consertado em 25/09 (entrega 0088).** O painel
mostrava, como total do pedido, a conta de ANTES dos descontos: o pedido com cupom ou com a oferta
do checkout aparecia com o valor cheio. No banco local, um pedido cobrado R$ 153,01 aparecia como
R$ 158,50. Isso valia pra lista de pedidos, o pedido aberto, as vendas do Início (hoje, a semana,
o ticket e o gráfico), o "gastou" dos clientes e o "vendeu" dos cupons. Agora todos mostram o que
foi cobrado, com os descontos — e o pedido cancelado e estornado continua mostrando o que foi
cobrado, e não R$ 0,00. O técnico está no AGENTS.md ("O total do pedido é o cobrado").

Conferido pelo `conferir-pedidos.mjs` (77 checagens, agora com oito pedidos: o pago e um estornado
levam a oferta do checkout), pelo `conferir-clientes.mjs` (37) e pelo `conferir-cupons.mjs` (25). Os
três comparam o total do painel com o que o Pagar.me cobrou; com o código de antes, essas checagens
falham.

Depois do deploy — **nada a configurar.** As vendas do Início e o "gastou" podem aparecer um pouco
menores que antes: a diferença é o desconto que a loja deu.

**Fase 7, parte 2: o site — pronto em 25/09 (entrega 0090).** O que acontece no navegador de quem
visita a loja, na mesma tela.

- **A página que não existe:** quem cai numa página que não existe vira um cartão do dia, com as
  páginas e quantas visitas. Se o link veio da própria loja, é link quebrado nosso (pra olhar); de
  fora — link antigo, digitado, buscador —, é pra saber. Na virada (fase 6), é aqui que aparecem os
  links antigos da Nuvemshop que ainda faltam redirecionar.
- **O erro no navegador:** o erro que estourou na tela de quem visitava vira um cartão do dia, com o
  mais comum e a página.
- **A velocidade de verdade:** cada visita mede três coisas e manda sozinha — o tempo pra carregar,
  pra responder ao toque, e o quanto a tela pula. A tela mostra os últimos 28 dias, no celular e no
  computador, com a régua do Google (bom, precisa melhorar, ruim), e a página mais lenta no
  celular.
- **O site no ar:** a loja é conferida de 5 em 5 minutos. A tela mostra a porcentagem dos últimos
  30 dias e a última queda; se a loja cair, vira problema — grave enquanto estiver fora.
- Os números do alto agora são os do protótipo: problemas, rotinas, site no ar e o carregar no
  celular. Os e-mails do dia seguem no cartão do Resend, nas integrações.
- Nada identifica quem visita: sem cookie, sem IP guardado, a página sem a busca e sem o id do
  pedido, e, do link de onde a pessoa veio, só o domínio ("google.com").

**Enquanto o domínio for da Nuvemshop, quase ninguém visita a loja nova:** a velocidade e as páginas
que não existem só ganham número de verdade depois da virada. Até lá, são as suas visitas e as de
teste.

Conferido pelo `conferir-observabilidade.mjs` (33 checagens: 6 novas, que abrem a loja local).

Depois do deploy — **nada a configurar.**

**A ressalva do antes e depois ficou curta — 25/09 (entrega 0092).** A pedido, embaixo dos casos
de antes e depois (na página do produto e na Prova social da home) fica só "O resultado varia de
pessoa pra pessoa." Saiu "Fotos de clientes reais, publicadas com autorização. Mesma pessoa, mesmo
ângulo, sem filtro." O "resultado varia" ficou porque é a proteção contra reclamação de propaganda
enganosa (CDC art. 37) — foi a escolha, depois de ouvir o risco de tirar tudo. As regras pra um caso
subir não mudaram: a autorização por escrito (o painel não grava sem ela) e a mesma pessoa, no
mesmo ângulo. Conferido pelos `conferir-home.mjs` (76) e `conferir-produtos.mjs` (92).

Depois do deploy — **nada a configurar.**

**Fase 6, parte 3: Configurações — pronto em 25/09 (entrega 0093).** O que muda como a loja
funciona, no painel, com as abas do protótipo. Só o dono entra.

- **Dados da empresa:** razão social, CNPJ, endereço, WhatsApp, e-mail, horário e prazo de
  postagem. Cada campo é conferido na hora: o CNPJ pelos dígitos, o WhatsApp com DDD, o e-mail. O
  que está errado aparece embaixo do campo, e nada é gravado pela metade. Salvou, a loja mostra em
  alguns segundos, no rodapé, no `/contato` e nas páginas legais. A faixa amarela do alto diz o que
  ainda está em branco na loja.
- **Frete:** a promoção (nenhuma, frete grátis ou preço fixo), a partir de quanto em produtos, e se
  vale na opção mais barata ou em todas. A frase "Hoje: …" diz a regra que está valendo. Embaixo,
  **"Se a Frenet cair"**: o preço e o prazo de emergência. Em branco, a loja para de vender até a
  cotação voltar; com preço, o prazo é obrigatório.
- **Pagamento e Entrega:** só pra conferir, em frase — o Pagar.me, o Pix (vale 30 minutos), as
  parcelas, os estornos, a cotação da Frenet, o pedido que vai sozinho pro painel da Frenet e o
  rastreio. Mudar isso é no código e nas variáveis do Railway.
- **Nota fiscal:** o Bling (conectado ou caído), **"Quando a nota sai"** (na hora, 5, 15 ou 30
  minutos, 1, 2 ou 4 horas — as mesmas da tela do ERP no admin) e as pendências, cada uma com o
  "Ver" do pedido. O que tem prazo na SEFAZ vem primeiro. Com o Bling fora do ar, as notas que não
  saíram pela mesma razão viram uma linha só ("112 notas ainda não saíram"), e a lista tem teto de
  30 linhas.
- **E-mails:** os do cliente (o que sai e o que ainda não) e os da equipe, cada um com o papel que
  recebe e quem recebe hoje.
- **Quem é avisado, por papel:** a nota que não saiu, a nota pra conferir e a nota pra cancelar vão
  pra operação e pro dono; a conexão do Bling caída e o estorno que não saiu, só pro dono. Sem
  ninguém do papel no painel, vai pro dono; sem ninguém no painel, pros usuários do admin do Medusa,
  como antes.
- **A tela de Configurações do admin do Medusa fica de reserva.** As duas gravam o mesmo lugar; o
  painel confere campo a campo, o admin só descartava o valor ruim em silêncio.
- Cada mudança fica no registro da equipe.

Conferido pelo `conferir-configuracoes.mjs` do painel (18 checagens, novo; ele desfaz o que mudou,
mesmo quando falha) e pelo `conferir-observabilidade.mjs` (34: o e-mail do estorno vai pro dono, e
não pra operação). De quebra, o de observabilidade parou de falhar às vezes: ele jogava o erro de
teste antes de a loja ficar pronta pra ouvir.

Depois do deploy — **nada a configurar.** Pra testar: Painel → Configurações → Dados da empresa,
preencha e Salvar; o rodapé da loja mostra em alguns segundos.

**Configurações, parte 2: Integrações — pronto em 25/09 (entrega 0094).** Uma aba nova em
Configurações pros códigos de medição e anúncio, a compra avisada a cada plataforma, e a faixa de
cookies valendo de verdade.

- **Os códigos:** GA4, Google Ads (e o rótulo da conversão de compra), Pixel da Meta, Microsoft
  Clarity e Pixel do TikTok. Pode colar só o código ou o trecho inteiro que a plataforma dá: o
  painel acha o código dentro. Em branco, a integração fica desligada. Embaixo de cada campo, onde
  achar o código na plataforma.
- **Nada carrega antes do "Aceitar".** Até hoje o GA4 carregava antes da resposta, e a política de
  privacidade prometia que não — **consertado**. A faixa agora diz a quem a pessoa está dizendo sim
  ("do Google, da Meta, do TikTok e da Microsoft") e **pergunta de novo a todo mundo uma vez**: a
  resposta de antes era só pro Google Analytics. Se entrar um parceiro novo no painel, ela pergunta
  de novo; o "não" vale pra sempre.
- **O que cada plataforma recebe**, só de quem aceitou: o produto visto, o que entra e sai da
  sacola, o começo do checkout, a entrega escolhida e a forma de pagamento.
- **A compra sai do servidor** pra Meta, o GA4 e o TikTok quando o pagamento entra — conta o Pix
  pago depois e quem usa bloqueador. Só de quem aceitou os cookies, e só pra plataforma com o
  código no painel e a chave no Railway. Uma vez por pedido; se a plataforma estiver fora do ar, a
  loja tenta de novo sozinha, por 24 horas. Se ela recusar (a chave errada), vira problema na
  Observabilidade, só pro dono.
- **A compra no Google Ads** sai da tela de obrigado, quando o pagamento entra (o Google Ads não
  recebe compra do servidor sem a API dele). O Pix pago com a tela fechada não conta ali.
- **A Clarity** grava como a página é usada, com os dados cobertos no checkout, na conta e na tela
  de obrigado.
- **A política de privacidade foi reescrita** com o que a loja faz hoje: os terceiros de sempre
  (Pagar.me, Resend, Frenet, Bling, que faltavam) e, só com o aceite, Google, Meta, TikTok e
  Microsoft. Saiu "não usa pra montar público de anúncio" — com o aceite, usa. **Vale passar pro
  jurídico**, junto da revisão que já estava pendente (seção 3).
- A aba **"A compra"** mostra, plataforma a plataforma, se a compra está saindo e o que falta.

Conferido pelo `conferir-integracoes.mjs` (24 checagens, novo): o painel, a loja antes e depois do
"Aceitar" (com os scripts de fora trocados por um de mentira) e a compra pelo servidor, com a Meta,
o GA4 e o TikTok falsos. E pelos testes de unidade da compra (formato de cada plataforma, e-mail e
telefone embaralhados, quem pode receber).

Depois do deploy — **o que você faz:**

- [x] Painel → Configurações → **Integrações**: cole os códigos e clique em Salvar. O do GA4 é o de
      hoje, `G-CS3QPK0QHL` (até você pôr no painel, vale o da variável da Vercel). **Feito em
      25/09:** GA4, Pixel da Meta e Google Ads (com o rótulo da compra), os mesmos do site antigo.
      TikTok e Clarity ficaram desligados de propósito.
- [x] No Railway, no serviço do Medusa → Variables, as três chaves da compra pelo servidor (o
      passo a passo de cada uma está no `apps/backend/.env.example`). **Feito em 25/09** com as da
      Meta e do GA4; a do TikTok fica pra quando ele for ligado:
  - `META_CAPI_TOKEN`: Gerenciador de Eventos → o pixel → Configurações → API de Conversões →
    Gerar token de acesso;
  - `GA4_API_SECRET`: GA4 → Administrador → Fluxos de dados → o site → Chaves secretas da API do
    Measurement Protocol → Criar;
  - `TIKTOK_EVENTS_TOKEN`: TikTok Ads Manager → Ferramentas → Eventos → o pixel → Configurações →
    Gerar token de acesso.
- [x] Conferir na aba Integrações: "A compra" com **Ligado** em cada plataforma que você usa —
      Meta, GA4 e Google Ads, em 25/09.
- [ ] No Google Ads, deixe **uma** conversão de compra como principal: a da tela de obrigado (o
      rótulo) ou a importada do GA4 — as duas juntas contam a compra em dobro.
- [ ] Quando ligar a Clarity: Settings → Setup, o mascaramento em "Balanced" (o padrão) ou
      "Strict".

Chave nunca passa pela conversa. Enquanto o domínio for da Nuvemshop, quase ninguém visita a loja
nova: os números de verdade começam depois da virada.

**O pedido #19 que a Frenet recusou — consertado em 25/09 (entrega 0095).** O #19 foi o primeiro
pedido a ir sozinho pro painel da Frenet, e voltou recusado "sem motivo na resposta".

- **O motivo era nosso:** a loja mandava a caixa do pedido (`Volumes`) como uma lista com uma caixa
  dentro, e a documentação da Frenet pede a caixa sozinha. A Frenet recusou antes de ler o pedido,
  num formato de erro que a loja não sabia ler — por isso "sem motivo".
- **Consertado:** a caixa vai como a documentação pede. E a loja agora lê o motivo em qualquer
  formato que a Frenet mandar: se ela recusar outro pedido, a faixa diz o campo.
- **E a resposta de sucesso** passou a ser lida nos dois formatos da documentação. Lendo só um, um
  pedido que entrou pareceria não ter entrado, e a loja mandaria de novo — o mesmo pedido duas
  vezes no painel da Frenet.
- **Botão novo:** no pedido que a Frenet recusou, a faixa vermelha tem **"Mandar pra Frenet de
  novo"** (dono e operação). Fica no histórico do pedido, com o nome de quem apertou.
- Se você já fez a etiqueta de um pedido à mão no painel da Frenet, **não aperte** o botão nele: o
  pedido apareceria duas vezes lá.

Conferido pelo `conferir-frenet.mjs` (9 checagens, novo: a recusa com o campo, o botão, o
histórico) e pelo `conferir-envio.mjs` da loja com o registro ligado (82), com a Frenet falsa agora
seguindo o formato da documentação — com o código de antes, ela recusa como a de verdade recusou.

Depois do deploy — **o que você faz:**

- [x] Painel → Pedidos → **#19** → **"Mandar pra Frenet de novo"** — só se você ainda não fez a
      etiqueta dele à mão. Deu "entrou", é só gerar a etiqueta no painel da Frenet. Se ela recusar
      de novo, o aviso diz o motivo: me manda um print. **Feito em 25/09: funcionou.**

**Carrinhos abandonados, parte 1: a lista — pronta em 25/09 (entrega 0096).** A área Carrinhos
abandonados do painel deixou de ser "em breve". Os e-mails automáticos ficam pra outra entrega,
como combinado.

- **Quem aparece:** quem pôs produto na sacola e não fechou a compra, nos últimos 30 dias. Uma
  linha por pessoa, com a sacola mais recente dela (a mesma pessoa abre mais de uma: outro
  aparelho, outro dia).
- **Em que passo parou:** Sacola › Contato › Entrega › Pagamento, com o passo em amarelo e uma
  frase — "Parou no contato, o primeiro passo", "Deu o contato e parou na entrega", "Chegou no
  pagamento e não pagou", "Tentou pagar e não fechou" ou "Tentou pagar e o pagamento não passou"
  (o cartão recusado, por exemplo). A régua é a mesma do checkout da loja.
- **O botão do WhatsApp:** abre o WhatsApp (no computador, o WhatsApp Web ou o aplicativo) com o
  número da pessoa e uma mensagem pronta, com o primeiro nome e o produto — dá pra mudar antes de
  mandar. **Quem manda é você**, do seu WhatsApp: o painel não manda nada sozinho. Depois do
  clique, a linha mostra "Chamado por (nome), (quando)", pra ninguém da equipe chamar a mesma
  pessoa duas vezes.
- **Os filtros:** **Parados** (mais de 30 minutos sem mexer na sacola), **No site agora** (mexeu há
  menos de 30 minutos — pode estar comprando neste minuto; melhor esperar) e **Voltaram e
  compraram** (fez um pedido depois, com o mesmo e-mail).
- **Sem contato:** quem pôs na sacola e nem deu o e-mail — é a maioria em toda loja. Vira só um
  número: não há com quem falar.
- **Quem vê:** dono e operação veem tudo e chamam; o marketing vê a lista com o e-mail mascarado,
  sem o telefone e sem o botão.
- **A política de privacidade** ganhou uma linha: quem deixar a compra no meio do caminho pode ser
  chamado no WhatsApp por uma pessoa da loja, e basta responder que não quer. Vai junto da revisão
  jurídica que já estava pendente.

Conferido pelo `conferir-carrinhos.mjs` (11 checagens, novo): um carrinho parado em cada passo,
feito pela API da loja como o checkout faz, a mesma pessoa com dois carrinhos, quem voltou e
comprou, o link do WhatsApp, o clique anotado, o marketing e o celular. E pelos testes de unidade
da régua (11).

Depois do deploy — **nada a configurar.** Pra testar: Painel → **Carrinhos abandonados**. Enquanto
o domínio for da Nuvemshop, quase só os seus testes aparecem ali.

**Produtos: o preço e o promocional na lista — prontos em 25/09 (entregas 0098 e 0102).** Até aqui
o preço era só o do Bling, e a promoção da loja antiga não veio na importação. A 0098 pôs a
promoção atrás de um botão ("Pôr em promoção"); a pedido da loja, a 0102 trocou pelos dois campos,
como na Nuvemshop — **Preço** e **Promocional** —, e o preço também passou a se mudar no painel.

- **Como:** Painel → Produtos → escreva no campo e aperte **Enter** (ou saia do campo): salva. O
  **Esc** volta o valor de antes. **Promocional vazio** é sem promoção. O desconto aparece embaixo
  do promocional enquanto você digita.
- **Com promocional, o preço fica riscado** — na lista e na loja, que mostra os dois (o riscado,
  com a %) na página do produto, nas vitrines e na busca, em segundos.
- **O preço mudado no painel é do painel:** a importação do catálogo do Bling não troca mais o
  preço daquele produto (o nome, a descrição, o peso e as medidas continuam vindo de lá). O
  detalhe do produto diz de onde vem o preço — "mudado no painel" ou "do Bling". O preço do Bling
  continua lá, no Bling; a nota fiscal sai com o preço do pedido.
- **"Quantas unidades"** (2 e 3 unidades) sai do preço de hoje — o promocional, se houver —, na
  hora. O cupom e a oferta do checkout descontam em cima dele.
- **O painel recusa**, com o recado embaixo do campo: promocional igual ou maior que o preço;
  desconto de mais de 80% (5,99 no lugar de 59,90); preço que muda mais de 5 vezes de uma vez
  (8,99 ou 899,00 no lugar de 89,90); e preço que passaria por baixo do promocional.
- **Quem muda:** dono e marketing; a operação vê os dois valores, sem campo. Fica no histórico do
  produto: "Fulano mudou o preço — de R$ 72,40 pra R$ 79,90", "Fulano pôs a promoção — de R$ 79,90
  por R$ 39,90".
- **O painel manda no de/por:** uma promoção antiga (feita no admin do Medusa) aparece com "de uma
  lista de preço do admin"; mudar o promocional pelo painel substitui ela.
- **De quebra, um conserto nos Carrinhos (0096):** na linha de quem voltou e comprou, o link do
  pedido cobria a linha inteira, e o botão do WhatsApp não abria. Consertado.

Conferido pelo `conferir-promocao.mjs` (17 checagens, novo: os dois campos, o Enter e o Esc, o que
é recusado, o que a loja cobra por 1, 2 e 3 unidades, a página da loja, a marca contra a
importação, o histórico, a operação e o celular) e pelo `conferir-carrinhos.mjs`, que ganhou a do
botão (12). E pelos testes de unidade do preço e da promoção, das faixas saindo do preço de hoje e
da importação deixando o preço do painel.

Depois do deploy — **o que você faz:**

- [ ] Os preços de hoje, antes da virada: ver "Os preços, antes da virada", na seção 3.

**Home: o banner mais baixo, sem faixa branca, e a descrição opcional — pronto em 26/09 (entrega
0103).**

- **A descrição da arte ficou opcional.** O slide salva só com a arte. Sem a descrição, a loja
  descreve o slide (pra quem não enxerga e pro Google) pelo nome do produto pra onde ele leva — ou
  "Ver todos os produtos".
- **Sem faixa branca:** a arte agora PREENCHE o banner. A do celular (820 × 1000) era um pouco mais
  larga que a caixa (4 × 5), e sobrava branco em cima e embaixo.
- **Mais baixo:** no computador, de 1920 × 700 pra 1920 × 630 (numa tela de 1440, de 525 pra 473
  px); no celular, de 4 × 5 pra 1080 × 1275 (de 488 pra 460 px). As quatro artes no ar em 26/09
  cabem sem perder texto — medidas uma a uma: sai só borda, uns 5% em cima e embaixo no computador
  e uns 2% no celular.
- **As próximas artes:** 1920 × 630 no computador e 1080 × 1275 no celular (o painel mostra em cima
  de cada quadro). Arte noutra medida entra do mesmo jeito: o painel avisa quanto sai de cada borda
  — deixe o texto longe delas.
- Sem a arte do celular, o celular mostra a do computador inteira (pequena), como antes.

Conferido pelo `conferir-home.mjs` (77 checagens: o slide sem descrição salva e a loja usa o texto
do link; a caixa na altura nova e a arte preenchendo, no computador e no celular). As medidas
foram tiradas das artes no ar, e a prévia com o CSS novo aplicado na loja de verdade mostrou as
quatro sem perder texto.

Depois do deploy — **nada a configurar.**

**Home: as bolinhas do banner embaixo da arte, e o slide passando quando a barrinha enche — pronto
em 26/09 (entrega 0106).**

Os dois pontos que ficaram do banner da 0103:

- **As bolinhas saíram de cima da arte:** ficam numa faixa escura logo embaixo dela — em cima,
  cobriam o botão desenhado na arte do celular. A faixa soma 24 px: com dois slides ou mais, o
  banner inteiro fica com 484 px no celular e 497 numa tela de 1440 — ainda menos que antes da 0103
  (488 e 525).
- **O slide passa quando a barrinha enche.** Antes eram dois relógios: a barra começava a encher
  antes de a página terminar de carregar, e no celular o slide levava mais um tempo pra passar; com
  o mouse em cima, a barra seguia enchendo com o slide parado. Agora a barra é o relógio (medido: o
  slide anda uns 10 a 20 milésimos depois de ela encher). O mouse em cima, o banner fora da tela ou
  a aba escondida seguram a barra onde está, e ela continua de onde parou.

Conferido pelo `conferir-home.mjs` (80 checagens; as 3 novas: as bolinhas embaixo da arte, o mouse
em cima segurando a barra, o slide passando quando ela enche) e pelo carrossel com as artes de
verdade na loja local (aba escondida, banner fora da tela, foco do teclado, bolinha clicada e
"menos movimento" no sistema).

Depois do deploy — **nada a configurar.**

**Home: o palco da Alta Performance no compasso da barrinha — pronto em 26/09 (entrega 0107).**

O mesmo conserto do banner (0106), no palco dos produtos:

- **A barrinha começa quando a pessoa chega no palco.** Antes ela enchia desde o carregamento da
  página: lá embaixo, a pessoa chegava com a barra já cheia, e o produto só trocava uns 5 segundos
  depois (medido na loja no ar: 5,8 s).
- **O produto troca quando a barrinha enche** (medido: uns 10 milésimos depois).
- **O mouse em cima segura** (novo no palco): quem está lendo o card, ou indo pro "Comprar", não vê
  o produto trocar debaixo do mouse. O foco do teclado dentro do palco, o palco fora da tela e a
  aba escondida também seguram; a barra continua de onde parou. Escolher um produto pelas bolinhas
  continua parando de vez.

Conferido pelo `conferir-home.mjs` (82 checagens; as 2 novas: a barrinha começando na chegada e o
produto trocando quando ela enche; o mouse em cima segurando) e pelos casos no navegador (aba
escondida, fora da tela, foco do teclado, bolinha clicada, "menos movimento" e o passo mais longo
no celular). O banner continua igual (os mesmos casos, de novo).

Depois do deploy — **nada a configurar.**

**Painel: Marketing, parte 1 — o Resumo e a meta do mês — pronto em 26/09 (entrega 0108).**

A área Marketing do protótipo volta, em partes. A primeira fica no menu, em Análise → Marketing
(dono e marketing; a operação não vê):

- **Os cinco números do período** — hoje, 7, 30 ou 90 dias —, contra o período de antes, do mesmo
  tamanho: receita, pedidos pagos, visitas, conversão e ticket médio. "7 dias" é contra os 7 dias
  antes, até a mesma hora; "hoje", contra ontem a esta hora.
- **A meta do mês:** quanto já foi vendido, a barra, onde o mês fecha no ritmo de agora e quanto
  falta por dia (contando hoje). Só o dono define ou muda; o marketing vê.
- **A receita no tempo** (por hora, por dia ou por semana) e **os produtos que mais venderam**, em
  reais.
- **As visitas contam só a loja nova.** O Google Analytics é o mesmo do site da Nuvemshop, que
  segue no ar: o painel pergunta só as do endereço da loja. Até a virada, os números são pequenos.
  O Início ainda conta as dos dois sites.
- O Google soma as visitas com algumas horas de atraso: a conversão (desde a entrega 0135, as
  compras que o Google viu ÷ as visitas) corta as compras na mesma hora que ele já somou.

As próximas partes, uma por entrega: Funil e Canais (com o montador de link de campanha), Produtos
e Ofertas, Clientes, e Pagamento e frete — com "O que os dados dizem" crescendo a cada uma.

Conferido pelo `conferir-marketing.mjs` (42 checagens: quem abre, as contas por dentro, as visitas
do Google falso, a meta pela API e pela tela, o Google fora e o celular) e pelos testes de unidade
das contas (24).

Depois do deploy — **o que você faz:**

- [ ] Painel → Marketing → **Definir a meta**: a meta de vendas deste mês. Vale pro mês; no mês
      que vem, uma nova.

**As sete seções em todos os produtos, e SEO 100 — pronto em 26/09 (entrega 0105).** Pedido dele:
"ative e escreva" Benefícios, Linha do tempo, Rotina com outros produtos, Como funciona e modo de uso,
Comparação, Pra quem é e Perguntas frequentes em todos os produtos, os kits do Fator iguais ao Fator,
e "SEO 100 em todas as PDP".

- **Os 15 produtos ganham as sete seções**, escritas a partir da descrição de cada um (a do Bling e
  a da loja antiga): o que tem na fórmula, como usar, pra quem é e pra quem não é. Os kits 2x, 3x e
  6x do Fator são o Fator (muda só o aviso de quantos meses o kit cobre); o Kit 2x Shampoo é o
  Shampoo. Entram sozinhas no deploy, uma vez; depois, muda-se no painel, seção por seção. No ar, só
  o Fator tinha uma seção, a Linha do tempo de teste ("Essa é a linha do tempo") — ela é trocada.
- **Fora de propósito:** o "88% de eficácia" e o "9 a cada 10 homens" (sem o laudo do teste, podem ser
  cobrados); e a fixação das pastas (o Bling diz média, a loja antiga dizia alta — o texto diz só
  "segura o penteado").
- **A Rotina diz o passo de cada produto** (antes, todo produto aparecia como "Passo 2 · trata — na
  pele, sem enxaguar", que é o do Fator), e ordena pelo número do passo.
- **A foto de "como funciona" e a do modo de uso** passam a ser escolhidas, uma a uma (no painel, em
  "Como funciona e modo de uso"): a 2ª foto do produto, que era a de sempre, é arte de anúncio em
  vários produtos.
- **"Descrição no Google"**, nos Textos de cada produto: o que aparece embaixo do nome na busca. Cada
  produto ganhou uma, de até 160 letras. Sem ela, a loja usa o começo da descrição do Bling, agora
  numa linha e sem cortar palavra (antes: cortada no 155º caractere, no meio da palavra).
- **SEO 100 nas 15 páginas de produto** (e acessibilidade e boas práticas 100), medido com a loja
  liberada pro Google, como fica na virada. No ar hoje é 69 em todas, e isso é de propósito: o site
  novo está fechado pro Google até a troca de domínio. De quebra, a Linha do tempo tinha um erro de
  marcação que tirava 3 pontos de acessibilidade.
- **O custo:** a página do produto ficou mais longa, e num celular simulado lento a foto do topo
  aparece uns 0,2 s depois (velocidade 97). O CI continua medindo a página do óleo sem as seções.
- [x] **Na virada (fase 6):** liberar o Google (`SITE_INDEXAVEL=true` na Vercel da loja) — é o que
      leva o SEO do ar de 69 pra 100. Feito em 27/09, na virada.

Textos pra revisar, produto a produto: página "Seções dos 15 produtos" (link na PR). Conferido pelo
`conferir-pdp.mjs` (69 checagens, agora nos 15 produtos: cada frase do arquivo na página, e a página
enxuta num produto esvaziado de propósito) e pelo `conferir-produtos.mjs` do painel (101).

Depois do deploy — **nada a configurar.** Pra conferir: abrir 2 ou 3 produtos na loja e rolar a página.

**Painel: Marketing, parte 2 — o Funil e os Canais — pronto em 26/09 (entrega 0110).**

Duas abas novas no Marketing, ao lado do Resumo (o período escolhido vai junto):

- **Funil — onde as pessoas desistem:**
  - do site até o pagamento: quantas visitas viram um produto, puseram na sacola, começaram o
    checkout, escolheram a entrega, foram pagar e pagaram — com a maior perda em vermelho;
  - da sacola ao pagamento, pelos carrinhos da loja: de todo mundo, com cookie ou sem;
  - celular × computador: quanto das visitas vem de cada um, e quanto compra.
- **Canais — de onde vêm as visitas e as vendas:** Instagram, Google (busca e anúncio), Direto,
  E-mail, WhatsApp… com visitas, pedidos, conversão e receita. Os pedidos de quem recusou os cookies
  ficam numa linha à parte ("sem origem conhecida"): a soma bate com o que a loja vendeu.
- **Campanhas e o montador de link:** escolha onde o link vai (Instagram, e-mail, WhatsApp,
  influenciador, anúncio), o nome da campanha e a página, e copie. A venda que vier do link aparece
  em Campanhas, com esse nome.
- **Cada aba começa pelo que os números querem dizer**, em frase — a maior perda do funil, o canal
  que mais vende por visita. Com pouca visita (até a virada), a frase diz que ainda é cedo.
- No Resumo, **os canais que mais venderam**, do lado dos produtos.

As compras que a loja manda pro Google pelo servidor levam a sessão de quem comprou: é assim que o
Google sabe de onde a venda veio. As do site da Nuvemshop ficam de fora.

Conferido pelo `conferir-marketing.mjs` (65 checagens; as 23 novas: o funil pela API e pela tela,
os canais, as campanhas, o montador de link com o Copiar, o Google fora e o celular) e pelos testes
de unidade (16 novos).

Depois do deploy — **nada a configurar.** Pra testar o montador, crie um link, abra ele no celular
e veja a visita chegar em Campanhas no dia seguinte (o Google soma com atraso).

**A página do produto mais enxuta — pronto em 26/09 (entrega 0112).** Pedido dele, com print do óleo:
tirar o texto embaixo dos Benefícios e o embaixo da Linha do tempo.

- **Saíram, em todos os produtos:** a ressalva embaixo dos Benefícios (a do óleo era "O óleo cuida do
  fio que já existe… leia isto antes.") e o aviso embaixo da Linha do tempo (a do óleo era "Barba
  curta pede poucas gotas…"). O painel também não oferece mais esses dois campos.
- **O "resultado varia" do Fator continua na página:** nas Perguntas ("Em quanto tempo vejo
  resultado?", "Funciona pra barba que não nasce nada?"), no "Pra quem é" e embaixo dos casos de antes e
  depois.
- Os kits 2x, 3x e 6x do Fator agora são exatamente o Fator (o aviso era a única diferença).

Conferido pelo `conferir-pdp.mjs` (69) e pelo `conferir-produtos.mjs` do painel (101).

Depois do deploy — **nada a configurar.**

**Painel: Marketing, parte 3 — os Produtos e as Ofertas — pronto em 26/09 (entrega 0113).**

Mais duas abas no Marketing:

- **Produtos — o que cada produto atrai, põe na sacola e vende:** quantas vezes a página dele foi
  vista, de cada 100 quantas viraram sacola, quantos vendeu e quanto somou, e um sinal: esgotado,
  acabando (menos de 10), "muita visita, pouca sacola" ou vendendo. A frase de cima aponta o produto
  muito visto que pouca gente põe na sacola — e quanto seria se chegasse na média. Tocar num produto
  abre a página dele no painel.
- **Ofertas — o que cada oferta soma:**
  - abaixo do preço de cada produto (os cartões de quantidade ou o leve junto): quantos levaram 2 ou
    mais, ou quantos levaram junto;
  - a oferta do checkout (a caixinha antes de pagar): quantos pedidos aceitaram — "1 em cada 6" — e
    quanto somou;
  - os cupons: quantas vezes cada um foi usado em pedido pago, quanto deu de desconto e quanto os
    pedidos somaram.
- O leve junto conta o pedido que levou o produto e um dos de junto, pelo caminho que for: a loja
  não marca de onde o item veio. A oferta do checkout, sim (o código dela vai no pedido).

Conferido pelo `conferir-marketing.mjs` (80 checagens; as 15 novas: os produtos pela API e pela
tela, a receita batendo com o Resumo, as ofertas e os cupons, e o Google fora) e pelos testes de
unidade (13 novos).

Depois do deploy — **nada a configurar.**

**Os e-mails do caminho da encomenda com a quantidade certa — pronto em 26/09 (entrega 0116).**
Pedido dele, com print do e-mail do #19: "0× Balm Modelador…" em "O que vai na caixa".

- **O que estava errado:** os quatro e-mails do caminho (a caminho, saiu pra entrega, esperando
  retirada, entregue) diziam "0×" em todo item. O pedido estava certo: só esses e-mails pediam a
  quantidade ao Medusa de um jeito que ele devolve vazio (ver o AGENTS, no parágrafo dos envios).
- **O que muda:** os próximos saem com a quantidade de cada item ("1× Balm…", "2× Óleo…"). O
  "a caminho" do #19 que já saiu fica como está; o "saiu pra entrega" e o "entregue" dele, se
  ainda não saíram, saem certos.
- **Nada mais tinha o erro:** a nota fiscal, o pedido no painel da Frenet, as compras mandadas pros
  anúncios, o painel e os e-mails de confirmação e de cancelamento leem a quantidade certa —
  conferido um por um, com as consultas de verdade, no banco local.

Conferido pelo `conferir-envio.mjs` (63 checagens; 84 com o registro no painel da Frenet ligado): o
pedido do caminho todo agora leva 2 unidades de um produto e 1 de outro, e os três e-mails dele são
conferidos contra o pedido no admin. Com o código de antes, as duas checagens novas falham
("faltam: 2× Óleo para Barba 30ml, 1× Balm Modelador para Barba 90g").

Depois do deploy — **nada a configurar.**

**Painel: Marketing, parte 4 — os Clientes e o Pagamento e frete — pronto em 26/09 (entrega 0115).**

Com as duas últimas, as sete abas do protótipo estão no painel. Do protótipo, falta só o bloco "O
que os dados dizem" do Resumo (as frases de todas as abas juntas, da que mais pesa pra que menos).

- **Clientes — quem compra, se volta, em quanto tempo e de onde:** quantas pessoas compraram no
  período; de cada 100 pedidos, quantos foram a primeira compra da pessoa e quantos a volta (com o
  ticket de cada um); em quantos dias, em média, vem a segunda compra; e os estados — pedidos,
  receita, ticket e o frete médio (em vermelho acima de R$ 30). Embaixo, a newsletter, com o
  atalho pra lista.
- **Pagamento e frete — como as pessoas pagam e o que não passa:**
  - como pagaram, Pix ou cartão — os mesmos pedidos do Resumo;
  - o Pix: de cada Pix gerado, quantos foram pagos e quantos venceram sem pagar;
  - o cartão: cada tentativa — aprovada, em análise, barrada pela análise de fraude, recusada pelo
    banco ou com os dados errados — e as parcelas;
  - o frete: quantos pedidos saíram com frete grátis, o frete médio de quem pagou, quantos
    desistem quando veem o frete, e o "quase lá" — quem pagou frete a menos de R$ 30 do grátis. O
    dono tem ali o atalho "Mudar o frete grátis".
- A pessoa é o e-mail do pedido: quem já comprava na Nuvemshop conta como cliente novo aqui (a
  loja nova não tem o histórico de lá).
- O cartão recusado que a pessoa tenta de novo no mesmo carrinho não fica guardado (o sistema de
  pagamento apaga a tentativa): conta a última tentativa de cada carrinho.
- No celular, a fileira de abas do Marketing rola até a aba aberta.

Conferido pelo `conferir-marketing.mjs` (104 checagens; as 24 novas: os clientes e o pagamento
pela API, batendo com o Resumo e com a newsletter, pela tela e no celular, e as duas abas com o
Google fora) e pelos testes de unidade (16 novos).

Depois do deploy — **nada a configurar.**

**Home e página do produto no celular: as bolinhas do banner por cima da arte, e a foto passando no
dedo — pronto em 26/09 (entrega 0114).** Dois pedidos dele, com print da home.

- **As bolinhas do banner ficam por cima da arte, no canto de baixo à esquerda**, num selo preto de
  canto cortado. A faixa escura que ficava embaixo do banner saiu — e com ela o vão até a barra de
  vantagens. No canto, elas não cobrem o botão desenhado no meio da arte do celular (era por isso
  que tinham ido pra baixo). O painel agora avisa, no banner: deixe o canto de baixo à esquerda da
  arte sem texto.
- **A foto grande da página do produto passa no dedo:** arrastando de lado, a foto acompanha o dedo
  e para inteira na próxima. Antes, no celular, só os pontos embaixo dela trocavam a foto. Os pontos
  continuam e marcam a foto da vez; tocar amplia a que está à vista. No computador, a miniatura
  troca a foto deslizando.
- A página continua abrindo com uma foto só, que é o que o Google mede: a segunda baixa quando a
  página termina de carregar, e as outras quando a pessoa chega perto.

Conferido pelo `conferir-home.mjs` (as bolinhas no canto, sem vão embaixo do banner, no celular e
no computador) e pelo `conferir-pdp.mjs`, que agora passa o dedo na foto no celular: arrastar pros
dois lados, o arrasto curto que volta, rolar a página com o dedo em cima da foto, tocar pra ampliar,
fechar o zoom e o ponto.

Depois do deploy — **nada a configurar.** Pra conferir: abrir um produto no celular e arrastar a
foto; na home, o banner encosta na barra de vantagens.

**Painel: a barra de avisos do topo, no Layout da home — pronto em 26/09 (entrega 0119).** Pedido
dele, com print da faixa amarela: "no dashboard na parte de layout da home, não conseguimos editar
essa barra".

- **Layout da home → Barra de avisos**, em cima das seções: os avisos que passam na faixa amarela,
  até 4, na ordem, e a caixinha do aviso do frete. A faixa fica no topo de TODAS as páginas da loja,
  e muda em todas no "Publicar", como o resto da home.
- **O aviso do frete continua vindo de Configurações → Frete.** A caixinha só liga e desliga: o
  valor muda sozinho quando o frete muda, e o aviso some quando não há promoção. A gaveta mostra
  como a faixa vai ficar, com o texto do frete de hoje.
- **Pelo menos um aviso escrito:** o do frete some sem promoção, e a faixa não pode ficar vazia.
- **A faixa anda na mesma velocidade com qualquer texto** (medido na loja local: de 39 a 44 px/s,
  de um aviso curto a quatro compridos com o frete; sem o ajuste, iria de 17 a 146 px/s), e cada
  volta cobre a tela.
- Enquanto ninguém mexer, a faixa é a de hoje — o frete e a "Compra 100% segura" —, com o HTML igual
  ao de antes (a home, que vive no limite do LCP, não ganha nem um byte).

Conferido pelo `conferir-home.mjs` (101 checagens; as 19 novas: a linha no painel, a gaveta e a
prévia contra a loja, o que falta, o rascunho que não vai pro site, o "Publicar" mudando a home, a
vitrine e a página do produto, a velocidade, o "Voltar ao texto original" com o HTML de antes, o
histórico e o celular), pelo `conferir-configuracoes.mjs` da loja (a faixa com e sem promoção de
frete) e pelos testes de unidade (8 novos).

Depois do deploy — **nada a configurar.** Pra testar: Painel → Layout da home → Barra de avisos →
Editar → mude um aviso → Salvar → Publicar. Em alguns segundos a faixa muda em todas as páginas.

**Painel: Marketing — "O que os dados dizem" no Resumo — pronto em 26/09 (entrega 0122).**

A última peça do protótipo do Marketing. No Resumo, entre a meta do mês e o gráfico:

- as frases de todas as abas juntas: o que pede conserto primeiro, depois as oportunidades e o que
  vai bem;
- cada frase com o atalho pra aba de onde veio ("Ver o funil →", "Ver pagamento e frete →"), no
  mesmo período;
- cabem 6; quando há mais, o bloco diz quantas ficaram nas abas;
- o "ainda é pouco" de cada aba fica na aba; se todas disserem isso, aparece uma frase só;
- sem o Google, as frases da loja (ofertas, clientes, pagamento) seguem, e o bloco diz por que
  faltam as do funil, dos canais e dos produtos.

As frases são as mesmas das abas: a conta é feita num lugar só.

Conferido pelo `conferir-marketing.mjs` (114 checagens; as 10 novas: as frases batendo com as das
abas, a ordem, nenhuma perdida, o atalho que abre a aba, o celular e o Google fora) e pelos testes
de unidade (6 novos).

Depois do deploy — **nada a configurar.**

**Loja: os links antigos da Nuvemshop — prontos em 26/09 (entrega 0125).** Pra quando o domínio
passar pra loja nova (fase 6): cada endereço que a loja antiga tinha, e que o Google e os links
salvos conhecem, abre a página certa, e não "página não encontrada".

- **Os produtos** têm o mesmo endereço nas duas lojas (`/produtos/oleo-para-barba`): nada a fazer,
  os 15 abrem.
- **As categorias:** "Produtos para a barba" vai pra Barba, "Kits para barba" pra Kits e "Para o
  cabelo" pra Cabelo. As quatro de dentro da barba (balm, shampoo, óleo, fator de crescimento) vão
  direto pra página do produto delas, que já mostra os kits dele.
- **As páginas:** Trocas e devoluções, Política de privacidade, Contato e Todos os produtos têm a
  página igual. A Política de envio abre as Dúvidas já no bloco "Entrega". O Quem somos e o Blog
  (que estava vazio) vão pra home, porque a loja nova não tem página própria pra eles.
- **O sistema de lá:** a busca (`/search?q=…`) vira a busca daqui, com o mesmo termo; o carrinho
  vai pra Todos os produtos; "Minha conta", entrar e cadastrar vão pro "Entrar" daqui (que também
  cria a conta).
- O redirect é permanente (o Google passa a relevância pra página nova) e leva junto a campanha do
  link (`?utm_…`).
- A lista inteira da loja antiga está no `apps/loja/ferramentas/conferir-enderecos-antigos.mjs`,
  que confere um por um. Hoje, na loja no ar, 15 desses endereços dariam "página não encontrada";
  com esta entrega, nenhum.

Depois do deploy — **nada a configurar.** Só vale de verdade na troca de domínio; até lá, dá pra
testar no endereço da Vercel: `…vercel.app/produtos-para-a-barba/` abre a Barba.

**Os cupons da Nuvemshop na loja nova — pronto em 26/09 (entrega 0126).** Pedido dele, com a lista
dos cupons ativos da Nuvemshop: "poderia criar para gente?".

- **104 dos 111 entram sozinhos no deploy**, iguais aos de lá: o código (com o "_" e tudo), o
  desconto (10%, 15% ou R$ 20, sem o frete), o limite de usos ("0 de 1" vira 1 uso no total) e a
  data de fim. Aparecem em Cupons e descontos, com a chave de pausar, e valem no checkout — digitados
  em maiúsculas ou minúsculas.
- **Os usos de lá não vêm:** o PRIMEIRACOMPRA (170 usos na Nuvemshop) começa do zero aqui.
- **Ficam de fora (7):** os dois de frete grátis (FRETEG e FRETEGRATISDOM — o cupom de frete ainda
  não existe aqui) e os cinco com "1 limite" na Nuvemshop (10PILA, ITAPEMA25, KIT15, PRIMEIRA10 e
  RIBEIRO): a lista não diz qual é o limite, e o cupom sem ele daria desconto a mais.
- Os 12 de poucos dias (ARTIDA10_7XGS, MARIA10_T5AL…) vencem entre 26 e 29/09; o que já tiver
  vencido no dia do deploy fica de fora.
- [ ] **O "1 limite" dos cinco e os dois de frete — você.** Na Nuvemshop, o print de cada um
      aberto (10PILA, ITAPEMA25, KIT15, PRIMEIRA10, RIBEIRO, FRETEG e FRETEGRATISDOM). Com eles,
      os sete entram numa migração nova (a 0126 já rodou), com as opções da 0128.

Conferido no banco local: a migração criou os 104 (rodando de novo, nenhum a mais), cada tipo de
cupom aplicado num carrinho de verdade pela API da loja, a tela de Cupons no computador e no celular,
o `conferir-cupons.mjs` (25/25) com eles no banco e os testes de unidade (15 novos).

Depois do deploy — **nada a configurar.** Pra conferir: Painel → Cupons e descontos — a lista começa
em 0P2XSB e termina em ZKVI3I.

**Checkout: em quantos dias chega, e a foto nos produtos do "Completa com" — pronto em 26/09
(entrega 0123).** Pedido dele, com print do passo 2.

- **Em quantos dias chega:** cada opção de entrega diz "Chega em 8 dias úteis" (o prazo da
  transportadora pro CEP), no lugar de "A mais barata para o seu CEP" — como a sacola e a página do
  produto já diziam, e como o protótipo desenhou. Embaixo das opções, "Dias úteis, contados da
  postagem." Não custa nada a mais na Frenet: o prazo vem na mesma consulta do preço.
- **A foto nos produtos do "Completa com":** cada produto sugerido pra completar o frete grátis ganha
  a foto pequena, do lado do nome. Produto sem foto no catálogo aparece só com o nome, como antes.

Conferido pelo `conferir-checkout.mjs` (as checagens novas: o prazo de cada opção igual ao da
cotação, a frase dos dias úteis, abrir o passo 2 com uma consulta só à Frenet, a foto certa e
carregada em cada chip, e o prazo quando as duas entregas são o mesmo serviço). Com a loja de
antes, as checagens do prazo e da foto falham.

Depois do deploy — **nada a configurar.**

**Aviso de venda nova pro dono — pronto em 26/09 (entrega 0127).** Pedido dele: "verifique se toda
compra manda um e-mail pra mim, o administrador; se não, crie — logo depois do pagamento aprovado".

- **Como estava:** a cada pedido pago, só o cliente recebia e-mail ("Pedido #N confirmado"). O dono
  só via a venda abrindo o painel; os e-mails da equipe eram só de problema (a nota, o Bling, o
  estorno).
- **O que muda:** a cada venda paga, o dono recebe "Venda nova: pedido #N, R$ X no Pix" (ou "no
  cartão"), logo depois do e-mail do cliente. Dentro: o valor, a hora do pagamento, a forma (no
  cartão, a bandeira e as parcelas), o que foi vendido, os totais, o cupom e o botão "Abrir o pedido
  no painel". Nada de quem comprou — nem nome, nem e-mail, nem endereço, nem o final do cartão —,
  como nos outros e-mails da equipe: isso está no pedido, no painel.
- **Quando sai:** quando o dinheiro entra — o Pix pago; o cartão aprovado (o que cai na análise de
  fraude só avisa quando ela aprova e ele é cobrado). Não sai pro Pix que venceu, pro cartão
  recusado nem pro Pix pago num pedido já cancelado (esse dinheiro volta pra quem pagou).
- **Pra quem:** quem está como dono no painel — Configurações → E-mails mostra, na linha nova
  "Venda nova"; sem ninguém no painel, os usuários do admin do Medusa. Um e-mail por pessoa, uma
  vez por pedido.
- **Se o e-mail falhar na hora** (o Resend fora), a varredura de 5 em 5 minutos manda depois, com a
  hora certa do pagamento — a mesma que cobre o "Check status" do admin.
- **No deploy**, os pedidos pagos nas 24 horas anteriores também recebem o aviso, uma vez cada (é a
  varredura alcançando): podem chegar alguns de uma vez, cada um com a hora do seu pagamento.

Conferido pelo `conferir-pagamento.mjs` (200 checagens; as 19 novas: o aviso do Pix, do cartão na
hora e depois da análise, com o Resend fora, depois do "Check status"; nenhum pro Pix vencido, pro
cartão reprovado nem pro Pix pago depois do cancelamento; nada de quem comprou; uma vez por pessoa
em toda a rodada), pelo `conferir-configuracoes.mjs` do painel (a linha "Venda nova", só pro dono) e
pelos testes de unidade (21 novos). Os e-mails que já existiam saem byte por byte iguais.

Depois do deploy — **nada a configurar.** Pra ver: a próxima venda paga chega na caixa do dono do
painel; e Configurações → E-mails → "Pra equipe" mostra a linha "Venda nova" e quem recebe.

**Loja: a página do produto esgotado, com o "avise-me quando chegar" — pronta em 26/09 (entrega
0124).** Pedido dele: "valide se a PDP tem página de produto fora de estoque, caso não tenha vamos
criar" — e, na pergunta, "com avise-me". Validado antes: não tinha. O produto esgotado mostrava a
página inteira como se vendesse (frete, parcelas, 1, 2 e 3 unidades), e só o botão virava
"Esgotado" — preto, com cara de clicável, sem fazer nada. No ar, em 26/09, nenhum dos 15 estava
esgotado.

- **A página do esgotado:** o preço (com o "de" riscado), a faixa "Esgotado" e, no lugar do botão,
  a caixa "Avise-me quando chegar", onde a pessoa deixa o e-mail. Saem o frete, as unidades, o leve
  junto e as garantias. A foto ganha o selo "Esgotado", embaixo vem "Enquanto isso, veja o que mais
  tem em <categoria>", e a barra que gruda embaixo vira "Avise-me".
- **Quando o Bling tiver estoque de novo:** em até 5 minutos a página volta a vender e sai UM
  e-mail pra cada pessoa — "Voltou: <produto>", com a foto, o preço e o botão "Comprar agora" (e
  Instagram e TikTok no rodapé). Na ordem de quem pediu primeiro. Depois do aviso, o e-mail sai da
  lista de espera; quem espera mais de 6 meses também sai.
- **A página vira sozinha nos dois sentidos:** o produto que esgota (a última unidade vendida)
  mostra "Esgotado" em até 5 minutos. Antes podia seguir com "Adicionar à sacola" por até uma hora,
  e o erro só aparecia na sacola.
- **Nos cards** (home, categorias, "Quem leva este, leva junto"): o selo diz "Esgotado" e o botão,
  "Avise-me". No carrossel da página do produto, o esgotado vai pro fim.
- **No painel:** Produtos → o produto → a faixa "Esgotado" diz quantas pessoas pediram o aviso, e o
  bloco "Preço e estoque" mostra quantas esperam e quantas já foram avisadas. O "Tirar" da
  newsletter tira a pessoa da lista de espera também.
- **Marketing → Canais:** a visita e a compra que vêm do e-mail aparecem como "E-mail", campanha
  "avise-me".
- **A Política de Privacidade** conta o dado novo (o e-mail e o produto, até o aviso sair).

Conferido pelo `conferir-avise-me.mjs` (novo, 32 checagens: a página esgotada no celular, a barra,
o pedido com e-mail errado, repetido e em maiúsculas, nada saindo com o produto esgotado, o card e
o carrossel, a volta com os e-mails e a página vendendo na primeira visita, a página velha que se
refaz, o Resend fora e o limite por pessoa), pelos de sempre na mesma base (pdp 68/70 — as 2 de
antes, do banco local —, checkout 160/160, catálogo 34/34, frete 70/70, configurações 17/17, links
26/26; no painel, produtos 101/101, clientes 37/37, observabilidade 34/34) e pelos testes de
unidade (949, 24 novos). No Lighthouse, A/B com a main: a home e a PDP do óleo seguem em 2,26 s, e
o HTML da PDP com estoque saiu igual.

Depois do deploy — **nada a configurar**: a tabela nova nasce na migração do Railway, e a rotina
aparece em Observabilidade ("Avisa quem pediu um produto esgotado que voltou"). Não dá pra ver no
ar sem esgotar um produto de verdade — e zerar no Bling mexe no estoque de todo lugar que lê dele.
Quando um esgotar, a página já aparece assim, e o painel mostra quem pediu.

**Cupons do jeito da Nuvemshop — pronto em 26/09 (entrega 0128).** Pedido dele, com o print do
"Criar cupom" da Nuvemshop: "nossos cupons tem que ser bem estilo os da nuvemshop".

- **O "Novo cupom" do painel tem as seções de lá**, na mesma ordem: Código do cupom (com o **link
  do cupom** pra copiar), Tipo de desconto (Porcentagem, Valor fixo ou **Frete grátis** — este
  também "só na opção de envio de menor custo"), **Aplicar a** (toda a loja, categorias ou
  produtos) e **Limites de uso**: permitir combinar com outras promoções, por cupom (ilimitado ou
  limitado), **por cliente** (ilimitado, limitado a N vezes ou primeira compra), **data** (período
  com começo e fim, com hora) e valor do carrinho. A prévia diz o cupom inteiro em frase.
- **Como na Nuvemshop:** "aplicar a" categorias ou produtos só aceita o cupom se TODOS os
  produtos do carrinho forem deles; sem "combinar", o cupom não desconta o produto em promoção
  (a promoção do painel, o desconto por quantidade) e não vale no pedido que já ganhou o frete
  grátis da loja.
- **Um cupom por pedido**, como lá: digitar outro troca o de antes. O Medusa também recusa o
  segundo, pra ninguém somar cupons chamando a API direto.
- **O link do cupom** é o mesmo caminho da Nuvemshop, `/discount/<CÓDIGO>`: os links que já
  circulam (bio, e-mail, story) seguem valendo depois da virada. Com sacola, o cupom entra na
  hora; sem, fica guardado e entra quando o checkout abre.
- **O cupom de frete grátis digitado antes da entrega fica guardado** ("entra quando você escolher
  a entrega") e entra sozinho quando a entrega é escolhida — o Medusa só desconta o frete de uma
  entrega escolhida. No resumo, no e-mail e na conta, o frete aparece "Grátis" e o desconto dele
  NÃO se repete na linha de desconto.
- A lista de cupons: frase nova pra cada opção, a situação "Agendado" (período que ainda não
  começou) e o botão "Link" em cada cupom.
- **Ficaram de fora duas opções do print**, porque o Medusa não faz: "incluir o custo de envio no
  desconto" (uma promoção desconta os produtos OU o frete) e "valor máximo de desconto" (a
  porcentagem dele não tem teto). Nenhum dos 111 cupons da Nuvemshop usava as duas.

Conferido pelo `conferir-cupons.mjs` do painel (41 checagens; as 16 novas: os sete tipos pelo
formulário novo, o frete grátis zerando o frete uma vez só, o da mais barata, a pergunta do frete
fechada pra quem não é a loja, categoria e produto com todo o carrinho, o "não combina" no produto
em promoção e no frete da loja, por cliente, o agendado, um cupom por pedido, as frases, o link e
a tela), pelo `conferir-checkout.mjs` (173; as 7 novas: um por pedido, o de frete guardado e
entrando com a entrega, o resumo sem desconto repetido, o link com e sem sacola), pelo
`conferir-pagamento.mjs` (200) e pelo `conferir-conta.mjs` (209), e pelos testes de unidade (15
novos nos cupons).

Depois do deploy — **nada a configurar.** Pra testar: Painel → Cupons e descontos → Novo cupom.

**Cartão: a porta contra o robô testando cartão — pronta em 26/09 (entrega 0129).** Pedido dele,
depois do levantamento do que a Nuvemshop e a Shopify têm e a loja não tinha ("me explica como
esse robô testando cartão vai funcionar" → "bora"). O golpe: quem compra uma lista de cartões
roubados usa uma loja pequena pra descobrir quais funcionam — um cartão atrás do outro, centenas
por hora, com as recusas saindo no nome da loja (e o Pagar.me pode segurar a conta por isso). Até
aqui o pagamento não tinha limite nenhum: a mesma sacola aceitava cartão novo sem fim, e ninguém
via — o painel guardava só a última tentativa de cada sacola.

- **A porta:** antes de o cartão ir pro Pagar.me, a loja confere a mesma sacola (até 5 tentativas
  por hora), a mesma pessoa (o IP, até 8) e quem tenta sem passar pela loja, direto no servidor (3
  por hora, todo mundo junto). Barrada, a pessoa lê que pode pagar no Pix agora ou tentar o cartão
  depois — e que nada foi cobrado. O Pix não passa por nada disso.
- **O freio:** muita recusa em pouco tempo (8 em 30 minutos, quase só recusa) é o robô que troca de
  IP e de sacola a cada tentativa. A loja liga o freio sozinha: o cartão da loja toda passa poucas
  tentativas por vez (3 a cada 10 minutos), e o dono recebe UM e-mail, "Robô testando cartão na
  loja". Desliga sozinho quando as recusas param. Uma tarde boa de vendas, com recusa de gente no
  meio, não liga: precisa ser quase tudo recusa.
- **O registro:** cada tentativa de cartão fica guardada 30 dias, sem o IP de ninguém. Na
  Observabilidade, o bloco "Cartão" mostra as das últimas 24 horas (aprovadas, recusadas,
  barradas) e o freio; o freio ligado vira problema grave, e a tentativa que chega sem passar pela
  loja, "pra olhar" (é robô — ou o `REVALIDAR_SEGREDO` diferente entre a Vercel e o Railway).
- **Soltar na mão:** se o freio ligar por engano, o Claude Code solta pelo admin
  (`POST /admin/cartao`, "soltar") — ou é esperar os 30 minutos.

Conferido pelo `conferir-pagamento.mjs` (a seção nova do robô: a mesma sacola pela tela, o robô que
pula a loja, o freio com 8 recusas de pessoas e sacolas diferentes, o e-mail do dono, o Pix com o
freio ligado, a frase na tela e o soltar), pelo `conferir-observabilidade.mjs` do painel (o bloco
Cartão conta igual ao admin), pelo `conferir-configuracoes.mjs` (7 avisos da equipe) e pelos testes
de unidade.

Depois do deploy — **nada a configurar**: a tabela nova nasce na migração do Railway. Pra ver:
Observabilidade → "Cartão", com zeros; a próxima compra no cartão aparece lá como aprovada.

- [ ] **Parte 2: a verificação invisível de robô** — o "não sou um robô" sem clicar em nada, no
      passo do pagamento (BotID, da Vercel, ou Turnstile, da Cloudflare). Com a Vercel no Pro, o
      BotID tem a análise profunda; decidir junto do plano.

**O catálogo pro Google Shopping e pra Meta — pronto em 26/09 (entrega 0134).** Item 4 do
levantamento do que a Nuvemshop faz e a loja nova não fazia: a Nuvemshop manda os produtos sozinha
pro Google (Shopping) e pra Meta (o catálogo do Instagram e do Facebook). A loja nova não mandava
nada — e, na virada, o anúncio de catálogo, o remarketing dinâmico e o Shopping parariam.

- **O arquivo:** `https://<a loja>/catalogo.xml`, um arquivo só pros dois, com todos os produtos
  publicados: nome, descrição, link, foto, preço (com o "de/por" da promoção), estoque (esgotado
  aparece como esgotado), marca, SKU e a categoria do Google. Ele se atualiza sozinho quando um
  produto, um preço ou o estoque mudam.
- **O código de cada produto é o mesmo que o pixel da Meta e o Google já mandam** (`variant_…`): é
  o que faz o anúncio mostrar o produto que a pessoa viu no site.
- **A foto vai em JPEG** (a Meta não aceita WebP, que é o formato das fotos da loja), só a principal
  — as artes com antes e depois derrubam conta de anúncio.
- **Sem código de barras:** nenhum produto tem EAN cadastrado, e o arquivo diz isso pro Google (é o
  aceito pra marca própria). Se os produtos tiverem EAN na embalagem, cadastrar melhora o Shopping.

Conferido pelo `conferir-feed.mjs` (novo, 14 checagens: o XML lido como o Google lê, cada produto
contra a API do Medusa, os links e as fotos abrindo em JPEG), pelos testes de unidade da foto (6
novos) e pelo `next build` da loja (a rota sai pronta no build).

Depois do deploy — **nada a configurar agora.** O arquivo só serve DEPOIS da virada: os links dele
apontam pro endereço da loja, e o Google confere o preço nessa página.

- [ ] **Na virada — você, no Google Merchant Center:** Produtos → Fontes de dados → Adicionar →
      arquivo com busca programada, diária, no `https://www.fuckingbarba.com.br/catalogo.xml`. Se
      a Nuvemshop manda os produtos pra lá hoje (o app Google Shopping), desligar a fonte dela no
      mesmo dia, senão fica tudo em dobro. Em Envio: frete grátis a partir do piso da loja.
- [ ] **Na virada — você, na Meta:** Gerenciador de Comércio → o catálogo → Fontes de dados →
      Adicionar itens → Feed de dados → URL programada (a cada hora), no mesmo endereço; e em
      Eventos, ligar o pixel 1284769389617301 a este catálogo. O catálogo que a Nuvemshop alimenta
      usa outros códigos: desligar a integração dela.
- [ ] Um dia depois das duas: olhar o Diagnóstico do Merchant Center e o da Meta — o Claude Code
      lê os avisos e acerta o que for do arquivo.

**CRM, parte 1: a loja anota o que cada pessoa faz — pronto em 26/09 (entrega 0130).** A primeira
parte da Fundação do "Ciclo da Barba" (o protótipo da aba CRM:
https://claude.ai/artifact/XDWBkcweP6y6WVJd3m4sty).

- **O que a loja anota**, só de quem clicou em "Aceitar" na faixa de cookies: de onde a pessoa
  chegou (o Instagram, o Google, a campanha do link), os produtos que viu, o que pôs e tirou da
  sacola, cada passo do checkout (o e-mail, a entrega, o pagamento, o Pix copiado), a inscrição na
  newsletter e a entrada na conta.
- **O anônimo vira pessoa:** quando ela entra na conta, deixa o e-mail no checkout ou assina a
  newsletter, tudo o que fez antes, no mesmo navegador, passa a ser dela.
- **A faixa de cookies muda:** agora diz "Usamos cookies da própria loja, do Google…" e aparece de
  novo pra todo mundo — a resposta de antes não vale pra uma finalidade nova, como a política
  promete. Ela aparece sempre, mesmo sem nenhum código de anúncio ligado no painel.
- **Quem recusa não entra**, e quem muda a resposta pra não (tem um botão novo na política de
  privacidade) tem tudo apagado na hora. O que foi anotado fica 13 meses e sai sozinho.
- **No painel:** "CRM", em Pessoas (dono e marketing): quantos visitantes, quantos já têm e-mail,
  quantas pessoas, o caminho na loja com cada coisa contada, e as últimas anotações, com o e-mail
  mascarado. Período: hoje, 7 dias ou 30 dias.
- **A política de privacidade** ganhou o que a loja anota, os 13 meses e o botão "Mudar minha
  resposta sobre os cookies".
- A Observabilidade ganhou a rotina "Apaga o que o CRM anotou há mais de 13 meses" (11 rotinas,
  com a do avise-me da 0124).
- A página inicial ficou uns 0,15 s mais lenta no teste de velocidade (o do GitHub, medido aqui do
  mesmo jeito), porque a faixa de cookies agora aparece pra todo mundo. Continua dentro do limite,
  mas sobra pouco pra próxima mudança que pese na home.

Conferido pelo `conferir-crm.mjs` (50 checagens: a faixa, o "não" sem nada anotado, o "sim" da
chegada até o e-mail do checkout, a newsletter, a conta, a tela de cada papel e o "não" depois do
sim apagando tudo), pelo `conferir-integracoes.mjs` (a faixa na versão 3, e o sim da versão 2 não
valendo mais) e pelos testes de unidade (18 novos).

Depois do deploy — **nada a configurar.** Pra testar: abra a loja, clique em "Aceitar", veja um
produto e ponha na sacola; depois, Painel → CRM → Hoje.

- [ ] **As próximas partes da Fundação** (uma entrega cada, perguntar antes): os avisos do Resend
      voltando (entregue, abriu, clicou, reclamou), a ficha de cada pessoa com as etiquetas, os
      Ajustes do CRM editáveis no painel, a base da Nuvemshop e o modelo de e-mail.

**O vigia de fora — pronto em 26/09 (entrega 0137).** Item 7 do levantamento, a parte que não
depende da Vercel no Pro. A Observabilidade mora dentro do servidor da loja: se ele cai, nenhum
aviso sai, e ninguém fica sabendo até um cliente reclamar. Agora um serviço de fora, o UptimeRobot
(grátis, e o plano grátis deles permite loja), vigia a loja, o servidor e o painel de 5 em 5
minutos, e avisa no seu celular quando um deles não responde. E o servidor manda um "estou viva"
pra ele a cada 5 minutos, depois de rodar as rotinas: se o recado para (o servidor caiu, as rotinas
travaram, o banco não responde), o aviso chega também. Na Observabilidade, a linha "Vigia de fora"
das integrações diz quando foi o último "estou viva".

Conferido pelos testes de unidade (6 novos: o endereço, o recado que chega, o que não chega, e a
linha das integrações), por um vigia de mentira na máquina (o recado chegou na hora da rotina) e
pelos conferidores do painel (observabilidade 35/35, com as 8 integrações; configurações 18/18).

Depois do deploy — **você, uns 15 minutos:**

- [ ] **A conta:** uptimerobot.com → criar a conta grátis, com o e-mail da loja. No celular,
      instalar o app **UptimeRobot** e entrar com a mesma conta: é por ele que o aviso chega.
- [ ] **Os três endereços** — "New monitor", tipo **HTTP(s)**, de 5 em 5 minutos, com o aviso por
      e-mail e pelo app:
  - Loja: `https://fuckingbarba-loja.vercel.app` (na virada, trocar por
    `https://www.fuckingbarba.com.br`);
  - Servidor: `https://fuckingbarbabackend-production.up.railway.app/health`;
  - Painel: `https://dashboard.fuckingbarba.com.br/entrar`.
- [ ] **O "estou viva"** — "New monitor", tipo **Heartbeat** (ou "Cron job"), nome "Rotinas da
      loja", intervalo de **10 minutos** (um recado atrasado não vira alarme; dois, sim). Copiar o
      endereço que ele mostra e colar no Railway → serviço do Medusa → Variables → nova variável
      `VIGIA_DE_FORA_URL`. Não colar esse endereço na conversa: quem tem ele finge que a loja está
      viva. O Railway publica de novo sozinho.
- [ ] Em até 10 minutos: Painel → Observabilidade → Integrações → "Vigia de fora" fica verde, e o
      monitor "Rotinas da loja" fica "Up" no UptimeRobot.

Se o UptimeRobot pedir plano pago pro Heartbeat, os três endereços já valem sozinhos; aí o "estou
viva" vai pro Better Stack (10 grátis) — é só trocar o endereço da variável.

**Pagamento: o Pagar.me saiu do meio do código — pronta em 26/09 (entrega 0132).** Primeira de
quatro partes do **Pix reserva**, pedido dele em 26/09: um segundo parceiro de pagamento, não pra
trocar o Pagar.me, e sim pra quando ele falhar ("erro de pagamento no cartão, problema pra gerar
Pix ou o Pagar.me instável"); "se um dos parceiros estiver instável, usa o que está estável"; e
"um ranking, pra ver qual está dando mais recusa". O parceiro reserva é o **Mercado Pago** (ele já
tem conta, a mesma das vendas do Mercado Livre). **Nada muda pra quem compra nem no painel.**

- **Antes**, o id do Pagar.me estava copiado em 12 arquivos, e um pedido pago por outro parceiro
  não teria o e-mail de confirmação, nem o "Venda nova", nem a forma de pagamento na nota.
- **Agora** há uma lista só dos parceiros (`apps/backend/src/lib/pagamento/parceiros.ts`, e a
  mesma na loja) e um estado comum que todo parceiro grava (a forma, a situação, o QR do Pix, o
  final do cartão, a recusa, quanto voltou). Os e-mails, o painel (pedido e Marketing), a nota, a
  versão pública do pedido, a porta do cartão e, na loja, a tela de obrigado, a conta e a recusa
  do passo 3 leem o pagamento de qualquer parceiro da lista.
- **Continua só do Pagar.me** (e vem por parceiro nas próximas partes): o provedor, a conciliação,
  a conferência dos estornos, o aviso (Edge Function), o script da região e o passo 3.
- De quebra, mais fechado: o estado só é lido na chave do parceiro dono da sessão — um estado
  forjado numa sessão do provisório (a API pública deixa escrever no `data`) não vira pagamento,
  nem na versão pública do pedido.

Conferido pelos testes de unidade (994; os 11 novos: a lista dos parceiros e a da loja batendo, a
sessão que virou o pagamento, o estado lido só na chave do parceiro dono, e o estado forjado fora da
versão pública do pedido), pelo `conferir-pagamento.mjs` (214, duas rodadas), `conferir-checkout.mjs`
(173), `conferir-conta.mjs` (209), `conferir-erp.mjs` (114) e, no painel, `conferir-pedidos.mjs`
(77), `conferir-acoes.mjs` (32) e `conferir-observabilidade.mjs` (35). O `conferir-marketing.mjs` não
rodou (pede o Google falso): o Pagamento e frete é o `montarPagamento`, coberto pelos testes.

Depois do deploy — **nada a configurar.**

- [x] **Parte 2: o Mercado Pago, só no Pix** — pronta em 27/09 (entrega 0140, mais abaixo). Cartão
      fica só no Pagar.me: cartão recusado não vai pro outro parceiro (quem recusa é o banco do
      cliente, e mandar pra outro atrai o robô testando cartão e a contestação).
- [x] **Parte 3: a troca automática, pelo parceiro estável** — pronta em 27/09 (entrega 0150,
      mais abaixo). Com os dois bem, Pix e cartão pelo Pagar.me (dá pra inverter no Pix, se a taxa
      do Mercado Pago for menor). Pagar.me instável: o Pix sai pelo Mercado Pago no mesmo clique, e
      o cartão oferece esse Pix. Mercado Pago instável: nada muda. Os dois: "tenta em instantes" e
      um e-mail pro dono. Instável = três falhas seguidas; o parceiro sai por 5 minutos (o
      disjuntor) e volta sozinho.
- [x] **Parte 4: o ranking dos parceiros** — pronta em 27/09 (entrega 0154, mais abaixo), no
      Marketing → Pagamento e frete: Pix gerados, pagos, que não geraram e o tempo pra gerar e
      confirmar; falhas, vezes fora e minutos fora. Com o número ao lado da porcentagem, e sem
      vencedor sem volume. O cartão fica no bloco Cartão: só compara se um dia o Mercado Pago
      também passar cartão.

**Marketing: a conversão do Resumo compara gente igual — pronta em 26/09 (entrega 0135).** Pedido
dele, depois da conversa sobre robôs e como a visita é contada ("sim vamos"). A conversão do Resumo
dividia TODOS os pedidos pagos pelas visitas do Google — e o Google só vê quem aceitou os cookies.
Quem recusa compra, mas não vira visita: a conversão saía maior que a real. No print dele (Canais,
30 dias), o pedido de R$ 81,75 de quem recusou entrava na conta do Resumo; a visita dessa pessoa,
não.

- **Agora:** a conversão divide as compras que o Google viu (as que a loja manda pelo servidor, só
  com o sim) pelas visitas — as duas do Google, no mesmo corte de hora. É a regra dos Canais. O
  "Pedidos pagos" do Resumo segue contando todo mundo.
- A ajuda da conversão (o mouse em cima do número) diz a conta do período ("3 pedidos em 120
  visitas") e que é só de quem aceitou os cookies; o glossário embaixo também.

Conferido pelo `conferir-marketing.mjs` (as compras do Google falso por dia e hora: o corte na hora
que o Google ainda soma, a pergunta na mesma chamada das visitas, a conversão na tela e a ajuda) e
pelos testes de unidade.

Depois do deploy — **nada a configurar.** Pra ver: Marketing → Resumo → a conversão, com o mouse em
cima.

- [ ] **O Início ainda mistura:** o "Ontem: N visitas · X% viraram pedido pago" divide os pedidos
      pagos da loja nova (de todos) pelas visitas do Google dos DOIS sites (a Nuvemshop segue no
      mesmo Analytics até a virada). Consertar do mesmo jeito (as compras que o Google viu ÷ as
      visitas), decidindo junto se o Início passa a contar só a loja nova.

**Promoções "Leve X, pague Y" — pronto em 26/09 (entrega 0133).** Pedido dele: "no nosso
dashboard quero poder criar promoções compre X e leve Y" (e o brinde, que é a parte 2). Decidido
por ele na conversa: só o "Leve 3, pague 2" da Nuvemshop (nem "compre A, ganhe B", nem "2ª unidade
com %"), e NÃO SOMA com o desconto por quantidade.

- **No painel:** Cupons e descontos ganhou o bloco **Promoções**, com o botão **Nova promoção**. A
  gaveta tem as seções do "Compre X e pague Y" da Nuvemshop: o nome (só pra loja), Comprando e
  Pague (com a conta em uma frase embaixo), Aplicar a (toda a loja, categorias ou produtos, e
  "permitir aplicar a produtos com preço promocional", marcada), o período (ilimitado ou com começo
  e fim) e o texto do selo (vazio, fica "Leve 3, pague 2"). Cada promoção na lista tem a chave de
  pausar, quantos pedidos, quanto de desconto e quanto vendeu.
- **No carrinho, quem dá o desconto é o Medusa, sozinho** — ninguém digita código: 3 no carrinho,
  uma sai de graça; 6, duas. Com produtos de preços diferentes na mesma promoção, sai de graça a
  mais barata de cada grupo de 3 (numa sacola grande e misturada, pode dar um pouco mais de
  desconto que a Nuvemshop, que dá as mais baratas da sacola inteira).
- **Não soma:** enquanto a promoção vale, os produtos dela saem dos 4%/6% do desconto por
  quantidade (2 unidades ficavam sem os 4% — a 0142, logo abaixo, devolveu a faixa de 2), e voltam
  quando ela pausa ou acaba.
- **Cupom:** o que combina com outras promoções desconta o que sobrou (10% das duas pagas); o que
  não combina não desconta o item da promoção, como já não descontava o de preço promocional.
- **Na loja:** o selo com a etiqueta no card (no lugar do "-X%" — a 0142 pôs os dois) e embaixo do
  preço na página do produto; o cartão "3 unidades" com o preço de 2; e na sacola, na linha do produto, "Leve 3, pague
  2 · mais 1 sai de graça" com 2, e "1 de graça" com 3. Pausada ou fora do período, o selo sai da
  loja na hora.

Conferido pelo `conferir-promocoes.mjs` do painel (novo, 42 checagens: o formulário pela API e pela
gaveta, a conta no carrinho de verdade com 2, 3, 5 e 6 unidades, o produto de fora, as faixas que
saem e voltam, o cupom que combina e o que não combina, um pedido Pix e a lista, a pausada e a
agendada, o celular, e na loja o card, a página do produto, a sacola e o selo saindo depois da
pausa), pelos testes de unidade (1024; 35 novos, que rodam a conta do próprio Medusa) e pelos de
sempre: no painel, cupons 41/41, preço promocional 17/17, pedidos 77/77 e produtos
101/101; na loja, checkout 173/173, pagamento 214/214, frete 70/70, catálogo 34/34 e PDP 68/70 (as
2 de antes, do banco local).

Depois do deploy — **nada a configurar.** Pra testar: Painel → Cupons e descontos → Nova promoção →
um produto → Criar; na loja, o selo aparece no card e na página dele, e 3 na sacola saem pelo preço
de 2.

**O cartão de 2 unidades e o "-X%" de volta — pronto em 27/09 (entrega 0142).** Pedido dele, vendo
a promoção no ar: "o card com 2 aqui saiu e não pode" e "tudo bem deixar a tag do leve 3 e pague 2
lá em cima, mas precisamos apresentar a % de desconto também".

- **A faixa de 2 fica:** num "Leve 3, pague 2", o produto sai só da faixa de 3 ou mais (a que chega
  no 3). 2 unidades seguem com os 4%, e o cartão "2 unidades" volta na página do produto; 3 seguem
  pelo preço de 2 (sem os 6% junto). Num "leve 2", saem as duas faixas, como antes.
- **Os dois selos no card:** o da promoção em cima e o "-X%" logo embaixo. Etiqueta comprida quebra
  a linha e empurra o de baixo, sem cobrir.
- **Na sacola, com 2:** "Leve 3, pague 2 · mais 1 por R$ 4,90". Com a faixa de 2 valendo, a
  terceira custa a diferença (a faixa deixa de valer no 3), e "mais 1 sai de graça" o total
  desmentiria no clique. O "+" já prevê o total certo.
- **A fresta, conhecida:** numa promoção de vários produtos (loja inteira ou categoria), 2 de um com
  os 4% e 1 de outro disparam o "leve 3" — e os 4% ficam. Com promoção de um produto só, não
  acontece.

Conferido pelo `conferir-promocoes.mjs` (46/46; novas: a faixa de 2 no carrinho, os dois selos no
card um embaixo do outro, o cartão de 2 na página do produto e o preço dele lá em cima, a sacola
com 2 e o card depois da pausa só com o "-X%"), pelos testes de unidade (1073; 4 novos, das faixas
que ficam), pelos de sempre (checkout 182/182, cupons 44/44, catálogo 34/34 e PDP 68/70 — as 2 de
antes, do banco local) e pelas fotos (card no computador e no celular, com etiqueta de 30 letras; a
caixa de compra; a sacola). E a virada do deploy, no banco local: promoção no ar sem a faixa de 2
(como a produção hoje), página guardada sem o cartão de 2 — a rodada de minuto em minuto devolveu a
faixa e avisou a loja com "agora", e o cartão apareceu sozinho em 14 s.

Depois do deploy — **nada a configurar**: a rodada de minuto em minuto devolve a faixa de 2 aos
produtos da promoção que já está no ar e avisa a loja na hora (uma faixa que muda com promoção
valendo avisa com "agora" desde esta entrega).

- [ ] **Parte 2: o brinde — Claude Code.** Decidido por ele: "compras acima de R$ X, leve um
      brinde", com o CLIENTE ESCOLHENDO entre 2 ou 3 opções (como o app Brinde no Carrinho); o
      "acima de R$ X" conta antes do cupom, igual ao frete grátis; o brinde é produto da loja
      (nada a cadastrar à parte no Bling) e **na nota tem que ir como brinde**, não como venda com
      desconto — ver no Bling como o pedido leva esse item como bonificação. O desenho: a linha
      do brinde entra pelo clique do cliente (uma rota que confere o valor, a opção e o estoque),
      sai quando o Medusa para de descontar (valor abaixo, promoção acabou), e uma trava no
      fechamento do carrinho (`completeCartWorkflow.hooks.validate`) recusa brinde cobrado.

**Os 7 consertos do checkup da reta final — prontos em 26/09 (entrega 0136).** Pedido dele: "estamos
na reta final, faça um checkup, cace bugs na loja" → "vamos corrigir os 7". O checkup (só leitura, na
main de 26/09) passou a loja do ar inteira (37 páginas no celular e no computador, sem erro), os 56
endereços antigos da Nuvemshop, os 964 testes de unidade e todos os conferidores na main (1.876 de
1.879), e seis revisões do código por área. Os sete que valiam consertar antes da virada:

- **E-mail com erro de digitação travava a compra.** "joão@gmail.com", "jose..silva@", ponto no fim ou
  vírgula no lugar do ponto passavam na loja, o Medusa recusava, e a tela dizia "Não consegui falar
  com a loja" pra sempre — a pessoa não saía do passo 1. Agora a regra é a mesma do Medusa, e a
  frase diz o que consertar ("E-mail não leva acento…", "Tem uma vírgula no e-mail…"), embaixo do
  campo.
- **Frete com preço igual nas duas entregas.** A tela mostrava só a expressa e gravava ela: o cupom de
  frete grátis "só na mais barata" nunca entrava, e aceitar a oferta do passo 3 podia fazer o frete
  sair de Grátis pra R$ 21,90. No empate (mesmo preço e mesmo prazo), agora fica a econômica — a
  mesma que a sacola já gravava.
- **Preço velho na sacola.** Quem voltava dias depois, com o endereço já preenchido, pagava o preço de
  quando pôs o produto (a promoção que acabou continuava valendo; a nova não entrava). Agora o "Pagar"
  refaz preço, cupom e frete antes de cobrar; se o total mudou, nada é cobrado e a tela mostra o de
  agora.
- **Cupom de 1 uso queimado por Pix não pago.** 74 dos 104 cupons da Nuvemshop valem 1 uso, e o Pix
  gerado já conta o uso. O pedido cancelado (Pix que venceu, cartão reprovado, cancelado no painel)
  agora devolve o uso, uma vez só; e os que já tinham queimado voltam na migração do deploy.
- **O Google ia esconder a página Contato.** A regra do robots.txt que esconde a /conta pegava a
  /contato também. Só apareceria no dia da virada.
- **Cupom em R$ com "não combinar com promoção" não salvava** (o painel dizia "Não consegui falar com
  a loja"). Agora salva, e desconta só os produtos de preço cheio.
- **Dava pra somar vários cupons chamando o sistema por fora da loja** (5 cupons, R$ 153,90 → R$ 81,06,
  no banco local). Ninguém de fora conseguia hoje — a chave não aparece no site —, mas a trava estava
  furada. Fechada nas duas pontas.

Conferido pelo `conferir-checkout.mjs` (182; as 9 novas: quatro e-mails tortos, o empate com o cupom
e com o carrinho mudando, o preço refeito no pagar), pelo `conferir-cupons.mjs` do painel (as 3 novas:
em reais sem combinar, o cupom no corpo do carrinho, o uso que volta), pelo `conferir-links.mjs` (o
robots contra o sitemap, com `SITE_INDEXAVEL=true`) e pelos testes de unidade.

Depois do deploy — **nada a configurar.** No log do Railway, a migração diz quantos pedidos cancelados
devolveram uso de cupom (`[cupons] pedidos cancelados: N de M`).

- [ ] **O que o checkup achou e ficou pra depois** (nada disso trava venda):
  - O desconto aparece duas vezes na linha do produto, na tela, no e-mail e no pedido do painel
    ("1 × R$ 79,90 … R$ 71,91" e embaixo "Desconto −R$ 7,99"). O total está certo.
  - A etiqueta da Frenet pode sair com uma transportadora diferente da cobrada, quando a sacola muda
    depois de escolher a entrega (o `data.servico` do método fica o de antes).
  - Pedido com estorno parcial aparece como "não pago" pro cliente (conta e obrigado).
  - Cartão de 19 dígitos (alguns Hipercard) não cabe no campo.
  - O link de cupom (`/discount/…`) guarda código que não existe e diz "entra sozinho"; e perde o
    `?utm_…` no redirect.
  - A home diz "12 produtos" (o Kit Shampoo Duplo e as duas Pastas nunca aparecem lá), não tem foto
    de prévia pro WhatsApp (`og:image`) nem canonical; a categoria de kits se chama "Kits — produtos
    pra kits".
  - Pix que o Pagar.me confirma depois de a sessão virar "cancelado" não é devolvido por ninguém
    (raro — é assunto da série do pagamento, entrega 0132).
  - Pedido de R$ 0 (cupom de 100% com frete grátis) não fecha — nenhum cupom assim hoje.
  - Marketing → Pagamento: a tentativa de cartão cancelada entra no total e em nenhum motivo (o
    `conferir-marketing` acusa num banco que já rodou o de pagamento).

**CRM, parte 2: os avisos do Resend — pronto em 26/09 (entrega 0138).** Agora a loja fica sabendo o
que aconteceu com cada e-mail que mandou pra cliente.

- **O que volta:** se o e-mail chegou, se foi aberto, em que link a pessoa clicou, se voltou
  (endereço errado) e se virou reclamação de spam.
- **No painel:** CRM → "Os e-mails da loja": quantos saíram no período e quantos chegaram, foram
  abertos, levaram clique, não chegaram e viraram spam; o mesmo pra cada e-mail (pedido confirmado,
  código de entrar, saiu pra entrega…); e os últimos avisos em frase, com o e-mail mascarado ("r•••@
  gmail.com clicou em “Pedido confirmado”", "“Código de entrar” não chegou · o endereço não aceita
  e-mail").
- Os e-mails da equipe (a venda nova, o código do painel) ficam fora dessas contas.
- A política de privacidade conta que a loja sabe se o e-mail chegou, se foi aberto e em que link se
  clicou (sem o IP), e que isso também fica 13 meses.
- [ ] **Ligar os avisos no Resend — você, uma vez:**
  1. Resend → **Webhooks** → **Add endpoint**. Endereço:
     `https://<o endereço do backend no Railway>/hooks/resend` (o mesmo do `MEDUSA_BACKEND_URL`).
     Eventos: marque os de e-mail (`email.sent`, `email.delivered`, `email.delivery_delayed`,
     `email.opened`, `email.clicked`, `email.bounced`, `email.complained`, `email.failed`,
     `email.suppressed`).
  2. Na tela do webhook criado, copie o **Signing secret** (começa com `whsec_`).
  3. Railway → o serviço do backend → **Variables** → nova variável `RESEND_WEBHOOK_SEGREDO`, com o
     valor copiado. Não cole em conversa nenhuma.
  4. Pra contar abertos e cliques: Resend → **Domains** → o domínio da loja → ligue **Open
     tracking** e **Click tracking**.
  5. Pra ver funcionando: Painel → CRM → "Os e-mails da loja" diz "o último chegou …" depois do
     próximo e-mail.

Conferido pelo `conferir-crm.mjs` (65 checagens; as 15 novas: a etiqueta no e-mail, os avisos com e
sem a assinatura, o clique sem o IP e sem o número do pedido, a abertura repetida contando uma vez,
o e-mail que voltou, o da equipe de fora, e a tela) e pelos testes de unidade (12 novos).

Depois do deploy — **os passos acima.** Sem eles, o CRM diz que os avisos ainda não estão ligados.

- [ ] **As próximas partes da Fundação** (uma entrega cada, perguntar antes): a ficha de cada pessoa
      com as etiquetas, os Ajustes do CRM editáveis no painel, a base da Nuvemshop e o modelo de
      e-mail.

**Painel: o dono escolhe o que cada papel abre — pronto em 27/09 (entrega 0139).** Pedido dele: "no
dashboard em configurações eu como admin quero poder habilitar as permissões dos colaboradores,
atualmente é fixo". Escolha dele: **por papel** (a tabela vira clicável), e não pessoa por pessoa.

- **Em Configurações → Equipe e acessos**, a tabela "O que cada papel abre" virou caixinhas: você
  marca o que a Operação e o Marketing abrem e clica em "Salvar acessos". Vale no próximo clique de
  cada pessoa, e no servidor — a área desmarcada some do menu e nem sai da loja pra quem não abre.
- **O dono abre tudo, sempre** (a coluna dele não tem caixinha). O **Início** abre pra todo mundo, e a
  **Equipe e acessos** é só do dono: essas duas linhas não mudam.
- **O que mora dentro de uma área só abre com ela:** o "Tentar o estorno de novo" (nos Pedidos),
  editar a página (nos Produtos), a newsletter (em Clientes) e mudar a meta (no Marketing). Marcar
  um deles marca a área junto; desmarcar a área desmarca ele.
- **Em amarelo**, o que está diferente de como a loja nasceu. "Voltar ao padrão" põe a tabela de
  antes na tela (falta salvar); "Desfazer" volta pro que está salvo.
- **O convite** por e-mail e o "Mudar" de cada pessoa passam a dizer o que o papel abre agora.
- **O registro da equipe** ganha uma linha a cada vez que alguém salva, com o que mudou.
- **O Início segue a tabela:** a fila dos pedidos e os pedidos de hoje só pra quem abre os Pedidos; o
  estorno que falhou, só pra quem abre o estorno; as visitas inteiras (hora a hora, de onde vieram)
  pra quem abre o Marketing — os outros veem só o número.
- **Configurações** pode ser liberada pra Operação ou Marketing; a aba "Equipe e acessos" continua só
  do dono.
- **O que segue pelo papel, e não pela tabela:** o CPF inteiro (só o dono vê), o Marketing sem o
  telefone dos clientes nos Carrinhos e em Clientes (e, em Clientes, só quem aceitou ofertas), pra
  quem vai cada aviso por e-mail (a aba E-mails) e as abas de baixo do celular. Liberar os Pedidos
  pro Marketing mostra o pedido como a Operação vê (com endereço, sem o CPF inteiro).

Conferido pelo `conferir-entrar.mjs` (90 checagens, 30 novas: a tabela igual à da API, as linhas
fixas, o estorno ligando e desligando com os Pedidos, o salvar com o aviso, o menu e a API da
operação mudando no clique seguinte, a tela de "sem acesso", o convite com a lista nova, o que a API
recusa, o "Voltar ao padrão" e a tabela cabendo no celular), pela rodada completa dos conferidores
do painel e pelos testes de unidade.

Depois do deploy — **nada a configurar**: a tabela nova do banco nasce sozinha no Railway (a
migração roda no deploy), e sem nada salvo a loja fica exatamente como antes. Pra testar: Painel →
Configurações → Equipe e acessos → marque "Cupons e descontos" na Operação → Salvar acessos.

**Painel mais rápido, com as listas em páginas — pronto em 27/09 (entrega 0146).** Pedido dele: "quero
que trabalhe na performance do dashboard (...) precisamos trabalhar na performance e paginação de
listas também" — menos a parte do CRM, que outra sessão está fazendo.

- **O clique responde na hora.** Toda área ganhou um esqueleto: ao clicar no menu, a tela troca na
  hora pro desenho da página (o título, os números, a lista) em cinza, e os dados entram quando
  chegam. Antes, nada mudava até a resposta inteira chegar, e o clique parecia perdido.
- **Uma espera a menos em todo clique.** Cada tela perguntava ao servidor "quem é você" e SÓ
  DEPOIS pedia os dados. Agora as duas perguntas saem juntas.
- **Listas em páginas:** Pedidos, Clientes e Carrinhos de 30 em 30, Cupons de 20 em 20 (com busca
  pelo código — os 104 cupons da Nuvemshop enchiam a tela) e a Newsletter de 50 em 50. Embaixo de
  cada lista: "31–60 de 300" e os números das páginas (no celular, as setas). As fitas de filtro e
  os números de cima continuam contando TUDO; o "Baixar CSV" da newsletter continua levando todo
  mundo.
- **Buscar não recarrega mais o painel inteiro** (Pedidos, Clientes, Cupons): troca só a lista.
- **O servidor lê menos.** O total de cada pedido o Medusa calcula na hora (itens, impostos,
  descontos, frete) — era o que mais pesava. As listas agora pedem o total só do que aparece na
  tela: a lista de Clientes ficou ~4× mais rápida, a de Pedidos, os Cupons e o Início também
  aliviaram, e a resposta da lista de pedidos caiu de 94 KB pra 10 KB.
- **Configurações** abre direto na primeira aba (antes passava por um redirecionamento).
- **Nada mudou nos números:** a prova A/B com o backend de antes, no mesmo banco, deu as mesmas
  respostas nas 57 leituras (as 7 fitas dos pedidos, as buscas, clientes com o "gastou", carrinhos,
  os usos dos cupons, a newsletter, o Início e 40 pedidos abertos) — as únicas diferenças foram o
  relógio andando ("há 1 h 10" × "há 1 h 11").

Conferido pelos conferidores do painel (os de pedidos, clientes, cupons e carrinhos ganharam as
checagens das páginas: a página 2 continua a 1, o pé, a fita contando todos, a página que não existe
virando a última, a busca dos cupons na tela, o CSV com todo mundo) e pelos testes de unidade (os
novos: as páginas, quais pedidos precisam do total no Início, o "gastou" só da página).

Depois do deploy — **nada a configurar.** O painel (Vercel) e o backend (Railway) sobem separados:
nos minutos em que só o painel novo está no ar, as listas aparecem inteiras, sem o pé das páginas,
como antes.

- [x] **A próxima parte: mais visual, menos texto** — aprovada em 27/09 ("perfeito vamos seguir para o
      próximo"), feita na 0148 (abaixo).

**Painel mais visual, com menos texto — pronto em 27/09 (entrega 0148).** O desenho aprovado por ele (o
Início, os Pedidos e os Clientes, no computador e no celular) está em
<https://claude.ai/artifact/DLk4uCe8UcrjFLpzqZP3xx>.

- **O "?" no lugar das explicações.** O que antes ficava escrito embaixo do título (e nas notas do pé)
  agora abre num "?", ao lado do título, só quando alguém toca.
- **Início:** cada número ganhou o seu ícone. As vendas de hoje têm as barrinhas da semana, o que espera
  pagamento mostra Pix e cartão pelos ícones, e as visitas dizem a diferença de ontem numa seta verde ou
  vermelha. **"Precisa de você" junta o que é igual**: sete "a nota do #N não sai sozinha" viram UM
  cartão "A nota não sai sozinha", com o número (7), o motivo ("sem CPF/CNPJ") e os pedidos, um botão pra
  cada. Os pedidos de hoje mostram a foto dos produtos e o ícone do pagamento; os mais vendidos, em barras.
- **Pedidos:** cada linha tem as iniciais do cliente, as fotos dos produtos, o ícone do Pix ou do cartão
  e, embaixo da situação, os seis passos em tracinhos (preto feito, amarelo agora, vermelho com problema).
  As fitas de filtro ganharam ícones, e a de problemas fica vermelha quando tem.
- **Clientes:** as iniciais de cada pessoa, os pedidos num quadradinho, o "gastou" com uma barrinha, e as
  ofertas pelos ícones do e-mail e do WhatsApp (aceso é quem aceitou). Em cima, o total de clientes e
  quantos aceitam ofertas.
- **No celular**, os mesmos desenhos nos cartões.

Conferido pelos conferidores do painel (os de pedidos e clientes ganharam as checagens do desenho: a fila
agrupada igual à da API, com o número, os pedidos e o "?"; a foto, o Pix ou o cartão e os seis passos de
cada linha; os ícones das ofertas) e pelos testes de unidade (a fila junta o que é igual, o motivo curto,
as fotos e os passos da linha, os canais do cliente).

Depois do deploy — **nada a configurar.** Nos minutos em que só o painel novo está no ar, a fila e as
linhas aparecem como antes (sem os números nem os desenhos novos).

- [x] **O resto das telas, parte A** (o pedido aberto, Produtos, Carrinhos e Cupons) — pedida em 27/09
      ("sim por favor"), feita na 0155 (abaixo).
- [x] **O resto das telas, parte B:** Observabilidade, Configurações, Marketing e Layout da home — feita
      na 0158 (abaixo). A aba Pagamento das Configurações fica pra depois da 0157 (a parcela mínima).

**Painel mais visual nas outras telas, parte A — pronto em 27/09 (entrega 0155).** O mesmo "?" e os
mesmos desenhos da 0148, agora no pedido aberto, nos Produtos, nos Carrinhos e nos Cupons.

- **O pedido aberto:** a faixa do problema mostra o título e o motivo em poucas palavras ("sem
  CPF/CNPJ", "vale até 14:30", "valor só reservado"); a explicação inteira vai no "?", e o botão
  continua na faixa. O pagamento tem o ícone do Pix ou do cartão; o cliente, as iniciais e a pílula de
  quem tem conta. A hora em que a nota sai sozinha fica numa pílula, com o porquê no "?".
- **Produtos:** a explicação da tela no "?"; o estoque num quadradinho (vermelho no zero, amarelo
  acabando); as fitas com ícones. Na página de cada produto, as explicações de cada bloco no "?", as
  medidas da foto e do vídeo em fichas, e quem só vê (a operação) ganha a pílula "Só pra ver" no alto —
  no lugar da frase repetida em três blocos.
- **Carrinhos:** as iniciais da pessoa, as fotos da sacola e o passo em que parou (vermelho quando o
  pagamento foi tentado e não passou); os números e as fitas com ícones; a nota do pé foi pro "?".
- **Cupons:** o valor num selo amarelo ("10%", "R$ 20", "Frete grátis"), as regras em fichas e os usos
  numa barrinha até o limite (vermelha quando acabou). As promoções mostram o selo da loja ("Leve 3,
  pague 2"); os descontos automáticos, um ícone cada.
- **No celular**, os mesmos desenhos, sem rolar de lado.

Depois do deploy — **nada a configurar.** Nos minutos em que só o painel novo está no ar, as telas
aparecem sem os desenhos que dependem do backend novo (as etiquetas das faixas, as fotos dos carrinhos,
o selo dos cupons).

**Painel mais visual nas outras telas, parte B — pronto em 27/09 (entrega 0158).** O mesmo "?" nas
telas que faltavam.

- **Observabilidade:** a faixa de cima com o porquê no "?"; os quatro números com ícone; o freio do
  cartão numa pílula ("Freio ligado" ou "desligado"); cada integração verde sem frase (ela vai pro
  "?"), e a que tem problema com o motivo à vista; "Quem é avisado" numa linha.
- **Configurações:** as explicações de cada bloco no "?"; o que falta nos dados da empresa em
  etiquetas; o remetente dos e-mails numa pílula; as pendências da nota com o número ao lado do título.
- **Marketing:** em todas as abas, as explicações e as notas do pé no "?" (o glossário e de onde vêm os
  números, no "?" do título); as ofertas com ícones nos números; as tentativas do cartão numa pílula.
- **Layout da home:** a faixa de publicar com cada mudança numa etiqueta e a última publicação numa
  pílula; a explicação no "?".
- **Newsletter:** a explicação da tela no "?".

Depois do deploy — **nada a configurar** (só o painel mudou).

**CRM, parte 3: a ficha de cada pessoa — pronto em 27/09 (entrega 0145).** Na ficha do cliente
(Clientes → a pessoa), o CRM mostra quem ela é pro "Ciclo da Barba".

- **As cinco etiquetas, no alto da ficha**, cada uma com o porquê:
  - **Etapa:** Lead (tem e-mail, não comprou), 1ª compra (pagou, ainda não chegou), Em tratamento
    (chegou), Recorrente (2 pedidos pagos), Em risco (20 dias depois do dia de comprar de novo) e
    Sunset (45 dias em risco, sem clicar nem visitar a loja).
  - **Engajamento:** quente (clicou num e-mail, visitou, comprou ou assinou a newsletter nos últimos
    30 dias), morno (até 90) ou frio.
  - **Tratamento:** o dia desde a entrega do primeiro Fator ("Dia 14").
  - **Próxima compra:** o dia em que o produto acaba (a entrega + quanto ele dura); em vermelho se já
    passou.
  - **Sensível a cupom:** "Sim" quando as últimas 3 compras foram com cupom (a oferta do checkout e
    o "Leve 3, pague 2" não contam).
- **Quanto dura cada produto:** os dias do protótipo — Fator 30; óleo, shampoo e spray 45; balm e
  pasta 60 —, vezes a quantidade (o kit de 3 dura 3 vezes mais). Fixos até a parte dos Ajustes do
  CRM. Sem o aviso de entrega, o pedido conta como entregue 7 dias depois de pago.
- **De onde a pessoa chegou** da primeira vez (Instagram, Google, direto…), e o dia.
- **O caminho dela**, embaixo dos pedidos: o que fez no site (com o sim dos cookies), os e-mails da
  loja (chegou, abriu, clicou) e as compras, do mais novo pro mais velho.
- **Quem vê:** quem abre o CRM (o dono e o marketing, no padrão). O marketing vê a compra e o valor,
  sem o número do pedido. A operação vê a ficha como antes.
- Por enquanto só contam os pedidos da loja nova: o histórico da Nuvemshop entra na parte da base.

Conferido pelo `conferir-crm.mjs` (72 checagens, 7 novas: a ficha da conta da rodada — lead, quente
pelo clique no e-mail, "Direto", o caminho com o e-mail e o site, a tela —, e a operação sem a parte
do CRM), pelo `conferir-clientes.mjs` (47, 10 novas: as etiquetas com pedidos de verdade, a oferta
do checkout fora do cupom, o Pix esperando fora da compra, o marketing sem o número do pedido), pela
rodada completa dos conferidores e pelos testes de unidade (18 novos).

Depois do deploy — **nada a configurar.** Pra ver: Painel → Clientes → abra um cliente.

- [ ] **As próximas partes da Fundação** (uma entrega cada, perguntar antes): os Ajustes do CRM
      editáveis no painel (inclusive quanto dura cada produto), a base da Nuvemshop e o modelo de
      e-mail.

**Pix reserva, parte 2: o Mercado Pago, só no Pix — pronta em 27/09 (entrega 0140).** A loja passa a
saber cobrar Pix pelo Mercado Pago (a conta dele, a mesma das vendas do Mercado Livre). **Ainda não
usa sozinha:** a troca automática, quando o Pagar.me falhar, é a parte 3. Nada muda pra quem compra.

- **O que já faz:** gera o Pix (o QR e o copia-e-cola aparecem na tela de obrigado como os do
  Pagar.me), recebe o aviso de pago direto no Medusa (assinado — aviso sem a assinatura certa não
  muda nada), e confere de 5 em 5 minutos o que o aviso não resolve: o Pix pago sem aviso, o
  vencido, o que o Mercado Pago cancelou, a resposta perdida no caminho e o Pix cuja sessão sumiu.
  O pedido cancelado com o Pix esperando cancela o QR lá NA HORA (o Pagar.me não deixa; o Mercado
  Pago deixa), e o pedido pago cancelado no admin devolve o dinheiro pelo Mercado Pago.
- **Uma compra, um Pix:** a resposta perdida é repetida com a mesma chave, e volta o mesmo Pix.
- **A venda do Mercado Livre, ninguém toca:** a loja só mexe no pagamento que tem a marca dela (a
  sessão do checkout e a origem desta instalação).
- **No painel:** Configurações → Pagamento e a Observabilidade ganham a linha do Mercado Pago —
  "Desligado" até o token entrar no Railway. A política de privacidade passa a citar o Mercado Pago.
- **Por dentro:** o que as duas conciliações dividem saiu pra `lib/pagamento/conciliacao.ts`, e a
  entrada da loja, o dinheiro em centavos e a origem, pra `lib/pagamento/{entrada,comum}.ts` (o
  Pagar.me continua exportando o que exportava). O dinheiro que entra num pedido já cancelado é
  devolvido pelo Medusa pra todo parceiro.

Conferido pelo `conferir-mercadopago.mjs` (48, novo: o Pix pela tela com o QR de lá, o aviso
assinado e o forjado, a conciliação sem aviso, o Pix vencido e o que o Mercado Pago venceu, o
cancelamento com o QR morrendo, o estorno do pedido pago, a resposta perdida, o Mercado Pago fora, a
dúvida "gerou ou não?", os órfãos, a venda do Mercado Livre intacta, o estado forjado e o cartão
recusado), pelos de sempre na mesma pilha — `conferir-pagamento.mjs` (214), `conferir-checkout.mjs`
(182), `conferir-conta.mjs` (209), `conferir-erp.mjs` (114) e, no painel, `conferir-pedidos.mjs`
(77), `conferir-acoes.mjs` (32), `conferir-observabilidade.mjs` (35, agora com 9 integrações) e
`conferir-configuracoes.mjs` (18) — e pelos testes de unidade (1127; 17 novos).

**Depois do deploy — com você, uma vez** (o Pix reserva só liga depois disto; sem, a loja segue só
com o Pagar.me, como hoje):

1. **A chave Pix:** no app do Mercado Pago, confira se a conta tem uma chave Pix cadastrada (sem
   chave, o Mercado Pago não gera Pix pela API).
2. **A aplicação:** em https://www.mercadopago.com.br/developers/panel/app, "Criar aplicação"
   (pagamentos online). Dentro dela, **Credenciais de produção** → ative (ele pede o setor e o site)
   → copie o **Access Token** (começa com `APP_USR-`).
3. **O aviso:** na mesma aplicação, **Webhooks** → **Configurar notificações** → modo de produção →
   URL `https://fuckingbarbabackend-production.up.railway.app/hooks/payment/mercadopago_mercadopago`
   → evento **Pagamentos** → salvar → copie a **assinatura secreta**.
4. **O Railway:** no serviço do backend, Variables → `MERCADOPAGO_ACCESS_TOKEN` (o Access Token) e
   `MERCADOPAGO_WEBHOOK_SEGREDO` (a assinatura secreta). Chave nunca na conversa. O Railway sobe de
   novo sozinho.
5. **A região:** no shell do Railway, `cd apps/backend/.medusa/server && npx medusa exec
   ./src/scripts/pagamento.js` — liga o Mercado Pago junto do Pagar.me, e antes confere o token
   (token errado para ali, com o motivo). Depois, Painel → Configurações → Pagamento mostra
   "Mercado Pago · Pix reserva: Conectado".

**Produto em mais de uma categoria — pronto em 27/09 (entrega 0151).** Pedido dele: "Quero poder
adicionar as categorias também dos produtos, por exemplo os kits para barba eu gostaria que
aparecessem na aba para barba também".

- **No painel** (Produtos → o produto → Textos): a **Categoria principal** (a de sempre) e, embaixo,
  **"Aparece também em"**, com as outras categorias pra marcar. Marcou Barba num kit de Kits: ele
  aparece nas duas abas da loja (/kits e /barba). Sem a principal, as outras ficam travadas.
- **A principal é a do caminho no topo da página do produto** ("Início › Kits › …") e a do Google e
  da Meta (o catálogo dos anúncios). As outras só põem o produto na vitrine delas. Em "Todos" e no
  "resto da loja" ele continua aparecendo uma vez só.
- **A lista de Produtos** mostra "Kits — também em Barba".
- **Cupons "só com produtos de":** o kit em Kits e em Barba conta como das duas, como na Nuvemshop —
  o cupom de Kits aceita, o de Barba também, o de Cabelo não. Sem esse conserto, o cupom de Kits
  passaria a recusar o kit no dia em que ele ganhasse Barba. O "Leve 3, pague 2" por categoria já
  contava assim.
- **Por dentro:** a principal fica guardada no produto (a marca `fb_categoria`), porque o Medusa não
  guarda ordem entre as categorias. Sem a marca — produto mexido direto no admin do Medusa —, vale a
  primeira pela ordem do menu (Barba, Cabelo, Kits). A importação do Bling mantém a marca junto com
  as categorias. Mudar categoria pelo admin do Medusa não avisa a loja (a página demora a mudar);
  pelo painel, avisa.

Conferido pelo `conferir-produtos.mjs` do painel (117, 16 novas: marcar e salvar, as duas vitrines,
a trilha seguindo a principal e não a ordem do menu, a lista, o painel de antes sem apagar as
outras, as recusas), `conferir-cupons.mjs` (47: o kit em duas categorias nos cupons das duas e de
uma terceira), `conferir-catalogo.mjs` (35: a trilha de cada produto, com dois produtos em duas
categorias no banco local — um com a principal marcada, outro sem), `conferir-feed.mjs` (14: a
categoria de cada linha é a principal), `conferir-erp.mjs` (115: a marca fica na importação),
`conferir-pdp.mjs` (68 de 70 — as 2 falham igual na main, com o mesmo banco: a rotina do spray
aponta pra pasta, que o banco local não tem, e um 404 no console), `conferir-checkout.mjs` (92
checagens até "O pedido", com os chips do frete grátis e a oferta — a parte que usa a categoria;
dali parou por tempo, com a máquina sem memória) e pelos testes de unidade (1167; 11 novos).

Depois do deploy — **nada a configurar.** Pra usar: Painel → Produtos → abra o kit → Textos →
"Aparece também em" → marque **Barba** → Salvar; em alguns segundos ele aparece em /barba também.
Repita em cada kit de barba. Espere o Railway terminar de subir antes: nos minutos em que só o
painel novo está no ar, o "Aparece também em" ainda não grava.

**Pix reserva, parte 3: a troca pelo parceiro que está de pé — pronta em 27/09 (entrega 0150).** A
loja passa a escolher sozinha por onde cobrar. Enquanto o Mercado Pago não for ligado (os 5 passos
da 0140, mais acima), nada muda: sem reserva, ela cobra só pelo Pagar.me, como antes.

- **O Pix no mesmo clique:** se o Pix não nasce no Pagar.me (ele não respondeu, recusou, ou a
  resposta sumiu), a loja gera o Pix pelo Mercado Pago na hora — quem compra só vê o QR, uns
  segundos depois. Com a reserva esperando, a loja não espera o Pagar.me meio minuto: desiste em
  10 segundos. O Pix que nascer tarde lá não chega a ninguém (a conciliação fecha). Cartão nunca vai
  pro outro parceiro.
- **O disjuntor:** três tentativas seguidas em que o parceiro NÃO RESPONDEU (e não as que ele
  recusou) tiram ele do caminho por 5 minutos; depois, a próxima compra é o teste, e ele volta
  sozinho se der certo. Com o Pagar.me fora, o Pix vai direto pelo Mercado Pago, e o cartão fica na
  tela apagado: "Fora do ar agora. Paga no Pix, que está funcionando." Com o Mercado Pago fora, nada
  muda pra quem compra. Com os dois fora, a loja segue tentando os dois (tirar o último parceiro
  seria deixar a loja sem pagamento) e a tela diz "Não consegui gerar o Pix agora, e nada foi
  cobrado. Tenta de novo em instantes."
- **O e-mail pro dono:** quando um parceiro cai e quando volta, no máximo um de cada por hora, com
  o que a loja está fazendo ("o Pix está saindo pelo Mercado Pago", "os parceiros pararam de
  responder", "o Pagar.me voltou, depois de 27 min fora"). Aparece em Configurações → E-mails como
  "Um parceiro de pagamento caiu".
- **Por dentro:** o provedor grava por que não deu (`falha`: "fora", "recusa" ou "interno"); as
  tentativas de pagar (`obs_tentativa`) ganham o parceiro e a forma — o Pix passa a ser anotado
  também, sem as travas do cartão —, e é delas que sai o disjuntor e sairá o ranking (parte 4). A
  loja pergunta quem está fora em `GET /store/pagamento`.

Conferido pelo `conferir-mercadopago.mjs` (77, duas rodadas; a parte 8 é nova: o Pagar.me falso
fora e o Pix pelo Mercado Pago no mesmo clique, em segundos; as três falhas, o e-mail e a aba antiga
com o cartão; o cartão apagado e o Pix direto no Mercado Pago; a volta sozinha e o e-mail; os dois
fora e a volta do Mercado Pago), pelos de sempre na mesma pilha — `conferir-pagamento.mjs` (214),
`conferir-checkout.mjs` (182), `conferir-conta.mjs` (209) e, no painel, `conferir-configuracoes.mjs`
(18, agora com 8 avisos da equipe), `conferir-observabilidade.mjs` (35) e `conferir-pedidos.mjs`
(83) — e pelos testes de unidade (1191; 35 novos).

Depois do deploy — **nada a configurar.** A troca começa a valer quando o Mercado Pago for ligado.

**CRM, parte 4: os Ajustes — pronto em 27/09 (entrega 0149).** Painel → CRM → aba **Ajustes**: você
muda quanto dura cada produto e as regras das etiquetas.

- **Quanto dura cada produto**, em dias por unidade: Fator, Óleo, Shampoo, Balm, Spray e Pasta.
  Embaixo de cada um aparecem os produtos da loja que contam como ele. O Kit Completo conta como
  óleo, shampoo e balm, e o kit de 3 conta 3 vezes. Produto que o sistema não reconhece aparece
  numa linha "Fora da conta".
- **As regras das etiquetas:**
  - em risco: 20 dias depois do dia de comprar de novo, ou 60 dias sem pedido quando não se sabe
    quanto o produto dura;
  - sunset: 45 dias em risco, sem clicar nem visitar;
  - quente: um sinal nos últimos 30 dias; morno: nos últimos 90;
  - sensível a cupom: as últimas 3 compras com cupom.
- **Na tela:** em amarelo, o que é diferente do padrão, com "Desfazer", "Voltar ao padrão" e
  "Salvar ajustes". Número fora do limite volta com o aviso embaixo do campo.
- **Quando vale:** na próxima ficha de cliente aberta. Quem abre o CRM (você e o marketing, no
  padrão) muda; a operação não abre.
- **Só o que você muda fica guardado.** Quando o histórico da Nuvemshop acertar os números do
  padrão, o que você não mexeu acompanha.
- De carona: o CRM, os Ajustes e a ficha do cliente abrem um pouco mais rápido (a leitura sai junto
  com a pergunta de quem é, como nas telas da 0146).

Conferido pelo `conferir-crm.mjs` (85 checagens, 13 novas: um pedido de Fator entregue, o número
errado recusado, a operação sem os Ajustes, o marketing mudando o Fator pra 40 dias no celular e a
próxima compra da ficha andando junto, o "Voltar ao padrão" e as abas), pela rodada completa dos
conferidores e pelos testes de unidade (10 novos).

Depois do deploy — **nada a configurar.** Pra testar: Painel → CRM → Ajustes → mude o Fator pra 40 →
Salvar ajustes. A ficha de quem comprou Fator passa a mostrar a próxima compra 10 dias depois.

- [ ] **As próximas partes da Fundação** (uma entrega cada, perguntar antes): a base da Nuvemshop e
      o modelo de e-mail.

**Avaliações de verdade: o e-mail um dia depois da entrega e a página escondida /avaliar — pronto
em 27/09 (entrega 0152).** Pedido dele: "uma página para avaliações (...) cliente não precisa estar
logado (...) página escondida que enviamos para o cliente 1 dia depois que recebe o produto via
e-mail", com o número do pedido, o nome, o produto, as estrelas e a descrição.

- **O e-mail "Pedido #N: o que você achou?"** sai um dia depois de o rastreio dizer "entregue" (a
  hora da transportadora, ou o "entregue" marcado no admin), das 9h às 21h de Brasília — a entrega
  das 23h vira e-mail às 9h do dia seguinte ao "um dia depois". Um por pedido, com um botão
  "Avaliar" pra cada produto, o WhatsApp pra quem teve problema ("antes de dar a nota, chama a
  gente") e o Instagram e o TikTok no rodapé. Não sai pra pedido cancelado, nem pra quem já avaliou
  tudo pela página. Vale pras entregas de até 10 dias atrás: no dia do deploy, quem recebeu nesses
  10 dias recebe o e-mail na primeira rodada.
- **A página /avaliar** — fora do menu, do mapa do site e do Google. Pelo botão do e-mail, ela abre
  com o número do pedido, o nome sugerido ("Rafael S.": a pessoa muda como quiser, é o que aparece
  no site) e o produto marcado; falta dar as estrelas e escrever. Depois do "valeu", ela oferece os
  outros produtos do pedido. Sem o e-mail, a página pede o número do pedido e o e-mail da compra, e
  manda o link de novo pra esse e-mail (desde a 0175 — antes, abria na hora). Sem conta e sem
  senha, mas só quem comprou avalia: o link do e-mail é assinado, e trocar o número não abre o
  pedido de outra pessoa. Uma nota por produto de cada pedido.
- **Painel → Avaliações** (novo, em Pessoas): as novas esperam você. "Aprovar" põe no site na hora;
  "Recusar" não põe (e "Tirar do site" tira a que já estava); a recusada pode ser apagada de vez —
  é pra quando a pessoa pede (a LGPD). O número do pedido aparece pra quem abre os Pedidos. O Início
  avisa "N avaliações esperando". Abrem: o dono, a operação e o marketing (dá pra mudar em
  Configurações → Equipe e acessos).
- **No site:** a aprovada aparece na página do produto ("O que diz quem usou", com as estrelas, o
  nome e o selo de compra verificada), entra na nota do topo da seção, na esteira da home e na nota
  que o Google lê (as estrelas no resultado de busca, depois da virada). A avaliação de verdade
  agora vem ANTES dos trechos das entrevistas — antes, a primeira aparecia em uma visita a cada
  sete.
- **A Política de Privacidade** diz o que a avaliação guarda e o que aparece no site.
- Recusar é pro que não é avaliação — ofensa, dado pessoal de alguém, propaganda. Nota baixa de quem
  comprou também é avaliação (a tela do painel diz isso embaixo da lista).

Conferido pelo `conferir-avaliacoes.mjs` da loja (44, novo: o pedido entregue há dois dias pela
Frenet, o e-mail e o botão de cada produto, a segunda rodada sem repetir, a página pelo botão com o
link fora do endereço, os erros, o "valeu" e o outro produto, o que o Medusa guardou, o link mexido,
a busca pelo número e o e-mail, a aprovada na página do produto com a nota no Product, o tirar e o
apagar), pelo do painel (27, novo: a tela, aprovar, tirar do site, apagar com confirmação, o Início,
o marketing sem o número do pedido e o celular), pelo `conferir-esteira.mjs` (52, 6 novas: a
conversão do que o Medusa manda e a avaliação antes do trecho), `conferir-observabilidade.mjs` (35,
agora com 12 rotinas), `conferir-entrar.mjs` (90) e pelos testes de unidade (1188; 32 novos). O
`conferir-pdp.mjs` passou em tudo menos a rotina do spray, que aponta pra pasta modeladora — produto
que não existe no banco local (igual na main).

Depois do deploy — **nada a configurar.** A tabela nova nasce sozinha no Railway (a migração roda no
deploy). O primeiro e-mail sai na primeira rodada entre 9h e 21h, pros pedidos entregues nos últimos
10 dias. Pra ver: Painel → Avaliações.

- [ ] **A nota na caixa de compra** ("★ 4,8 · 12 avaliações", ao lado do preço, como no protótipo
      da PDP — o CSS `.compra__nota` já existe): quando houver avaliações, perguntar se ele quer.

**Pix reserva, parte 4: os parceiros lado a lado — pronta em 27/09 (entrega 0154).** O pedido dele:
"precisamos ver qual tá mais dando recusado e essas coisas". No Marketing → Pagamento e frete, um
bloco novo, **Os parceiros**, com o Pagar.me e o Mercado Pago lado a lado:

- **Pix gerados** (com "de N tentativas · %", o que não gerou), **pagos** (a parte dos gerados),
  **pra gerar** (do clique ao QR, a mediana), **até pagar** (do QR ao pago), **sem resposta** (as
  tentativas em que ele não respondeu) e **fora do ar** (quantas vezes e quanto tempo — a regra do
  disjuntor: três seguidas sem resposta, até a primeira que ele atendeu).
- **Quem gera mais Pix** só aparece com 10 tentativas de Pix em cada um no período; antes disso, a
  frase diz que ainda não há volume — com a reserva, o Mercado Pago só cobra quando o Pagar.me
  falha. O parceiro que não cobrou nada no período sai da tabela, com uma linha dizendo isso.
- **O achado:** quando um parceiro fica fora do ar no período, o "O que os dados dizem" avisa,
  com quantos Pix saíram pelo outro nesse tempo.
- **O cartão** fica no bloco Cartão (só o Pagar.me passa cartão), que ganhou a barra
  **"Cancelados antes de cobrar"** — o pedido cancelado com o cartão ainda em análise. Antes, eles
  entravam no total e em motivo nenhum, e as partes não fechavam a conta.
- Os Pix gerados e pagos são os pedidos (somados, dão os do bloco Pix); o que não gerou, o tempo e
  o fora do ar vêm das tentativas anotadas desde a entrega 0150.

Conferido pelo `conferir-marketing.mjs` (120, duas rodadas; 3 novas: os parceiros somando o Pix do
período, cada um dentro das regras, e a tela com os números da API) e pelos testes de unidade (1212;
10 novos).

Depois do deploy — **nada a configurar.** Pra ver: Painel → Marketing → Pagamento e frete.

**CRM, parte 5: a base da Nuvemshop — pronto em 27/09 (entrega 0156).** Painel → CRM → aba **Base da
Nuvemshop**: você manda os três arquivos que a loja antiga exporta (Clientes, Vendas e Carrinhos
abandonados), e o CRM passa a conhecer os clientes antigos.

- **O que entra:** de cada pessoa, o e-mail, o primeiro nome, se aceita ofertas (a coluna Marketing),
  se tinha conta e desde quando é cliente; dos pedidos, as datas, os produtos, os valores e o cupom;
  dos carrinhos, a data, os produtos e o total.
- **O que não entra:** CPF, telefone, endereço, rastreio e dados do cartão. São jogados fora na
  chegada.
- **Mandar de novo atualiza.** Nada duplica e ninguém sai: dá pra mandar de novo no dia da virada,
  com os pedidos até ali.
- **Na aba:** quantas pessoas, quantas aceitam ofertas, os pedidos pagos (de quando a quando), o
  vendido e os carrinhos. Embaixo, quem é quem na base inteira: quantos em cada etapa (lead, 1ª
  compra, em tratamento, recorrente, em risco, sunset) e engajamento, e desses quantos aceitam
  ofertas — os que os e-mails vão poder chamar.
- **Na ficha do cliente:** a compra da loja antiga conta nas etiquetas (quem comprou lá e comprou
  de novo na loja nova é recorrente) e aparece no caminho ("pagou o pedido #N na Nuvemshop").
- **Nos Ajustes:** cada produto mostra o que a Nuvemshop diz de quanto tempo leva pra comprar de
  novo. Nos arquivos de 27/09, por unidade: Fator 37 dias (59 recompras), óleo 70 (34), shampoo 78
  (98) e balm 81 (37); spray e pasta ainda sem recompra. O botão "Usar os números da Nuvemshop" põe
  esses números nos campos, e você decide se salva.
- **O SKU diz o que vem em cada produto:** os kits Essencial (shampoo e balm) e Hidratação (shampoo e
  óleo) passam a contar certo.
- A política de privacidade conta o que veio da loja antiga, e o que não veio.

Conferido pelo `conferir-crm.mjs` (97 checagens, 12 novas: os três arquivos pela tela, mandar de novo
sem duplicar, a ficha de quem comprou nas duas lojas, nenhum CPF ou telefone nas respostas, o
histórico e o botão nos Ajustes, a operação sem a base, o arquivo errado e o celular), pela rodada
completa dos conferidores, pelos testes de unidade (14 novos) e pelos três arquivos de verdade lidos
na memória (3.784 pessoas, 2.876 pedidos com 3.227 itens, 128 carrinhos, nenhuma linha perdida) — sem
gravar em lugar nenhum.

- [ ] **Depois do deploy — você, uma vez:** Painel → CRM → Base da Nuvemshop → "Escolher os
      arquivos" → os três que você exportou (clientes.csv, vendas.csv e carrinho_abandonado.csv).
      Depois, se quiser, Ajustes → "Usar os números da Nuvemshop" → Salvar ajustes.
- [x] **As próximas partes da Fundação:** o modelo de e-mail é a parte 6 (entrega 0161, logo
      abaixo). A base na lista de Clientes fica pra quando você quiser ver os clientes antigos lá.

**CRM, parte 6: o modelo dos e-mails e o sair da lista — pronto em 27/09 (entrega 0161).** Todo
e-mail de oferta sai de um modelo só. Painel → CRM → aba **E-mails**:

- **Três exemplos:** boas-vindas, hora de repor e carrinho. Eles saem com os produtos, os preços e a
  empresa de verdade; o cupom e o depoimento são de mentira.
- **"Mandar pra mim":** manda o exemplo pro seu e-mail, com [Teste] no assunto, pra você ver no
  celular como chega.
- **O modelo:**
  - em cima, "Oi, Nome!", o título, o texto e o botão;
  - no meio, os blocos: produtos com foto e preço, cupom, depoimento, os passos da rotina, selo e
    texto;
  - no pé, por que a pessoa recebeu, **Sair da lista em 1 clique**, a empresa com o CNPJ, e os links
    da loja, do Instagram, do TikTok e do WhatsApp.
  Todo link pra loja leva a campanha, e a visita e a compra aparecem em Marketing → Canais, como
  E-mail.
- **Sair da lista:**
  - o link do pé leva à página `/sair` da loja, que pergunta antes;
  - o "cancelar inscrição" que o Gmail e o iPhone mostram no alto do e-mail tira na hora;
  - sair tira a pessoa das ofertas em todo lugar: newsletter, conta, avise-me e a base da
    Nuvemshop. Os e-mails dos pedidos continuam chegando;
  - mandar a base da Nuvemshop de novo não põe de volta quem saiu.
- **Os e-mails de pedido** (confirmado, cancelado e envio) ganharam o TikTok no pé, do lado do
  Instagram.

O que ainda não tem: **quem recebe o quê e quando** (os fluxos: boas-vindas, reposição, carrinho,
volta). Isso é a próxima parte. Até lá, nenhum e-mail de oferta sai sozinho.

- [x] **Recomendado, antes de os fluxos começarem (você, uma vez):** um endereço só pra oferta, pra
      que, se um dia a oferta cair no spam, o e-mail de pedido não caia junto. No Resend, Domains →
      Add Domain → `news.fuckingbarba.com.br`, e os registros que ele mostrar vão na GoDaddy. Depois,
      no Railway, a variável `EMAIL_REMETENTE_CRM` = `FuckingBarba <contato@news.fuckingbarba.com.br>`
      (`contato@`, e não `ofertas@`: desde a 0170, o mesmo endereço manda os e-mails assinados por
      você). Eu te guio no passo a passo quando for a hora. **Feito em 27/09:** o `news` verificado
      no Resend e a variável no Railway; o painel mostra o endereço novo em CRM → E-mails.
- [x] **A próxima parte da Fundação:** os fluxos começaram na parte 7 (entrega 0165, logo abaixo).

**CRM, parte 7: os fluxos de compra — pronto em 27/09 (entrega 0165).** Os primeiros e-mails que
saem sozinhos, pra quem começou uma compra e não terminou. Painel → CRM → aba **Fluxos**.

- **Pix pendente:** 15 minutos antes de o Pix vencer, o aviso, com o código copia e cola e o número
  do pedido. Se venceu, o e-mail do cancelamento tem o botão **Refazer o pedido**. Depois de 1 dia,
  o desconto; depois de 2, a última chamada.
- **Checkout abandonado** (digitou o e-mail e não pagou):
  - em 30 minutos, "Faltou só o pagamento";
  - em 4 horas, "Ficou alguma dúvida?";
  - em 1 dia, o desconto;
  - em 2 dias, a última chamada.
- **O botão de todos** põe a pessoa de volta no checkout, com a sacola do jeito que estava (ou,
  no Pix vencido, uma sacola nova com os mesmos produtos), e o desconto já aplicado.
- **O desconto:** um cupom só da pessoa, de uso único, que vence em 2 dias. Soma com o preço
  promocional, e vai no máximo um a cada 60 dias pro mesmo e-mail. Começa em 10%, e você muda na
  aba Fluxos (de 5% a 30%). Os cupons ficam fora da lista de Cupons: a aba Fluxos conta quantos
  saíram e quantos foram usados.
- **Quem recebe:** quem digitou o e-mail (escolha sua: é sobre a compra que a pessoa começou), menos:
  - quem saiu da lista;
  - o e-mail que voltou ou foi marcado como spam;
  - a equipe;
  - os 5% do grupo de controle, que servem pra saber o que o fluxo vende a mais de verdade.
- **As regras:**
  - comprou, parou;
  - um fluxo por vez: o Pix vem antes do checkout;
  - no máximo 3 e-mails num dia e 6 numa semana por pessoa;
  - de madrugada, só o aviso do Pix e o de 30 minutos. Os outros esperam as 8h.
- **Começam ligados** (escolha sua), mas só pra quem começar uma compra depois do deploy: nada sai
  pros carrinhos de antes. Cada fluxo tem a chave de ligar e desligar na aba, com o "Mandar pra mim"
  de cada e-mail.
- **Na aba, os números de 30 dias:** quem recebeu, quem comprou em até 7 dias e quanto, os cupons
  usados, e quantos do grupo de controle compraram sem receber nada.
- **A política de privacidade** conta esses e-mails (até quatro, com o Sair da lista).

- [ ] **Depois do deploy (você, 5 minutos):** Painel → CRM → Fluxos → "Mandar pra mim" em cada
      e-mail, pra ver no celular. Se quiser mudar o desconto, é ali.
- [x] **O carrinho abandonado** entrou na parte 8 (entrega 0169, logo abaixo).

**CRM, parte 8: o carrinho abandonado — pronto em 27/09 (entrega 0169).** O terceiro fluxo, na mesma
aba **Fluxos**: quem pôs na sacola e não foi pro checkout.

- **Quem recebe:** quem a loja já conhece (escolha sua). É quem aceitou os cookies e já entrou na
  conta, assinou a newsletter ou comprou antes. De quem ninguém sabe quem é, a sacola fica sem
  e-mail.
- **Os e-mails, nas suas horas:**
  - 1 hora: "Esqueceu isso aqui?";
  - 12 horas: o que os clientes acharam, com as avaliações de verdade (as que você aprova no painel)
    dos produtos da sacola;
  - 1 dia: o desconto (o mesmo % da aba), que aqui vale 3 dias;
  - 3 dias: "o desconto vence amanhã";
  - 5 dias: a última chamada.
- **Para quando** a pessoa compra, ou quando abre o checkout. Aí quem cuida é o fluxo do checkout.
- **Começa ligado**, como os outros, e só pra quem puser na sacola depois do deploy.
- **A política de privacidade** conta esses e-mails.

- [ ] **Depois do deploy (você):** CRM → Fluxos → "Mandar pra mim" nos 5 do carrinho.
- [ ] **A próxima parte** (uma entrega, perguntar antes): o pop-up da 1ª compra e as boas-vindas.
      Depois, a campanha de estreia pra base da Nuvemshop.

**Os e-mails dos fluxos fora de Promoções — pronto em 27/09 (entrega 0170).** No seu teste, os
e-mails caíam na aba de ofertas do Gmail. Entraram os ajustes que você escolheu:

- **O aviso do Pix** ficou com a cara dos e-mails de pedido. Sai do mesmo endereço deles, e o pé diz
  "Você recebeu porque fez o pedido #N". Não tem o "sair da lista", que é coisa de oferta.
- **Os lembretes sem desconto** viraram e-mail de gente:
  - texto simples, sem foto e com um link só;
  - assinados "Matheus", com "Matheus, da FuckingBarba" no remetente;
  - quem responder cai no e-mail de atendimento das Configurações;
  - o "sair da lista" continua, pequeno, no pé.
- **Os com desconto** continuam com a cara da marca. Promoções é o lugar deles.
- **O "Mandar pra mim"** sai igual ao de verdade.

Nenhum ajuste garante a aba Principal. Quem decide é o Gmail, pelo jeito do e-mail e pelo que as
pessoas fazem com ele (abrir, responder).

- [x] **Depois do deploy (você):** CRM → Fluxos → "Mandar pra mim" no aviso do Pix e no de 30
      minutos do checkout. Ver em que aba do Gmail cada um cai. (Feito na 0173, logo abaixo.)
- [x] **O endereço só das ofertas** (o 3º ajuste; você, com o meu passo a passo): o item da parte
      6, lá em cima. Feito em 27/09.

**Os lembretes sem preço — pronto em 27/09 (entrega 0173).** No seu teste depois da 0170, a
maioria ainda caía em Promoções. Chequei todos os e-mails da loja. O que empurra pra lá:
- todos saem do mesmo endereço, no domínio que o Perfit usava pras newsletters;
- o rastreio de cliques do Resend troca todos os links por links de rastreio;
- o preço com "de R$" nos lembretes sem desconto;
- a sua caixa já aprendeu que a loja manda promoção. O Gmail aprende com cada pessoa.

O que entrou:
- **Os lembretes sem desconto** listam os produtos só pelo nome: sem o preço e com um link só,
  também na versão em texto. Continuam em texto simples até o teste (escolha sua: testar antes).
- **Os e-mails de pedido e de conta** ficam com a cara padrão da loja, como estão (escolha sua).

- [x] **Você, no Resend:** Domains → `fuckingbarba.com.br` → desligar **Click Tracking**. Na
      GoDaddy, não apagar o registro `links`, que os e-mails já enviados usam. O CRM para de contar
      cliques; as vendas dos fluxos continuam contadas. Feito em 27/09, com o Open Tracking
      desligado também, nos dois domínios.
- [x] **O endereço só das ofertas:** o item da parte 6, lá em cima. Feito em 27/09.
- [x] **O teste**, depois dos dois acima. Foi no seu Gmail, pelo "Mandar pra mim" da aba Fluxos:
  - "Faltou só o pagamento" (30 minutos do checkout): **Principal**;
  - o aviso do Pix: **Principal**;
  - "Esqueceu isso aqui?" (1 hora do carrinho): **Promoções**. Virou a 0174, logo abaixo.
- [x] **Depois do teste:** o texto simples ajudou, então os lembretes continuam em texto simples.

**Os lembretes sem frase de propaganda — pronto em 27/09 (entrega 0174).** O de 30 minutos, que
caiu em Principal, fala de pedido e de pagamento. O do carrinho, que caiu em Promoções, usava
"Esqueceu isso aqui?", o assunto clássico de e-mail de carrinho. Os lembretes sem desconto agora
falam de compra, como o de 30 minutos (escolha sua: reescrever e testar).

- **Carrinho:**
  - 1 hora: "Sua compra ficou pela metade";
  - 12 horas: "Sobre o Fator de Crescimento que você escolheu" (o produto da sacola), com as
    avaliações;
  - 5 dias: "O último lembrete da sua compra";
  - o botão é "Terminar a compra".
- **Checkout e Pix:**
  - 2 dias, sem desconto: "O último lembrete do seu pedido";
  - o Pix vencido, sem desconto: "Quer refazer o seu pedido?".
- **Saíram:** "Esqueceu isso aqui?", "Última chamada", "Ainda dá tempo" e "em 1 clique".
- **Os com desconto** não mudam.

- [x] **Depois do deploy (você):** CRM → Fluxos → "Mandar pra mim" em "Sua compra ficou pela
      metade" e no último lembrete do carrinho. Me dizer a aba de cada um. Caíram em Principal.

**Os lembretes com a cara da loja — pronto em 27/09 (entrega 0176).** Você achou o texto simples
cru, diferente dos outros e-mails. Os seus testes mostraram que o que levava pra Promoções eram as
palavras, e não a foto: o aviso do Pix, com a logo e a foto do produto, caiu em Principal. Então os
lembretes voltaram pra cara padrão, com os textos novos (escolha sua: voltar e testar).

- **A cara da marca,** com as fotos e o "sair da lista" no pé.
- **O resto fica igual:** o remetente "Matheus, da FuckingBarba" e nada do cabeçalho de oferta.
  Assim o teste diz se a cara pesa.
- **O "Ficou alguma dúvida?"** diz onde tirar a dúvida: é só responder o e-mail.

- [ ] **Depois do deploy (você):** CRM → Fluxos → "Mandar pra mim" em "Faltou só o pagamento" e em
      "Sua compra ficou pela metade".
  - Se cair em Principal, fica assim.
  - Se cair em Promoções, os lembretes voltam pro texto simples. É uma troca pequena.

**A parcela mínima do cartão, editável — pronta em 27/09 (entrega 0157).** O pedido dele: "quero
poder editar a parcela mínima no cartão, ali diz 5 reais". Em **Configurações → Pagamento**, o
bloco **Parcelas no cartão** tem o campo **Parcela mínima**.

- **O que ela faz:** o cartão só parcela quando cada parcela passa do valor. Com R$ 30,00, um
  pedido de R$ 60,00 sai em até 2x; um de R$ 90,00, em até 3x. Vale em tudo que mostra "3x de
  R$ X" (o card do produto, a vitrine da home, a página do produto, a sacola, o resumo do checkout
  e as Dúvidas) e nas parcelas que o passo 3 oferece.
- **O mínimo é R$ 5,00** (parcela menor o banco recusa), e o máximo, R$ 1.000,00. Fora disso, o
  campo diz o que vale e nada é gravado.
- **O Medusa confere também:** quem tentar parcelar abaixo da mínima por fora da loja é recusado;
  e se a mínima mudar com o checkout de alguém aberto, a tela diz "A parcela mínima no cartão é de
  R$ X. Escolhe menos parcelas — nada foi cobrado." e mostra as parcelas de agora.
- Salvou, a loja atualiza em segundos. A mudança fica no registro da equipe.

Conferido pelo `conferir-pagamento.mjs` (219; 5 novas: a seção nova grava uma mínima que tira o 3x e
confere a rota da loja, a recusa do Medusa e as parcelas do passo 3), pelo
`conferir-configuracoes.mjs` do painel (20; 2 novas: a API — abaixo do banco recusado, a operação
sem gravar, R$ 30 gravado e lido pela loja — e o Salvar da tela) e o da loja (18; 1 nova: a
parcela na rota pública), pelo `conferir-checkout.mjs` (182) e pelos testes de unidade (1268; 9
novos).

Depois do deploy — **nada a configurar.** Até alguém mudar, vale R$ 5,00, como antes.

**A virada do domínio — feita em 27/09, às 13h (entregas 0159 e 0160).** O `www.fuckingbarba.com.br`
é a loja nova. A loja antiga, na Nuvemshop, fica fora do domínio.

- **Antes:** os pedidos da loja nova passaram a começar no **#3301** (o último da Nuvemshop foi o
  #3194). A loja nova ganhou as duas marcas que a Nuvemshop tinha no código da página: a do Google
  (Search Console) e a da Meta (a verificação do domínio dos anúncios). Isso foi a entrega 0159.
- **Vercel:** o `www.fuckingbarba.com.br` é o principal; o `fuckingbarba.com.br` leva pro www (308)
  e o `fuckingbarba-loja.vercel.app` também (307, com o mesmo caminho). `NEXT_PUBLIC_SITE_URL` =
  `https://www.fuckingbarba.com.br`, `SITE_INDEXAVEL=true` (só Production), e o
  `NEXT_PUBLIC_LOJA_ATUAL_URL` apagado, com redeploy sem cache.
- **GoDaddy:** só o A do `@` (`216.150.1.1`) e o CNAME do `www`
  (`5f77d1e0df816333.vercel-dns-017.com`) mudaram. O resto ficou como estava: o MX do Google, os TXT,
  o `dashboard`, o `links`, o `send`, o `rsend`, os do Perfit (`in`, `pem._domainkey`) e os do
  Resend.
- **Railway:** `LOJA_URL` = `https://www.fuckingbarba.com.br`, e `STORE_CORS`/`AUTH_CORS` =
  `https://www.fuckingbarba.com.br,https://fuckingbarba.com.br`.
- **Pagar.me:** nada a cadastrar. Um pedido de token vazio saindo do www volta como "campos
  obrigatórios", igual de qualquer endereço: essa conta não tem trava de domínio, e o cartão passa.
- **Conferido depois da troca:**
  - o `conferir-enderecos-antigos.mjs` contra o domínio: 56 de 56 endereços da loja antiga abrem a
    página certa;
  - o `conferir-links.mjs`: 28 de 28, o robots contra o sitemap;
  - a página diz ao Google que o endereço é o www, e o sitemap tem as 25 páginas;
  - uma compra de verdade no Pix, pelo celular no 4G: o **#3301**, aprovado na hora.

- [ ] **Hoje — você, na Nuvemshop:** Configurações → Domínios → deixar como principal o endereço
      dela (`fuckingbarba.lojavirtualnuvem.com.br`) e tirar o `www.fuckingbarba.com.br`. Assim os
      e-mails que ela ainda mandar pros pedidos antigos (rastreio, entrega) abrem lá, onde eles
      existem.
- [ ] **Amanhã — você, no Search Console:** o sitemap novo
      (`https://www.fuckingbarba.com.br/sitemap.xml`).
- [ ] **Amanhã — você, no Merchant Center e na Meta:** o catálogo da loja nova, pelos passos da
      0134 (mais acima, "Na virada").
- [ ] **Amanhã — você, na Nuvemshop:** fechar a loja pra vendas (modo manutenção), sem cancelar o
      plano. Os pedidos antigos seguem lá: rastreio e trocas.
- [ ] **Uns 30 dias depois:** exportar tudo da Nuvemshop de novo e cancelar o plano, depois de o
      último pedido antigo chegar e passar o prazo de troca.
- [ ] **A primeira venda no cartão** no domínio novo: conferir que o antifraude aprovou (o Pix já
      foi, no #3301).
- [x] **Os cupons da Nuvemshop criados depois de 26/09:** nenhum (ele confirmou em 27/09).
- [ ] **Se o vigia de fora (UptimeRobot, 0137) estiver ligado:** trocar os endereços dos monitores
      da loja pro `www.fuckingbarba.com.br`.
- [ ] Opcional: `SITE_ORIGENS` no Supabase com o www (é só da função `vitals`, a medida antiga de
      velocidade).

**A campanha do anúncio de volta na Clarity, no Google e na Meta — pronto em 27/09 (entrega
0162).** O que ele viu, com a Clarity ligada no domínio novo: "quando tava na Nuvemshop, a entrada
apresentava certinho de onde o usuário vinha, da campanha, os utm; agora tá apresentando apenas o
site".

- **Por quê:** as tags (Clarity, Google Analytics, Google Ads, Meta e TikTok) só ligam no "Aceitar"
  da faixa de cookies — é o que a política de privacidade promete —, e cada uma lê a campanha no
  endereço da página em que liga. Quem chegava pelo anúncio e aceitava depois de trocar de página
  já não tinha o `?utm_…` nem o clique do anúncio (`gclid`, `fbclid`) na barra, e todas viam só o
  site. Na Nuvemshop, a Clarity carregava sem perguntar, na primeira página.
- **O conserto:** a loja guarda a campanha da página em que a pessoa chegou (na própria aba, sem
  mandar pra ninguém) e, no "Aceitar", devolve pro endereço antes de ligar as tags. Pras
  plataformas, é como se a pessoa tivesse aceitado na página em que chegou: a campanha, a origem e
  o clique do anúncio (Google, Meta, TikTok e Microsoft).
- **O que se vê:** depois do "Aceitar", o endereço mostra de novo o `?utm_…` até a próxima página.
  Uma vez por campanha: na página seguinte, ele não volta.
- **O que não muda:** a gravação da Clarity começa no "Aceitar" — o que a pessoa fez antes dele não
  aparece. Os redirecionamentos já levavam a campanha inteira (conferido no domínio em 27/09: com e
  sem www, com a barra no fim e os endereços antigos da Nuvemshop).
- **O que se perdeu:** as visitas entre a virada e este deploy de quem aceitou depois de trocar de
  página ficam sem campanha na Clarity, no Google Analytics (e no Marketing do painel, que lê dele)
  e nos anúncios. Não dá pra recuperar.

Conferido pelo `conferir-integracoes.mjs` (35; 5 novas: quem chega pelo anúncio e aceita no
produto — o endereço e o que cada plataforma lê quando liga —, a página seguinte da mesma visita,
quem aceita na página em que chegou e quem chega sem campanha) e pelo `conferir-crm.mjs` (97, a
chegada do CRM igual). E por uma sonda no checkout e na busca: o "Aceitar" com a campanha não
recarrega a página, não pede nada ao servidor, e o e-mail já digitado fica no campo.

Depois do deploy — **nada a configurar.** Pra ver: na Clarity, as gravações de depois do deploy
voltam a ter a campanha e a origem nos filtros de tráfego.

**As visitas contadas como na Nuvemshop — pronto em 27/09 (entrega 0166).** Ele perguntou por que
as visitas da Nuvemshop passavam as da loja nova, e pediu: "quero que fique igual da Nuvemshop".

- **Por quê:** a Nuvemshop ligava o Google Analytics pra todo mundo, sem perguntar (conferido no
  HTML dela em 27/09: o consentimento de saída já vinha "granted"), e a loja nova só ligava depois
  do "Aceitar" da faixa de cookies — quem recusava ou só ignorava a faixa não entrava na conta. É o
  mesmo Analytics nas duas (`G-CS3QPK0QHL`): depois da virada, a mesma gente virava menos visitas.
- **O que muda:** o GA4 liga na primeira página, antes da resposta, só pra contar (o anúncio do
  Google fica negado até o sim). Quem clica em "Só o necessário" sai da conta: o GA4 para, os
  cookies dele saem e a página recarrega sem ele. O Google Ads, a Meta, o TikTok, a Clarity e o CRM
  da loja seguem só com o "Aceitar" (a Clarity só com o aceite é escolha dele).
- **A compra pelo servidor** vai pro GA4 de quem não recusou (antes, só de quem aceitou): as
  compras e as visitas do Marketing seguem contando a mesma gente, e a conversão não cai à toa. O
  aparelho da compra, no Funil, também. A Meta e o TikTok, só com o sim, como antes.
- **A faixa** diz que o GA4 já conta: "O Google Analytics conta as visitas. Com o seu sim, também
  usamos cookies da própria loja, do Google, da Meta… pra lembrar o que você viu, medir e mostrar
  anúncios. Você escolhe." No celular, segue com 4 linhas.
- **A política de privacidade** diz o que mudou: a contagem de visitas do Google Analytics é por
  legítimo interesse e para com o "Só o necessário"; anúncio, gravação e o CRM seguem por
  consentimento. A versão da faixa NÃO subiu: quem já tinha respondido segue com a resposta (subir
  faria o "não" de antes voltar a ser "sem resposta", e o GA4 contaria quem já recusou).
- **O painel:** as ajudas do Marketing e das Integrações dizem "de todo mundo, menos quem recusou
  os cookies".
- **Igual, igual, não fica:** quem usa bloqueador de anúncio e quem clica em "Só o necessário" não
  entram, e a Nuvemshop conta com um contador próprio, que nunca bate 100% com o do Google. O
  número fica perto do de antes, no mesmo Analytics.
- **Uma página a mais no GA4:** quem chega por anúncio e aceita depois de trocar de página faz a
  campanha voltar ao endereço (0162), e o GA4, já no ar, conta isso como mais uma página vista —
  não uma visita a mais.

Conferido pelo `conferir-integracoes.mjs` (36; 9 mudadas e 1 nova: só o GA4 antes da resposta,
com o anúncio negado; o "Só o necessário" recarregando sem o GA4 e sem os cookies dele; o
"Aceitar" com o GA4 já no ar; a resposta de antes que não vale ligando só o GA4; o purchase do
GA4 com o anúncio liberado pelo sim; e, nova, a compra de quem não respondeu indo só pro GA4),
pelos unitários (1357 no backend, 3 novos na compra), pelo `conferir-marketing.mjs` (120) e pelo
`conferir-crm.mjs` (151 de 152 — a que falhou é a da tela da Base da Nuvemshop, que a entrega não
toca). O `conferir-visitas.mjs` deu 40 de 41: o "Google lento" (o Início em menos de 2,5 s)
falhou igual na main, na mesma máquina carregada. No Lighthouse (o `lhci` como o CI, Medusa falso),
a home fica com o mesmo HTML e CSS (41,7 KB) e 0,85 KB a menos de JavaScript — os trechos das
tags viraram `import()` —, e o melhor LCP das três páginas é o da main (2,41 s, 2,11 s e 2,26 s,
aqui). As medidas lentas de vez em quando (a pintura em 2,2 s) apareceram nas duas.

Depois do deploy — **nada a configurar.** Pra ver: numa aba anônima, abra a loja sem responder a
faixa; no Google Analytics, em Relatórios → Tempo real, a visita aparece. O dia 27/09 fica com o
buraco: entre a virada e este deploy, a loja nova só contou quem aceitou.

**A Clarity grava também quem não responde a faixa — pronto em 27/09 (entrega 0171).** Depois da
0166 ele perguntou se a Clarity ia aparecer mais, e pediu: "quero que o Clarity mostre quem clica
em aceitar e quem não clica, porque com isso eu consigo ver a jornada de usuários".

- **O que muda:** a Clarity liga na primeira página junto com o GA4, antes da resposta, só pra
  gravar (o `consentv2` com o anúncio da Microsoft negado até o sim). Quem clica em "Só o
  necessário" fica fora, como no GA4: a Clarity para, os cookies dela (`_clck`, `_clsk`) saem e a
  página recarrega sem ela. Com o sim, o anúncio da Microsoft passa a valer.
- **As marcas da Clarity** (sacola, checkout, entrega, pagamento, Pix copiado, cupom) saem junto
  com o GA4, também de quem não respondeu — é o que acha a sessão de quem chegou em cada passo.
- **O que a pessoa digita segue coberto:** o checkout, a tela de obrigado, a conta, a avaliação e
  o "sair da lista" gravam com tudo coberto (`data-clarity-mask`).
- **A campanha na Clarity** agora vem da própria página de chegada (antes, só voltava pro endereço
  no "Aceitar", 0162).
- **A faixa:** "O Google Analytics e a Clarity medem as visitas. Com o seu sim, também usamos
  cookies da própria loja, do Google, da Meta… pra lembrar o que você viu e mostrar anúncios. Você
  escolhe." No celular, segue com 4 linhas.
- **A política de privacidade:** a gravação da Clarity entra na medição por legítimo interesse, com
  o GA4, e para com o "Só o necessário"; o anúncio da Microsoft entra no consentimento. A versão da
  faixa não sobe (pelo mesmo motivo da 0166).
- **O painel:** a nota das Integrações diz que o GA4 e a Clarity carregam pra todo mundo.

Conferido pelo `conferir-integracoes.mjs` (36; 8 mudadas: a Clarity antes da resposta com o
anúncio negado, o "Só o necessário" tirando também a Clarity e os cookies dela, o "Aceitar"
liberando o anúncio da Microsoft sem carregar a Clarity de novo, e a resposta de antes que não
vale ligando o GA4 e a Clarity). No Lighthouse (o `lhci` como o CI), a home fica com o mesmo HTML e
CSS e 0,1 KB a mais de JavaScript (a frase de quem mede), e passa com o melhor LCP de antes.

Depois do deploy — **nada a configurar.** Pra ver: na Clarity, as gravações de depois do deploy
incluem quem não respondeu a faixa (a partir dali, o número de sessões sobe).

**A faixa de cookies com o texto da Nuvemshop — pronto em 27/09 (entrega 0172).** Pedido dele:
"quero alterar esse texto e deixar como era o meu da Nuvemshop". A faixa agora diz, igual à de lá
(com o mesmo destaque): "Ao navegar por este site **você aceita o uso de cookies** para agilizar a
sua experiência de compra."

- **O que não muda:** os dois botões ficam — "Só o necessário" é o jeito de recusar (tira o GA4 e
  a Clarity, que medem desde a primeira página), e "Aceitar" liga a Meta, o TikTok, o Google Ads e
  o CRM. Na Nuvemshop era um botão só ("Entendi"). O link "Como usamos seus dados" saiu da faixa; a
  política segue no rodapé de toda página.
- **Os anúncios continuam esperando o "Aceitar":** o texto diz que navegar é aceitar, mas a Meta,
  o TikTok e o Google Ads só ligam com o clique — como antes.

Conferido pelo `conferir-integracoes.mjs` (36: a faixa com o texto novo, e ela no celular) e pelo
`conferir-crm.mjs` (159: a faixa sem parceiro ligado). O do CRM logo depois do das integrações
falhou uma vez em "a resposta fica, na versão 3" (`nao.3.gmtc`): a loja ainda servia a
configuração com os códigos de teste (o cache troca por trás, no "max"). Com o
`/api/revalidar` da tag `configuracoes` em "agora", 159 de 159.

Depois do deploy — **nada a configurar.** Pra ver: numa aba anônima, a faixa no pé da loja.

**O `/trocas` sem a linha do frete de volta — pronto em 27/09 (entrega 0164).** Saiu da seção
"Desistiu?" o "Quem paga o frete de volta", que estava no ar com a tarja vermelha de pendente.
Orientação jurídica: não precisa estar no site — então a linha não volta, nem como pendência. Era a
única tarja do `/trocas` em produção; sem ela, a página fica sem nenhuma. A data de atualização da
página passou pra 27/09.

Conferido numa loja local: a seção "Desistiu?" termina no reembolso, e o resto da página não muda.
E pelo typecheck, o lint e o prettier da loja.

Depois do deploy — **nada a configurar.** Pra ver: `www.fuckingbarba.com.br/trocas`, na seção
"Desistiu? 7 dias, sem precisar explicar".

**A auditoria do backend, parte 1: o dinheiro — pronto em 27/09 (entrega 0163).** Em 27/09 ele
pediu "uma auditoria no módulo de backend: bugs, segurança e vulnerabilidades". Foram 3 achados
altos, 13 médios e 22 baixos (o relatório ficou com ele). Esta entrega conserta os que mexem com
dinheiro; a parte 2 ("a loja de pé": frete, CRM, código de entrar, admin) e a 3 (nota fiscal, Frenet
e LGPD) vêm depois, se ele quiser.

- **Pagar menos que o pedido.** O Medusa abre a sessão de pagamento com o valor que o carrinho
  tinha naquela hora, e o fechamento não confere com o total. Abrindo a sessão no mesmo instante em
  que o carrinho crescia, um pedido de R$ 1.010 fechava com Pix de R$ 10. Agora o fechamento recusa
  a sessão com valor diferente do total (`valor_divergente`; a loja diz "o valor do carrinho mudou,
  confere e tenta de novo"). E, como segunda trava, a etiqueta, a nota e o e-mail de confirmado só
  tratam como pago o pedido cuja cobrança foi paga por inteiro.
- **O aviso falso de estorno.** O carrinho aceitava `metadata`, que vira o do pedido — onde a loja
  guarda os registros dela. Dava pra acender no painel a faixa grave "o estorno de R$ X não saiu,
  devolva pelo Pagar.me", calar o e-mail de venda nova e mandar a loja cancelar na Frenet o envio de
  outra pessoa. Agora o carrinho não aceita `metadata` (o do endereço, com o CPF, continua).
- **O Pix que segurava o estoque.** Pix gerado reserva os produtos por uns 40 minutos, sem pagar:
  um robô deixava a loja "esgotada". Agora, no Pix: até 10 unidades de cada produto por pedido (em
  2.879 pedidos da Nuvemshop ninguém levou mais de 4) e até 3 Pix por pessoa em 40 minutos. O
  cartão não muda.
- **A oferta do checkout somada.** O código da oferta de cada produto é fixo; pela API dava pra
  aplicar o de todos juntos. Agora é uma oferta por carrinho, e o campo de cupom recusa esses
  códigos.
- **"R$" virava zero.** Um "R$" sem número no piso do frete grátis deixava o frete grátis em todo
  pedido (e no frete de emergência, frete zero). Agora é erro no formulário.

Conferido por uma prova direta na API, com 20 checagens: o `metadata` recusado, a sessão R$ 10
abaixo do total recusada sem chegar ao Pagar.me, uma oferta por carrinho e as travas do Pix. Contra
o backend da main, 10 delas falham — é o buraco aparecendo. E pelos conferidores:

- loja, os cinco em sequência na mesma janela de 40 minutos, sem nenhum Pix barrado no caminho:
  checkout 182/182, pagamento 219/219, mercadopago 77/77, envio 84/84, conta 209/209;
- loja, o erp: 119/119;
- painel: cupons 49/49, configurações 20/20, promoções 47/47, produtos 119/119;
- os unitários (1.318), o typecheck do backend e da loja, o `medusa build`, o lint e o prettier.

Os conferidores de Pix foram ajustados pra caber nas travas novas: cada pedido pela API vai
assinado com um IP de documentação sorteado, e os Pix pelo navegador soltam as travas antes.

Depois do deploy — **nada a configurar.** Se um cliente disser que o Pix não saiu com "já saíram
vários Pix daqui" ou "até 10 unidades", é a trava nova: ele paga um dos Pix abertos, usa o cartão,
ou me chama pra mudar o número.

**O número vermelho da Observabilidade passa de 100 — pronto em 27/09 (entrega 0167).** No menu do
painel, o número vermelho da Observabilidade parava em 100: o backend lia no máximo 100 problemas
graves abertos e contava os que o papel via. Com mais de 100, o menu dizia 100 e a tela, o total
(o `conferir-observabilidade` achou num banco local que juntou 108). Agora o número é a conta do
banco (`gravesAbertos`: o total do `listAndCountProblemas`, com o papel no filtro — o
`filtroDoPapel`, a mesma regra do `podeVer` da tela: o estorno só conta pro dono). O "+1" das
rotinas paradas continua. Com até 100 graves abertos, nada muda.

Conferido pelo `conferir-observabilidade.mjs` nesse banco (108 graves abertos): com o código de
antes, 35/36 — "dono 100 · op 100 · tela 114"; com o conserto, 36/36 três vezes (dono 109, operação
108, tela 109). E por 3 testes novos do `gravesAbertos` (com o código de antes, os 110 viram 100) e
1 que amarra o filtro do banco ao `podeVer` em todo papel; os unitários (1.357), o typecheck, o
lint, o `medusa build` e o prettier.

O limite que fica: a tela lê até 300 problemas (os abertos e os resolvidos nos últimos 30 dias).
Com mais que isso, os cartões e o "N problemas graves agora" da tela ficam curtos — e o menu, que
agora conta tudo, fica maior que a tela.

Depois do deploy — **nada a configurar.** Pra ver: o número vermelho do menu é o mesmo do "N
problemas graves agora" da Observabilidade.

**A auditoria do backend, parte 2: a loja de pé — pronto em 27/09 (entrega 0168).** Pedido dele:
"não podemos deixar qualquer um derrubar a loja". O que é público passou a ter limite de frequência e
de tamanho, e o limite enxerga a pessoa:

- a calculadora de frete tem limite por pessoa e um tamanho máximo de pergunta;
- o CRM e a telemetria têm um teto de eventos por dia, por rede e pra loja toda;
- o código de entrar conta a vaga na hora (pedidos ao mesmo tempo não passam juntos);
- a foto e a base da Nuvemshop do painel só são lidas depois da porta do painel;
- a senha do admin do Medusa tem freio (as erradas);
- o "avise-me" refaz as páginas no máximo a cada 5 minutos;
- as fotos do catálogo: uma conversão por foto de cada vez;
- o IPv6 conta pelo bloco da rede, em todo limite por pessoa;
- e a loja passou a assinar toda chamada à API do Medusa — com a trava ligada (abaixo), quem não é
  a loja não fala com ela.

Conferido por uma prova direta na API, com 22 checagens, uma por limite (o frete, a rajada de
códigos, o corpo grande sem a assinatura, as senhas do admin, a trava da API da loja, o avise-me e
os tetos do dia) — e a mesma prova contra o código de antes, pra ver que cada uma mede o que diz. E
pelos conferidores, com a trava desligada (como fica no deploy) e ligada (a loja inteira assinando,
sem nenhum 401 no caminho):

- loja: frete 70, pdp 68/70 (os 2 de sempre deste banco local), checkout 182, conta 209, avise-me
  32, avaliações 44, pagamento 219, mercadopago 77, envio 84;
- painel: entrar 90, produtos 119, home 103, crm 159, observabilidade 36;
- os unitários (1.379), o typecheck do backend e da loja, o `medusa build`, o lint e o prettier.

Depois do deploy — **uma coisa pra ligar, com calma:**

- [x] **Railway → o serviço do backend → Variables:** `STORE_SO_DA_LOJA` = `true` — ligado por você
      em 27/09, com o deploy no ar; conferido no mesmo dia: a loja abre, e a chamada sem a
      assinatura da loja ouve 401. Pra desfazer: apagar a variável.

**A auditoria do backend, parte 3: nada parado calado — pronto em 27/09 (entrega 0175).** Pedido
dele: "vamos fazer todos menos o 6" (a LGPD da base da Nuvemshop fica de fora). Cinco pontos:

- **A nota que passa de 3 dias.** A loja tenta emitir a nota por 3 dias; depois disso, o pedido
  saía da conta calado. Agora ele vira "A nota não sai sozinha · 3 dias sem nota" no painel, e a
  equipe recebe um e-mail pra conferir no Bling se a nota já foi feita à mão — e só então "Tentar de
  novo" (a loja não emite sozinha: nota em dobro é problema com a Receita).
- **O mesmo na Frenet.** O pedido que passa de 3 dias sem entrar no painel da Frenet deixava de ser
  tentado e continuava "tentando entrar". Agora a loja para e diz: "O pedido não entrou na Frenet",
  com o "Mandar de novo".
- **O pedido cancelado que a Frenet não deixa tirar** (a etiqueta já gerada, a Frenet fora do ar):
  antes, só uma linha no log. Agora a equipe recebe "O pedido #N foi cancelado e continua na Frenet"
  (um e-mail só: não gere a etiqueta), o painel mostra o problema, e a loja tenta tirar de novo por
  7 dias.
- **O aviso de rastreio da Frenet**: o endereço de aviso de cada pedido só mexe no envio daquele
  pedido.
- **A lista da newsletter em planilha**: o que começa como fórmula vai como texto no CSV, e o e-mail
  com cara de fórmula nem entra na lista.
- **O link da avaliação**: a página /avaliar sem o link manda o link pro e-mail da compra, em vez
  de abrir o pedido na hora.

Conferido por uma prova direta no Medusa local, com o relógio dos pagamentos voltado no banco (19
checagens: a nota e a Frenet dos 3 dias, o cancelado que fica e sai, o e-mail uma vez só, o "Tentar
de novo") — contra o código de antes, as 9 do conserto falham. E pelos conferidores, com os casos
novos no de envio, nos de avaliações e nos de clientes e configurações:

- loja: envio 87, avaliações 45, erp 119, pagamento 219, conta 209, checkout 182, mercadopago 77,
  avise-me 32;
- painel: pedidos 100, ações 34, frenet 9, observabilidade 36, avaliações 27, clientes 52,
  configurações 20, entrar 90, crm 159 (com a main juntada);
- os unitários (1.406), o typecheck do backend e da loja, o `medusa lint` e o prettier.

Depois do deploy — **nada a configurar.** Pode acontecer: na primeira rodada, a varredura olha os
pedidos pagos dos últimos 30 dias (desde a conexão do Bling, 23/09). Pedido pago sem nota há mais de
3 dias aparece de uma vez como "A nota não sai sozinha · 3 dias sem nota", com um e-mail cada. Se
aparecer num pedido de teste de antes da virada, me avise e a gente decide junto (cancelar devolve o
dinheiro). Se a nota foi feita à mão, o aviso fica no pedido (como o da nota sem CPF feita à mão) —
um botão "a nota foi feita à mão" pra tirar o aviso fica pra depois, se você quiser.

## Como seguir no Claude Code

- O operacional está no AGENTS.md: comandos, os conferidores da loja e do painel (contra o Medusa
  local, com Frenet, Pagar.me, Resend e Bling falsos) e as regras. Rode os conferidores antes de
  subir.
- O que mexe em produção — variável, painel, script no Railway — quem faz é você; o Claude Code
  prepara e diz o comando.
- Chave nunca passa pela conversa. Cuidado com texto copiado de painel: o link pode levar o valor
  escondido. Pra mostrar uma tela, print.
