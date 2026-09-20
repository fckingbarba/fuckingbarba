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

## O checkout

Três passos numa URL só — contato, entrega (com o frete dentro) e pagamento —, portado do
`ferramentas/porte/prototipo-checkout.html`. O CSS sai de lá pelo
`ferramentas/porte/checkout-partes/agrupa-checkout.py`, que reporta seletor sem grupo; os três
`checkout*.css` de `src/estilos/` são **gerados** e não se editam à mão. O que o protótipo não
tinha (espera, sacola vazia, a carcaça da loja fora do caminho) está em `checkout-loja.css`.

**`CHECKOUT_ABERTO`, em `src/lib/site.ts`, é a chave.** Vire pra `true` quando o Pagar.me estiver
ligado. Enquanto for `false`, o botão da sacola vai pro `/em-breve` e as três formas de pagamento
(Pix, cartão, boleto) aparecem pro desenho poder ser visto — com a chave virada sem gateway, elas
somem sozinhas e fica só o meio que cobra. A tela não tem como ir ao ar pedindo CVV sem cobrar.

**O número do cartão não sai do navegador.** Os campos não têm `name`, então não entram no
`FormData` da ação. É assim que vai ser com o Pagar.me também: quem tokeniza é o navegador.

**O passo aberto sai do carrinho**, não de um contador: tem e-mail e documento? tem endereço e
frete escolhido? Quem recarrega, fecha o navegador ou abre em outra aba cai onde parou.

**As ofertas são de verdade.** O chip de "completa o frete grátis" só sugere produto que SOZINHO
fecha a conta — sugerir um que não fecha transforma a promessa em mentira. E o desconto do order
bump existe no Medusa (`apps/backend/src/scripts/promocoes.ts`): marcar a caixinha aplica um
código de promoção, desmarcar remove. O `20` de `conteudo/checkout.ts` e o do script precisam
bater; o conferidor prova que batem.

Coisas que custaram caro e agora estão travadas em teste:

- **O `metadata` do carrinho é DESCARTADO no `complete`** — o pedido nasce com `metadata: null`.
  O do endereço sobrevive. Por isso CPF/CNPJ mora no `metadata` do endereço de **cobrança**.
- **O proxy passava a URL pra minúscula**, e id de pedido do Medusa é ULID com maiúscula. Toda
  tela de "pedido feito" dava "não achei esse pedido". `CAMINHOS_COM_ID`, em `src/proxy.ts`.
- **O React dá reset no `<form action={…}>`** depois que a ação roda. Sem devolver o que foi
  digitado no estado da ação, um dígito errado no CPF esvaziava os cinco campos junto.
- **O frete marcado por padrão não é o frete gravado.** `defaultChecked` não dispara `onChange`,
  então quem não tocasse nos rádios salvava o endereço e continuava no passo 2. O rádio mora
  dentro do formulário da entrega, e a ação grava os dois de uma vez.
- **`usePathname` fora de `<Suspense>` é erro de build** com Cache Components — foi por isso que
  o contador da sacola voltou a ser atualizado por um componente na tela de obrigado, e não por
  uma releitura a cada navegação.

Depois de escrever, as ações chamam **`refresh()`** (de `next/cache`), não `revalidateTag`: com
perfil de revalidação em segundo plano o `revalidateTag` marca pra atualizar depois e **não**
re-renderiza na resposta da ação, e o frete apareceria com o valor velho.

```bash
node ferramentas/conferir-documento.mjs   # CPF e CNPJ (inclusive o alfanumérico)
node ferramentas/conferir-checkout.mjs    # compra de verdade, com Medusa e loja de pé
node ferramentas/conferir-catalogo.mjs    # /barba, /cabelo, /kits e /produtos
node ferramentas/conferir-links.mjs       # nenhum link do site leva a 404
```

