# Estado do projeto — e o que vem a seguir

Atualizado em 21/09/2026, no fim da integração do Pagar.me. O AGENTS.md diz **como** trabalhar aqui;
este arquivo diz **onde** o projeto está. Leia os dois antes de começar e, ao terminar uma tarefa,
atualize este: o que mudou de estado, o que saiu da lista, o que entrou.

## No ar hoje

| Peça                          | Onde                                              | Estado                                                                      |
| ----------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------- |
| Loja (Next.js 16)             | Vercel — `fuckingbarba-loja.vercel.app`           | No ar, sem indexar. Domínio definitivo é a fase 6.                          |
| Backend (Medusa 2.21)         | Railway — serviço `@fuckingbarba/backend` + Redis | **Um serviço só, `WORKER_MODE=shared`** (ver abaixo).                       |
| Banco, imagens, Edge Function | Supabase (`us-east-1`)                            | `webhook-pagamento` publicada.                                              |
| Frete                         | Frenet                                            | Econômica e expressa; emergência R$ 20 / 7 dias úteis.                      |
| Pagamento                     | Pagar.me, **chave de produção**                   | Pix (30 min) e cartão em até 3x sem juros. Checkout aberto desde `a6165ae`. |

### O backend roda num serviço só

O README e o AGENTS descrevem o Medusa em dois serviços, server e worker. Em produção o worker nunca
foi criado, e com `WORKER_MODE=server` sozinho **nada de fundo rodava**: Pix pago não virava pedido
pago, a conciliação não existia, nenhum subscriber disparava. Hoje o único serviço roda os dois
papéis (`WORKER_MODE=shared`), o que dá conta do volume atual. Separar em dois serviços é quando o
volume pedir — e aí as variáveis do Pagar.me vão nos DOIS.

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

- [ ] Uma compra real pequena no Pix e outra no cartão, cancelando as duas no admin em seguida.
      Confirma a chave pública de produção, o webhook de produção e o estorno de verdade.

### 2. Achados da revisão do pagamento — Claude Code

- [ ] **A loja guarda falha em cache** (o mais urgente). Em `apps/loja/src/lib/medusa.ts`,
      `regiaoBrasil()` e outras leituras devolvem `null` ou lista vazia quando o Medusa não responde
      — DENTRO do `"use cache"`, então a falha fica guardada por horas ou dias. Aconteceu no
      desenvolvimento: um restart do backend deixou o catálogo vazio até revalidar. Em produção, um
      deploy do Railway na hora errada faz o mesmo. Correção: lançar dentro da função cacheada e
      cair no padrão do lado de fora (erro não entra no cache).
- [ ] **A API de pedido do Medusa mostra endereço e CPF** a quem tiver o id do pedido
      (`GET /store/orders/:id`). A tela de obrigado esconde; a API, não. Um middleware em
      `apps/backend/src/api/middlewares.ts` limitando os campos resolve.
- [ ] **A tela de obrigado promete e-mail que não sai:** "enviamos os detalhes pra <e-mail>" e "o
      código de rastreio chega por e-mail". Ajustar o texto até a fase 5, ou adiantar os e-mails.
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
- [ ] Troca de domínio (fase 6). O que depende do endereço da loja: `NEXT_PUBLIC_SITE_URL` na
      Vercel, `STORE_CORS`/`AUTH_CORS` no Railway, `SITE_ORIGENS` no Supabase, a indexação, e o
      domínio no Pagar.me se ele passar a exigir.

### 4. Fase 5

- E-mails transacionais (Resend), nota fiscal (Bling) e `purchase` pro GA4 e pra Meta. O gancho é
  `apps/backend/src/subscribers/pagamento-capturado.ts` — idempotente, porque o evento pode sair
  duas vezes pro mesmo pagamento.
- E-mail de "seu Pix venceu": a conciliação já cancela o pedido e devolve o estoque; falta avisar.

## Como seguir no Claude Code

- O operacional está no AGENTS.md: comandos, os oito conferidores (contra o Medusa local, com Frenet
  e Pagar.me falsos) e as regras. Rode os conferidores antes de subir.
- O que mexe em produção — variável, painel, script no Railway — quem faz é você; o Claude Code
  prepara e diz o comando.
- Chave nunca passa pela conversa. Cuidado com texto copiado de painel: o link pode levar o valor
  escondido. Pra mostrar uma tela, print.
