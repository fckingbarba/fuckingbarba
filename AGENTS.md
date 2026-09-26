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
# pro conferir-integracoes do painel (a Meta, o GA4 e o TikTok falsos, na 4370), acrescente:
# META_GRAPH_URL=http://127.0.0.1:4370 GA4_MP_URL=http://127.0.0.1:4370
# TIKTOK_EVENTS_URL=http://127.0.0.1:4370 META_CAPI_TOKEN=token-de-teste
# GA4_API_SECRET=segredo-de-teste TIKTOK_EVENTS_TOKEN=token-de-teste
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
e da tela de obrigado, e `retrato-consentimento.mjs`, a faixa de cookies em cima das barras presas
embaixo), e roda contra `next build` + `next start`. Os conferidores, ao contrário,
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

**O LCP da home vive no limite de 2,5 s.** O simulado (4G lento) anda em degraus: com poucas
centenas de bytes a mais no HTML da home, a primeira pintura passa pra outra ida e volta na conexão
que o HTML, o CSS e a fonte dividem, e o LCP sobe uns 220 ms. Em 26/09, a home da #93 media 2,26
ou 2,41 s aqui e 2,64 s de mediana no CI; qualquer seção a mais (mesmo vazia) dava 2,48 ou 2,63 s
aqui (entrega 0111). Seção nova na home se mede antes da PR, e a folga de verdade vem de aliviar a
primeira tela — não da seção nova.

Dois tropeços de ambiente, que não são bug: o de configurações muda a política de frete pelo admin,
e quem derruba o cache da loja depois é o backend, pelo `LOJA_URL` do `apps/backend/.env`; se ele
não apontar pro `next dev` conferido, rode esse por último (ou reinicie o `next dev`), senão o de
checkout lê a política do teste. E pedido de teste reserva estoque: `insufficient_inventory` num
conferidor é o estoque local acabando — reponha no admin local.

Um terceiro, que também não é bug: publicar ou apagar um produto (o `conferir-produtos` do painel
faz os dois) muda a lista do `generateStaticParams` da PDP, e o `next dev` manda
`staticParamsChanged` pelo websocket pra toda aba aberta, que se recarrega sozinha. Se a mensagem
cai no meio da hidratação, o React avisa "Can't perform a React state update on a component that
hasn't mounted yet" — sobre o roteador do PRÓPRIO Next, não da loja; em produção não existe. Por
isso o conferidor seguinte falhava às vezes no "nenhum erro no console". O de PDP e o de checkout
descontam esse aviso só quando ele sai colado numa mensagem de recarga, na aba que a recebeu
(`ferramentas/recarga-do-dev.mjs`, com a pilha); o de pagamento, o da conta e o de envio olham o
console sem ele.

Um quarto, também do `next dev`: "Failed to execute 'measure' on 'Performance': '<componente>'
cannot have a negative time stamp.", quando o relógio do `next dev`, no ar há horas, fica atrás
do navegador. O da conta e os do painel descontam esse erro (`ferramentas/relogio-do-dev.mjs`);
a explicação está no parágrafo do painel, mais abaixo.

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
  cache e em quem chama (`criarCarrinhoCom`, `buscarCep`).
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
não calcula. Peso e medidas moram na VARIANTE (`src/scripts/medidas.ts`), não no produto. As duas
faixas (econômica e expressa) saem do mesmo `escolherFaixas`; quando a mais barata é também a mais
rápida — ou a transportadora responde um serviço só —, as duas são A MESMA entrega, e o frete
grátis vale nas duas (`aplicarPolitica` recebe o `servico` de cada faixa, no provider e na rota
`/store/frete`). Antes só a econômica zerava, e a "expressa" cobrava pelo mesmo PAC e o mesmo
prazo. No checkout, a econômica empatada em preço some (`semEntregaEmpatada`), a não ser que seja
a gravada no carrinho.

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
só como token, gerado no navegador (`apps/loja/src/lib/pagarme.ts`). E manda o total que o botão
mostrou (`total_visto`): se o carrinho tiver outro — um item posto por outra aba, a seta de
voltar do navegador —, o `finalizar` não abre o pagamento, redesenha a tela e diz o total novo.
Sem isso o cartão era autorizado por um valor que ninguém viu. O cupom vai como foi digitado,
depois em maiúsculas e em minúsculas: o Medusa procura o código exatamente como foi cadastrado.
Quando o `complete` recusa por falta de estoque ("Not enough stock available…"), o `finalizar`
desce o pedido até o que tem (`ajustarAoEstoque`, em `apps/loja/src/lib/checkout.ts`: cada linha
até o estoque de agora, e o que acabou sai — com o código da oferta dele) e a frase diz o que
mudou e o total novo. Nada foi cobrado: o Medusa reserva o estoque antes de autorizar. Antes era
"espera um minuto e clica de novo", pra sempre. A aba que paga depois de outra vai pro MESMO
pedido: as abas dividem os cookies, e o pedido da primeira apaga a sacola das duas — a segunda se
acha pelo crachá (o `carrinho_visto` do formulário contra o carrinho do cookie `pedido`) ou, se as
duas pagaram juntas, pela sessão recusada com o carrinho já fechado. E-mail com mais de 64
caracteres (o limite do Pagar.me) é recusado no passo 1, com o motivo.

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
volta pro pedido pelo `/checkout/retomar`, em vez de mostrar "sacola vazia". Quem diz qual pedido
saiu do carrinho é a rota `GET /store/pedido-do-carrinho/:id` (`pedidoDoCarrinho`, em
`lib/carrinho.ts`), e não o `complete` de novo: o Medusa (2.21) confere as sessões de pagamento
ANTES de ver que o pedido já existe, e com o pagamento cancelado — cartão reprovado na análise, Pix
vencido — responde 400 pra sempre. Sem pedido, o retomar volta com `?retomar=falhou`, e o checkout
mostra o recado em vez de mandar pra lá de novo: era um laço de 71 idas em 8 segundos.

**O PAGAR.ME NÃO CANCELA PIX PENDENTE.** `DELETE /charges/:id` numa cobrança de Pix esperando
pagamento responde **412** ("This charge cannot be canceled because is pending"), e Pix VENCIDO
continua `pending` lá — o 412 não passa nunca. Foi o que prendeu o estoque do #7 por um dia: o
cancelamento do pedido vinha depois do DELETE, e o DELETE estourava de 5 em 5 minutos. Regra:
ninguém manda DELETE em Pix pendente — nem a conciliação, nem o `cancelPayment` do provedor, nem o
subscriber. No lugar disso, **Pix vencido cancela só o pedido aqui** (com os 10 minutos de folga, e
relendo o pagamento antes — pago no limite existe), e **pedido cancelado com o Pix ainda valendo
deixa a sessão pendente e VIGIADA**: o QR continua pagável, e a varredura de pagos em pedido
cancelado (todo pedido cancelado dos últimos 7 dias) devolve o que estiver capturado e não devolvido
— entrado quando for —, pelo `refundPaymentsWorkflow`: no PLURAL, porque o singular recusa pedido
cancelado. Cartão em análise ainda se cancela com DELETE; se vier 412, vira vigiado também, com a
sessão marcada "cancelando" (ver abaixo). Quando o Pix vence sai de três
camadas, nesta ordem: o `expires_at` que o Pagar.me acabou de dizer, o gravado na sessão (juntos com
`||`, e não `??`: o lido nasce string VAZIA) e o `created_at` de lá + `PAGARME_PIX_MINUTOS`. Sem
nenhuma das três, o Pix não vence — antes o estoque preso que a venda cancelada à toa.

**DINHEIRO DE PEDIDO CANCELADO PASSA PELO MEDUSA** (entrega 0083, os casos raros de 24/09). O Pix
pago numa sessão vigiada, achado pela conciliação ou pelo subscriber antes do aviso, é REGISTRADO no
pedido cancelado (`processPaymentWorkflow`, o caminho do aviso) e devolvido pelo Medusa
(`fecharDePedidoCancelado` → `devolverDoCancelado`) — nunca estornado direto no Pagar.me, onde
ninguém conferia: o estorno de Pix recém-pago falha (saldo), e o dinheiro ficava com a loja,
calado. Registrado, ele cai no `lib/estornos.ts` como qualquer estorno. Direto lá só sobra pra quem
não tem pedido aqui (órfã, incerta), e com estorno andando ou dinheiro já devolvido por fora.
Cartão em análise de pedido cancelado: a sessão fica `situacao: "cancelando"` ANTES do DELETE, e o
`authorizePayment` nunca cobra uma sessão assim (`naoCobrar`: desfaz a reserva, ou estoura pra
conciliação tentar de novo). O "Check status" do admin (`POST /admin/orders/:id/payment-sessions/
authorize`) pega a trava do carrinho, a mesma do aviso e da conciliação
(`lib/check-status-na-trava.ts`): sem ela, os dois registravam juntos, o segundo batia no índice
único e o Medusa chamava o `cancelPayment`, que estornava um pedido pago. A conciliação também
solta o pedido preso numa sessão que terminou recusada ou cancelada por fora dela (`pedidoPreso`) e
retoma a autorização que parou no meio com o pedido já criado (`retomarAutorizacaoParada`: paga,
vira pagamento; se não, cancela). O Pagar.me falso tem `atrasoNaBusca` (a corrida do Check status)
e `proximoCancelamento` ("412" ou "queda").

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
— por isso pede `ADMIN_EMAIL`/`ADMIN_SENHA`, como os de frete e pagamento. **O total do pedido é
o cobrado**, na conta e na tela de obrigado (`totalCobrado`, em `lib/pedido.ts`): o `total` do
Medusa mais o `credit_line_total`, arredondado no centavo como o Pagar.me cobra — a mesma conta do
painel e do e-mail de cancelamento. O `total` sozinho zera no pedido estornado (o cancelamento
grava a devolução como crédito), e o `original_total` é a conta de antes do cupom e da oferta do
checkout. O conferidor compara cada total com o que o Pagar.me falso cobrou, com um pedido pago
com a oferta e cancelado na lista. Quem decide a situação
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

