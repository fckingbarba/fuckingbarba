# Loja — Next.js 16

A vitrine e o checkout da FuckingBarba. Roda na Vercel, lê tudo do Medusa (Railway) pela
API de loja e serve HTML pronto do CDN.

## Rodar local

```bash
# na raiz do repositório, com o Medusa já de pé (ver apps/backend/README.md)
cp apps/loja/.env.example apps/loja/.env.local   # e cole a chave publicável
npm run loja:dev                                 # http://localhost:3000
```

## O que está aqui (fase 1)

| Caminho                               | O que faz                                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/app/layout.tsx`                  | `lang="pt-BR"`, Inter servida do próprio domínio, metadata base, link "pular pro conteúdo", tags |
| `src/app/page.tsx`                    | Página "loja nova em construção" com a cara da marca (a home real entra na fase 3)               |
| `src/app/[categoria]/page.tsx`        | `/barba`, `/cabelo`, `/kits` lendo categoria e produtos do Medusa                                |
| `src/app/produtos/[handle]/page.tsx`  | `/produtos/<handle>` lendo o produto do Medusa (esqueleto da PDP)                                |
| `src/app/(institucional)/`            | `/privacidade` e `/trocas` — texto provisório, marcado                                           |
| `src/app/robots.ts` · `sitemap.ts`    | Bloqueia tudo fora de produção; sitemap gerado do Medusa                                         |
| `src/app/api/revalidar/route.ts`      | O Medusa avisa que algo mudou → a tag do cache cai (`revalidateTag(tag, "max")`)                 |
| `src/proxy.ts` + `src/redirects.json` | 301 da Nuvemshop, 301 pra minúsculo, 404 real no primeiro nível, `noindex` fora de produção      |
| `src/lib/medusa.ts`                   | Único ponto de contato com o Medusa; toda leitura é `use cache` com tag                          |
| `src/lib/rastrear.ts`                 | Única porta de saída de eventos (dataLayer no formato GA4)                                       |
| `src/components/analytics/`           | Consent Mode v2 (tudo negado até aceitar) + GA4 + faixa de consentimento LGPD                    |
| `src/app/globals.css`                 | Tokens da marca em `@theme` (Tailwind v4): `bg-menta`, `text-tinta`, `chanfro`, `faixa-perigo`…  |
| `lighthouserc.json` + `budgets.json`  | Metas: performance ≥ 90, SEO 100, LCP ≤ 2,5 s, CLS ≤ 0,05, terceiros ≤ 150 KB                    |

## Decisões que valem saber

- **Cache Components ligado** (`cacheComponents: true`). Dados vêm de funções `"use cache"` com
  `cacheTag`; a página é servida pré-renderizada e só o que depende de request faz stream.
- **404 de verdade é no proxy.** Com Cache Components a rota dinâmica manda o shell com 200 antes
  de saber se o conteúdo existe; por isso `/qualquer-coisa` é reescrito no proxy pra
  `/nao-encontrado` (rota estática, status 404). Produto inexistente sai como not-found com
  `noindex` (soft 404) até a fase 3, quando o proxy passa a conferir o handle contra a lista do build.
- **Sem Google Tag Manager na largada.** O `dataLayer` já existe; se precisar, é trocar o componente.
- **URLs em português e minúsculas, para sempre.** `/produtos/<handle>` e `/<categoria>` — o Medusa
  só guarda o handle (validado no admin), o caminho é desta app.

## Comandos

```bash
npm run dev          # next dev
npm run build        # next build (Turbopack)
npm run start
npm run typecheck    # next typegen + tsc
npm run lint
npm run lhci         # Lighthouse CI local (precisa de Chrome)
```
