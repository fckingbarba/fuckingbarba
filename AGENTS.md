# AGENTS.md

Guia pra quem (pessoa ou agente) for mexer neste repositório. O contexto de produto e as decisões de
arquitetura estão no README e no doc de arquitetura linkado lá; aqui é o operacional. **Onde o projeto
está e o que vem a seguir: [ESTADO.md](./ESTADO.md)** — leia antes de começar, atualize ao terminar.

## Estrutura

```
apps/loja/       Next.js 16 (App Router, Cache Components, Tailwind v4) — Vercel
apps/dashboard/  Next.js 16 — o painel da loja (dashboard.fuckingbarba.com.br), outro projeto na Vercel
apps/backend/    Medusa v2 — Railway; feito pra server + worker, hoje um serviço só (ver ESTADO.md)
supabase/        migrations do schema `loja` (nunca `public`) e Edge Functions (Deno)
.github/         um workflow por área, disparado por caminho
```

Os três apps são workspaces npm da raiz (`apps/*`). O lockfile é o da raiz. Não crie outro.

## Comandos

```bash
npm install                    # sempre na raiz
npm run dev | build | lint | typecheck        # turbo, nos três apps
npm run backend:dev | backend:migrate | backend:user -- --email x --password y
npm run loja:dev
npm run dashboard:dev                          # o painel, na porta 3100
cd supabase/functions && deno check webhook-pagamento/index.ts vitals/index.ts && deno lint
```

Desenvolvimento local precisa de Postgres e Redis: `docker compose up -d`.

**`next start` fala com a PRODUÇÃO.** Ele lê o `.env.local`, que aponta pro Medusa do Railway; só o
`next dev` lê o `.env.development.local`. Pra testar um build contra o Medusa local, exporte as
variáveis do `.env.development.local` antes do `next build` (as `NEXT_PUBLIC_` entram no bundle na
hora do build) e de novo no `next start`. Sem isso, "Adicionar à sacola" cria carrinho na loja de
verdade.

### Conferidores

`apps/loja/ferramentas/conferir-*.mjs` abrem a loja num Chromium de verdade e comparam o que está na
tela com o que a API do Medusa responde — nunca com outra conta feita no próprio teste. São onze:
frete, pdp, checkout, pagamento, catálogo, links, configurações, documento, conta, envio e erp (este
sem navegador: o Bling falso e o admin). Rode os que
tocam no que você mexeu, e todos antes de entregar. Os que escrevem no admin desfazem o que mudaram
no fim, mesmo quando falham.

```bash
# frete e checkout sobem uma Frenet falsa (4310) e um Pagar.me falso (4320); os de pagamento,
# conta e envio sobem os dois e um Resend falso (4330), de onde leem os e-mails. O backend
# aponta pros três; o de envio manda os avisos de rastreio da Frenet com o FRENET_WEBHOOK_TOKEN
FRENET_URL=http://127.0.0.1:4310/shipping/quote FRENET_TOKEN=teste FRENET_WEBHOOK_TOKEN=token-de-teste \
PAGARME_SECRET_KEY=sk_test_falsa PAGARME_URL=http://127.0.0.1:4320/core/v5 \
MEDUSA_WEBHOOK_SEGREDO=segredo-de-teste \
RESEND_URL=http://127.0.0.1:4330 RESEND_API_KEY=re_teste_falsa npm run backend:dev
# com o registro no painel da Frenet ligado (a seção 7c do conferir-envio, que também precisa do
# FRENET_PARCEIRO_TOKEN no ambiente dele), acrescente: FRENET_PARCEIRO_TOKEN=parceiro-de-teste
# FRENET_WHITELABEL_URL=http://127.0.0.1:4310 MEDUSA_BACKEND_URL=http://127.0.0.1:9000
# pro conferir-erp (o Bling falso na 4340), acrescente: BLING_CLIENT_ID=cliente-de-teste
# BLING_CLIENT_SECRET=segredo-de-teste BLING_URL=http://127.0.0.1:4340/Api/v3
# BLING_AUTORIZACAO_URL=http://127.0.0.1:4340/Api/v3/oauth/authorize
# NUVEMSHOP_LOJA_URL=http://127.0.0.1:4350 (a Nuvemshop falsa) — e rode o conferir-envio
# SEM elas: com o ERP conectado, a etiqueta espera a nota, e ali não há Bling pra emitir
# e a loja tokeniza no falso: no .env.development.local,
#   NEXT_PUBLIC_PAGARME_PUBLIC_KEY=pk_test_falsa
#   NEXT_PUBLIC_PAGARME_API=http://127.0.0.1:4320/core/v5
npm run loja:dev
cd apps/loja && export $(grep -E '^(MEDUSA_BACKEND_URL|NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY)=' .env.development.local | xargs)
ADMIN_EMAIL=<admin local> ADMIN_SENHA=<senha local> node ferramentas/conferir-frete.mjs
```

O admin é um usuário do banco LOCAL (`npm run backend:user`). `CHROMIUM=<caminho>` quando o
Playwright não achar o navegador. Layout de componente interativo se confere com foto, não com
asserção — `ferramentas/retrato-calculadora.mjs` é o modelo (e `retrato-pagamento.mjs`, o do passo 3
e da tela de obrigado), e roda contra `next build` + `next start`. Os conferidores, ao contrário,
rodam contra o `next dev` (`LOJA`, padrão `localhost:3000`): com o cache de produção o de PDP lê o
conteúdo de antes da edição e falha sem bug nenhum. Os `apps/backend/ferramentas/conferir-{frete,pedido}.mjs` são de antes da Frenet (esperam
"Correios PAC" fixo e não sobem a falsa) — os que valem são os onze da loja.

O **Lighthouse do CI** roda contra `apps/loja/ferramentas/medusa-falso.mjs` — um Medusa só de
leitura, na porta 9000, com os seis produtos de verdade e fotos desenhadas na hora —, porque sem
Medusa o build sai com o catálogo vazio e o orçamento mediria uma vitrine que ninguém vê. Pra medir
aqui do mesmo jeito: `node ferramentas/medusa-falso.mjs` num terminal; no outro, exporte
`MEDUSA_BACKEND_URL=http://localhost:9000`, `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_medusa_falso` e
as variáveis do job (`.github/workflows/loja.yml`), rode o `next build` e depois
`npx lhci collect && npx lhci assert` em `apps/loja` (sem `autorun`, que publica o relatório).

Dois tropeços de ambiente, que não são bug: o de configurações muda a política de frete pelo admin,
e quem derruba o cache da loja depois é o backend, pelo `LOJA_URL` do `apps/backend/.env`; se ele
não apontar pro `next dev` conferido, rode esse por último (ou reinicie o `next dev`), senão o de
checkout lê a política do teste. E pedido de teste reserva estoque: `insufficient_inventory` num
conferidor é o estoque local acabando — reponha no admin local.

O de pagamento liga o Pagar.me na região pelo admin e devolve como estava. O de checkout, com o
checkout aberto (`CHECKOUT_ABERTO`), precisa do Pagar.me ligado na região local — o passo 3 não
oferece mais o provisório —: `PAGARME_SECRET_KEY=sk_test_falsa npm run backend:pagamento`, uma vez. A conciliação automática roda a cada 5 minutos DENTRO do
`medusa develop` (o worker é o mesmo processo): teste que depende de "ninguém mexeu nisso ainda"
precisa sair da janela dela — ver `longeDaConciliacaoAutomatica` no conferidor de pagamento.

## Regras do projeto

- **Português nos nomes** (funções, variáveis, rotas, comentários) e nas mensagens pro usuário. Sem
  acento em identificador e em URL.
