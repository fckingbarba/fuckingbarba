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
npm run produtos     # os cinco produtos iniciais (idempotente)
```

No Railway, o mesmo script roda a partir do build, pelo shell do `medusa-server`:

```bash
cd apps/backend/.medusa/server && npx medusa exec ./src/scripts/produtos-iniciais.js
```

Ele exige `S3_BUCKET` configurado quando `NODE_ENV=production` — sem isso as fotos iriam pro disco
do container e sumiriam no deploy seguinte, com os produtos ainda apontando pra elas.

Documentação: https://docs.medusajs.com
