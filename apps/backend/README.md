# Backend — Medusa v2

O motor da loja: carrinho, pedidos, estoque, cupons, clientes e o painel admin.
Roda no Railway em dois serviços a partir deste mesmo código:

| Serviço         | `WORKER_MODE` | `ADMIN_DISABLED` | Faz                                                                        |
| --------------- | ------------- | ---------------- | -------------------------------------------------------------------------- |
| `medusa-server` | `server`      | `false`          | API REST em `/store` e `/admin`, admin em `/app`, healthcheck em `/health` |
| `medusa-worker` | `worker`      | `true`           | subscribers, jobs agendados e workflows (fila no Redis)                    |

Só o **server** roda as migrações (pré-deploy). Suba ele primeiro; o worker depois.

## Rodar local

```bash
# na raiz do repositório
docker compose up -d            # Postgres 16 + Redis 7
cp apps/backend/.env.example apps/backend/.env
npm install
npm run backend:migrate         # cria as tabelas e os dados iniciais (BRL, região Brasil, categorias)
npm run backend:user -- --email voce@exemplo.com --password troque-isso
npm run backend:dev             # http://localhost:9000 · admin em http://localhost:9000/app
```

A chave publicável da loja aparece no log do `backend:migrate` (`[seed] pronto. Chave publicável…`) e
também em Admin → Settings → Publishable API Keys. Ela vai no `.env` do Next.js.

## O que está aqui além do padrão

- `medusa-config.ts` — server/worker por variável, Redis pra cache, eventos, workflows e locks,
  Postgres do Supabase com SSL, imagens no Supabase Storage (S3).
- `src/migration-scripts/dados-iniciais.ts` — loja em BRL, região Brasil, canal "Loja online", chave
  publicável, estoque, zona de entrega e as categorias `barba`, `cabelo`, `kits`. Sem produto de exemplo.
- `src/scripts/produtos-iniciais.ts` — cinco produtos **reais** da loja atual, com foto, preço e um
  trecho da descrição, pra vitrine e PDP terem contra o que ser desenhadas. Não é a migração do
  catálogo (isso é a fase 2). Roda quantas vezes quiser: handle que já existe é pulado.
- `src/api/middlewares.ts` — todo `handle` (slug) de produto e categoria é validado e gerado sem acento:
  é o que vira a URL `/produtos/oleo-para-barba`.
- `src/subscribers/pagamento-capturado.ts` — o ponto onde a fase 5 liga NF-e, e-mail e conversões.
- `railway.server.json` / `railway.worker.json` — build, start, healthcheck e migração de cada serviço.

## Comandos

```bash
npm run dev          # medusa develop (hot reload)
npm run build        # gera .medusa/server (é o que o Railway roda)
npm run typecheck    # tsc sem emitir
npm run lint
npm run db:migrate   # migrações + migration-scripts pendentes
npm run user -- --email x --password y
```

## Os scripts de dados

Todos são idempotentes — o que já existe é pulado — e todos começam dizendo **em que banco estão
escrevendo** (`src/scripts/onde-estou.ts`), porque `medusa exec` obedece ao `DATABASE_URL` que
estiver no ambiente e não pergunta se você queria mesmo mexer em produção.

| Comando                | O que faz                                                                      |
| ---------------------- | ------------------------------------------------------------------------------ |
| `npm run produtos`     | os cinco produtos reais da loja atual, com foto, preço e descrição              |
| `npm run kits`         | os kits de 2 e 3 unidades do fator de crescimento                              |
| `npm run fotos`        | varre o catálogo inteiro e remove as fotos reprovadas, por URL                  |
| `npm run frete`        | conjunto de entrega, zona Brasil e as opções de frete com o piso do frete grátis |

Da raiz, os mesmos com o prefixo `backend:` (`npm run backend:frete`).

No Railway eles rodam a partir do build, pelo shell do `medusa-server` — repare no `.js`, e que o
shell abre em `/app`, a raiz do monorepo:

```bash
cd apps/backend/.medusa/server && npx medusa exec ./src/scripts/produtos-iniciais.js
```

O `produtos` exige `S3_BUCKET` configurado quando `NODE_ENV=production` — sem isso as fotos iriam
pro disco do container e sumiriam no deploy seguinte, com os produtos ainda apontando pra elas.

O `frete` se recusa a rodar em banco remoto enquanto `CONFERIDO` for `false` no topo do arquivo: os
valores que vêm no repositório são de exemplo, e preço de frete chutado em produção é prejuízo seu
ou reclamação do cliente.

### Conferir o pedido inteiro

```bash
node ferramentas/conferir-pedido.mjs    # precisa do Medusa de pé
```

Vai do carrinho vazio ao pedido fechado pela API da loja — as mesmas chamadas que o checkout faz,
na mesma ordem. Duas coisas que ele existe pra travar:

- **`metadata` de CARRINHO é descartado no `complete`**: o pedido nasce com `metadata: null`. O de
  ENDEREÇO sobrevive. É por isso que o CPF/CNPJ mora no endereço de cobrança, e não no carrinho.
- **A mensagem de erro do `complete` é sempre sobre pagamento**, mesmo faltando e-mail, endereço
  ou frete — ele confere o pagamento primeiro e desiste ali. Ou seja, ela não serve pra dizer à
  pessoa o que falta; quem sabe em que etapa a compra está é o checkout.

### Conferir o frete

```bash
node ferramentas/conferir-frete.mjs     # precisa do Medusa de pé
```

Monta carrinhos de verdade pela API da loja e confere que as opções aparecem, que cobram o valor
cadastrado abaixo do piso e que **a mesma opção** vai a zero a partir dele. O frete grátis aqui não
é promoção: é um segundo preço da opção, com regra em `item_total` — o único atributo que o Medusa
aceita nessa regra. Promoção funcionaria, e apareceria como desconto numa linha separada, deixando
o cliente fazer a conta de quanto vai pagar de frete.

O piso mora em dois lugares e os dois precisam bater: `FRETE_GRATIS_A_PARTIR_DE` em
`apps/loja/src/lib/site.ts` (o que a loja promete) e `FRETE_GRATIS_A_PARTIR_DE` em
`src/scripts/frete.ts` (o que o checkout cobra).

Documentação: https://docs.medusajs.com