O formato é o da documentação deles ("Inserir pedidos na Frenet", `docs.frenet.com.br/reference/
createorderasync`): o lote é uma lista de `ShipmentBase`, cada um com `Order` e **`Volumes` — um
OBJETO, não lista**. A lista foi o #19 (25/09), o primeiro pedido de verdade: a validação do ASP.NET
deles recusou com 400 no formato `{title, errors}`, que a loja não lia — a faixa ficou "sem
motivo na resposta". Agora `motivoDoErro` lê as duas formas (`Message`/`Details` e
`title`/`errors`) e, fora delas, o começo da resposta crua; e a resposta do lote é lida em qualquer
caixa (`campo`): a
documentação mostra `statusBatch`/`items`/`shipmentId`, e lendo só `StatusBatch` o pedido que entrou
pareceria não ter entrado — e iria de novo. A Frenet falsa segue o mesmo esquema (e responde o 400
da validação, `roteiroDosPedidos = "validacao"`). A recusa não se refaz sozinha: o botão
**"Mandar pra Frenet de novo"** da faixa do pedido (`POST /dashboard/pedidos/:id/frenet`, dono e
operação, só com `frenetPraTentar`) chama o `registrarNoParceiro` com `deNovo` — que passa por cima
da recusa e da espera, e só delas — e fica no registro da equipe (`mandou-pra-frenet`). O conferidor
é o `apps/dashboard/ferramentas/conferir-frenet.mjs`, com o Medusa de registro ligado (o
`FRENET_PARCEIRO_TOKEN`, o `FRENET_WHITELABEL_URL` na falsa) e SEM as variáveis do Bling (senão o
pedido espera a nota) — fora da rodada normal, como a seção 7c ligada.

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
Os e-mails pra equipe ele lê numa caixa só (`praEquipe`): a do dono do painel (o
`DASHBOARD_DONO_EMAIL` do backend, que vai no ambiente dele também) ou, num banco sem ninguém no
painel, a do admin local. É que, desde a 0093, o aviso vai pro papel que resolve
(`lib/equipe/avisados.ts`), e o dono recebe todos os do ERP; até a 0101 o conferidor olhava só o
`ADMIN_EMAIL`, e em banco com equipe no painel 9 checagens falhavam com a loja certa.
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
do ERP nunca entra em produto com a marca `fb_fotos`. O NOME também tem marca (entrega 0099):
produto com `fb_nome` — o nome dado no painel — fica com o nome dele em toda importação, a
primeira inclusive, e no recriado também (a prévia diz "O nome na loja fica"); o Bling segue com
o seu (a nota, os marketplaces). A marca `fb_erp` guarda o `nome` do ERP da última vez, pro painel
mostrar ao lado. As marcas moram em `lib/erp/marcas.ts`, sem dependência (o painel lê de lá); o
`catalogo.ts` reexporta.

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

O de **pagamento devolvido** (`src/lib/avisar-devolucao.ts`; o desenho mora ao lado do cancelado,
em `emails/pedido-cancelado.ts`) é o segundo e-mail de um pedido cancelado, e só de alguns:
cancelar não mata o QR do Pix (o Pagar.me responde 412), a pessoa paga depois, e a conciliação
devolve. **A régua é o que o e-mail de cancelamento DISSE**, não a hora de nada: sai quando o
`emails.cancelado` diz que não houve cobrança (`porque` ≠ `estornado`), há pagamento do Pagar.me
capturado, e o estorno do Medusa já cobre tudo (o e-mail diz "devolvemos"). Na hora, pela
conciliação, logo depois do estorno (`devolverDoCancelado`); embaixo, a varredura do
`confirmar-pedidos`, 7 dias pra trás. Registro em `metadata.emails.devolvido`, e a trava é a do
aviso de cancelamento (`travaDosAvisos`): um de cada vez, pra este ler o que aquele gravou. O
total que os dois mostram é o `totalDoPedido` — o cancelamento do Medusa grava a devolução como
CRÉDITO no pedido, e o `total` de um pedido cancelado e estornado é zero (o `original_total` não
serve: é a conta antes do cupom).

