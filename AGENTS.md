# AGENTS.md

Guia pra quem (pessoa ou agente) for mexer neste repositório. O contexto de produto e as decisões de
arquitetura estão no README e no doc de arquitetura linkado lá; aqui é o operacional. **Onde o projeto
está e o que vem a seguir: [ESTADO.md](./ESTADO.md)** — leia antes de começar, atualize ao terminar.

## Estrutura

```
apps/loja/       Next.js 16 (App Router, Cache Components, Tailwind v4) — Vercel
apps/backend/    Medusa v2 — Railway; feito pra server + worker, hoje um serviço só (ver ESTADO.md)
supabase/        migrations do schema `loja` (nunca `public`) e Edge Functions (Deno)
.github/         um workflow por área, disparado por caminho
```

Os dois apps são workspaces npm da raiz (`apps/*`). O lockfile é o da raiz. Não crie outro.

## Comandos

```bash
npm install                    # sempre na raiz
npm run dev | build | lint | typecheck        # turbo, nos dois apps
npm run backend:dev | backend:migrate | backend:user -- --email x --password y
npm run loja:dev
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
tela com o que a API do Medusa responde — nunca com outra conta feita no próprio teste. São dez:
frete, pdp, checkout, pagamento, catálogo, links, configurações, documento, conta e envio. Rode os que
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
"Correios PAC" fixo e não sobem a falsa) — os que valem são os dez da loja.

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
O pedido nasce no Pagar.me no `authorizePayment`, no fim do fechamento do carrinho: cartão aprovado
fecha pago, Pix fecha aguardando, cartão recusado desfaz o pedido. O Pix pago chega pelo webhook
(Pagar.me → Edge Function `webhook-pagamento` → `/hooks/payment/pagarme_pagarme`, que exige o
`x-webhook-segredo` e relê o pedido na API antes de acreditar); o que o webhook não resolve — Pix
vencido, aviso perdido, cobrança que sumiu no caminho — a conciliação resolve a cada 5 minutos no
worker (`src/lib/conciliar-pagamentos.ts`, e `POST /admin/pagamentos/conciliar` pra rodar na hora).
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

A **sacola** grava CEP e entrega no carrinho (`apps/loja/src/lib/acoes/frete.ts`), e o pé da
gaveta mostra o frete e o total que o Medusa calculou com ela — o checkout abre com os dois. Com
entrega pendurada, toda mudança de quantidade faz o Medusa cotar de novo; o `cotar` do
`client.ts` junta perguntas iguais do MESMO carrinho por 10 s, e é por isso que a rota
`/store/frete` recebe `cart_id` quando quem pergunta é a sacola.

## Fora dos limites

- `apps/backend/.medusa/`, `apps/loja/.next/`, `node_modules/` — gerados.
- **CSS que começa com "Gerado por …"** em `apps/loja/src/estilos/` (quase todo `pdp*.css` e
  `checkout*.css`). Sai de `ferramentas/porte/pdp-partes/agrupa-pdp.py` (fonte: `estilo.css` da mesma
  pasta) e de `ferramentas/porte/checkout-partes/agrupa-checkout.py` (fonte:
  `prototipo-checkout.html`). Edite a fonte e rode o script — o que se escreve no gerado some na
  próxima rodada. Arquivo sem o cabeçalho é escrito à mão e se edita direto.
- Schema `public` do Supabase — do Medusa; migra pelo `medusa db:migrate`, nunca por SQL manual.
- `redirects.json` — só cresce; nunca remova uma linha (é o que preserva o Google).