- **URLs são contrato.** `/produtos/<handle>` e `/<categoria>`; handle só `a-z0-9-` (o middleware do
  Medusa em `apps/backend/src/api/middlewares.ts` garante). Mudou handle publicado = 301 em
  `apps/loja/src/redirects.json`.
- **Medusa é a fonte de verdade** de preço, estoque, pedido e frete grátis. O front exibe, não calcula.
  Edge Function nunca escreve no schema `public`; ela chama a API do Medusa.
- **Uma porta de saída de analytics**: `apps/loja/src/lib/rastrear.ts`. Nenhum componente chama
  `gtag`/`fbq`. `purchase` só no worker, com pagamento confirmado.
- **Toda leitura do Medusa no front é `"use cache"` com `cacheTag`**, e passa pelo `lerDoMedusa`
  (`apps/loja/src/lib/medusa.ts`). Invalidação por `POST /api/revalidar`. **Falha lança, nunca vira
  vazio:** o que a função cacheada devolve fica guardado, e um `[]` de quando o Medusa não respondeu
  era a vitrine vazia por horas. Erro não entra em cache: a página no ar fica com a última versão
  boa, a que não estava pronta mostra o `app/error.tsx`, e o build com o Medusa fora falha (a loja
  anterior segue no ar; Redeploy quando o Railway voltar). Padrão no lugar da resposta, só fora do
  cache e em quem chama (`garantirCarrinho`, `buscarCep`).
- **Página é dado, não JSX.** Quais seções uma página monta, e em que ordem, vem do registro
  (`apps/loja/src/lib/secoes/registro.ts`); a rota só escreve `<Secoes escopo="..." />`. A ordem do
  array é a ordem padrão — não existe segunda lista, e o banco guardará só a diferença
  (`lib/secoes/layout.ts`). Seção nova se declara lá, com `id` estável (é chave de banco), `nome` e
  `descricao` (é o que uma pessoa lê no painel) e `fixo: true` quando não pode ser desligada.
- **404 real no primeiro nível é no proxy** (`apps/loja/src/proxy.ts`); com Cache Components, rota
  dinâmica manda o shell com 200. Ao criar uma página nova de primeiro nível, adicione o segmento em
  `PAGINAS_RAIZ` do proxy.
- **A vitrine não lê `searchParams`.** `/barba`, `/cabelo`, `/kits` e `/produtos` são estáticas, e o
  `?ordem=` é trocado pelo proxy por `/<página>/ordem/<ordem>` (estática também, sem mudar a URL).
  Ler `searchParams` numa delas a torna dinâmica: esqueleto, streaming, rodapé pulando e LCP
  estourado no Lighthouse — ver `apps/loja/src/components/catalogo/tela.tsx`. A `/busca` é a
  exceção, porque o `?q=` não tem como ser gerado no build.
- **Sem GTM, sem widget de terceiro no `<head>`.** Tags entram por `components/analytics/tags.tsx`,
  depois do consentimento. Orçamento de terceiros: 150 KB (Lighthouse CI quebra acima).
- **Segredo nunca com `NEXT_PUBLIC_`.** Chaves de servidor ficam no Railway e na Vercel, nunca em código.
- **Chave nunca passa pela conversa.** Token, senha e segredo vão direto no painel do Railway ou da
  Vercel, por quem tem acesso a ele. Se um aparecer colado num chat, num log ou num commit, conta como
  vazado: revoga e gera outro. Diagnóstico de credencial mostra host e nome do banco, nunca o valor.
  A chave publicável do Medusa (`pk_…`) é pública por desenho e não entra nesta regra.
- **Número de cartão nunca chega no servidor da loja** (PCI-DSS). A tokenização é no navegador, e
  campo de cartão não tem atributo `name` — o conferidor de checkout confere isso.
- **Estilo**: sem `border-radius` (a marca é chanfro e sombra dura); tokens em `globals.css`
  (`@theme`); em fundo menta só `text-tinta`/`text-papel` (contraste AA).
- **CSS de uma tela só não entra no `globals.css`.** Tudo que ele importa, toda página baixa antes
  de pintar. PDP, checkout e conta importam o seu por `src/estilos/telas/` — ver o quadro "O QUE
  NÃO MORA AQUI" no próprio `globals.css` antes de mover mais alguma coisa.
- Prettier na raiz (`.prettierrc`: sem ponto e vírgula, 100 colunas). ESLint por app.

## Next.js 16 — leia antes de escrever código de front

Esta versão muda coisas que modelos costumam "saber" errado. A documentação do exato build instalado
está em `node_modules/next/dist/docs/` (a partir de `apps/loja`). Em especial: `proxy.ts` (não
`middleware.ts`), `cacheComponents` + `"use cache"`/`cacheTag`/`cacheLife`, `PageProps<"/rota">` e
`LayoutProps` são globais (rode `next typegen`), `revalidateTag(tag, "max")`, e o guia de status 404
em `03-api-reference/03-file-conventions/loading.md`.

## Medusa v2 — onde cada coisa mora

`medusa-config.ts` (módulos e processos) · `src/api/` (rotas e middlewares) · `src/subscribers/`
(reação a evento, roda no worker) · `src/jobs/` (agendados) · `src/workflows/` · `src/modules/`
(providers de pagamento/frete próprios) · `src/migration-scripts/` (rodam uma vez no `db:migrate`).
Documentação: https://docs.medusajs.com. O build de produção é `.medusa/server` — é de lá que o
Railway roda `medusa start` e `medusa db:migrate`.

**Frete** é um provider próprio (`src/modules/frenet/`, id `frenet_frenet`), montado por
`src/scripts/frete.ts`. As opções só aparecem no carrinho com a corrente inteira de pé — canal de
venda → local de estoque → conjunto → zona → opção, e todo produto com perfil de envio. Um elo
faltando dá lista vazia, sem erro nenhum; por isso o script confere a corrente no fim em vez de
dizer "pronto". Preço cotado sai de `POST /store/shipping-options/:id/calculate`: o `GET` da lista
não calcula. Peso e medidas moram na VARIANTE (`src/scripts/medidas.ts`), não no produto.

**Pagamento** é um provider próprio (`src/modules/pagarme/`, id `pp_pagarme_pagarme`): Pix e cartão
em até 3x pelo Pagar.me, ligado na região por `npm run backend:pagamento` (que tira o provisório
`pp_system_default` — o que aprova sem cobrar — e confere o que a loja enxerga; `-- voltar` desfaz).
O pedido nasce no Pagar.me no `authorizePayment`, no fim do fechamento do carrinho: Pix fecha
aguardando, cartão recusado desfaz o pedido. **O cartão só é AUTORIZADO ali** (`auth_only`: o valor
fica reservado) e só é COBRADO (`POST /charges/:id/capture`) com a análise de fraude aprovada —
quem decide é o `podeCobrar` (`modules/pagarme/situacao.ts`). O checkout espera uns 6 segundos
pela análise: aprovada, cobra e fecha pago; reprovada, desfaz o pedido, como o recusado; ainda
pensando, fecha aguardando ("em análise"), e a cobrança vem pelo aviso `charge.antifraud_approved`
ou pela conciliação — os dois passam pelo `processPaymentWorkflow`, que chama o mesmo
`authorizePayment`, e é ele que cobra. Reprovada depois, o pedido é cancelado e a reserva desfeita,
sem nada na fatura; e reserva desfeita não é estorno (o `estornado` da sessão fica 0). O Pix pago
chega pelo webhook (Pagar.me → Edge Function `webhook-pagamento` →
`/hooks/payment/pagarme_pagarme`, que exige o `x-webhook-segredo` e relê o pedido na API antes de
acreditar); o que o webhook não resolve — Pix vencido, aviso perdido, cobrança que sumiu no
caminho — a conciliação resolve a cada 5 minutos no worker (`src/lib/conciliar-pagamentos.ts`, e
`POST /admin/pagamentos/conciliar` pra rodar na hora).
Duas armadilhas já pagas: o Medusa MISTURA (em profundidade) o `data` da sessão com o que chegou
da API pública, então o provedor grava o estado inteiro, com `null` explícito, e acha o pedido do
Pagar.me pelo CÓDIGO (o id da sessão), nunca pelo `data`; e o cartão aprovado no fechamento não
emite `payment.captured` — quem emite é `src/subscribers/pedido-pago-na-hora.ts`. A loja manda o
comprador em `data.entrada` (montado do carrinho, em `apps/loja/src/lib/pagamento.ts`) e o cartão
só como token, gerado no navegador (`apps/loja/src/lib/pagarme.ts`).

