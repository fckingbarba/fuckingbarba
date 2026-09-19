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
| `src/app/layout.tsx`                  | A carcaça de toda página: esteira, cabeçalho, rodapé, Inter local, metadata base, tags           |
| `src/components/layout/`              | `Anuncio`, `Cabecalho` (menu lateral e busca), `Rodape`, `Newsletter`, `ForaDaTela`              |
| `src/components/icones.tsx`           | Os SVGs do protótipo, inline; quem nomeia é o `aria-label` de quem os contém                     |
| `src/estilos/`                        | O CSS do protótipo por componente — ver "Por que o CSS não virou Tailwind" abaixo                |
| `src/app/page.tsx`                    | Home provisória: só o miolo, que a fase 3 troca pelas seções do protótipo                        |
| `src/app/[categoria]/page.tsx`        | `/barba`, `/cabelo`, `/kits` lendo categoria e produtos do Medusa                                |
| `src/app/produtos/[handle]/page.tsx`  | `/produtos/<handle>` lendo o produto do Medusa (esqueleto da PDP)                                |
| `src/app/em-breve/page.tsx`           | Destino honesto dos links cujas páginas ainda não existem (blog, conta, busca)                   |
| `src/app/(institucional)/`            | `/privacidade` e `/trocas` — texto provisório, marcado                                           |
| `src/app/robots.ts` · `sitemap.ts`    | Bloqueia tudo até `SITE_INDEXAVEL=true`; sitemap gerado do Medusa                                |
| `src/app/api/revalidar/route.ts`      | O Medusa avisa que algo mudou → a tag do cache cai (`revalidateTag(tag, "max")`)                 |
| `src/proxy.ts` + `src/redirects.json` | 301 da Nuvemshop, 301 pra minúsculo, 404 real no primeiro nível, `noindex` fora de produção      |
| `src/lib/site.ts`                     | Identidade, contato e o mapa de links que cabeçalho, menu e rodapé leem                          |
| `src/lib/medusa.ts`                   | Único ponto de contato com o Medusa; toda leitura é `use cache` com tag                          |
| `src/lib/rastrear.ts`                 | Única porta de saída de eventos (dataLayer no formato GA4)                                       |
| `src/components/analytics/`           | Consent Mode v2 (tudo negado até aceitar) + GA4 + faixa de consentimento LGPD                    |
| `src/app/globals.css`                 | Tokens da marca em `@theme` (Tailwind v4): `bg-menta`, `text-tinta`, `chanfro`, `faixa-perigo`…  |
| `lighthouserc.json` + `budgets.json`  | As metas que o CI defende: ver "O que o Lighthouse CI cobra" abaixo                              |

## Por que o CSS não virou Tailwind

O protótipo HTML já estava desenhado e aprovado: seiscentas regras de chanfro em `clip-path`,
sombra dura deslocada e `clamp()` calibrados um a um. Traduzir isso pra classes utilitárias seria
refazer de cabeça um desenho pronto, e a chance de errar um detalhe é alta — errar em silêncio,
que é pior. Então o CSS foi **portado como está**, um arquivo por componente em `src/estilos/`,
importado no `globals.css`. O React entra pra estrutura e comportamento; o Tailwind continua
valendo pro que é novo (as páginas de texto, `/em-breve`, a home provisória).

Duas coisas mudaram na travessia, e as duas estão comentadas no CSS:

1. **Entrelinha.** O protótipo não tinha regra nenhuma em `body` e herdava `line-height: normal`
   do navegador; o preflight do Tailwind põe `1.5` na raiz. A diferença engorda todo bloco que não
   declara a própria entrelinha — 4,7px na esteira de avisos, 30px nas colunas do rodapé. Cada
   raiz de seção portada devolve `line-height: normal`.
2. **O link da política no rodapé ganhou sublinhado.** No protótipo ele se distingue do texto ao
   redor só pela cor, e a diferença entre as duas não chega a 3:1 — falha de WCAG 1.4.1. Quem pegou
   foi o Lighthouse do CI, que exige acessibilidade 100.

Fora isso, cabeçalho, esteira e rodapé batem com o protótipo **nó por nó**: mesma árvore, mesma
caixa, mesma cor. O protótipo e as ferramentas que fatiam o CSS dele e conferem o resultado estão
em `ferramentas/porte/` — é por ali que cada próxima seção passa.

## Decisões que valem saber

- **Cache Components ligado** (`cacheComponents: true`). Dados vêm de funções `"use cache"` com
  `cacheTag`; a página é servida pré-renderizada e só o que depende de request faz stream.
