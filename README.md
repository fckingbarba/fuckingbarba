# FuckingBarba — loja própria

Monorepo da loja nova: **Next.js 16** na Vercel (vitrine e checkout), **Medusa v2** no Railway (motor
de commerce, em dois processos) e **Supabase** (Postgres, imagens e Edge Functions). Sai da Nuvemshop em
sete fases; este repositório entrega a **Fase 1 — Fundação**.

> A arquitetura completa, com o porquê de cada escolha, está no doc
> [Arquitetura da loja própria FuckingBarba](https://claude.ai/code/artifact/4b9ac1b3-5744-4c1e-b68c-6b13ad0675ab).

```
fuckingbarba/
├── apps/
│   ├── loja/        Next.js 16 · Vercel            → apps/loja/README.md
│   └── backend/     Medusa v2 · Railway (server + worker) → apps/backend/README.md
├── supabase/        schema `loja` + Edge Functions → supabase/README.md
├── .github/workflows/   CI: loja · backend · supabase
├── docker-compose.yml   Postgres 16 + Redis 7 pra desenvolvimento
└── turbo.json           tarefas (dev, build, lint, typecheck) nos dois apps
```

## Rodar tudo local em 5 minutos

```bash
docker compose up -d                                  # Postgres + Redis
npm install
cp apps/backend/.env.example apps/backend/.env
cp apps/loja/.env.example apps/loja/.env.local

npm run backend:migrate                               # tabelas + dados iniciais (BRL, Brasil, categorias)
#   → copie a "Chave publicável" que aparece no log pra NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY em apps/loja/.env.local
npm run backend:user -- --email voce@exemplo.com --password troque-isso

npm run dev                                           # Medusa em :9000 (admin em /app) e loja em :3000
```

## Ordem de deploy (Fase 1)

Faça na ordem; cada passo entrega o que o próximo precisa. Tudo abaixo é grátis pra começar, exceto o
Supabase Pro (recomendado desde o dia 1 pelo backup diário) e o Railway (paga o que usar).

### 1. GitHub

Suba este repositório. Dois ramos: `main` (produção) e `staging`. Pull request roda o CI; merge em
`staging` publica staging; merge `staging → main` é a "promoção" pra produção.

> ### Uma regra antes de criar qualquer conta: região
>
> **Medusa e Postgres ficam na mesma região, sempre.** Uma requisição do Medusa dispara dezenas de
> queries SQL; com servidor e banco em continentes diferentes, cada `add to cart` vira segundos. Isso
> não é ajuste fino, é a diferença entre funcionar e não funcionar.
>
> O Railway só tem quatro regiões — Califórnia, Virgínia, Amsterdã e Singapura — e nenhuma na América
> do Sul. Então tudo que é dinâmico mora no **norte da Virgínia**: Supabase `us-east-1`, Railway
> `US East`, e as funções da Vercel no padrão `iad1` (já fixado em `apps/loja/vercel.json`). Os três
> ficam na mesma região metropolitana, a milissegundos um do outro.
>
> O que o usuário brasileiro sente: **nada na vitrine**, que é servida do cache no PoP de São Paulo —
> é ali que moram o SEO e o Core Web Vitals. O custo cai só no dinâmico: carrinho e checkout pagam uma
> travessia de ~120 ms, e as APIs brasileiras que o Medusa chama (Frenet, Pagar.me, Bling) ganham
> +120 ms cada — a cotação de frete é a que mais dói, porque está no caminho do checkout.
>
> Isso foi escolhido pra ser **medido, não adivinhado**: a Edge Function `vitals` e os eventos de
> funil do checkout dizem, com um mês de dados reais, se essa latência custa conversão. Se custar, o
> caminho é mover o backend pra São Paulo (Fly.io `gru` ou Cloud Run `southamerica-east1`) com a
> Supabase em `sa-east-1` — migra o backend, não a arquitetura.

### 2. Supabase

1. Novo projeto na região **East US (North Virginia)** — `us-east-1`, pelo motivo acima, não São
   Paulo. Guarde a senha do banco.
2. **Project Settings → Database → Connection string → Session pooler** (porta **5432**). É essa URL
   que vai no Railway, com `?ssl_mode=disable` no fim (ver `apps/backend/.env.example`).
   O modo transação (6543) não funciona com o Medusa.
3. **Storage → New bucket** `produtos`, público. **Settings → S3 → New access key**: anote
   `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, o endpoint e a região.
4. Schema próprio e Edge Functions: siga `supabase/README.md` (`supabase db push`, `functions deploy`).

### 3. Railway

Um projeto, três serviços, todos apontando pro **mesmo repositório com Root Directory na raiz** (é um
monorepo npm: o `package-lock.json` fica na raiz). Em cada serviço, Settings → Deploy → **Region:
`US East (Virginia)`** — a mesma da Supabase.

| Serviço         | Config-as-code (Settings → Config-as-code → caminho) | Variáveis próprias                           |
| --------------- | ---------------------------------------------------- | -------------------------------------------- |
| `Redis`         | plugin do Railway                                    | —                                            |
| `medusa-server` | `apps/backend/railway.server.json`                   | `WORKER_MODE=server`, `ADMIN_DISABLED=false` |
| `medusa-worker` | `apps/backend/railway.worker.json`                   | `WORKER_MODE=worker`, `ADMIN_DISABLED=true`  |

Variáveis comuns aos dois serviços Medusa (copie de `apps/backend/.env.example`): `DATABASE_URL`
(pooler sessão), `DATABASE_SSL=true`, `REDIS_URL=${{Redis.REDIS_URL}}`, `STORE_CORS`, `ADMIN_CORS`,
`AUTH_CORS`, `JWT_SECRET`, `COOKIE_SECRET`, `MEDUSA_BACKEND_URL`, `S3_*`, `NODE_ENV=production`.

- Suba o **server primeiro**: o pré-deploy dele roda `medusa db:migrate` (tabelas + dados iniciais).
  O worker sobe depois e não migra nada.
- Domínio: `api.SEUDOMINIO.com.br` no `medusa-server` (Settings → Networking). O admin fica em
  `https://api.SEUDOMINIO.com.br/app`.
- Primeiro usuário do admin: Settings → Deployments → shell do `medusa-server`, ou localmente apontando
  `DATABASE_URL` pro Supabase: `cd apps/backend && npx medusa user --email … --password …`.
- A chave publicável da loja: Admin → Settings → Publishable API Keys.
- Cinco produtos pra loja não nascer vazia (opcional, e só depois das variáveis `S3_*`): no shell do
  `medusa-server`, `cd apps/backend/.medusa/server && npx medusa exec ./src/scripts/produtos-iniciais.js`.
  São produtos reais da loja atual, com foto e preço; a migração do catálogo inteiro é a fase 2.

### 4. Vercel

1. **Add New → Project** a partir do repositório. **Root Directory: `apps/loja`**. Framework: Next.js
   (detectado). Instalação e build vêm da raiz do monorepo automaticamente.
2. Variáveis (copie de `apps/loja/.env.example`) em _Production_ e _Preview_: `NEXT_PUBLIC_SITE_URL`,
   `MEDUSA_BACKEND_URL`, `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_REF`,
   `REVALIDAR_SEGREDO`, `NEXT_PUBLIC_LOJA_ATUAL_URL` e, quando quiser medir, `NEXT_PUBLIC_GA4_ID`.
3. Região das funções: **não mexa**. O `apps/loja/vercel.json` fixa `iad1`, que é a mesma região do
   Railway e da Supabase. Trocar pra `gru1` (São Paulo) parece melhor e é pior: afasta a função do
   banco, que é o que ela mais espera.
4. Ramo de produção: `main`. Em **Domains**, deixe o domínio final cadastrado mas **não aponte o DNS
   ainda** — isso é a Fase 6. Até lá a loja nova vive em `SEUPROJETO.vercel.app` e **não indexa**:
   o robots bloqueia tudo e o proxy manda `X-Robots-Tag: noindex` enquanto `SITE_INDEXAVEL` não
   existir. Ligar a indexação é um passo manual da virada, não algo que acontece por deployar.
   Defina também `NEXT_PUBLIC_SITE_URL` com o endereço real do site, senão canonical, sitemap e
   Open Graph saem apontando pra `localhost`.
5. Adicione `https://SEUPROJETO.vercel.app` (e o domínio final) em `STORE_CORS` e `AUTH_CORS` no Railway.

### 5. Cloudflare

Só o DNS por enquanto: mova os nameservers do domínio pra Cloudflare (sem mexer nos registros que
apontam pra Nuvemshop). Crie o `api` (CNAME pro Railway) e o `admin` (redirect rule pra
`api.SEUDOMINIO.com.br/app`, opcional). O `www` continua na Nuvemshop até a virada.

### Critério de pronto da Fase 1

- [ ] `https://api.SEUDOMINIO.com.br/health` responde `OK` e `/app` abre com login
- [ ] `https://SEUPROJETO.vercel.app/barba` mostra a categoria vinda do Medusa (vazia, por enquanto)
- [ ] Merge em `staging` e em `main` faz deploy sozinho nos três lugares
- [ ] CI verde nos três workflows
- [ ] Lighthouse móvel ≥ 90 em performance (o CI já exige; a fase 1 saiu com 100/100/100/100)

## Comandos na raiz

```bash
npm run dev            # os dois apps
npm run build          # os dois apps (turbo)
npm run typecheck      # tsc nos dois
npm run lint
npm run backend:dev    # só Medusa   ·  npm run loja:dev  só a loja
npm run backend:migrate
npm run backend:user -- --email x --password y
```

## O que vem depois

| Fase          | Entrega                                                                                        | Onde encostar                                                              |
| ------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 2. Catálogo   | Nuvemshop → Medusa: produtos, variações, fotos, medidas, slugs congelados e pedidos antigos    | script de importação em `apps/backend/src/scripts/`                        |
| 3. Vitrine    | Home, PDP, categoria, busca, blog, institucionais — o protótipo HTML vira componentes          | `apps/loja/src/app`, `components/`                                         |
| 4. Checkout   | Gaveta + 3 passos ligados ao Medusa; Pagar.me em sandbox; webhook pela Edge Function           | `apps/backend/src/modules/pagarme`, `supabase/functions/webhook-pagamento` |
| 5. Operação   | Bling (NF-e), Frenet (+ Melhor Envio reserva), e-mails de pedido (Resend), carrinho abandonado | subscribers/jobs do worker                                                 |
| 6. Virada     | Mapa de 301 completo, a última importação de pedidos da Nuvemshop, DNS                         | `apps/loja/src/redirects.json`, Cloudflare                                 |
| 7. Pós-virada | 30 dias de vigilância: 404, Web Vitals, conversão, webhooks                                    | Search Console, `loja.web_vitals_p75`                                      |