Três portas que o Medusa deixa abertas e o projeto fecha. (1) Abrir sessão de pagamento APAGA as
anteriores da coleção, sem conferir se ela já é de um pedido: `src/api/middlewares.ts` recusa sessão
nova em coleção de pedido fechado — sem isso, o Pix esperando perde a sessão que o aviso procura.
(2) Cancelar pedido não chama o provedor pra sessão pendente: `src/subscribers/pedido-cancelado.ts`
fecha no Pagar.me o que dá (ver abaixo) e estorna o que tiver sido pago sem o Medusa saber. (3) A cobrança cuja
sessão sumiu (tentou de novo depois de uma resposta perdida) não aparece em lugar nenhum da loja: a
conciliação lista os pedidos do Pagar.me das últimas 48 horas e fecha os que não têm mais sessão. É
por isso que o `deletePayment` do provedor não mexe no Pagar.me — o `data` que ele recebe pode ser o
corpo cru da API pública. Os pedidos levam `metadata.origem` (hash do usuário, host e banco da
`DATABASE_URL`, nunca a senha), e a conciliação só fecha órfão da própria origem: duas instalações
na mesma chave de teste não estornam as compras uma da outra. Ainda assim, uma chave por ambiente —
a de produção só no Railway. Na loja, carrinho que fechou sem a confirmação chegar ao navegador
volta pro pedido pelo `/checkout/retomar`, em vez de mostrar "sacola vazia".

**O PAGAR.ME NÃO CANCELA PIX PENDENTE.** `DELETE /charges/:id` numa cobrança de Pix esperando
pagamento responde **412** ("This charge cannot be canceled because is pending"), e Pix VENCIDO
continua `pending` lá — o 412 não passa nunca. Foi o que prendeu o estoque do #7 por um dia: o
cancelamento do pedido vinha depois do DELETE, e o DELETE estourava de 5 em 5 minutos. Regra:
ninguém manda DELETE em Pix pendente — nem a conciliação, nem o `cancelPayment` do provedor, nem o
subscriber. No lugar disso, **Pix vencido cancela só o pedido aqui** (com os 10 minutos de folga, e
relendo o pagamento antes — pago no limite existe), e **pedido cancelado com o Pix ainda valendo
deixa a sessão pendente e VIGIADA**: o QR continua pagável, e a varredura de pagos-depois-de-
cancelados (todo pedido cancelado dos últimos 7 dias) devolve o que entrar, pelo
`refundPaymentsWorkflow` — no PLURAL, porque o singular recusa pedido cancelado. Cartão em análise
ainda se cancela com DELETE; se vier 412, vira vigiado também. Quando o Pix vence sai de três
camadas, nesta ordem: o `expires_at` que o Pagar.me acabou de dizer, o gravado na sessão (juntos com
`||`, e não `??`: o lido nasce string VAZIA) e o `created_at` de lá + `PAGARME_PIX_MINUTOS`. Sem
nenhuma das três, o Pix não vence — antes o estoque preso que a venda cancelada à toa.

