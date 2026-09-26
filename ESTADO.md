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
  - [ ] **Folga pro LCP da home no Lighthouse do CI.** Ele vive no limite de 2,5 s (ver o
        AGENTS.md, perto do Lighthouse): qualquer seção a mais na home sobe o simulado um degrau
        de ~220 ms. A folga de verdade vem de aliviar a primeira tela — o HTML, o CSS e a fonte que
        dividem a conexão —, e é trabalho à parte.
- [x] **O conferidor do ERP procurava o aviso da equipe na caixa errada** (entrega 0101, 25/09).
      Desde as Configurações (entrega 0093), o e-mail da equipe — a nota que não saiu, a nota pra
      conferir ou pra cancelar, o Bling caído — vai pra quem está no painel com o papel que
      resolve, e o dono recebe todos. O `conferir-erp` seguia procurando esses e-mails na caixa do
      admin do Medusa: em todo banco local com gente no painel, 9 checagens falhavam, com o código
      da main e com o de qualquer entrega. A loja estava certa — no log, cada aviso saiu pro dono.
      Agora ele lê a caixa do dono do painel ou, num banco sem ninguém no painel, a do admin, como
      antes. Só o conferidor mudou: nada muda na loja, e nada a configurar.
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
  - [ ] Numeração: decidido que os pedidos novos começam depois do último da Nuvemshop (nada de dois
        "#28"). **Falta você dizer o número** do pedido mais recente de lá.
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
- [ ] **Os endereços antigos que não são de produto — Claude Code.** Conferidos em 25/09 contra o
      mapa do site da Nuvemshop, dão "página não encontrada" na loja nova: `/produtos-para-a-barba/`
      (e `/balm/`, `/fator-de-crescimento/`, `/oleo/` e `/shampoo/` dentro dela), `/kits-para-barba/`,
      `/para-o-cabelo/`, `/quem-somos/` e `/politica-de-envio/`. Entram no
      `apps/loja/src/redirects.json` antes da virada. Os de produto são os oito rascunhos acima.
- [ ] Troca de domínio (fase 6). O que depende do endereço da loja: `NEXT_PUBLIC_SITE_URL` na
      Vercel, `STORE_CORS`/`AUTH_CORS` e `LOJA_URL` (revalidação, logo e links dos e-mails) no
      Railway (ele também diz ao Marketing de que endereço contar as visitas), `SITE_ORIGENS` no
      Supabase, a indexação, e o domínio no Pagar.me se ele passar a exigir.

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
  servidor — esconder botão não é permissão. Decidido na fase 1: rotas próprias (`/dashboard/*`)
  e uma tabela só de quem abre o quê (`ACESSO`, no backend); o controle de papéis do Medusa 2.21
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
- **Observabilidade:** os problemas abertos em frase, com o que fazer; as integrações; os 8 jobs
  com a última rodada; a velocidade do site.
- **Marketing** (resumo, funil, canais, produtos, ofertas, clientes por estado, pagamento e frete)
  ficou escondido de início, e volta em partes desde 26/09 (a parte 1, o Resumo e a meta do mês, na
  entrega 0108; a parte 2, o Funil e os Canais, na 0110; a parte 3, os Produtos e as Ofertas, na
  0113).

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

- [ ] O cupom de **frete grátis**: o resumo do checkout mostraria o desconto do frete duas vezes
      (no frete e no desconto). Entra quando o resumo mudar. O frete grátis pelo valor mínimo
      segue valendo.
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
- O Google soma as visitas com algumas horas de atraso: a conversão (pedidos ÷ visitas) corta os
  pedidos na mesma hora que ele já somou.

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
- [ ] **Na virada (fase 6):** liberar o Google (`SITE_INDEXAVEL=true` na Vercel da loja) — é o que
      leva o SEO do ar de 69 pra 100.

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

## Como seguir no Claude Code

- O operacional está no AGENTS.md: comandos, os conferidores da loja e do painel (contra o Medusa
  local, com Frenet, Pagar.me, Resend e Bling falsos) e as regras. Rode os conferidores antes de
  subir.
- O que mexe em produção — variável, painel, script no Railway — quem faz é você; o Claude Code
  prepara e diz o comando.
- Chave nunca passa pela conversa. Cuidado com texto copiado de painel: o link pode levar o valor
  escondido. Pra mostrar uma tela, print.