**O metadata do pedido** tem vários donos — `emails.confirmado`, `emails.cancelado`,
`emails.devolvido`, `estornos`, `fb_parceiro` e `fb_bump` — e UMA porta de escrita:
`gravarNoMetadataDoPedido` (`src/lib/metadata-do-pedido.ts`). O `updateOrders` do Medusa lê o pedido, mistura o metadata na
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
TROCAR O CEP — na gaveta ou no passo 2 — passa pela `comCepNovo` (`lib/endereco.ts`, a mesma regra
no servidor e na tela): CEP diferente leva embora o lugar do antigo e, a não ser na mesma rua, o
número e o complemento; o checkout volta pro passo 2 pedindo o número. Antes o carrinho ficava
com a rua nova e o número da antiga, e o checkout pulava pro pagamento. O passo 2 não envia com o
CEP sendo buscado, e o `salvarEntrega` recusa CEP de outra cidade (`cepDeOutraCidade`).
O DESCONTO POR QUANTIDADE (a lista "Desconto por quantidade", `apps/backend/src/lib/
precos-por-quantidade.ts`) sai do preço de UMA unidade de agora, com promoção, e o job refaz de
minuto em minuto. Promoção que acaba não emite evento nenhum — a data passa, ou alguém desliga no
admin —, então é a rodada que percebe: ela compara a foto dos preços (uma unidade com e sem
promoção, e as listas com as datas) com a anterior e, mudou, avisa a loja (`produtos` e
`promocao`). De 15 em 15 minutos, 2 e 3 unidades seguiam o preço da promoção que tinha acabado.
A SACOLA NÃO SE DIZ VAZIA SEM SABER. A leitura (`GET /api/sacola`, com prazo de 10 s) separa "não
tem carrinho" de "o Medusa não respondeu" (`leituraDoCarrinho`, em `lib/carrinho.ts`): sem
resposta, o contador não mostra número e a gaveta diz que não conseguiu abrir, com "Tentar de
novo"; e as ações devolvem `carrinho: null`, que a tela lê como "fica com o que tinha". Era a
sacola vazia de todo deploy do backend — e quem pusesse tudo de novo ficava com o dobro. A leitura
é GET, e não action, porque o Next roda as actions de uma aba UMA POR VEZ: uma leitura presa na
rede segurava o "+" atrás dela. A gaveta relê toda vez que abre, e o checkout manda reler na saída
(`<RecarregaSacola quando="sair" />`). E TODA action chamada do navegador passa pelo `semQueda`
(`lib/rede.ts`): sem internet, a promessa rejeitada subia pro boundary de erro, e o "+" da sacola,
que mora no layout raiz, derrubava o site inteiro. Action nova em componente de cliente entra por
ele também (nos passos do checkout, com o `estadoSemResposta`, que devolve o que foi digitado).
O **"leva junto"** da gaveta (`components/sacola/leva-junto.tsx`) sai de uma lista pronta do
servidor: `vitrineDaSacola` (`lib/medusa.ts`, cacheada com a tag `produtos`) é lida no layout raiz
e entregue à `<Gaveta>` junto com o modelo do motor de recomendação; a escolha de até três, na
hora, é `escolherLevaJunto` (`lib/recomendacao.ts`). "Adicionar" entra na fila das quantidades
(o `adicionar` do contexto, logo abaixo). Os logos das bandeiras são os oficiais, em arquivo
(`public/bandeiras/`, MPL-2.0 — ver o `LICENCA.txt` de lá).
A SACOLA RESPONDE NO CLIQUE (entrega 0104). Na produção, cada escrita no carrinho é um workflow
inteiro do Medusa — preço, estoque, promoção, frete e imposto refeitos, umas cem idas e voltas ao
banco — e leva de 0,6 a 0,9 s; o clique inteiro, de 0,9 a 2,4 s (medido em 26/09). Três partes:
(1) os botões de comprar (a dobra, o "Comprar" da vitrine, a rotina e o leva junto) chamam o
`adicionar` do contexto (`components/sacola/contexto.tsx`), que abre a gaveta NO CLIQUE com a linha
que a página já sabe desenhar (`ItemChegando`: nome, foto, preço da unidade e o total do degrau). A
linha nova vem com `chegando`, e os botões dela esperam o id de verdade; o dinheiro esmaece como no
"+". Chame no evento de clique, NUNCA de dentro de uma transição: o que muda dentro de uma transição
assíncrona o React só mostra quando ela termina, e a gaveta abriria junto com a resposta (quem quer
o "Adicionando…" guarda a promessa e espera na própria transição). A previsão não pode somar duas
vezes — o React refaz as previsões pendentes sobre cada resposta até a última transição acabar —,
então ela guarda `antes` (quanto daquela variante a sacola tinha no clique) e só cresce a linha que
ainda está nesse número (`chegar`). (2) Os botões da gaveta não travam mais: as escritas andam numa
fila do contexto (`naFila`), e a de quantidade que chega na vez dela com um clique mais novo na
mesma linha não sai (`PULOU`) — três "+" seguidos são duas idas ao Medusa. (3) No servidor
(`lib/acoes/carrinho.ts`), uma ida ao Medusa por clique: sem carrinho, `criarCarrinhoCom` cria já
com o item; adicionar e mudar a quantidade escrevem direto no id do cookie, e o próprio Medusa
recusa carrinho que virou pedido (`carrinhoAcabou`: 400 "is already completed", 404 "Cart id not
found"); remover pergunta antes, curto (`situacaoDoCarrinho`), porque a remoção de linha do Medusa
2.21 não confere isso. O `CAMPOS_CARRINHO` não pede mais `*items.product` nem `*items.variant` (a
linha já guarda nome, handle, variante e foto). O conferidor é o `conferir-checkout` ("A sacola
responde no clique", com cada ação segurada 1,5 s no navegador pra ver a tela antes da resposta).

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

A **esteira de avaliações** da home ("Nossos clientes nos amam", `components/home/amam.tsx`) mostra
até quatro depoimentos de cada produto — avaliação ou trecho de entrevista —, sorteados a cada
visita, e o mesmo depoimento posto em vários produtos (a mesma pessoa, o mesmo texto) conta uma vez
só — na esteira e na nota média (`lib/avaliacoes.ts`). O sorteio é no navegador
(`components/home/esteira-de-avaliacoes.tsx`): a home continua estática, e a semente da visita entra
por `useSyncExternalStore`. Os cartões só são desenhados quando a seção chega a uma tela de
distância: no carregamento vai só o lugar, com a altura da faixa reservada (`.amam__lugar`); e a
foto do cartão é `getImageProps` no tamanho da caixa (54 px, só 1x e 2x). A volta dura 7,5 s por
cartão (o ritmo do protótipo): com mais depoimentos, ela fica mais longa, e não mais rápida.
`ferramentas/conferir-esteira.mjs` confere a conta e a lista de trechos, sem servidor.

**Trecho de entrevista não é avaliação** (`TRECHOS`, em `conteudo/depoimentos.ts`): aparece como
"Entrevista com cliente", sem nome, sem estrela e sem selo, e fica fora da nota média e do
`AggregateRating` — na esteira e na seção "O que diz quem usou" da página do produto de que ele
fala (uma vez só; os do Fator não se repetem nos kits). Avaliação de verdade, com o nome e a nota
que a pessoa deu, vai em `AVALIACOES`. As regras estão no topo do próprio arquivo.

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
só desenha. **O total do pedido é o cobrado** (`totalDo`, em `pedido.ts`, com a conta do e-mail de
cancelado, o `totalDoPedido`): o `total` do Medusa mais o `credit_line_total`, na lista, no
pedido, nas vendas do Início, no "gastou" dos clientes e no "vendeu" dos cupons. O
`original_total` é a conta de ANTES dos descontos (o cupom e a oferta do checkout entram como
ajuste) — com ele, o pedido de R$ 153,01 aparecia como R$ 158,50. E o `total` sozinho zera no
pedido estornado: o cancelamento do Medusa grava a devolução como crédito. O painel arredonda em
centavos, como o Pagar.me cobra (`emCentavos`): a oferta deixa fração no Medusa (R$ 123,355), e o
Pix sai de R$ 123,36. Leitura de pedido nova pro painel pede os dois campos (`total` e
`credit_line_total`). Os conferidores são
o `apps/dashboard/ferramentas/conferir-entrar.mjs` e o `conferir-pedidos.mjs` (as peças comuns em
`pecas.mjs`): Resend falso, como o da conta; `DASHBOARD_DONO_EMAIL` e `REVALIDAR_SEGREDO` iguais
aos do backend, `PAINEL` apontando pro `next dev` do painel; o de pedidos faz oito pedidos com a
Frenet e o Pagar.me falsos (`pedido-de-teste.mjs`, que ganhou o `pedidoCartao` — o cartão em
análise —, o `codigoDaOferta` e o `cobrado`: o pago e o estornado levam a oferta do checkout, e o
total do painel é conferido contra o que o Pagar.me cobrou) e usa o admin local
(`ADMIN_EMAIL`/`ADMIN_SENHA`) e a chave publicável. **Frase com relógio não se compara inteira:**
a idade do cartão em análise no título da fila ("há 11 min") é a do instante em que o backend
respondeu, e a tela e o conferidor fazem dois pedidos a ele. Com dezenas de cartões parados em
análise no banco local (cada rodada do `conferir-pedidos` deixa um), algum vira o minuto entre as
duas leituras — era o "a fila é a da API" que falhava umas 3 vezes em 10 (24/09). Ler a API
depois da tela não resolve, continuam dois instantes: o conferidor compara a fila sem a idade
(`semIdade`). Vale pra toda frase que muda com a hora sem ninguém mexer no pedido.

**O erro do React que o relógio do `next dev` causa** (entrega 0091). Em desenvolvimento, o React
desenha os componentes do servidor no painel de desempenho do navegador: o servidor manda, pelo
websocket do HMR, a hora em que começou a página (no relógio do processo Node) e o tempo de cada
componente contado dali. O Node conta pelo relógio monotônico desde que subiu, e o do sistema vai
sendo acertado: um `next dev` no ar há horas fica atrás do navegador que o conferidor acabou de
abrir (em 25/09, dois de três horas estavam 300 a 380 ms atrás). Com o servidor atrás, o tempo do
componente cai antes do começo da página, e o React 19.2.8 mede o componente que deu erro (ou foi
abortado) sem conferir isso (react/react#37561): o `notFound()` da ficha que o marketing não abre
virava "Failed to execute 'measure' on 'Performance': 'Ficha' cannot have a negative time stamp."
(o nome vem com um espaço de largura zero na frente) — erro não tratado da página, uns 100 ms
depois de ela carregar, e só se o conferidor ainda estiver nela. Era o "nenhum erro no console"
do `conferir-clientes` que falhava 2 em 3 voltas. Em produção não existe: o cliente de produção do
React nem tem esse código. Os conferidores do painel descontam esse erro no `abrirNavegador` do
`pecas.mjs`, com o `apps/loja/ferramentas/relogio-do-dev.mjs`: só essa frase, só com a pilha
inteira no cliente de RSC do React, só quando o servidor disse ter começado ANTES da página, e um
por página carregada; o `resumo()` diz o que descontou. Reiniciar o `next dev` zera o atraso. Na
loja, o mesmo erro aparece com componentes "[Prerender]" (a conta, o checkout): o
`conferir-conta` usa o mesmo desconto, e os outros conferidores da loja ainda não. Quando o Next
trouxer um React com a trava, o desconto sai.

**As ações do pedido e as visitas** (fase 2, parte 2). "Emitir a nota agora" / "Tentar a nota de
novo" e "Tentar o estorno de novo" são as funções que o admin já usava (`tentarDeNovo`,
`tentarEstornoAgora`) atrás de `POST /dashboard/pedidos/:id/nota` e `/estorno`: a rota confere o
papel (o estorno tem linha própria no `ACESSO`, `estornos`, só do dono) e se o pedido ainda está no
estado do botão (`src/lib/painel/acoes.ts`, puro; senão 409 `nada_a_fazer`), faz, e grava a linha
no registro da equipe (`lib/painel/anotar.ts`, com o `workflows/equipe/anotar-acao.ts`) — o
histórico do pedido lê o registro e mostra o nome de quem apertou. O aviso de baixo das ações é um só pro painel inteiro (`ComAvisos`, no
layout): a frase sobrevive à página se refazendo — e chega ANTES dela. A resposta da ação traz o
resultado primeiro e o aviso entra na hora; a tela refeita pelo `revalidatePath` entra numa
segunda renderização, a da transição, uns 20 ms depois no `next dev` (perto de 100 ms com o
navegador lento). Conferidor que lê a tela depois do aviso espera ela mudar (`waitFor`,
`waitForFunction`, como o histórico no `conferir-acoes`): lida na hora, às vezes ainda é a de
antes — era o "a pessoa sai da lista" do `conferir-entrar`, que falhava 1 em 3.
As visitas vêm do GA4 pela
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

**Marketing** (a área do protótipo, em partes; parte 1, entrega 0108: o Resumo e a meta do mês).
No `ACESSO`, `marketing` é do dono e do marketing, e `metaDoMes` (mudar a meta) só do dono.
`src/lib/painel/marketing.ts` é puro, com testes: o período (`hoje`, `7d`, `30d`, `90d`; o resto
vira 30d) e o de antes, do mesmo tamanho e terminando na mesma hora (`janelasDo`); venda é pedido
pago e não cancelado, no instante da captura, com o frete (a regra do Início, `vendasDos`); os
números com a variação (`null` sem nada antes); o gráfico (por hora, por dia, ou por semana nos 90
dias); os mais vendidos em reais (`items.total`); e a meta (`fb_metas` no metadata da loja, um valor
por mês — `{ "2026-09": 12000 }` —, gravada pelo `mudarMetadataDaLoja`). `GET /dashboard/marketing
?periodo=` devolve o Resumo (e `mudaAMeta`); `GET /dashboard/marketing/visitas`, as visitas do
período e do de antes numa pergunta só ao GA4 (`visitasDoMarketing`, em `ga4.ts`, guardada como as
do dia: `date`+`hour` de `2n−1daysAgo` a `today`, até 4.320 linhas) e a conversão com os pedidos NO
MESMO CORTE de hora das visitas (`visitasDoPeriodo` — o Google soma hoje com atraso); `POST
/dashboard/marketing/meta` `{ valor }` (vazio tira) grava e anota `mudou-meta`. **As visitas
contam só o endereço da loja** (`hostsDaLoja(LOJA_URL)`, filtro `hostName` na pergunta): o GA4 é o
mesmo do site da Nuvemshop, que segue no ar até a virada — o `LOJA_URL` troca na virada, e o
filtro junto (o Início ainda conta os dois sites). No painel, `app/(painel)/marketing`, com
`components/marketing.tsx` (visitas e conversão num `<Suspense>`) e `mudar-meta.tsx`. O gráfico
fino (30 barras no celular: 8 px cada) usa `.barras-v--pontas`: a coluna de dentro de cada barra
crescia até a largura do rótulo e empurrava a barra pra fora da caixa. Conferidor:
`conferir-marketing.mjs` (o Google falso do `conferir-visitas`, que agora entende "13daysAgo"). As
próximas partes: Funil e Canais (com o montador de link de campanha), Produtos e Ofertas, Clientes
e Pagamento e frete — o protótipo tem tudo, em `telaMarketing`.

**Produtos** (fase 3, parte 1). `GET /dashboard/produtos` (a lista, com as fitas) e
`GET /dashboard/produtos/:id` (o que vem do Bling, só pra ler; as seções com o texto e o fundo de
cada uma; a caixa de compra; o catálogo pros seletores; as categorias; o `noSite` do "Ver no site"
e o `historico`, lido do registro da equipe) abrem pra todo papel. Mudar é da linha
`editarProdutos` do `ACESSO` (dono e marketing): `POST /dashboard/produtos/:id/secao` (o texto e o
fundo de UMA seção, num "Salvar"), `/ordem` (ligar, desligar, subir ou descer uma — sem "Salvar"),
`/caixa`, `/textos` (o nome da loja, o subtítulo e a categoria), `/publicar` e `/imagens`. **O
nome** mudado ali ganha a marca `fb_nome` (a importação do Bling não troca mais), e o nome igual
ao do Bling tira a marca — o botão "Usar o do Bling" (`mudancaDoNome`, em
`lib/painel/produtos.ts`, com testes). Nome da loja é curto: até uns 36 caracteres cabe em 2
linhas no título da PDP, do celular de 360 px ao computador (o título tem teto de 38 px no
`pdp.css`); o painel avisa acima disso. **Cada gravação é UMA
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

**A galeria, o vídeo do modo de uso e o antes e depois** (fase 3, parte 2). As FOTOS da galeria
continuam sendo as do produto no Medusa (`images` pela ordem `rank`, e a `thumbnail` = a primeira):
a vitrine, o Google e o link no WhatsApp leem elas, e a galeria da dobra mostra SÓ elas. Os VÍDEOS
moram no `fb_pdp.videos` (com `titulo` opcional, até 40 caracteres) e vão pra faixa "Vê na prática"
(`components/produto/ve-na-pratica.tsx`, no fim da coluna de compra — o CSS é o `.videos` do
`pdp.css` gerado; o clique abre o `dialog.videos__tela` com som, e a margem automática dele mora no
`pdp-video.css`), cada um com a `posicao` dele ENTRE OS VÍDEOS (até 24/09 era a casa na galeria; a
ordem entre eles se mantém). `lib/painel/galeria.ts` (puro, com testes) junta as duas coisas numa
lista só pro painel — as fotos primeiro, os vídeos depois (`montarGaleria`; a loja só ordena os
vídeos, `videosDaFaixa`) — e aplica UMA mudança dentro do tipo (incluir no fim do grupo, andar uma
casa entre os do mesmo tipo, tirar, `titular`);
`mudarGaleriaDoProduto` (`lib/painel/gravar-produto.ts`) grava as fotos com `rank`, a `thumbnail` e o
`fb_pdp` num update só, dentro da trava do produto, e marca as fotos como escolhidas (`fb_fotos` com
origem "painel": a importação do ERP e a da Nuvemshop não trocam mais). Rota:
`POST /dashboard/produtos/:id/galeria`. **O vídeo não passa pela Vercel** (4,5 MB): o painel pede um
bilhete (`POST /dashboard/produtos/:id/videos/envio`, com o papel conferido; `lib/videos.ts`: HMAC
com uma chave derivada do `JWT_SECRET`, 15 minutos, uso único, pra um produto, um tipo e um tamanho)
e o navegador manda o arquivo cru direto pro Medusa, `PUT /painel-envio/:bilhete` — `bodyParser:
false`, CORS só pra origem do `DASHBOARD_URL` —, que confere o tipo pelos primeiros bytes (MP4 pela
caixa `ftyp`, WebM pelo EBML; o `.MOV` do iPhone recusado com frase própria) e grava EM FLUXO no
armazenamento (`getUploadStream` do módulo de arquivos: o arquivo nunca fica inteiro na memória);
o que foi recusado no meio é apagado. A capa do vídeo (um quadro do começo, tirado no navegador)
sobe como imagem, `uso: "poster"`. O vídeo do modo de uso é `funciona.usoVideo`; o antes e depois é
`conteudo.antesDepois` (até 3 casos; caso sem `autorizou: true` não existe, e o editor diz que
falta), com as fotos em `uso: "caso"`; a rota da seção confere que toda foto e vídeo dela mora no
armazenamento (`urlsDaSecao`). A loja lê os casos do produto (e só na falta deles o
`conteudo/depoimentos.ts` de antes) e toca o vídeo do modo de uso com `components/produto/video.tsx`:
mudo, em loop, só quando aparece na tela (`preload="none"`), com a capa até tocar. O `conferir-produtos.mjs`
grava os vídeos de teste no próprio navegador (canvas + `MediaRecorder`, em WebM sem a duração no
cabeçalho, como o de um Android — o painel acha a duração indo pro fim do vídeo).

**A home** (fase 4, parte 1). O texto e a ordem da home saíram do código pro `metadata` da loja, na
chave `fb_home` (`apps/backend/src/lib/home.ts`): duas versões, `publicado` (o que a loja mostra) e
`rascunho` (`null` = nada esperando), cada uma com `conteudo` ESPARSO (só as seções salvas) e
`layout` (`visibilidade`/`ordem`, o mesmo formato do produto). Seção que ninguém salvou mostra o
texto de fábrica (`SEMENTE_DA_HOME`, o que estava no ar em 24/09). As regras do painel são puras
(`lib/painel/home.ts`, com testes): toda mudança vai pro rascunho; o rascunho que fica igual ao
publicado some; a ordem é a conta da loja (a fixa — o bloco escuro, que tem o `<h1>` — volta pro
lugar dela no registro, no meio da página, e as outras passam por cima); o "Publicar" copia o
rascunho e avisa a loja (a etiqueta `home`; o backend ainda manda a `layout:home`, que a loja não
usa mais — ver o parágrafo das imagens). Rotas: `GET /dashboard/home` e
`POST /dashboard/home/{secao,ordem,publicar,desfazer}` (área `home`: dono e marketing), e
`GET /store/home` (só o publicado, com todas as seções completas). **O metadata da loja é gravado
inteiro**: o módulo de loja do Medusa não junta o metadata (o de produto junta). Quem grava lê e
grava dentro da trava `loja:metadata` (`mudarMetadataDaLoja`, `lib/metadata-da-loja.ts`); a home e
as configurações do admin passam por ela. Na loja, `home()` (`lib/medusa.ts`, `"use cache"` com a
tag `home`) lê a rota, com uma peneira menor (`lib/home.ts`); no 404 (um Medusa de antes da rota:
o push sobe o Railway e a Vercel juntos) e na seção que chegar quebrada, vale a reserva
`conteudo/home.ts`, cópia do texto de fábrica; o `lerAjuste("home")` usa o `layout` publicado. O
Medusa falso do CI responde a home vazia (tudo de fábrica). No painel, os campos das seções moram em
`SECOES_DA_HOME` (`apps/dashboard/src/lib/home.ts`), e o formulário é o mesmo da página do produto
(`components/formulario.tsx` e `lib/formulario.ts`, com `max` nas listas, `minimo` nos grupos —
`0`, o grupo pode ficar vazio — e `vazio` no seletor de produto). Seção nova da home entra em
quatro lugares: o registro da loja, o `lib/home.ts` do backend (tipo, semente, leitor e `EXIGE`), o
da loja (tipo, peneira e a reserva) e o `SECOES_DA_HOME` do painel. Conferidor:
`apps/dashboard/ferramentas/conferir-home.mjs` — guarda o `fb_home` do banco no começo, devolve no
fim e avisa a loja.

**As imagens da home** (fase 4, parte 2, e a entrega 0076). O banner é `{ slides, tempo }` (até 5
slides; `tempo` em 0, 5, 7 ou 10 s) e é SÓ ARTE: cada slide tem a `imagem` (e a `imagemCelular`),
o `titulo` (o `alt`; opcional desde a 0103 — sem ele, o `montar` do `banner.tsx` usa o nome do
produto do link, ou "Ver todos os produtos") e o `produto` (vazio, leva pra vitrine); slide sem
imagem — como os de texto de antes — cai na leitura (no backend e na loja), e o banner de fábrica é
`slides: []`: sem arte, a home começa na barra de vantagens. Na loja, `components/home/slides-do-banner.tsx` desenha a arte sem hook (o servidor usa
pro banner de um slide só) e `carrossel-do-banner.tsx` é o carrossel: o trilho do `useCarrossel`
(rolagem com encaixe), a troca sozinha, e a imagem de cada slide montada só quando ele vai
aparecer. Na troca sozinha, a barrinha da bolinha da vez é o RELÓGIO (0106; o palco da Alta
Performance também, desde a 0107): `components/home/use-barra-relogio.ts` (`useBarraRelogio`),
comum aos dois — uma animação do navegador (`Element.animate`) na `…__ponto-cheia` da bolinha da
vez, e o slide troca quando ela termina (`finished`); o mouse ou o foco em cima, a seção fora da
tela e a aba escondida pausam ela (`andando`), e ela continua de onde parou; `quase` faz algo
antes de encher (o banner baixa a arte do próximo). Não volte pra barra no CSS com `setTimeout` ou
`setInterval` do lado: eram dois relógios — a barra começava no HTML do servidor e a contagem só
depois da hidratação (o palco, lá embaixo, chegava com a barra cheia), e a barra enchia com o
slide parado. As bolinhas ficam numa faixa escura EMBAIXO da arte
(`--faixa-dos-pontos`, 24 px), não em cima: cobriam o botão desenhado na arte do celular. A caixa é 1920 × 630 (1080 × 1275 abaixo de 768 px, com a do celular) — mais baixa desde
a 0103 (era 1920 × 700 e 4 × 5) — e a arte a PREENCHE (`cover`, pelo centro): sem faixa branca, e
a arte de outra medida perde um pouco das bordas. Sem a do celular, no celular, a do computador
aparece inteira (`contain`): no carrossel o slide estica até o mais alto, e preencher cortaria o
texto dos lados. As medidas moram em `ARTE_DO_COMPUTADOR`/`ARTE_DO_CELULAR` e, no painel, no
`MEDIDA_DA_ARTE` de `lib/home.ts` — mudou uma, muda a outra. Foto de fundo nas seções de `SECOES_COM_FUNDO_DA_HOME` (`fundos` da versão,
como o `fb_pdp.fundos`), embrulhadas pelo mesmo `Fundo` de `components/secoes.tsx` (o
`CELULAR_ATE` ganhou as da home), com o véu em `estilos/fundo.css` — que agora entra pelo
`globals.css`, e não só na PDP (sem ele, a foto vazava pra página inteira). A última chamada tem
`imagem`/`imagemCelular` próprias. Na loja, toda imagem passa por `ehDoArmazenamento`, que saiu
pra `lib/armazenamento.ts` (a PDP e a home usam; em `lib/pdp.ts` ela fazia ciclo de import com
`lib/medusa.ts`). No painel, as imagens sobem por `POST /dashboard/home/imagens` (os usos do
fundo) e o `FundoDaSecao` virou comum: recebe `subir` (pra onde sobe), `comVeu` e, na medida,
`minimo` e `mostra: "centro"` (a arte do banner: a loja corta pelo centro, e o aviso diz quantos %
saem de cada borda). O formulário ganhou os campos
`imagens` (a do computador em `c`, a do celular em `c` + "Celular") e `opcoes`. **O ajuste de
layout não tem cache próprio** (`lib/secoes/layout.ts`): era um `"use cache"` lendo outro (o
`home()`, o produto), e no "Publicar" o de fora se refazia lendo o de dentro ainda vencido e
guardava a ordem velha por dias. Leitura cacheada que depende de outra leitura cacheada, com as
duas etiquetas caindo juntas, tem esse risco: prefira um cache só.

**Arrastar e soltar** (entrega 0078). Todo quadro de subir foto ou vídeo do painel aceita o
arquivo arrastado do computador: o `useArrastar` (`components/arrastar.tsx`) dá os eventos ao
quadro (o `.slot` inteiro, ou o "+" da galeria) e chama o mesmo `escolher` do campo de arquivo —
então a conferência de tipo e de tamanho é a mesma (`prepararNoNavegador`, `lerVideoNoNavegador`).
Um arquivo por vez (`UmPorVez` avisa quando vieram vários). O `dragenter` e o `dragleave` chegam de
cada filho do quadro: ele conta as entradas menos as saídas, e aceso (`data-arrastando`) os filhos
ficam sem `pointer-events`. Não tire da árvore, no meio do arrasto, o elemento que está debaixo do
ponteiro: o `dragleave` dele não chega mais no quadro, e a conta fica presa (o quadro não apaga).
O `SoltarSoNoQuadro`, no layout do `(painel)`, cancela o `dragover`/`drop` de arquivo que nenhum
quadro aceitou — sem ele, o navegador abre a foto no lugar do painel e some o que estava sem salvar
na gaveta. Quadro novo de subir arquivo: use o `useArrastar`. Os conferidores soltam arquivos com o
`arrastarArquivos` (`ferramentas/pecas.mjs`: o DataTransfer montado na página, e o dragenter, o
dragover e o drop pelo `dispatchEvent`).

**O vídeo da história e a prova social** (fase 4, parte 3, entrega 0080). O vídeo da história da
marca é o `sobre.video` da home (`VideoDaHistoria`: url, largura e altura; `poster` e `duracao`
quando subiu pelo painel). Sobe como o vídeo do produto: o bilhete vem de
`POST /dashboard/home/videos/envio`, com destino `"home"` no bilhete de `lib/videos.ts`, e o
`PUT /painel-envio/:bilhete` grava `home-video.<ext>`. A capa vai em `POST /dashboard/home/imagens`
com `uso: "poster"`. No painel, o `CampoDeVideo` sobe pro `DestinoDoVideo` do contexto do formulário:
`videoDoProduto(id)` na página do produto, o da home na gaveta dela. O campo `video` tem `uso`:
"uso" é deitado, "historia" tanto faz. O `GET /store/home` manda sempre o `sobre.video` (o vídeo, ou
`null`). Sem a chave, o Medusa é de antes, e a loja usa o `configuracoes().home.video`, o do admin.
A migração `migration-scripts/video-da-historia-no-painel.ts` roda uma vez no `db:migrate` e copia o
vídeo do admin pro publicado e pro rascunho (`comVideoDoAdmin`, com testes). O
`fb_configuracoes.home.video` ficou lá, parado: a tela do admin só aponta pro painel e devolve o
`home` como leu. A prova social lê os casos dos produtos com `casosDoProduto`
(`conteudo/produto.ts`), o mesmo da PDP, com a reserva do `conteudo/depoimentos.ts`. Os casos saem
da lista de produtos, que já traz o `metadata`: até 8, alternando os produtos. A ressalva é a
`RESSALVA_DO_ANTES_E_DEPOIS`. Salvar a página de um produto derruba a etiqueta `produtos`, e com ela
a home. O painel recebe `provas` no `GET /dashboard/home` (`provasDaHome`: os produtos no site com
caso) e mostra na gaveta. O número 8 está nos dois lados (`CASOS_NA_HOME`).

**Clientes e newsletter** (fase 6, entrega 0082). `src/lib/painel/clientes.ts` é puro, com
testes, e faz o seguinte:

- junta os clientes do Medusa pelo e-mail (`juntarPessoas`). O convidado de cada checkout sem conta
  e o da conta são a mesma pessoa, e os pedidos dos dois somam;
- junta os consentimentos (`consentimentosDa`): a caixa de "Meus dados" (o `metadata.ofertas` do
  cliente, `{ email, whatsapp }`, cada um com a data do primeiro "sim") e a `newsletter_inscricao`
  do rodapé;
- corta a lista e a ficha por papel (`listaDeClientes`, `fichaDoCliente`): o marketing só vê quem
  aceitou ofertas, sem cidade, celular, CPF, endereço e pedidos, e a ficha de quem não aceitou dá
  404 pra ele. O CPF inteiro só sai pro dono;
- monta a aba Newsletter (`newsletterDa`) com o rodapé e a conta numa lista só, sem repetir e-mail.

As rotas são estas:

- `GET /dashboard/clientes?busca=` e `GET /dashboard/clientes/:id`, na área `clientes`;
- `GET /dashboard/newsletter` e `POST /dashboard/newsletter/tirar` `{ email }`, na área nova
  `newsletter`, que é do dono e do marketing.

O "tirar" apaga a inscrição (`removerDaNewsletterWorkflow`) e desmarca só o e-mail no
`metadata.ofertas` da conta, deixando o WhatsApp. Ele anota no registro da equipe com o e-mail
mascarado (`emailMascarado`). A lista lê até 5000 clientes e os últimos 2000 pedidos, só com os
campos que ela soma. A ficha lê os pedidos inteiros de todos os cadastros da pessoa, até 200. O
`numerosDaNewsletter` do Início usa a mesma conta da aba. O plano de CRM ("Ciclo da Barba") vai
ler os mesmos consentimentos e pôr as 5 etiquetas da pessoa na ficha, num bloco a mais. O
conferidor é o `apps/dashboard/ferramentas/conferir-clientes.mjs`, com os mesmos falsos e variáveis
do `conferir-pedidos`.

**Cupons e descontos** (fase 6, entrega 0085). Cupom é promoção do Medusa com código: quem aplica
e recusa é o Medusa, no carrinho. `src/lib/cupons.ts` é puro, com testes, e faz o seguinte:

- lê o formulário (`lerCupomNovo`): código em maiúsculas, sem o prefixo `BUMP-` das ofertas,
  número em reais do jeito brasileiro, data de hoje em diante (Brasília);
- monta a promoção (`promocaoDoCupom`): porcentagem em `items` com `allocation: across` (o `each`
  do 2.21 pede `max_quantity`), reais em `order`, o limite total no `limit` do Medusa (conta no
  pedido feito) e a forma do cupom no `metadata.fb_cupom`, de onde a lista lê;
- faz das condições que o Medusa não tem regras comuns (`regrasDoCupom`), sobre campos que o gancho
  `setPromotionContext` do `updateCartPromotionsWorkflow`
  (`src/workflows/hooks/contexto-dos-cupons.ts`) põe no contexto (`contextoDosCupons`):
  `fb_cupons.produtos` (o `somaDosProdutos`, a medida do frete grátis), `fb_cupons.agora`, e
  `fb_cupons.pedidos` e `fb_cupons.usados` (os pedidos não cancelados do e-mail do carrinho, numa
  consulta);
- põe junto de toda condição a trava `fb_cupons.conferido = "sim"`, que o gancho só escreve quando
  leu tudo. O Medusa lê número que falta como zero (`MathBN`): sem a trava, uma conta sem o gancho
  (ou com a consulta dos pedidos falhando) deixaria passar o "vale até" e o "uma vez". O teste
  roda as regras no avaliador do próprio Medusa (`areRulesValidForContext`).

Sem e-mail, a lista de pedidos é vazia e "uma vez"/"primeira compra" deixam aplicar. O workflow
refaz os códigos do carrinho a cada mudança e tira o que deixou de valer (o e-mail chegou, o
produto saiu). O `use_by_attribute` do orçamento de campanha do Medusa não serve: sem e-mail no
carrinho, ele derruba a conta com erro.

As rotas ficam na área `cupons` (dono e marketing):

- `GET /dashboard/cupons`: os cupons de campanha (`ehCupomDeCampanha`: com código, não automático,
  sem `BUMP-`), os usos por código nos ajustes dos pedidos (`usosPorCodigo`: não cancelados; o
  vendido, só dos pagos) e os descontos automáticos em frase (`src/lib/painel/cupons.ts`);
- `POST /dashboard/cupons`: 422 com os erros por campo, 409 se o código já existe (em qualquer
  caixa);
- `POST /dashboard/cupons/:id` `{ acao: "pausar" | "ligar" }`: só cupom de campanha; muda o
  `status`.

As três anotam no registro da equipe. O cupom de frete grátis ficou de fora: o resumo do checkout
mostra `shipping_total` e `discount_total`, e o desconto do frete apareceria nos dois. O
conferidor é o `apps/dashboard/ferramentas/conferir-cupons.mjs`: cria os cupons pelo painel,
aplica pela Store API e faz os pedidos com o `pedidoPix(..., { cupom })` do `pedido-de-teste.mjs`.

**Observabilidade** (fase 7, entrega 0087). O módulo `src/modules/observabilidade/` guarda três
tabelas: `obs_rotina` (a última rodada de cada job), `obs_problema` e `obs_sinal` (o dia de cada
integração). A regra mora em `src/lib/painel/observabilidade.ts`, puro, com testes:

- `ROTINAS`: os jobs de `src/jobs`, em frase, com a agenda. O teste confere que cada job está na
  lista com o mesmo `config`: job novo entra nela, ou o teste falha;
- os problemas: `problemasDosPedidos` (estorno, nota, Frenet, entrega, os mesmos do Início),
  `problemaDoErp`, `problemasDasRotinas` (falhando seguido, parada) e `problemasDosSinais` (um por
  integração e por dia);
- `conciliarProblemas`: o que muda na tabela. Cria o novo, atualiza o aberto, reabre o que voltou e
  resolve sozinho o de estado que sumiu. O de pedido fora da janela lida não some;
- a tela (`telaDaObservabilidade`), conforme o papel. `so_dono` é o estorno, como no Início.

O resto é assim:

- **A rodada.** Todo job exporta `comRodada(config.name, fn)` (`lib/observabilidade/rodada.ts`):
  começo, fim e erro em `obs_rotina`, e o erro segue pro Medusa como antes. Anotar nunca derruba o
  job.
- **O sinal.** `sinal({ integracao, ok, resumo, detalhe })` (`lib/observabilidade/sinal.ts`) mora
  em cada chamada de fora: o `enviarEmail`, o `perguntar` da cotação da Frenet, o `chamar` do
  Pagar.me e o aviso (webhook), o `chamarBling` e o token, o `postar` do Google e o `avisarALoja`.
  É uma porta global, que o construtor do serviço liga (essas funções não recebem o container).
  Nunca espera e nunca lança. O `semDadoPessoal` cobre e-mail e CPF, e o assunto do e-mail vai com
  o código de seis dígitos coberto. A soma do dia é do banco (`insert … on conflict`, no serviço).
- **O vigia** (`lib/observabilidade/vigia.ts`). Roda no job `vigiar-a-loja` (minutos 1, 6, 11…) e
  na tela, no máximo a cada 30 segundos, um de cada vez. Lê os pedidos dos últimos 45 dias (até 500)
  com as notas e os envios, a conexão do ERP, as rotinas e os sinais de hoje e de ontem. Apaga os
  sinais de mais de 60 dias e os problemas resolvidos há mais de 90.
- **Os dois tipos.** O problema de estado (`sozinho`) não se marca: a rota responde 409
  `sai_sozinho`. O de evento se marca pelo `resolverProblemaWorkflow`, e volta se acontecer de novo
  depois. As rotinas todas paradas (o vigia também) viram um problema na hora da leitura, sem
  tabela: é o worker fora do ar.
- **As rotas**, na área `observabilidade` (dono e operação): `GET /dashboard/observabilidade`
  (`lib/observabilidade/tela.ts`: a loja agora pelo `LOJA_URL`, guardada 1 minuto; o Medusa ligado
  desde; a conexão do ERP e a última nota) e `POST /dashboard/observabilidade/problemas/:id`
  `{ acao: "resolver" }`. O `GET /dashboard/eu` devolve `avisos.observabilidade`: os graves que o
  papel vê, pro número vermelho do menu.

O conferidor é o `apps/dashboard/ferramentas/conferir-observabilidade.mjs`. Ele cria as falhas nos
falsos: o Resend recusa, a Frenet cai, e o Pagar.me não estorna.

**A parte 2: o que o navegador manda** (entrega 0090). A loja mede e manda, e o painel mostra:

- **Na loja:** `components/telemetria/telemetria.tsx` mora no layout raiz. Ele guarda o LCP, o INP
  e o CLS do `useReportWebVitals` (uma de cada por envio, pelo nome: no desenvolvimento, o React
  liga o medidor duas vezes) e o erro dos scripts da própria loja (`error` e
  `unhandledrejection`). O `avisar-404.tsx` mora no `not-found.tsx`, e as telas de erro contam o
  que caiu (`avisarTelaDeErro`). Tudo vai pelo `sendBeacon` pra `POST /api/telemetria`, que responde
  204 na hora e repassa depois (`after`), assinado. Ele descarta o corpo acima de 8 KB, o robô
  (inclusive o Lighthouse) e o preview da Vercel.
- **A ordem de sair da página importa.** O envio escuta o `visibilitychange` no `window`, e não no
  `document`: o Next conta o CLS e o INP finais no `document`, e o evento só sobe pro `window`
  depois. Trocando de página, o `pagehide` vem ANTES do `visibilitychange`, então os dois mandam.
- **No backend:** `POST /store/telemetria` só aceita a loja (`daLoja`) e limita 60 recados por
  minuto por visitante, e 3.000 pra loja inteira. O `lerEventos` (`lib/observabilidade/telemetria.ts`)
  confere cada evento: tira a busca e o que identifica alguém da página (id do Medusa, número
  comprido, e-mail), guarda da origem só o domínio, e passa o erro no `semDadoPessoal`.
- **As tabelas:** `obs_medida` guarda uma linha por medida, e `velocidade()` tira o p75 dos últimos
  28 dias com `percentile_cont`. `obs_ocorrencia` soma a página que não existe e o erro por dia.
- **O vigia:** `problemasDasOcorrencias` faz um cartão por dia pro 404 (atenção quando o link veio
  da própria loja) e outro pro erro.
- **O site no ar:** o job `vigiar-a-loja` confere a loja antes do vigia (`conferirALoja`, no
  `LOJA_URL`), e anota no sinal `loja-no-ar`. O problema `loja-fora/<dia>` é grave enquanto a
  loja não volta. O `noArNaTela` soma 30 dias, arredondando pra baixo.
- **O que expira:** a medida, em 28 dias; a ocorrência, em 60.

O conferidor (`conferir-observabilidade.mjs`) abre a loja local (`LOJA`) num 404, num erro de
propósito e em duas visitas (celular e computador). O erro de propósito vai de novo até o recado
sair: o ouvinte nasce na hidratação, e o erro jogado antes dela não é visto — com a máquina
ocupada, o "load" chega antes. É um limite da loja também: o erro de antes da hidratação não conta.

**Configurações** (fase 6, entrega 0093). As abas do protótipo, na área `configuracoes` (só o
dono). A regra mora em `src/lib/painel/configuracoes.ts`, puro, com testes:

- **A leitura do formulário, campo a campo:** `lerEmpresa` (CNPJ pelos dígitos, WhatsApp com o 55
  na frente, horário uma frase por linha), `lerFrete` (guarda o `tetoDeCusto` que já estava: a tela
  não mostra) e `lerEmergencia` (em branco, a loja não vende; com preço, o prazo é obrigatório).
  Errado, a rota responde 422 com `erros` por campo, e nada é gravado. Os números em reais passam
  pelo `numeroBrasileiro` de `lib/cupons.ts`.
- **A gravação:** `gravarConfiguracoes` (`lib/painel/ler-configuracoes.ts`) junta a parte nova no
  `fb_configuracoes` dentro da trava do metadata da loja (`mudarMetadataDaLoja`) e avisa a loja
  (`avisarALoja(["configuracoes"])`). É o mesmo lugar do admin do Medusa, que segue de reserva, e a
  mesma peneira da rota pública (`lib/configuracoes.ts`). A rota do frete confere antes da trava e
  lê de novo dentro dela (a `atual` pode ter mudado no meio).
- **A janela da nota** grava na conexão do ERP (`atualizarConexao`), só as da lista (`JANELAS`: as
  mesmas da tela do ERP no admin). Outra, gravada pela API, aparece marcada no fim, como "N min".
- **A tela** (`telaDasConfiguracoes`): pagamento e entrega em frase, das variáveis (o Pix, as
  parcelas, os estornos, o token da Frenet); as pendências da nota (`pendenciasEmFrase`: primeiro
  o que tem prazo na SEFAZ, depois o que precisa de alguém; da mesma queda, 4 ou mais viram uma
  linha, e a lista para em `MAX_PENDENCIAS`); os e-mails, com o remetente do `remetenteDosEmails`
  (`lib/email.ts`, o mesmo do `enviarEmail`).
- **Pra quem vai o aviso da equipe:** `AVISOS_DA_EQUIPE` diz o papel de cada um (a nota: operação e
  dono; o Bling caído e o estorno: dono), e `destinatarios` escolhe os e-mails — quem está ativo no
  papel; sem ninguém, o dono; sem ninguém no painel, os usuários do admin, como antes. O
  `avisarAEquipe` do ERP e o dos estornos chamam o `emailsPraAvisar` (`lib/equipe/avisados.ts`).

As rotas: `GET /dashboard/configuracoes` e
`POST /dashboard/configuracoes/{empresa,frete,emergencia,nota}`. Todas anotam no registro da
equipe. O conferidor é o `apps/dashboard/ferramentas/conferir-configuracoes.mjs` — o do painel,
que não é o `apps/loja/ferramentas/conferir-configuracoes.mjs` da loja. Ele guarda as configurações
e a janela no começo e devolve no fim, mesmo quando falha. O `conferir-observabilidade.mjs` confere
que o e-mail do estorno vai pro dono, e não pra operação.

**Integrações** (Configurações, entrega 0094). Os códigos de medição e anúncio, a faixa de
cookies e a compra pelo servidor:

- **O contrato:** `integracoes` em `fb_configuracoes` (`lib/configuracoes.ts`): GA4, Google Ads e o
  rótulo da compra, Pixel da Meta, Clarity e Pixel do TikTok. É PÚBLICO (`soOPublico`) — o código
  de um pixel está no HTML de qualquer loja —, e a leitura só aceita o formato de cada plataforma
  (`FORMATO_DAS_INTEGRACOES`), porque o código vai pra dentro de um `<script>`. O painel acha o
  código no trecho colado (`INTEGRACOES[].achar`, em `lib/painel/configuracoes.ts`) e grava por
  `POST /dashboard/configuracoes/integracoes`. O `POST /admin/configuracoes` passou a gravar só as
  seções que o corpo traz: a tela do admin não conhece as integrações, e o "Salvar" dela zerava.
- **A faixa** (`apps/loja/src/lib/consentimento.ts`): o cookie `fb_consentimento` guarda a resposta,
  a versão e os parceiros — `sim.2.gmtc`. Resposta de outra versão (`VERSAO_DO_CONSENTIMENTO`) ou
  um sim sem um parceiro que entrou depois volta a ser "perguntar" (`respostaQueVale`); o "não"
  vale pra qualquer lista. A versão sobe com parceiro ou finalidade nova — a política promete
  avisar antes de valer.
- **O pé da tela** (entrega 0097): a faixa (`components/analytics/consentimento.tsx`) mora no pé
  da tela, EM CIMA da barra que estiver presa lá — a de compra da PDP, a do total no checkout do
  celular. Cada barra diz a própria altura em `--pe-da-tela`, no `<html>`, pelo `usePeDaTela`
  (`lib/use-pe-da-tela.ts`: medida com `ResizeObserver`, num registro em que vale a maior — o
  Next guarda telas visitadas escondidas, e a cópia que se esconde não pode apagar a medida da
  que está na tela). Barra nova presa embaixo: use o `usePeDaTela`. Até 25/09 a barra da PDP
  (z-index 60) cobria os botões da faixa, e a faixa (z-50, depois no DOM) cobria o botão do
  checkout. No celular a faixa é menor: letra de 12 px e cada botão numa linha.
- **As tags** (`components/analytics/`): `tags.tsx` (no layout raiz, com o GA4 da Vercel de
  reserva) só chama `ligarIntegracoes` (`integracoes.ts`) com o sim — o modo básico: antes dele,
  nenhum script de fora na página. Os trechos são os oficiais, com o código conferido de novo. As
  trocas de página cada plataforma conta sozinha (GA4, Meta, TikTok e Clarity escutam o histórico):
  não mande `page_view` à mão.
- **Os eventos** saem só por `lib/rastrear.ts`: `gtag('event', …)` pro GA4 e o Ads (o
  `dataLayer.push` de objeto, sem GTM, o gtag.js ignora), os padrões da Meta e do TikTok, e marcas
  na Clarity. Até as tags ligarem, o evento espera numa fila da página (o efeito do produto roda
  antes do das tags); sem o sim, morre com ela. Onde nascem: `view_item` na caixa de compra,
  `add_to_cart`/`remove_from_cart` pela diferença da sacola no provedor
  (`rastrearMudancaDaSacola` — pega a página do produto, o leva junto, a oferta e o "+"),
  `begin_checkout` e `add_shipping_info` nas etapas, `add_payment_info` no pagar. O `item_id` é o
  id da variante, o mesmo da compra do servidor.
- **O rastro da compra** (`apps/loja/src/lib/rastro.ts`): a ação de finalizar lê a resposta sobre
  os cookies e, só com o sim, `_ga`/`_ga_<código>`, `_fbp`/`_fbc`, `_ttp`, o IP e o navegador; e
  manda DEPOIS da resposta (`after()`) pra `POST /store/pedidos/rastro` (só a loja, `daLoja`;
  `registrarRastroWorkflow` grava `fb_rastro` uma vez). NÃO vai no metadata do carrinho — que o
  2.21 copia pro pedido (conferido em 25/09) —, porque qualquer update do carrinho roda o
  `refreshCartItemsWorkflow`: cota o frete de novo e refaz a coleção de pagamento, na hora de
  pagar.
- **A compra pelo servidor** (`apps/backend/src/lib/anuncios/`): `compra.ts` é puro — `decidir`
  (código no painel, chave no Railway, o sim pra aquele parceiro; sem rastro, espera 30 minutos) e
  o formato de cada um (a Meta na Graph `v26.0`, o GA4 no Measurement Protocol, o TikTok na Events
  API; o id do pedido é o `event_id`/`transaction_id` de todos). `enviar.ts` manda, dentro da trava
  `anuncios-compra:<pedido>`, e grava `fb_anuncios.compra.<plataforma>` (enviada, dispensada ou
  recusada); queda não grava, e a varredura do `confirmar-pedidos` tenta por 24 horas. Chamam: o
  `pagamento-capturado`, a rota do rastro (pedido já pago) e a varredura. As chaves são
  `META_CAPI_TOKEN`, `GA4_API_SECRET` e `TIKTOK_EVENTS_TOKEN` (`chaves.ts`); o endereço da Meta
  leva o token na query e nunca vai pro log. A falha manda o sinal `anuncios` — o problema
  "compra não chegou nos anúncios", só pro dono.
- **O Google Ads** não recebe compra do servidor sem a API dele: `converterCompraNoGoogleAds`, na
  tela de obrigado, com o pagamento entrado (o `transaction_id` descarta a repetida).
- **A Clarity** fica coberta (`data-clarity-mask`) no checkout, na conta e na tela de obrigado.

O conferidor é o `apps/dashboard/ferramentas/conferir-integracoes.mjs` (29; a seção "A faixa e as
barras do pé da tela" confere, no celular e no computador, que o meio de cada botão da faixa e o da
barra é o próprio botão, e o tamanho da faixa no celular). Ele troca os scripts de
fora por um de mentira (o `route` do Playwright) e lê as filas dos trechos (`dataLayer`,
`fbq.queue`, `ttq`, `clarity.q`); a compra, no `apps/loja/ferramentas/anuncios-falsos.mjs` (4370,
`PORTA_ANUNCIOS`), com os pedidos da `fabricaDePedidos` (que devolve o `carrinho` pro crachá da
tela de obrigado).

**Os carrinhos abandonados** (entrega 0096 — só a lista; os e-mails vêm depois).
`GET /dashboard/carrinhos?filtro=parados|agora|voltaram` (área `carrinhos`) monta a tela em
`apps/backend/src/lib/painel/carrinhos.ts`, puro e com testes; a leitura é `ler-carrinhos.ts`:

- **O que lê:** os carrinhos sem `completed_at` mexidos nos últimos 30 dias, em duas leituras, com
  e sem e-mail — os sem e-mail são a maioria e, na mesma leitura, empurrariam pra fora do limite os
  que dá pra chamar; os pedidos do mês inteiro (o banco compara e-mail letra por letra, e a
  comparação sem maiúsculas é a do código); e o registro da equipe com a ação `chamou-no-whatsapp`.
- **O passo** (`ondeParou`) é a régua do checkout (`etapaDoCarrinho`, em
  `apps/loja/src/lib/checkout-visivel.ts`): sem e-mail, sacola; sem o documento no
  `billing_address.metadata`, contato; sem CEP, rua, número ou frete, entrega; o resto, pagamento
  — a sessão em `error` é "o pagamento não passou". Funciona porque o passo do contato grava
  e-mail, os dois endereços e o CPF de uma vez, e a conta aberta preenche o carrinho quando o
  checkout abre (`preencherDaConta`): e-mail sem CPF é quem viu o passo do contato. Se o checkout
  mudar o que grava em cada passo, a régua muda junto.
- **Uma linha por pessoa:** o carrinho mais recente por e-mail (ou telefone, sem e-mail). Sem
  nenhum dos dois, só conta em "sem contato". **Voltou** = pedido não cancelado com o mesmo e-mail,
  feito depois do `updated_at` do carrinho. **Parado** = 30 minutos sem mexer (`PARADO_MIN`); antes,
  "no site agora".
- **O WhatsApp:** `wa.me/55…?text=` com a mensagem pronta (`mensagemDoWhatsapp`). O botão
  (`components/carrinhos-whatsapp.tsx`) abre numa aba nova e, no mesmo clique, a ação
  `anotarWhatsapp` faz `POST /dashboard/carrinhos/:id/whatsapp`, que grava no registro da equipe.
  O marketing lê a lista com o e-mail mascarado (`emailMascarado`, o dos clientes), sem telefone e
  sem link, e leva 403 no `POST`.

O conferidor é o `apps/dashboard/ferramentas/conferir-carrinhos.mjs` (11): cria os carrinhos pela
API da loja, um parado em cada passo, e o pedido de quem voltou pela `fabricaDePedidos`; o
`wa.me` vira uma página de mentira (o `route` do Playwright). Carrinho recém-criado cai em "No site
agora", e é nesse filtro que ele confere.

**O preço e o promocional no painel** (entregas 0098 e 0102): os dois campos de cada produto na
lista de Produtos, como na Nuvemshop (a 0098 tinha só o promocional, atrás de um botão). A regra é
`lib/painel/promocao.ts`, pura: `lerMudancaDePreco` (o corpo `{ preco?, promocional? }` contra o
preço e o promocional do painel de hoje; recusa com o campo que errou — promocional que não é
desconto, mais de 80%, preço que muda mais de 5 vezes, ou que passa por baixo do promocional) e
`precoDoProduto` (o que a lista mostra).

- **O preço** é o da variação, gravado com `updateProductVariantsWorkflow` (o mesmo da importação;
  as listas de preço ficam). O produto ganha a marca `fb_preco` (`MARCA_DO_PRECO`, em
  `lib/erp/marcas.ts`, ao lado da do nome): da segunda importação do Bling em diante, `planejar` marca
  `precoDoPainel`, `atualizarNoLugar` não manda `prices`, e a prévia do admin mostra o de hoje. Na
  primeira ("do zero"), a marca sai com as outras chaves.
- **O promocional** mora numa lista de preço do Medusa, "Promoção do painel" (tipo sale, sem data,
  criada na primeira gravação): o Medusa fica com o menor preço e devolve o original, e a loja já
  desenha o de/por (`precosDe`). Gravar tira o preço do produto das OUTRAS listas — fora a do
  desconto por quantidade; é a regra da importação na primeira vez.
- **A gravação** (`gravar-preco.ts`, na trava `preco-do-painel`) avisa a loja (`tagsDoProduto`) e
  roda `sincronizarPrecosPorQuantidade` na hora, pra "2 unidades" não esperar o job do minuto.
- **A leitura** (`precosDos`, em `ler-produtos.ts`) junta o `calculatePrices` de uma unidade (o que
  a loja cobra), o preço da variação (`variants.prices` não traz os de lista) e o da lista do
  painel. `deOutraLista`: quem ganha é outra lista (a de lançamento, que o banco local ainda tem).
  `semEfeito`: o preço baixou pra menos que o promocional. As faixas do detalhe e o preço do
  catálogo dos seletores saem do preço de hoje.
- **As rotas:** `GET /dashboard/produtos` (com `promocao`, `promocaoSemEfeito` e `podeEditar`) e
  `POST /dashboard/produtos/:id/preco` — área `editarProdutos`; 400 `{ message, campo }`; 409
  `sem_preco` ou `precos_diferentes`; registro "mudou-preco" (de, para) e "mudou-promocao" (de,
  por, antes). Depois de gravar, a rota relê o produto: o preço da variação mudou.
- **Na tela** (`components/produto/campos-de-preco.tsx`): Enter ou sair do campo salva; o Esc
  volta e NÃO salva — a saída do campo ainda enxerga o texto digitado, então o Esc marca a
  desistência antes (`desistiu`). O campo fica só leitura enquanto salva (desligado, perderia o
  foco).
- **A linha da tabela é um link esticado** (`.tabela__link::after`, `inset: 0`, com a `tr` em
  `position: relative`): o que for clicável dentro dela precisa de `position: relative; z-index: 1`,
  senão o clique vai pro link. Era o que escondia o botão do WhatsApp na linha de quem voltou, nos
  carrinhos — lá o link do pedido virou `link` comum.

O conferidor é o `apps/dashboard/ferramentas/conferir-promocao.mjs` (17). Ele usa a "Promoção de
lançamento" do banco local pra conferir que o painel manda no de/por, e no fim devolve tudo (o
preço, a marca, a promoção antiga) e espera o job refazer "2 unidades": os outros conferidores
contam com esses preços.

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