O **estorno** é pedido na hora (cancelar pedido pago no admin chama o `refundPayment`) e o Medusa
marca "Refunded" na hora — mas anda DEPOIS, no Pagar.me, e pode falhar: o de Pix sai do saldo
disponível. A conciliação confere todo estorno dos últimos 7 dias na cobrança, pelo dinheiro (o
que o Medusa diz que voltou contra `canceled_amount`/`refunded_amount`; "aguardando cancelamento"
é esperar) — `src/lib/estornos.ts`. O que falhou fica em `metadata.estornos` do pedido, vira uma
faixa vermelha no pedido no admin (`src/admin/widgets/estorno.tsx`, com "Tentar o estorno de
novo" → `POST /admin/pedidos/:id/estorno`) e UM e-mail pra cada usuário do admin; o do pagamento
inteiro é pedido de novo sozinho de 6 em 6 horas, até 8 vezes. Parcial, nunca sozinho. No
conferidor, o Pagar.me falso segura o estorno (`pagarme.estornos = "segura"`) e faz ele falhar
(`falharEstorno`) ou sair (`concluirEstorno`).

O **pedido pelo id** (`GET /store/orders/:id`) é aberto de propósito no Medusa — o id faz as vezes
de senha —, e a resposta padrão traz e-mail, endereço, telefone e o CPF. Só que o id está na URL da
tela de obrigado e no link dos e-mails. `src/api/middlewares.ts` e `src/lib/pedido-publico.ts`
fecham: o pedido inteiro só sai pra quem prova que é dono — o carrinho de onde ele nasceu, no
cabeçalho `x-carrinho`, ou a conta dona (token de cliente). Pra todo o resto, a versão pública,
montada campo a campo: número, situação e a forma de pagamento. Carrinho errado é 403. Na loja, o
crachá de quem comprou é o cookie `pedido` = `<pedido>.<carrinho>` (`abrirPedido`, em
`apps/loja/src/lib/checkout.ts`), e quem decide se ele vale é o Medusa (`lerPedido`). A troca de
dono (`/store/orders/:id/transfer/*`) e a devolução pela API (`POST /store/returns`) ficam
fechadas: abriam o pedido de qualquer um pelo id, e a loja não usa nenhuma das duas. Conferidor que
precisa do pedido inteiro lê pelo admin ou manda o `x-carrinho`.

A **conta** entra com código no e-mail, sem senha. `POST /store/conta/codigo` sorteia seis dígitos,
guarda só o hash (HMAC com o `JWT_SECRET`) no `provider_metadata` da identidade `codigo` e manda o
e-mail pelo Resend (`src/lib/email.ts`; sem `RESEND_API_KEY`, fora de produção, o código sai no
log). Quem confere é o provedor de auth `codigo` (`src/modules/codigo/`), na rota
`POST /auth/customer/codigo` do próprio Medusa; as regras (10 minutos, 5 tentativas, limites por
e-mail) estão num arquivo só, `regras.ts`, com teste de unidade. No primeiro código certo,
`POST /store/conta/vincular` liga a identidade a um cliente — e o convidado que o checkout criou
com aquele e-mail VIRA a conta, com os pedidos dele. `authMethodsPerActor` deixa cliente só no
`codigo` e admin só no `emailpass`. Na loja, o token mora no cookie `httpOnly` `sessao` e só o
servidor fala com o Medusa (`apps/loja/src/lib/conta.ts`); o `proxy.ts` faz a checagem otimista da
porta da `/conta`. O limite por pessoa conta o IP que a loja manda em `x-cliente-ip`, assinado com o
`REVALIDAR_SEGREDO`.

Os **pedidos da conta** (`apps/loja/src/lib/pedidos-da-conta.ts`) saem de `GET /store/orders` com o
token da sessão — a rota só devolve pedido do cliente do token. O detalhe também vem por ela
(`?id=`), e não por `/store/orders/:id`: pedido de outra pessoa não aparece, e a tela diz que não
achou. O rastreio vem de
`GET /store/conta/pedidos/:id/rastreio` (backend), que lê os envios do núcleo (ver **Envios**,
abaixo) com o mesmo filtro de dono — a API da loja nem sabe que eles existem, e corta as etiquetas
dos fulfillments. O id do pedido no endereço não passa pra minúscula (`CAMINHOS_COM_ID`, no `proxy.ts`). O
conferidor da conta monta pedidos de verdade em cada estado com `ferramentas/pedido-de-teste.mjs`
— por isso pede `ADMIN_EMAIL`/`ADMIN_SENHA`, como os de frete e pagamento. Quem decide a situação
de cada pedido é o servidor (`situacaoDe`), com a hora dele: Pix que passou do `expiraEm` não é
`pix`, é **`vencido`** — selo "Pix vencido", "O Pix venceu — o pedido vai ser cancelado" e "Ver
pedido" no lugar de "Pagar o Pix". Quem está com a tela aberta na hora em que vence vê a troca sem
recarregar (`AteVencer`, em `components/conta/pecas.tsx`, que desenha o texto de antes no servidor
e na primeira pintura). Pra montar esse estado no conferidor, `pedidoPix(..., { validadeSegundos })`
aceita NEGATIVO — um Pix que já nasce vencido, dentro dos 10 minutos de folga antes de a
conciliação cancelar.

Os **endereços e os dados da conta** (`/conta/enderecos` e `/conta/dados`; as ações em
`apps/loja/src/lib/acoes/enderecos.ts` e `dados.ts`) gravam no cliente do Medusa pela API da conta,
com o token (`/store/customers/me` e `/me/addresses`) — que só acha endereço do cliente do token. O
endereço usa a tradução do checkout (`lib/endereco.ts`), sem nome nem telefone: quem recebe é o dono
da conta. O principal é o `is_default_shipping` (o Medusa desmarca o outro; excluir o principal
passa o posto pro mais antigo, na loja). CPF e ofertas moram no `metadata` do cliente, que o Medusa
mescla no primeiro nível e o próprio cliente pode escrever pela API: a loja confere o documento ao
ler, e nada dali decide preço, dono ou acesso. **O checkout de quem está na conta:**
`preencherDaConta` (`lib/checkout.ts`) roda na página antes de ler o carrinho — passa o carrinho pro
nome da conta (`POST /store/carts/:id/customer`, com o token) e preenche o que estiver vazio, grupo
por grupo (o passo 1 de "Meus dados"; o endereço principal, se o passo 2 nunca foi salvo e o CEP que
a sacola gravou não é de outro lugar). O `finalizar` confere o dono de novo e, depois da resposta
(`after`), `guardarDaCompra` (`lib/conta.ts`) salva o endereço e completa os dados vazios — com o
token, nunca pelo e-mail do pedido: o Medusa liga à conta todo carrinho com o e-mail dela, e quem
digitasse o e-mail de outra pessoa escreveria na conta dela. Sair (a ação `sair` e o `/conta/sair`)
apaga o cookie da sacola quando ela é da conta.

**Trocar o e-mail da conta** ("Meus dados": `components/conta/troca-de-email.tsx` e
`lib/acoes/troca-de-email.ts`) são duas rotas do backend, só com token de cliente:
`POST /store/conta/email/codigo` manda um código pro endereço NOVO e `POST /store/conta/email`
confere e troca. O código fica em `troca`, no mesmo `provider_metadata` da identidade `codigo`, com
hash de contexto próprio (`contextoDaTroca`, em `regras.ts`): não serve pra entrar, nem pra trocar o
e-mail de outra conta. O e-mail mora em dois lugares e o `trocarEmailWorkflow` muda os dois — o
`entity_id` da identidade (a chave de entrar) e o `customer.email`. A identidade `codigo` do e-mail
novo sem cliente (quem só pediu código de entrar com ele) sai antes; com cliente, `email_em_uso`,
dito só depois do código certo. O endereço antigo recebe o aviso (`emailDeEmailTrocado`). As rotas
usam a trava do código de entrar (`conta:codigo:<e-mail>`), porque escrevem no mesmo
`provider_metadata`.

Os **envios** — o rastreio dos pacotes — têm um núcleo que não sabe quem é o parceiro de entrega. Três
camadas: o TRADUTOR de cada parceiro (`src/modules/frenet/rastreio.ts`: confere a chave do aviso,
lê o formato dele e converte os códigos), o NÚCLEO (`src/lib/envios/`, com as tabelas `envio` e
`envio_evento` no módulo `src/modules/envios/`) e quem consome (a conta, os e-mails), que só falam
o vocabulário do núcleo (`situacao.ts`: postado, em trânsito, saiu pra entrega, esperando retirada,
entregue, devolvido, extraviado; atraso e tentativa frustrada são alertas). Toda notícia entra por
`receberNovidade` (`nucleo.ts`): o aviso do parceiro em `POST /hooks/envio/:parceiro` (a rota
escolhe o tradutor em `parceiros.ts`), e o "Mark as shipped"/"Mark as delivered" do admin
(`src/subscribers/envio-pelo-admin.ts`). O núcleo acha o pedido (pelo `order_…` ou pelo número que
o parceiro devolve, ou pelo código que o admin cadastrou), ignora o repetido, recalcula a situação
de TODOS os eventos (fora de ordem não puxa pra trás), marca enviado/entregue no Medusa pelos
workflows dele (`medusa.ts`), e solta `envio.mudou` — o e-mail ao cliente é um assinante
(`avisos.ts`), um por momento, só se ainda for notícia. Aviso sem pedido conhecido fica guardado e
se liga quando o código aparecer num pedido. O job `acompanhar-envios` (de hora em hora) refaz o
que falhou. Trocar de parceiro é escrever outro tradutor e pôr em `parceiros.ts`: o núcleo, a conta
e os e-mails não mudam, e os dois parceiros convivem enquanto houver pacote do velho na rua. Três
armadilhas: o `MedusaService` do módulo tem as chaves no PLURAL (`Envios`, `Eventos`), porque o tipo
do Medusa pluraliza "Envio" como "Envioes" e o código gera "Envios"; o "Postado" que o admin marca
tem a hora do clique e só conta enquanto a transportadora não contou nada (senão puxaria um "em
trânsito" de volta); e a Frenet escreve `ServiceDescrition`, sem o "p". A chave do aviso da Frenet
é o `FRENET_WEBHOOK_TOKEN`, no cabeçalho `x-webhook-token` ou em `?chave=`; sem ela, nenhum aviso
entra.

**A etiqueta feita à mão no painel da Frenet não manda aviso** (resposta deles, 23/09: o aviso só
vale pros pedidos que entram pela API de pedidos, que exige o token de parceiro). Pra ela, a loja
PERGUNTA: o `consultar` do contrato (`parceiro.ts`), que na Frenet é `POST /tracking/trackinginfo`
com o token da loja, chamado por `perguntarAosParceiros` (`lib/envios/consultas.ts`) — no job
`acompanhar-envios`, de hora em hora, e em `POST /admin/envios/consultar`. Entram os pacotes com
código a caminho, de até 45 dias; a resposta passa pelo mesmo tradutor do aviso e entra no núcleo
como qualquer notícia. A consulta pede o serviço da entrega: o provedor de frete guarda o da
cotação no método de entrega (`validateFulfillmentData`, `data.servico`), e sem ele o código dos
Correios vai pelo PAC. O `validateFulfillmentData` nunca lança — lançar ali impediria a pessoa de
escolher a entrega.

**O pedido pago vai sozinho pro painel da Frenet** — o caminho da Nuvemshop, DESLIGADO até o token
de parceiro existir (`FRENET_PARCEIRO_TOKEN`). O contrato ganhou `registraPedidos`,
`registrarPedido` e `tirarPedido` (opcionais); na Frenet, `POST /v1/orders` e
`/v1/shipments/:id/cancel` (ou `DELETE`) da API whitelabel, com os dois tokens
(`modules/frenet/pedidos.ts`). Quem decide é
`lib/envios/registro.ts`: `registrarNoParceiro` no `payment.captured`, logo depois da confirmação;
a varredura `registrarPendentes` (job `registrar-pedidos`, de 10 em 10 minutos, e
`POST /admin/envios/registrar`); `tirarDoParceiro` no `order.canceled`. Vão os pagos, não
cancelados, sem envio criado no admin e pagos DEPOIS de o registro ligar — o "desde" fica no
metadata da loja (`fb_parceiros`), gravado na primeira rodada ligada, pra não duplicar no painel o
pedido que já teve etiqueta à mão. Uma vez só: trava por pedido e o registro em
`metadata.fb_parceiro`, gravado pela porta do metadata do pedido (ver **O metadata do pedido**,
abaixo) — registro perdido aqui é o mesmo pedido entrando duas vezes no painel.
Recusa da Frenet (400, erro no item) é definitiva e o log pede a etiqueta à mão; queda, tempo e
token recusado voltam na varredura, com espera crescente (10 min até 6 h), por três dias. No
painel o pedido se chama **FB-<número>** (`referenciaDoPedido`) — a Nuvemshop segue na mesma conta,
com a numeração dela —, e o núcleo aceita esse nome de volta. Registrado o pedido, nasce um envio
"aguardando", SEM código, com o `ShipmentId` — o aviso acha o pedido por ele; sem código, ninguém
mostra nem pergunta por ele. Cada pedido leva o `TrackingNotificationUrl` dele, montado com o
`MEDUSA_BACKEND_URL`: `?pedido=FB-N&assinatura=HMAC(FRENET_WEBHOOK_TOKEN)`, que só vale pra aviso
daquele pedido (`lerAviso`). A chave da porta nunca vai em URL. No conferidor de envio, a seção 7c
roda das duas formas (ver o cabeçalho dele).

**O ERP** (hoje, o Bling) mora em duas pastas, no mesmo molde dos envios. `src/lib/erp/` é a
regra da loja, na língua dela: o contrato (`contrato.ts`: `lerSaldos`, `emitirNota`,
`consultarNota`, `desfazerNota`, o OAuth), a conexão (`conexao.ts`: tokens cifrados com AES-GCM por
uma chave derivada do client secret, `cofre.ts`; o `state` de uso único e de 10 minutos, apagado
ANTES de trocar o código — no Bling, reusar o código revoga o usuário; a renovação sob a trava, e a
queda com e-mail pra equipe), o estoque (`estoque.ts`) e as notas (`notas.ts`).
`src/modules/bling/` é o formato do Bling: a fila das chamadas (400 ms entre elas — o limite de 3
por segundo é da CONTA), `enable-jwt: 1` em toda chamada, o 401 que renova e o 429 que espera; SKU
→ id pelo `GET /produtos?codigos[]` (no PLURAL — o singular é ignorado em silêncio); cliente pelo
CPF (o PUT do contato vai inteiro, senão apaga o que a equipe cadastrou — e atualiza nome,
endereço, e-mail, `emailNotaFiscal`, `telefone` e `celular`, que são os que a NOTA usa; o PUT que
falha vira "Confira a nota" pra equipe, não silêncio); pedido de venda com
`numeroLoja` "FB-N" (o Bling NÃO deduplica — a loja procura por `numerosLojas[]` antes de criar);
`gerar-nfe` e `enviar?enviarEmail=false`, que só vai com a nota PENDENTE (reenvio demais bloqueia a
nota no Bling). As tabelas são do módulo `src/modules/erp` (`erp_conexao` e `erp_nota`, com os
passos dados no ERP gravados um a um). O estoque espelha o saldo que dá pra vender no ERP MAIS o que
o Medusa reservou pros pedidos que já estão lá (senão o pedido pago desconta duas vezes). O pedido
vai pro ERP no `payment.captured`, pela varredura `acompanhar-notas` (5 em 5 minutos) e pelo aviso
do ERP (`/hooks/erp/:erp`, assinado com HMAC do client secret sobre o corpo cru); só pros pedidos
pagos depois da primeira conexão (`notas_desde`). A **JANELA DE CANCELAMENTO**
(`erp_conexao.janela_da_nota`, em minutos; `null` = 5 minutos, 0 = na hora; `POST
/admin/erp/notas/janela`): dentro dela, `emitirNota` vai com `ate: "pedido"` — cliente e pedido de
venda, sem nota — e a varredura emite quando ela fecha. Ela conta do PRIMEIRO pagamento, a cada vez
(não é gravada no registro): mudar a janela vale pra quem já espera. Cancelado dentro dela, o
pedido de venda é cancelado no ERP e não há nota nem e-mail. `POST /admin/erp/notas/tentar` ("Emitir
agora" e "Tentar de novo") pula a janela. O conferidor roda as seções da nota com a janela em 0 e
confere a janela numa seção dela (e devolve o valor de antes no fim). Autorizada, solta `erp.nota_autorizada`, e o
`subscribers/nota-autorizada.ts` manda o pedido pro painel da Frenet — que, com o ERP conectado,
espera a nota (`notaParaAEtiqueta`) e leva número e chave no `Invoice`. Cancelado sem nota
autorizada, a loja apaga a nota pendente e cancela o pedido de venda; com nota autorizada, e-mail
pra equipe (a API não cancela NF-e) e, quando a nota aparece cancelada (o aviso `invoice.updated`,
ou a varredura, que pergunta pelas autorizadas de pedido cancelado), a loja cancela o pedido de
venda — o Bling deixa ele "Atendido" ao gerar a nota. O `desfazerNota` confere a situação do
pedido antes (já cancelado, não manda de novo) e passa pelo 404 da nota que ele mesmo já apagou. A
marca `cancelar` é gravada antes da trava, e a varredura marca o cancelado cujo evento se perdeu.
Falha no desfazer que precisa de alguém (o 403 inclusive) vira o e-mail "Cancele no <ERP> o pedido
#N" e a pendência "desfazer"; a loja segue tentando. O conferidor é o `conferir-erp.mjs`, com o `bling-falso.mjs`.
O **403 do Bling é escopo que falta no app** (e a resposta de produção veio sem corpo): o
`chamarBling` põe na mensagem o escopo que o caminho pede (`escopoDoCaminho`, com o nome da tela de
escopos do app) e marca `semPermissao`; na nota isso NÃO é definitivo (`precisaDeGente`): a equipe
recebe o aviso de conectar de novo, a loja segue tentando, e conectar de novo zera a espera das
notas pendentes. `POST /admin/erp/permissoes` confere escopo por escopo, LER e GRAVAR (são
permissões diferentes no Bling): a leitura com um item, a gravação com um pedido que o Bling
recusa antes de gravar (o cliente e o pedido de venda vazios, a nota e o pedido de id 0) — 400 ou
404 é permissão dada, 403 é a que falta. `POST /admin/erp/notas/tentar` devolve à fila a nota de
que a loja desistiu, e emite na hora. No Bling falso, `painel.semEscopo` nega um caminho ("/contatos") ou só um
método nele ("POST /contatos").

A **importação do catálogo** (`src/lib/erp/catalogo.ts`; a tela é `admin/routes/erp/catalogo`)
traz os produtos do ERP em dois passos: a prévia, sem efeito (`GET /admin/erp/catalogo`), e a troca
(`POST`, com os ids do ERP que entram e os ids do site que saem — só os que a prévia mostrou; ela
relê o ERP em vez de confiar na prévia). O mesmo SKU é reescrito NO LUGAR: o Medusa não apaga
produto com reserva de estoque, e o id mantém a sacola, o pedido em andamento, o endereço e as
categorias. SKU novo nasce em rascunho; formato que muda (simples ↔ variações) tira o velho do
caminho e recria com o endereço dele. Campo vazio no ERP não apaga o do site. O `metadata` do
produto MISTURA na atualização (chave que vem `""` sai): é assim que o `fb_pdp` sai. As fotos são
baixadas e sobem pro armazenamento da loja (o tipo sai dos bytes: o S3 do Bling responde
`binary/octet-stream`), com a chave de cada uma na marca `fb_erp` do produto — rodar de novo não
baixa outra vez. E a lista de produtos do Bling pergunta pelos três `filtroSaldoEstoque`: a
especificação dá padrão "só saldo positivo", que esconderia o esgotado da sincronização. O "do
zero" (subtítulo, textos, "de/por" e fotos) vale só na PRIMEIRA vez de cada produto — sem a marca
`fb_erp`; rodar de novo atualiza nome, descrição, preço, peso e medidas e deixa o resto, e foto
do ERP nunca entra em produto com a marca `fb_fotos`.

Os **endereços e as fotos da Nuvemshop** (`src/lib/nuvemshop.ts`; a tela é `admin/routes/nuvemshop`)
vêm da loja antiga no ar, sem API e sem senha: o `/sitemap.xml` diz os produtos, e a página de cada
um traz o SKU (o `mainEntity` do JSON-LD e o `data-variants`), a categoria (a trilha, posição 2) e a
galeria (os links `data-fancybox="product-gallery"`, em 1024 px; o do vídeo fica de fora). Casa
pelo SKU; o handle vira o slug de lá (o rascunho que a Nuvemshop não tem sai do caminho com
"-antigo"; o publicado, não), as fotos são copiadas pra loja com a marca `fb_fotos`, e a categoria
só entra no produto que está sem. A página da Nuvemshop recusa pedido sem `user-agent` (403).

Os **e-mails** moram em `apps/backend/src/lib/emails/`: a `moldura.ts` (barra preta com a logo,
fundo menta, blocos com sombra dura — em tabela e estilo em linha, porque é e-mail) e um arquivo
por e-mail (o de código, o de pedido confirmado e o `envio.ts`, com os quatro momentos do caminho
da encomenda). Tudo o que vem de fora passa por `esc`. A logo e os ícones são PNGs em
`apps/loja/public/email/`, gerados dos vetores do site por `ferramentas/logo/pngs-do-email.mjs`, e o
e-mail aponta pra eles pela `LOJA_URL`. Pra ver antes de mandar:
`cd apps/backend && npx ts-node ferramentas/previa-emails.ts` escreve
`ferramentas/saida/previa-emails.html` — computador, celular e modo escuro lado a lado.

O de **pedido confirmado** sai uma vez por pedido, quando o pagamento é capturado
(`src/lib/confirmar-pedido.ts`): na hora, pelo `payment.captured` (Pix pelo aviso ou pela
conciliação; cartão pelo `pedido-pago-na-hora.ts`), e pela varredura — o job `confirmar-pedidos`,
de 5 em 5 minutos (nos minutos 2, 7, 12…), e `POST /admin/pedidos/confirmar` —, que olha os
pagamentos das últimas 24 horas e manda o que faltou: o "Check status" do admin captura sem evento
nenhum, e o e-mail que falhou tenta de novo. O registro fica no pedido,
`metadata.emails.confirmado` (`email`, `dispensado` ou `recusado`), lido dentro da trava do pedido;
e a chave de idempotência do Resend (`pedido-confirmado/<id>`) cobre o resto. Não sai pra pedido
cancelado, sem o Pagar.me ou que já saiu pra entrega. Todo e-mail de pedido novo segue esse molde
— evento na hora, varredura embaixo, registro no pedido —, e a nota fiscal e o `purchase` também:
o `payment.captured` sozinho perde o "Check status".

O de **pedido cancelado** (`src/lib/avisar-cancelamento.ts`) é o mesmo molde, com o `order.canceled`
no lugar do `payment.captured` e a mesma varredura embaixo; o registro é `metadata.emails.cancelado`.
Ele diz três coisas — estornado, Pix vencido, cancelado antes do pagamento —, e **a pergunta "houve
dinheiro?" é feita ao pagamento CAPTURADO, nunca ao estorno**: o estorno pode ser registrado minutos
depois do cancelamento (admin cancelando e estornando em dois cliques), e o lado errado dessa
corrida é um e-mail dizendo "nada foi cobrado" pra quem acabou de ver o dinheiro sair da conta. A
outra ponta, a cobrança que o Pagar.me recebeu e o Medusa nunca soube, quem descobre é o
`fecharCobrancasDoPedido` do subscriber — por isso ele roda ANTES e passa o `estornouLa`.

**O metadata do pedido** tem vários donos — `emails.confirmado`, `emails.cancelado`, `estornos`,
`fb_parceiro` e `fb_bump` — e UMA porta de escrita: `gravarNoMetadataDoPedido`
(`src/lib/metadata-do-pedido.ts`). O `updateOrders` do Medusa lê o pedido, mistura o metadata na
memória (só no primeiro nível) e grava a coluna inteira: dois donos gravando juntos, o último
apaga o que o primeiro gravou — foi o registro da confirmação sumindo debaixo do `fb_bump`, gravado
uns 10 ms depois, e a varredura mandando de novo. A porta segura uma trava por pedido, a mesma pra todos
(`metadata-do-pedido:<id>`), relê o metadata dentro dela e manda pro Medusa só a chave de quem
grava. A chave pode ser um caminho (`["emails", "confirmado"]` grava ao lado do `cancelado`), e o
valor, uma função que recebe o que está lá agora e devolve o novo — `undefined` não grava (é assim
que a oferta entra uma vez só). É sempre a trava de DENTRO: a de cada dono (a do e-mail, a do
estorno, a do parceiro) segura o trabalho inteiro, por fora, e nada dentro da porta pega outra. Um
registro novo no pedido entra por ela; o `metadata-do-pedido.unit.spec.ts` falha se alguém chamar o
`updateOrders` em outro lugar. Fora do alcance: o JSON do pedido editado à mão no admin do Medusa.

A **sacola** grava CEP e entrega no carrinho (`apps/loja/src/lib/acoes/frete.ts`), e o pé da
gaveta mostra o frete e o total que o Medusa calculou com ela — o checkout abre com os dois. Com
entrega pendurada, toda mudança de quantidade faz o Medusa cotar de novo; o `cotar` do
`client.ts` junta perguntas iguais do MESMO carrinho por 10 s, e é por isso que a rota
`/store/frete` recebe `cart_id` quando quem pergunta é a sacola. Igual é byte a byte: com o
`cart_id`, a rota monta a pergunta DO CARRINHO — o valor (já com a faixa de quantidade) e os
itens, pelas mesmas `somaDosProdutos` e `itensPraCotar` do provider. Sem ele (a PDP), monta as
linhas que o carrinho teria: a mesma variante numa linha só, e o preço pedido com a quantidade
(`calculated_price` com `quantity` no contexto) — com o preço de uma unidade, a PDP prometia frete
grátis que o checkout não dava.
O **"leva junto"** da gaveta (`components/sacola/leva-junto.tsx`) sai de uma lista pronta do
servidor: `vitrineDaSacola` (`lib/medusa.ts`, cacheada com a tag `produtos`) é lida no layout raiz
e entregue à `<Gaveta>` junto com o modelo do motor de recomendação; a escolha de até três, na
hora, é `escolherLevaJunto` (`lib/recomendacao.ts`). "Adicionar" entra na fila das quantidades
(`comCarrinho`). Os logos das bandeiras são os oficiais, em arquivo (`public/bandeiras/`, MPL-2.0
— ver o `LICENCA.txt` de lá).

O **motor de recomendação** (o "leva junto" da gaveta, os chips do frete grátis e a oferta do
checkout, e o carrossel "Quem leva este, leva junto" da PDP; nada se escolhe no admin) tem duas
metades. O BACKEND monta o modelo (`apps/backend/src/lib/recomendacao.ts`, pura, com testes):
afinidade entre produtos pelos pedidos do último ano, com a rotina da PDP e a categoria como crença
inicial (vale 10 pedidos), as peças de cada kit (pelo nome), a popularidade e o peso aprendido de
cada oferta (`fb_bump` no metadata do pedido). `GET /store/recomendacoes` entrega o modelo só pra
loja (`x-loja-segredo`, `daLoja` em `lib/quem-pede.ts`), com 10 min de memória; a loja guarda 1 h
(`modeloDeRecomendacao`; erro guarda minutos). A LOJA decide (`escolherLevaJunto`, `escolherBump`,
`escolherParaOFrete` — os chips, em `listarSugestoes` —, e `ordenarParaAPagina` — o carrossel, em
`components/produto/relacionados.tsx`): noisy-or da afinidade mais a popularidade, peso pro frete
grátis na gaveta, preço perto do pedido na oferta e nos chips (que só sugerem quem sozinho fecha a
conta), e 10% de exploração na oferta, sorteada pelo id do carrinho (a mesma oferta a cada recarga).
Sem o modelo, cada lugar volta à regra de antes (a oferta some). A oferta tem uma promoção de 10%
POR PRODUTO (`lib/bumps.ts`; o job `bumps` mantém de hora em hora, o `promocoes` faz na hora), com
código `BUMP-<HANDLE>-<8 hex>` assinado por HMAC do `REVALIDAR_SEGREDO` — a loja calcula o mesmo em
`lib/bump.ts`. `alternarBump` tira qualquer outro código de oferta antes de aplicar (uma oferta por
vez) e não refaz a escolha; `finalizar` registra a oferta no pedido em `after()` (`registrarOferta`
→ `POST /store/recomendacoes/oferta`, grava uma vez). A frase da caixinha só afirma o que o modelo
prova (`Motivo`). `ferramentas/conferir-recomendacao.mjs` roda as duas metades juntas, sem servidor.

A **newsletter** do rodapé é um módulo próprio (`src/modules/newsletter/`, tabela
`newsletter_inscricao`): só o e-mail, a origem e a data do consentimento, como a Política de
Privacidade promete. Entra por `POST /store/newsletter` (a mesma resposta pra quem já estava na
lista, e os limites por IP assinado do código da conta) e se vê, baixa em CSV e remove no admin, em
"Newsletter". Remover APAGA — é o "pode sair quando quiser" e o pedido de exclusão da LGPD. A
tabela `loja.newsletter` do Supabase, do plano antigo, ficou sem uso.

O **vídeo da história da marca** (a seção "O cuidado que impõe presença" da home) é `home.video`
nas configurações da loja (`fb_configuracoes`): sobe no admin, em Configurações da loja → Home, com
a largura e a altura medidas no navegador (a loja reserva o espaço com elas), e a home troca a foto
por ele (`components/home/video-da-marca.tsx`: mudo, em loop, só baixa e toca quando aparece na
tela; pausar sempre, som só quando o vídeo tem). Depois de salvar qualquer configuração, a primeira
visita ainda recebe a página velha — a loja refaz no fundo —, e conferidor que lê a tela logo
depois de gravar precisa de uma visita de aquecimento (ver `conferir-configuracoes.mjs`).

O **painel da loja** (`apps/dashboard`, em dashboard.fuckingbarba.com.br; o plano e a ordem das
fases no ESTADO.md, 4.5) é um Next.js à parte que só fala com o Medusa do SERVIDOR: o navegador
nunca chama o Medusa, o token da equipe mora num cookie `httpOnly` (`painel_sessao`) e toda chamada
vai assinada com o `REVALIDAR_SEGREDO` (`apps/dashboard/src/lib/medusa.ts`). A equipe não é o
`user` do admin do Medusa — que continua do dono, como reserva — e sim o ator `equipe`: módulo
`src/modules/equipe/` (tabelas `equipe_membro` e `equipe_registro`, este o "quem fez o quê") e o
provedor de auth `codigo-equipe` (`src/modules/codigo-equipe/`, o mesmo código por e-mail da conta,
numa identidade à parte: o cliente que também é da equipe tem as duas, e uma não abre a outra).
Entrar: `POST /dashboard/entrar/codigo` manda (só pra quem `podeEntrar`; quem não é da equipe ouve
a mesma resposta, com os limites na memória), `POST /auth/equipe/codigo-equipe` confere,
`POST /dashboard/vincular` liga o membro (e relê se ainda é da equipe) e `POST /auth/token/refresh`
devolve o token com ele. O primeiro dono é o `DASHBOARD_DONO_EMAIL` do Railway, e só enquanto não
houver dono ativo (`workflows/equipe/garantir-dono.ts`). **Quem abre o quê é UMA tabela**, `ACESSO`
em `src/lib/equipe/regras.ts`, conferida no servidor; o painel só esconde o que ela nega. Todas as
rotas `/dashboard/*` passam pela `portaDoPainel` (`src/lib/equipe/acesso.ts`): assinatura, token do
ator `equipe` e o membro relido do BANCO a cada pedido — tirado da equipe, o token de 30 dias não
abre mais nada no clique seguinte. Rota nova já nasce trancada; a área nova entra no `ACESSO`
antes da rota, e a rota começa com `exigirArea(pedido, res, "<área>")`. Toda escrita na equipe
passa pela trava `equipe` (uma só: dois donos se removendo juntos não deixam a loja sem dono) e
deixa uma linha no registro. **Pedidos e Início** moram em `src/lib/painel/`: `pedido.ts` (puro,
com testes) decide onde o pedido está, o que travou, o caminho de seis passos e o histórico, a
partir do pedido do Medusa, da nota (`erp_nota`) e dos envios (`envio`); `inicio.ts` monta o
Início por papel; `ler.ts` é o que lê do banco (os 300 pedidos mais recentes pra lista, os de 45
dias pro Início, e o mais velho pelo número). O que o papel não vê não sai da rota: o CPF inteiro
só vai no detalhe do dono, e o marketing recebe o Início sem nome de cliente. As frases (as do
caminho, da fila, do histórico) nascem no backend, na hora de Brasília (`formato.ts`) — o painel
só desenha. Os conferidores são o `apps/dashboard/ferramentas/conferir-entrar.mjs` e o
`conferir-pedidos.mjs` (as peças comuns em `pecas.mjs`): Resend falso, como o da conta;
`DASHBOARD_DONO_EMAIL` e `REVALIDAR_SEGREDO` iguais aos do backend, `PAINEL` apontando pro
`next dev` do painel; o de pedidos faz sete pedidos com a Frenet e o Pagar.me falsos
(`pedido-de-teste.mjs`, que ganhou o `pedidoCartao` — o cartão em análise) e usa o admin local
(`ADMIN_EMAIL`/`ADMIN_SENHA`) e a chave publicável.

**As ações do pedido e as visitas** (fase 2, parte 2). "Emitir a nota agora" / "Tentar a nota de
novo" e "Tentar o estorno de novo" são as funções que o admin já usava (`tentarDeNovo`,
`tentarEstornoAgora`) atrás de `POST /dashboard/pedidos/:id/nota` e `/estorno`: a rota confere o
papel (o estorno tem linha própria no `ACESSO`, `estornos`, só do dono) e se o pedido ainda está no
estado do botão (`src/lib/painel/acoes.ts`, puro; senão 409 `nada_a_fazer`), faz, e grava a linha
no registro da equipe (`lib/painel/anotar.ts`, com o `workflows/equipe/anotar-acao.ts`) — o
histórico do pedido lê o registro e mostra o nome de quem apertou. O aviso de baixo das ações é um só pro painel inteiro (`ComAvisos`, no
layout): a frase sobrevive à página se refazendo. As visitas vêm do GA4 pela
`GET /dashboard/visitas`, à parte do Início: `src/lib/painel/ga4.ts` fala com o Google (conta de
serviço só leitura, JWT assinado com `node:crypto`, um `batchRunReports` e um `runRealtimeReport`,
respostas guardadas `GA4_CACHE_SEGUNDOS`, token recusado pede outro uma vez) e `visitas.ts` (puro)
lê as respostas; a operação recebe só o número. **O Google soma o dia com horas de atraso** (4 ou
mais, na propriedade comum): a comparação com ontem é só nas horas que ele já somou hoje
(`comparacaoComOntem`), e hoje, ontem e a hora são os do fuso da propriedade (as perguntas usam
"today"/"yesterday", e a resposta diz o fuso em `metadata.timeZone`). No painel, cada pedaço das visitas está num
`<Suspense>` e o Início não espera o Google. Conferidores: `conferir-acoes.mjs` (Bling e Pagar.me
falsos; o backend com o app do Bling apontando pro falso, como no conferir-erp — e o Bling fica
conectado no banco local, como depois dele) e `conferir-visitas.mjs` (o `google-falso.mjs` sobe na
porta do `GA4_API_URL` e confere a assinatura do JWT com a chave pública da `GA4_CREDENCIAIS`). A
chave do teste se gera na hora — nenhuma chave, nem de teste, mora no repositório:

```bash
export GA4_PROPERTY_ID=123456789 GA4_API_URL=http://127.0.0.1:4360/v1beta GA4_CACHE_SEGUNDOS=0
export GA4_CREDENCIAIS=$(node -e 'const{generateKeyPairSync:g}=require("node:crypto");const{privateKey:k}=g("rsa",{modulusLength:2048});process.stdout.write(Buffer.from(JSON.stringify({type:"service_account",client_email:"painel@local.iam.gserviceaccount.com",private_key:k.export({type:"pkcs8",format:"pem"}),token_uri:"http://127.0.0.1:4360/token"})).toString("base64"))')
# as mesmas no backend (antes do backend:dev) e no conferidor
```

**Produtos** (fase 3, parte 1). `GET /dashboard/produtos` (a lista, com as fitas) e
`GET /dashboard/produtos/:id` (o que vem do Bling, só pra ler; as seções com o texto e o fundo de
cada uma; a caixa de compra; o catálogo pros seletores; as categorias; o `noSite` do "Ver no site"
e o `historico`, lido do registro da equipe) abrem pra todo papel. Mudar é da linha
`editarProdutos` do `ACESSO` (dono e marketing): `POST /dashboard/produtos/:id/secao` (o texto e o
fundo de UMA seção, num "Salvar"), `/ordem` (ligar, desligar, subir ou descer uma — sem "Salvar"),
`/caixa`, `/textos` (subtítulo e categoria), `/publicar` e `/imagens`. **Cada gravação é UMA
mudança** sobre o `fb_pdp` lido na hora, dentro da trava `pdp:<id>` (`lib/painel/gravar-produto.ts`:
`mudarPdp` grava só a chave `fb_pdp` — o `mergeMetadata` do Medusa é raso — e avisa a loja pelas
etiquetas do produto, do layout dele e da vitrine): duas pessoas em seções diferentes não se
atropelam. Seção pela metade não grava e volta em `422 { faltando }`, com as chaves dos campos
(`faltandoNaSecao`, em `lib/pdp.ts`, a mesma regra do `lerPdp`); o painel troca pelos nomes da
tela. O editor de cada seção é DADO: `SECOES`, em `apps/dashboard/src/lib/produtos.ts` (os campos,
os nomes e a medida de cada fundo), gêmeo do `SECOES_DA_PAGINA` (`lib/painel/produtos.ts`) e do
registro da loja (`apps/loja/src/lib/secoes/registro.ts`) — seção nova entra nos três.

**As imagens de fundo.** O navegador encolhe a foto até a medida máxima (2880 de largura no
computador, 1290 no celular) e manda como arquivo pra uma ação do servidor do painel (até 3,5 MB:
`serverActions.bodySizeLimit` é 4 MB, e a Vercel não passa de 4,5); o painel repassa em base64 pra
`POST /dashboard/produtos/:id/imagens` (corpo de até 17 MB, em `api/middlewares.ts`), que refaz com
o `sharp` (`lib/imagens.ts`: o tipo sai dos bytes — JPG, PNG ou WebP —, o `rotate()` aplica a
orientação e tira o EXIF, encolhe dentro da medida e grava WebP 82) e guarda no armazenamento da
loja. Subir não grava: o endereço entra no fundo no "Salvar" da seção, que só aceita imagem do
armazenamento (`ehDoArmazenamento`: o `S3_FILE_URL`, ou o `/static/` do Medusa local). A loja
desenha o fundo como `<picture>` pelo `getImageProps` do Next (`components/secoes.tsx`), a do
celular até o corte de cada seção (`CELULAR_ATE`), e descarta na leitura fundo de fora do
armazenamento (`lib/pdp.ts`). As medidas que o painel sugere são as das seções medidas na loja
(tela de 1440 a 2x; celular de 390 a 3x): mudou o desenho de uma seção, meça de novo e troque em
`SECOES`. **A caixa de compra** é uma coisa OU outra (`combinada.modo`): "unidades" (os cartões,
com a linha opcional do avulso) ou "junto" (até 2 produtos no site, nunca o próprio); o que foi
salvo antes do `modo` vale como a loja mostrava — os cartões, a não ser com `kits: false`. O widget
do admin (`src/admin/widgets/pdp.tsx`) agora só aponta pro painel; `GET/POST
/admin/produtos/:id/pdp` fica pros conferidores e grava do mesmo jeito (trava, só `fb_pdp`, só
fundo do armazenamento). Conferidor: `apps/dashboard/ferramentas/conferir-produtos.mjs` — precisa
da loja no ar (`LOJA`), com o backend avisando ela (`LOJA_URL`), do admin local e da chave
publicável; cria um produto em rascunho por rodada (e apaga no fim) e confere a caixa de compra no
balm, devolvendo a página dele como estava.

O CSS do painel segue o do protótipo, uma regra por linha, escrito à mão: o prettier fica nos
`.ts`/`.tsx`/`.mjs` — rodado nos `.css` do painel, ele reescreve o arquivo inteiro. A gaveta
(`components/gaveta.tsx`) mora no `<body>`, por portal: aberta de dentro de um `.bloco`, ela
herdava o recorte do chanfro dele.

## Fora dos limites

- `apps/backend/.medusa/`, `apps/loja/.next/`, `apps/dashboard/.next/`, `node_modules/` — gerados.
- **CSS que começa com "Gerado por …"** em `apps/loja/src/estilos/` (quase todo `pdp*.css` e
  `checkout*.css`). Sai de `ferramentas/porte/pdp-partes/agrupa-pdp.py` (fonte: `estilo.css` da mesma
  pasta) e de `ferramentas/porte/checkout-partes/agrupa-checkout.py` (fonte:
  `prototipo-checkout.html`). Edite a fonte e rode o script — o que se escreve no gerado some na
  próxima rodada. Arquivo sem o cabeçalho é escrito à mão e se edita direto.
- Schema `public` do Supabase — do Medusa; migra pelo `medusa db:migrate`, nunca por SQL manual.
- `redirects.json` — só cresce; nunca remova uma linha (é o que preserva o Google).
