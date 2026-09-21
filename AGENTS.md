# AGENTS.md

Guia pra quem (pessoa ou agente) for mexer neste repositório. O contexto de produto e as decisões de
arquitetura estão no README e no doc de arquitetura linkado lá; aqui é o operacional.

## Estrutura

```
apps/loja/       Next.js 16 (App Router, Cache Components, Tailwind v4) — Vercel
apps/backend/    Medusa v2 — Railway em dois processos (server e worker), mesmo código
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
tela com o que a API do Medusa responde — nunca com outra conta feita no próprio teste. São sete:
frete, pdp, checkout, catálogo, links, configurações e documento. Rode os que tocam no que você mexeu,
e todos antes de entregar. Os que escrevem no admin desfazem o que mudaram no fim, mesmo quando falham.

```bash
# o de frete sobe uma Frenet falsa na porta 4310; o backend precisa apontar pra ela
FRENET_URL=http://127.0.0.1:4310/shipping/quote FRENET_TOKEN=teste npm run backend:dev
npm run loja:dev
cd apps/loja && export $(grep -E '^(MEDUSA_BACKEND_URL|NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY)=' .env.development.local | xargs)
ADMIN_EMAIL=<admin local> ADMIN_SENHA=<senha local> node ferramentas/conferir-frete.mjs
```

O admin é um usuário do banco LOCAL (`npm run backend:user`). `CHROMIUM=<caminho>` quando o
Playwright não achar o navegador. Layout de componente interativo se confere com foto, não com
asserção — `ferramentas/retrato-calculadora.mjs` é o modelo, e roda contra `next build` +
`next start`.

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

## Fora dos limites

- `apps/backend/.medusa/`, `apps/loja/.next/`, `node_modules/` — gerados.
- **CSS que começa com "Gerado por …"** em `apps/loja/src/estilos/` (quase todo `pdp*.css` e
  `checkout*.css`). Sai de `ferramentas/porte/pdp-partes/agrupa-pdp.py` (fonte: `estilo.css` da mesma
  pasta) e de `ferramentas/porte/checkout-partes/agrupa-checkout.py` (fonte:
  `prototipo-checkout.html`). Edite a fonte e rode o script — o que se escreve no gerado some na
  próxima rodada. Arquivo sem o cabeçalho é escrito à mão e se edita direto.
- Schema `public` do Supabase — do Medusa; migra pelo `medusa db:migrate`, nunca por SQL manual.
- `redirects.json` — só cresce; nunca remova uma linha (é o que preserva o Google).