- **404 de verdade é no proxy.** Com Cache Components a rota dinâmica manda o shell com 200 antes
  de saber se o conteúdo existe; por isso `/qualquer-coisa` é reescrito no proxy pra
  `/nao-encontrado` (rota estática, status 404). Produto inexistente sai como not-found com
  `noindex` (soft 404) até a fase 3, quando o proxy passa a conferir o handle contra a lista do build.
- **Sem Google Tag Manager na largada.** O `dataLayer` já existe; se precisar, é trocar o componente.
- **O Lighthouse CI cobra o que a gente decidiu, não tudo que o Lighthouse sabe.** São nove
  asserções: as quatro notas de categoria (performance ≥ 90, acessibilidade 100, SEO 100, boas
  práticas ≥ 90), LCP ≤ 2,5 s, CLS ≤ 0,05, TBT ≤ 300 ms e os orçamentos de bytes (script ≤ 250 KB,
  terceiros ≤ 150 KB). Sem preset. A tentação é ligar o `lighthouse:no-pwa`, que reprova em cima de
  cada auditoria individual — mas metade delas mede coisa que não controlamos (polyfill que o
  próprio Next empacota) ou artefato de testar contra `localhost` (sem HTTP/2, sem CDN, sem cache
  de verdade). CI que fica vermelho por isso é CI que todo mundo aprende a ignorar. As notas de
  categoria já agregam essas auditorias: se o peso ficar ruim de verdade, a performance cai abaixo
  de 90 e quebra do mesmo jeito.
- **13 KiB de polyfill do Next entram de propósito.** A auditoria "Legacy JavaScript" acusa um
  `Array.prototype.at` empacotado pelo Next. Dava pra eliminar subindo o alvo do browserslist, mas
  isso quebra o checkout pra quem está num Safari antigo — troca ruim numa loja. Fica o custo.
- **O LCP do CI é 3 s, e não os 2,5 s do Google, de propósito.** O número que o Lighthouse mostra é
  simulado: ele pega o que mediu (501 ms de LCP observado em `/barba`, com as fotos de produto) e
  recalcula como seria num 4G de 1,5 Mbps com 150 ms de latência e um celular quatro vezes mais
  lento — contra `localhost`, sem HTTP/2, sem CDN e sem Brotli, que é justamente o que a Vercel dá
  de graça em produção. Com as fotos reais na grade, essa simulação passou a dar entre 2,49 s e
  2,63 s **na mesma configuração, rodada atrás de rodada**. Um limite de 2,5 s ali dentro não mede
  regressão: sorteia. E CI que sorteia é CI que todo mundo aprende a ignorar — o mesmo raciocínio
  que fez o preset cair. A 3 s ele continua pegando o que importa (foto de herói sem otimizar,
  script bloqueando o render, fonte nova na frente do conteúdo), que empurra o LCP bem além disso.
  Quem diz a verdade sobre o cliente é a Edge Function `vitals`, com P75 de gente real.
  Duas tentativas de baixar o número de verdade ficaram pelo caminho, e valem como registro:
  `priority` nas quatro primeiras fotos da grade (ficou — é certo por si só, mas mexeu pouco no
  LCP, porque a foto já chegava em 51 ms) e tirar o preload da Inter (foi revertido: economizou uns
  50 ms de LCP, no ruído, e em troca levou o FCP de 790 ms pra 1,2 s e o CLS de 0 pra 0,019).
- **O TBT ≤ 300 ms aqui é tripwire, não a meta.** A meta real é 200 ms no P75 de usuário de verdade,
  e quem mede isso é a Edge Function `vitals` (tabela `loja.web_vitals`, view `web_vitals_p75`). O
  runner do GitHub é mais lento que celular bom e mais rápido que celular ruim; serve pra pegar
  regressão, não pra dizer a verdade sobre o cliente.
- **As funções rodam em `iad1` (Virgínia), fixado em `vercel.json`.** Parece errado pra uma loja
  brasileira e não é: a função passa a vida esperando o Medusa, que está no Railway US East com o
  Postgres da Supabase ao lado. Aproximá-la do usuário (`gru1`) a afastaria do banco, que é o que ela
  mais espera. A vitrine, que é o que o usuário realmente carrega, sai do cache no PoP de São Paulo e
  não depende disso. O raciocínio completo está no README da raiz.
- **Indexar é opt-in explícito (`SITE_INDEXAVEL=true`), não consequência de deployar.** Enquanto a
  variável não existir, o `robots.ts` bloqueia tudo e o proxy manda `X-Robots-Tag: noindex`. Isso
  não é excesso de zelo: a primeira versão ligava indexação em `VERCEL_ENV === "production"`, e o
  primeiro deploy real subiu com `Allow: /` numa loja em construção hospedada em `.vercel.app`,
  com a loja de verdade ainda na Nuvemshop. Deploy de produção não quer dizer pronto pro público.
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