O `conferir-links.mjs` é o que segura a armadilha do `PAGINAS_RAIZ` do proxy: em vez de saber de
uma página específica, ele colhe todo `href` interno das telas principais e pede cada um. Página
nova que apareça no menu ou no rodapé passa a ser coberta sozinha. Ele também **relata** as tarjas
`data-pendente` das páginas legais — CNPJ, telefone e prazo de postagem que ainda não existem. O
dia em que esse relatório vier vazio é o dia em que a loja pode abrir.

O validador de CNPJ aceita **letras**: desde julho de 2026 a Receita emite CNPJ alfanumérico nas
12 primeiras posições. Um validador só-numérico passa em todo teste antigo e recusa toda empresa
aberta de julho pra cá.

## A tela de categoria

`/barba`, `/cabelo`, `/kits` e `/produtos` são **a mesma tela** (`src/app/[categoria]/page.tsx` e
`src/app/produtos/page.tsx`, com os componentes de `src/components/catalogo/`). O card é o mesmo
`CartaoProduto` da home — a categoria não desenha produto de um jeito só dela.

**A ordenação é `?ordem=` na URL, com formulário GET e sem uma linha de JavaScript.** Ela vira um
link que dá pra mandar por WhatsApp, volta igual no botão voltar e o buscador lê. O botão que
envia fica sempre visível, em vez de aparecer só dentro de `<noscript>`: dois estados do mesmo
controle é o que ninguém testa.

**Ordena-se em Node, depois de buscar**, e não com o `order` do Medusa. Preço no v2 é *calculado*
por região e promoção — não é coluna que dá pra ordenar no banco; e os kits de quantidade são
peneirados depois da resposta (o Medusa não filtra por metadata), então ordenar antes da peneira
ordenaria uma lista que não é a exibida. Num catálogo deste tamanho custa nada. Quando passar de
umas centenas de produtos, isto vira paginação de verdade e a conversa muda.

**A barra de ordenação some com menos de dois produtos.** Ordenar uma lista de um item é um
controle que não faz nada, e controle que não faz nada ensina a pessoa a não confiar nos outros
que estão na mesma tela. Pelo mesmo motivo, categoria com um ou dois produtos ganha o painel
`.convite` ocupando o resto da linha, e "o resto da loja" embaixo: três quartos de tela em branco
não lê como "categoria pequena", lê como "página quebrada".

**A contagem dos trilhos sai da mesma busca que desenha a grade**, então não existe a versão em
que o número diz quatro e a lista mostra três. Ela conta por `id` no trilho "Todos", porque um
produto pode estar em duas categorias e a soma diria que a loja tem sete produtos quando tem seis.

### Com JavaScript desligado, a grade não aparece

E isso vale também pra `/produtos` e pra **PDP** — é anterior à tela de categoria, não foi ela que
trouxe. Com Cache Components, o que lê `searchParams` tem que ficar dentro de `<Suspense>`, e
conteúdo em `<Suspense>` só é *revelado* pelo script embutido que o React manda junto com o
stream. Sem script, ele fica no HTML e fica escondido.

O que isso afeta, na prática: **buscador não**, porque o conteúdo está no HTML cru e os que rodam
JS rodam esse script — o `conferir-catalogo.mjs` confere isso num `fetch`, sem navegador. Afeta
quem navega com JavaScript desligado, que vê o esqueleto. A home, que não depende de
`searchParams`, funciona normalmente sem JS.

Não tem conserto barato: tirar o `<Suspense>` faz o `next build` recusar a rota. Se um dia virar
problema de verdade, o caminho é separar a lista padrão (estática) da ordenada (dinâmica).

## Decisões que valem saber

- **Cache Components ligado** (`cacheComponents: true`). Dados vêm de funções `"use cache"` com
  `cacheTag`; a página é servida pré-renderizada e só o que depende de request faz stream. O
  `/checkout` é a exceção pelo avesso: lê cookie, então nada ali é cacheado — e a leitura fica
  dentro de um `<Suspense>`, senão o `next build` recusa a rota.
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
