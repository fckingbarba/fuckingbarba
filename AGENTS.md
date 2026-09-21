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
tela com o que a API do Medusa responde — nunca com outra conta feita no próprio teste. São oito:
frete, pdp, checkout, pagamento, catálogo, links, configurações e documento. Rode os que tocam no que
você mexeu, e todos antes de entregar. Os que escrevem no admin desfazem o que mudaram no fim, mesmo
quando falham.

```bash
# frete, checkout e pagamento sobem uma Frenet falsa (4310) e um Pagar.me falso (4320);
# o backend precisa apontar pros dois
FRENET_URL=http://127.0.0.1:4310/shipping/quote FRENET_TOKEN=teste \
PAGARME_SECRET_KEY=sk_test_falsa PAGARME_URL=http://127.0.0.1:4320/core/v5 \
MEDUSA_WEBHOOK_SEGREDO=segredo-de-teste npm run backend:dev
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
"Correios PAC" fixo e não sobem a falsa) — os que valem são os oito da loja.

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
- **Toda leitura do Medusa no front é `"use cache"` com `cacheTag`** (`apps/loja/src/lib/medusa.ts`).
  Invalidação por `POST /api/revalidar`.
- **Página é dado, não JSX.** Quais seções uma página monta, e em que ordem, vem do registro
  (`apps/loja/src/lib/secoes/registro.ts`); a rota só escreve `<Secoes escopo="..." />`. A ordem do
  array é a ordem padrão — não existe segunda lista, e o banco guardará só a diferença
  (`lib/secoes/layout.ts`). Seção nova se declara lá, com `id` estável (é chave de banco), `nome` e
  `descricao` (é o que uma pessoa lê no painel) e `fixo: true` quando não pode ser desligada.
- **404 real no primeiro nível é no proxy** (`apps/loja/src/proxy.ts`); com Cache Components, rota
  dinâmica manda o shell com 200. Ao criar uma página nova de primeiro nível, adicione o segmento em
  `PAGINAS_RAIZ` do proxy.
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
cancela o Pix (o QR morre) e estorna o que tiver sido pago sem o Medusa saber. (3) A cobrança cuja
sessão sumiu (tentou de novo depois de uma resposta perdida) não aparece em lugar nenhum da loja: a
conciliação lista os pedidos do Pagar.me das últimas 48 horas e fecha os que não têm mais sessão. É
por isso que o `deletePayment` do provedor não mexe no Pagar.me — o `data` que ele recebe pode ser o
corpo cru da API pública. Os pedidos levam `metadata.origem` (hash do usuário, host e banco da
`DATABASE_URL`, nunca a senha), e a conciliação só fecha órfão da própria origem: duas instalações
na mesma chave de teste não estornam as compras uma da outra. Ainda assim, uma chave por ambiente —
a de produção só no Railway. Na loja, carrinho que fechou sem a confirmação chegar ao navegador
volta pro pedido pelo `/checkout/retomar`, em vez de mostrar "sacola vazia".

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
