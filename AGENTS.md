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

**A Vercel só monta o que mudou** (o `vercel.json` da loja e o do painel, entrega 0179). Push em
`entrega/*` não gera preview: quem confere o build na PR é o CI do GitHub — nada de commit vazio
"pra rodar a Vercel de novo". Na `main`, cada projeto só monta se a pasta dele, ou o `package.json`,
o `package-lock.json` e o `turbo.json` da raiz, mudou desde o último deploy dele que deu certo
(`ignoreCommand`, com o `VERCEL_GIT_PREVIOUS_SHA`); senão o deploy daquele projeto sai cancelado
pelo Ignored Build Step, e é o esperado. Da pasta do app, NÃO contam o que não vai pro ar (entrega
0227): os conferidores e falsos (`ferramentas/`), os textos (`*.md`) e o Lighthouse do CI
(`budgets.json`, `lighthouserc.json`) — de 28 a 30/09, 10 dos 35 builds do painel foram só de
conferidor. Por isso nada em `src` importa de `ferramentas/` (lá só se cita, em comentário), e arquivo
novo na pasta do app que não vai pro ar entra no `:!` (exclude) dos DOIS `vercel.json`. **O
`ignoreCommand` tem no máximo 256 caracteres** (o schema da Vercel, `maxLength`): passou disso, a
Vercel recusa o `vercel.json` e TODO deploy da loja e do painel falha, até o próximo merge que conserte
— foi o que a 0227 fez (316 caracteres; consertado na 0228 com o `P=` e o `:!` curto, 238). Mexeu no
comando: conte os caracteres e valide contra https://openapi.vercel.sh/vercel.json antes da PR. Depois do merge, só espere a Vercel do app que a PR mexeu.
O redeploy do mesmo commit pelo painel (variável nova) monta sempre. O motivo: no Pro cada build é
cobrado, e o "Skip deployment" automático da Vercel conta arquivo da raiz fora dos workspaces (este
AGENTS, o ESTADO) como mudança em tudo — em 26 e 27/09 foram 374 builds em 2 dias, 6 em cada 10 de
preview, e mais da metade de um app que nem tinha mudado. Precisa de um preview? Push numa branch
com outro nome.

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
tela com o que a API do Medusa responde — nunca com outra conta feita no próprio teste. Entre
eles: frete, pdp, checkout, pagamento, catálogo, links, configurações, documento, conta, envio,
erp (este sem navegador: o Bling falso e o admin), avise-me, mercadopago (o Pix reserva),
avaliacoes (o e-mail um dia depois da entrega e a página /avaliar), criadores (a página
escondida /criadores e a inscrição) e whatsapp (este também sem navegador: o webhook e o
atendente, com a Meta e a IA falsas). Rode os que
tocam no que você mexeu, e todos antes de entregar. Os que escrevem no admin desfazem o que mudaram
no fim, mesmo quando falham.

A faixa de cookies aparece pra todo mundo desde a 0130 (a própria loja pergunta, pro CRM), por cima
do pé da tela — e o clique no botão de baixo caía nela. Os conferidores que não são dela chamam
`comAFaixaRespondida(navegador, LOJA)` (`ferramentas/faixa-respondida.mjs`) logo depois do
`chromium.launch`: todo contexto nasce como quem recusou os cookies (o "não" da política de
privacidade): sem tag, sem CRM e sem faixa. Conferidor novo que
abre páginas da loja no navegador: faça o mesmo (o `conferir-feed` não precisa — o navegador dele só
lê o XML numa página em branco). Quem confere a faixa são o `conferir-integracoes` e o
`conferir-crm` do painel.

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
# pro conferir-mercadopago (o Mercado Pago falso na 4360, o Pix reserva), acrescente:
# MERCADOPAGO_ACCESS_TOKEN=TEST-token-do-mercadopago-falso MERCADOPAGO_URL=http://127.0.0.1:4360
# MERCADOPAGO_WEBHOOK_SEGREDO=segredo-do-aviso-do-mercadopago
# PAGAMENTO_DISJUNTOR_SEGUNDOS=20 (o parceiro fora do caminho por 20 s, e não 5 min — a parte 8)
# pro conferir-integracoes do painel (a Meta, o GA4 e o TikTok falsos, na 4370), acrescente:
# META_GRAPH_URL=http://127.0.0.1:4370 GA4_MP_URL=http://127.0.0.1:4370
# TIKTOK_EVENTS_URL=http://127.0.0.1:4370 META_CAPI_TOKEN=token-de-teste
# GA4_API_SECRET=segredo-de-teste TIKTOK_EVENTS_TOKEN=token-de-teste
# pro conferir-whatsapp (a Meta e a IA falsas na 4380, que o próprio conferidor sobe), acrescente:
# WHATSAPP_URL=http://127.0.0.1:4380 ANTHROPIC_URL=http://127.0.0.1:4380 LOJA_URL=http://127.0.0.1:4380
# WHATSAPP_TOKEN=token-de-teste WHATSAPP_NUMERO_ID=100000000000001
# WHATSAPP_APP_SEGREDO=segredo-de-teste WHATSAPP_VERIFICACAO=verificacao-de-teste
# ANTHROPIC_API_KEY=sk-ant-teste — e rode com o DATABASE_URL do backend no ambiente
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
leitura, na porta 9000, com os seis produtos de verdade, fotos desenhadas na hora e o banner da home
(uma arte que pesa o mesmo que a da loja em AVIF, na qualidade do banner; recalibre se a da loja
mudar muito) —, porque sem Medusa o build sai com o catálogo vazio e o orçamento mediria uma
vitrine que ninguém vê. Até a 0117 a home falsa não tinha banner, e o LCP medido era a foto de um
produto cortada no pé da tela: nem era a home da loja. Pra medir
aqui do mesmo jeito: `node ferramentas/medusa-falso.mjs` num terminal; no outro, exporte
`MEDUSA_BACKEND_URL=http://localhost:9000`, `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_medusa_falso` e
as variáveis do job (`.github/workflows/loja.yml`), rode o `next build` e depois
`npx lhci collect && npx lhci assert` em `apps/loja` (sem `autorun`, que publica o relatório).

**Como o CI chega no LCP, e por que ele anda em degraus** (medido na entrega 0117). O número é
SIMULADO (Lantern, do Lighthouse 12.6.1 que o `lhci` usa): a carga é gravada numa rede rápida e
recalculada como num 4G lento (150 ms de ida e volta, 1,6 Mbit/s). Três regras mandam nele:

1. **Todo script que rodou antes da pintura do LCP na gravação entra na conta.** Com o servidor na
   mesma máquina, os ~15 pedaços de JavaScript da página (~180 KB comprimidos) chegam antes da
   pintura quase sempre, e o LCP da home vira o tempo de baixar HTML, CSS, fonte, banner E todo o
   JavaScript. (Quando o servidor atrasa os scripts, a gravação pinta antes deles e o número cai pra
   ~2 s — não conte com isso.)
2. **Na mesma origem em HTTP/2, o simulador baixa um pedido de cada vez**, em degraus de 150 ms de
   ~30 KB cada, e o LCP cai no degrau em que termina o último script. Bytes a mais só custam quando
   cruzam um degrau — e aí custam 150 ms de uma vez.
3. **O HTML e o CSS dividem as duas primeiras voltas da conexão: cabem 43,8 KB** comprimidos (14,6
   + 29,2). Na 0117 a home tem 23,8 KB de HTML e 19,2 KB de CSS (43,0 KB) e mede 2,26 s; com 1,2 KB
   a mais em qualquer um dos dois, o CSS vai pra terceira volta, a primeira pintura atrasa e o LCP
   pula pra 2,56 s — reprova. É o degrau mais perigoso da home: veja o que a mudança soma ao HTML e
   ao CSS dela antes da PR. Depois da 0118 (o rodapé em sanfona no celular, +0,1 KB de HTML e
   +0,24 KB de CSS em toda página), a home soma 43,3 KB: sobra menos de meio KB. Conferido pelo
   método abaixo nos três traces: com a 0118 o LCP não muda; com +0,5 KB a mais, pula 300 ms.

**O degrau da 0130** (medido em 26/09, com `lhci` como o CI e o Medusa falso na 9100): a home da
main já estava na beira de um degrau — 250 bytes a mais de JavaScript levavam o LCP local de 2,26 s
pra 2,41 s, e o `lighthouse` avulso, sem mudança nenhuma, oscilava entre 2,32 e 2,46. A faixa de
cookies em toda primeira tela e o CRM somam ~0,8 KB de JavaScript à home, mesmo com o envio só
depois do sim e sem o prefetch da política: a home local mede 2,41 s (a /barba e a PDP não mudam).
No CI, a main da #114 media 1,97 s na home. Quem somar JavaScript à home depois disto: meça antes
da PR — o próximo degrau local é 2,56 s, acima do orçamento.

**O degrau da 0194** (28/09; os relatórios públicos de 76 runs do CI de 27 e 28/09, e o `lighthouse`
12.6.1 avulso intercalando main e entrega com o Medusa falso na 9194). Desde a main 668d2b7 a home
do CI media 2,56 s, com o FCP em 1,21 s: a 0189 separou a `@font-face` da Inter num CSS à parte
(o Turbopack deixou de juntar os dois do `globals.css`) e o HTML e o CSS somados passaram dos
43,8 KB (43.992 B no CI) — o degrau de cima. Três coisas tiraram a home de lá sem mudar nada na tela
— o HTML visível e o payload do React são os mesmos, e o estilo calculado de cada elemento também
(5 milhões de valores, em nove páginas, no celular e no computador, contra a main):

- **O Tailwind só lê o `src/`** (`source("..")` no `globals.css`). Ele varria o `apps/loja` inteiro —
  os protótipos do porte, os conferidores, este arquivo — e gerava `container`, `border`,
  `transition`, `filter`... que nenhuma tela usa. Seis palavras do `src/` que não são classe ficam
  de fora (`@source not inline(...)`, com o porquê ali). O CSS de toda página cai 0,67 KB, e o da
  home volta a um arquivo só.
- **Uma lista de seções por página** (ver "Página é dado, não JSX"): a home deixou de baixar a
  dobra, a galeria, os kits e a rotina da PDP — ~9 KB comprimidos de JavaScript.
- **O `web-vitals` do Next depois do `load`** (ver a parte 2 da observabilidade): ~2,5 KB em toda
  página.

A home ficou com 42,5 KB de HTML e CSS (gzip) — sobram ~0,7 KB antes do degrau — e 176 KB de
JavaScript (eram 187). No `lighthouse` avulso, seis rodadas de cada, intercaladas: a mediana vai
de 2,56 pra 2,26 s (FCP 1,21 → 0,97 s); com a CPU lenta (`taskpolicy -b node .../lighthouse`, que
roda o Chrome nos núcleos de eficiência do Mac — mais perto da máquina do CI), de 2,67 pra 2,40 s.
A /barba e a PDP não mudam de degrau (2,18 e 2,26 s). O próximo pedaço grande da home é a gaveta da sacola (~4,5 KB, desenhada
fechada em toda página); a próxima conta de CSS, o `@font-face` das sete escritas da Inter (o
`next/font/google` escreve todas, e a loja só usa a latina).

**Por que um corte às vezes não muda nada** (o Lantern do 12.6.1). Em HTTP/2 o simulador passa a
sobra da última volta pro pedido seguinte (`h2OverflowBytesDownloaded`, no `TCPConnection`). Mas
quando uma tarefa de CPU termina no meio de um download — o ParseHTML e o Layout logo depois do
HTML, a avaliação do pedaço do React depois dele —, o `updateProgressMadeInTimePeriod` gasta essa
sobra sem contar os bytes, e o pedido baixa tudo de novo: uma volta (150 ms) perdida. Era isso que
levava o CSS da main de 909 pra 1.209 ms, com 109 B passando da sobra do HTML. Por isso o LCP da home
anda em degraus e depende de ONDE o corte cai: cortar antes do pedido interrompido só aumenta a sobra
que ele perde. E o modo "bom" do CI (~1,96 s) é a gravação em que a página pintou antes de avaliar
os scripts (aí eles saem do grafo); o "ruim" (~2,4 s), a que avaliou antes. Pra ver na sua máquina,
sem rodar o Lighthouse de novo: grave os artefatos (`-G`) e peça o `LanternLargestContentfulPaint`
(`lighthouse/core/computed/metrics/`) com o `loadArtifacts` e um `{computedCache: new Map(),
settings}`; o grafo (`PageDependencyGraph`) tem o `transferSize` de cada pedido pra mudar, e a
duração das tarefas de CPU (`CPUNode.duration`) dá pra escalar e imitar a máquina do CI. Desde a
0194 o CI guarda as nove medições (artefato `lighthouse`: `gh run download <run> -n lighthouse`).

Imagem `data:` em CSS é pedido "sem conexão" pro Lantern e derruba a conta pessimista (ver `--raio`
em `estilos/base.css`). Pra medir uma mudança sem o ruído da máquina (aqui o Lighthouse oscila meio
segundo entre rodadas do mesmo build): grave os artefatos com `node_modules/.bin/lighthouse <url>
-G=<pasta> --only-categories=performance --chrome-flags="--headless=new
--ignore-certificate-errors"`, copie a pasta, mude o tamanho do pedido no
`defaultPass.devtoolslog.json` (o `encodedDataLength` do `Network.loadingFinished` dele, e o dos
`Network.dataReceived` na mesma proporção; tirar os eventos do pedido = ele não existir) e rode
`lighthouse <url> -A=<cópia>`. O Lantern lê a rede do **devtoolslog**, não do trace: mudar o
`ResourceFinish` do `defaultPass.trace.json` não mexe no número (só com `INTERNAL_LANTERN_USE_TRACE`
definido).

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

Um quinto, de banco copiado: o código da oferta do checkout é assinado com o `REVALIDAR_SEGREDO`
(`lib/bumps.ts`), e um backend com outro segredo não acha nenhuma oferta valendo — o modelo do
motor vem com `bump: {}`, e o de checkout para em "a caixinha aparece". O job `bumps` refaz as
promoções de hora em hora; na hora, `medusa exec ./src/scripts/promocoes.ts` no banco local e
reinicie o Medusa e o `next dev` (o modelo fica guardado uma hora nos dois).

O de pagamento liga o Pagar.me na região pelo admin e devolve como estava. O aviso do estorno
que não saiu ele lê numa caixa só (`caixaDaEquipe`), como o do ERP: a do dono do painel (o
`DASHBOARD_DONO_EMAIL` do backend, que vai no ambiente dele também) ou, num banco sem ninguém no
painel, a do admin local — desde a 0093 o aviso vai pro papel que resolve
(`lib/equipe/avisados.ts`), e o do estorno é do dono. Até a 0121 ele olhava só o `ADMIN_EMAIL`, e
em banco com gente no painel 2 checagens falhavam com a loja certa. O de checkout, com o
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
- **Página é dado, não JSX.** Quais seções uma página monta, e em que ordem, vem do registro dela:
  `SECOES_DA_HOME` (`apps/loja/src/lib/secoes/registro-da-home.ts`) e `SECOES_DO_PRODUTO`
  (`registro-do-produto.ts`), com os tipos e as regras em `registro.ts`; a rota só escreve
  `<Secoes escopo="..." secoes={...} />`. A ordem do array é a ordem padrão — não existe segunda
  lista, e o banco guardará só a diferença (`lib/secoes/layout.ts`). Seção nova se declara na lista
  da página dela, com `id` estável (é chave de banco), `nome` e `descricao` (é o que uma pessoa lê no
  painel) e `fixo: true` quando não pode ser desligada. **Uma lista por arquivo, e nenhum arquivo
  importa as duas** (0194): quem importa a lista manda pro navegador o JavaScript de cliente de
  todas as seções dela, apareçam ou não — com as duas juntas, a home baixava a dobra da PDP.
- **404 real no primeiro nível é no proxy** (`apps/loja/src/proxy.ts`); com Cache Components, rota
  dinâmica manda o shell com 200. Ao criar uma página nova de primeiro nível, adicione o segmento em
  `PAGINAS_RAIZ` do proxy.
- **Os endereços da Nuvemshop** (`apps/loja/src/redirects.json`, servidos como 301 pelo proxy; o
  destino pode levar âncora, `/duvidas#entrega`). O endereço antigo vem com a barra no fim: o Next
  responde 308 pra sem barra, e só então o proxy faz o 301 — dois saltos, e o Google segue. O
  `conferir-enderecos-antigos.mjs` confere a lista inteira da loja antiga (o mapa do site dela em
  26/09, mais a busca, o carrinho e a conta): cada um abre, o redirect é permanente, a query e a
  âncora vão junto, e nenhuma linha leva pra outra. Os produtos têm o mesmo endereço nas duas
  lojas, e dependem do catálogo: no local (onde faltam produtos) rode com `SEM_PRODUTOS=1`; contra
  a loja no ar, sem — e de novo logo depois da troca de domínio.
- **O robots.txt vale pelo COMEÇO do endereço** (`apps/loja/src/app/robots.ts`): `Disallow: /conta`
  pegava também o `/contato`, que está no sitemap (entrega 0136). Pasta bloqueia com a barra
  (`/conta/`) e o endereço exato com `$` (`/conta$`). Até a virada a loja responde `Disallow: /`;
  o `conferir-links.mjs` confere o robots contra o sitemap quando a loja indexa — rode com
  `SITE_INDEXAVEL=true` antes da troca, e contra o domínio logo depois dela.
- **A vitrine não lê `searchParams`.** `/barba`, `/cabelo`, `/kits` e `/produtos` são estáticas, e o
  `?ordem=` é trocado pelo proxy por `/<página>/ordem/<ordem>` (estática também, sem mudar a URL).
  Ler `searchParams` numa delas a torna dinâmica: esqueleto, streaming, rodapé pulando e LCP
  estourado no Lighthouse — ver `apps/loja/src/components/catalogo/tela.tsx`. A `/busca` é a
  exceção, porque o `?q=` não tem como ser gerado no build.
- **Sem GTM, sem widget de terceiro no `<head>`.** Tags entram por `components/analytics/tags.tsx`:
  todas desde a primeira página, antes de qualquer clique, com o consentimento do Google todo
  liberado — como na Nuvemshop (entrega 0230, pedido do dono com aval jurídico). A faixa tem um botão
  só ("Entendi"), que libera o CRM da loja; quem não quer recusa na política de privacidade
  (`mudar-resposta.tsx`) e fica sem tag nenhuma, e sem a compra pelo servidor. Orçamento de
  terceiros: 150 KB (Lighthouse CI quebra acima).
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
  de pintar. PDP, checkout, conta, categoria e busca importam o seu por `src/estilos/telas/`, e as
  páginas de texto pelo layout delas — ver o quadro "O QUE NÃO MORA AQUI" no próprio `globals.css`
  antes de mover mais alguma coisa.
- **Nada de imagem `data:` em CSS de coisa que aparece na carga** (ícone, raio de fundo): no
  Lighthouse do CI ela atrasa a fonte e sobe o LCP. O raio decorativo é recorte (`--raio`, em
  `estilos/base.css`).
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
prazo. No empate de preço (que é também empate de prazo: a econômica é a mais barata e, entre as
mais baratas, a mais rápida), a tela mostra uma entrega só — a ECONÔMICA — na sacola e no checkout
(`semEntregaEmpatada`, em `apps/loja/src/lib/frete.ts`; entrega 0136). Era a expressa, e a expressa
gravada quebrava duas coisas: o cupom de frete grátis "só na mais barata" mira a econômica e nunca
entrava, e a cada mudança no carrinho o Medusa cota de novo a entrega gravada PELA FAIXA dela — a
expressa voltava como "a mais rápida", que pode ser outro serviço, mais caro, e o frete grátis
sumia. O PRAZO ("Chega em 8 dias úteis") o checkout não tem como tirar da cotação
do Medusa, que devolve só o preço: ele pergunta à rota da calculadora (`POST /store/frete`, com o
`cart_id`), em paralelo, e junta por faixa (`prazosDasFaixas`, em `lib/checkout.ts`; entrega
0123). Pelo carrinho, a pergunta é a mesma do Medusa, e as duas dividem a viagem à Frenet — o
`conferir-checkout` confere que abrir o passo 2 é uma viagem só. Quando as duas faixas são o
mesmo serviço, a rota responde uma entrega só, e o prazo dela vale pras duas. Sem resposta da rota,
a linha volta pra descrição do tipo ("A mais barata para o seu CEP").

**A CALCULADORA DA PÁGINA DE PRODUTO** (0208, desenho aprovado pelo dono no canvas "Frete na página
do produto", opção D): `components/produto/calculadora.tsx` + `estilos/pdp-frete.css`. Depois de cotar,
o campo vira a linha "Cidade · UF · CEP · Trocar" (o `lugar` que o `cotarFrete` busca no ViaCEP em
paralelo, cacheado; sem ele, só o CEP); as entregas viram DOIS CARTÕES IGUAIS, com a etiqueta amarela
"Mais barata"/"Mais rápida" (uma entrega só: sem etiqueta) — nenhum com sombra ou borda grossa, que
parecia botão (correção dele); com o piso alcançado entra a faixa menta "Frete grátis garantido" (só o
raio, sem caixinha de marcar — outra correção dele); faltando, a frase com o valor em destaque e a
barra; e o cartão do produto que COMPLETA: o mais barato que sozinho fecha o que falta, entre os do
"leve junto" e a vitrine da sacola na ordem do motor (`completam`, montado no `dobra.tsx`, sem o
próprio produto nem kit/peça dele — `foraDaSugestao`). "Adicionar" marca no MESMO `juntos` do "leve
junto" (vai no Comprar e recota); o posto fica na caixa com "Tirar". Sem o pé "Prazo contado em
dias úteis depois da postagem / Não sei meu CEP" desde a 0211 (pedido do dono, pra caixa ficar
enxuta) — a sacola e o checkout continuam com o deles. Conferidor:
`apps/loja/ferramentas/conferir-frete-na-pdp.mjs` (23), com a Frenet falsa.

**O LEVE JUNTO DA PÁGINA DE PRODUTO** (0221, desenho aprovado pelo dono no canvas "Leve junto",
opção D): `function LeveJunto` em `components/produto/compra.tsx` + `estilos/pdp-junto.css`. UMA
CAIXA SÓ, sem chanfro (o `clip-path` cortava a borda e o cartão parecia quebrado): uma linha por
produto — foto, `nomeCurto`, "30 ml · + R$ 79,90" e o botão "+ Levar" / "✓ Vai junto" — e o RODAPÉ
com o total do clique ("Total" · "Total dos 3", o mesmo `pedido` da barra fixa) e o frete dele:
"Faltam R$ X pro frete grátis" (`fraseDoQueFalta`) em cinza, ou o `frases.selo` em menta quando
alcança; sem política ou com piso zero, só o total. A tarja por item saiu (lia-se "este produto tem
frete grátis") e com ela o `fechaOPiso`. O `<input type="checkbox">` continua de verdade: cobre a
linha, invisível, com `aria-label`; o botão é desenhado pelo `:checked`. Com algo marcado, o
Comprar diz "Adicionar os 3" (sem "à sacola": quebrava em duas linhas). A prévia do painel
(`PreviaJunto` em `caixa-de-compra.tsx`) imita. Conferido no `conferir-pdp` (o rodapé nos três
modos de frete e o botão).

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
`POST /admin/pagamentos/conciliar` pra rodar na hora). O que é caso raro — os órfãos (a listagem de
48 horas lá no parceiro) e a conferência dos estornos de 7 dias — anda só na rodada COMPLETA: de 30
em 30 minutos no job (`rodadaCompleta`, minutos 0 e 30; entrega 0199), sempre na rota do admin e
nos conferidores. O pendente, o incerto, o pedido preso e o dinheiro num pedido cancelado seguem de
5 em 5.
Duas armadilhas já pagas: o Medusa MISTURA (em profundidade) o `data` da sessão com o que chegou
da API pública, então o provedor grava o estado inteiro, com `null` explícito, e acha o pedido do
Pagar.me pelo CÓDIGO (o id da sessão), nunca pelo `data`; e o cartão aprovado no fechamento não
emite `payment.captured` — quem emite é `src/subscribers/pedido-pago-na-hora.ts`. A loja manda o
comprador em `data.entrada` (montado do carrinho, em `apps/loja/src/lib/pagamento.ts`) e o cartão
só como token, gerado no navegador (`apps/loja/src/lib/pagarme.ts`). E manda o total que o botão
mostrou (`total_visto`): se o carrinho tiver outro — um item posto por outra aba, a seta de
voltar do navegador —, o `finalizar` não abre o pagamento, redesenha a tela e diz o total novo.
Sem isso o cartão era autorizado por um valor que ninguém viu. E ANTES dessa conferência o
`finalizar` refaz a conta do carrinho (`cart.update` com a MESMA região, que liga o
`force_refresh` do Medusa: preço das linhas, promoções e frete gravado; entrega 0136): o Medusa 2.21
só refaz o preço quando muda a região, o idioma ou o endereço, e a sacola de 30 dias, com o
endereço já gravado, pagava o preço de quando o produto entrou. O e-mail do passo 1 segue a regra
do Medusa (a `email` do zod 4, a mesma do `POST /store/carts/:id`): com uma mais frouxa, o e-mail
que ele recusa travava a pessoa no passo 1 com "Não consegui falar com a loja". O cupom vai como foi digitado,
depois em maiúsculas e em minúsculas: o Medusa procura o código exatamente como foi cadastrado.
A regra do cupom digitado mora em `apps/loja/src/lib/cupom.ts` (`porCupom`, `tirarCupom`), e o
checkout e a sacola chamam a mesma (0207: o campo no pé da gaveta, `components/sacola/cupom.tsx`) —
não copie a regra pra uma tela nova. Quando o `complete` recusa por falta de estoque ("Not enough stock available…"), o `finalizar`
desce o pedido até o que tem (`ajustarAoEstoque`, em `apps/loja/src/lib/checkout.ts`: cada linha
até o estoque de agora, e o que acabou sai — com o código da oferta dele) e a frase diz o que
mudou e o total novo. Nada foi cobrado: o Medusa reserva o estoque antes de autorizar. Antes era
"espera um minuto e clica de novo", pra sempre. A aba que paga depois de outra vai pro MESMO
pedido: as abas dividem os cookies, e o pedido da primeira apaga a sacola das duas — a segunda se
acha pelo crachá (o `carrinho_visto` do formulário contra o carrinho do cookie `pedido`) ou, se as
duas pagaram juntas, pela sessão recusada com o carrinho já fechado. E-mail com mais de 64
caracteres (o limite do Pagar.me) é recusado no passo 1, com o motivo.

**O PASSO SEGUINTE ABRE NO CLIQUE** (entrega 0201). As regras dos passos 1 e 2 (o e-mail do zod 4,
os 64 caracteres, nome, celular, CPF/CNPJ, o endereço) moram em `apps/loja/src/lib/passos-do-checkout.ts`,
sem nada de servidor: a tela confere o formulário (`conferirContato`, `conferirEndereco`) e a ação
confere de novo (`salvarContato`, `salvarEntrega`). O erro da tela volta na forma do `erro` das ações
(`estadoComErros`), sem ida à loja. O envio que confere entra num carrinho ADIANTADO
(`comOAdiantado`, em `etapas.tsx`, pelo `adiantar` do `onSubmit`, que é atualização urgente — dentro
da ação seria de transição e só apareceria com a resposta): é dele que saem o passo aberto e a linha
do passo feito, e a ação grava por trás. O adiantado sai quando o carrinho de verdade chega com ele
(`jaChegou`, no render — "ajustar o estado quando a prop muda"), NÃO na resposta da ação: o Next
entrega a resposta antes da página refeita (`server-action-reducer.js`), e soltar ali (ou usar
`useOptimistic`, que solta no fim da ação) mostraria o passo de antes por um instante. A ação que recusa chama `aoVoltar` (o passo reabre, com o recado e os
`valores`). O pagar espera enquanto um passo de antes grava (`gravando`, pelo `SALVANDO` que os
passos avisam em `ocupados`; o da entrega esmaece o dinheiro, `mudandoOTotal`) e confere `pronto` no
`onSubmit` (a barra do celular não passa pelo botão). Envio que não confere num passo recém-aberto
(`recemAberto`, 600 ms) é o segundo toque na barra: ignorado, sem vermelho. Sem internet logo depois
do "Ir pro pagamento", a ação chega a gravar e o pagar fica travado até a página refeita chegar — o
Next busca de novo quando a internet volta (medido: solta ~3 s depois). CONFERIDOR que lê o Medusa
logo depois de o passo seguinte aparecer espera a gravação (`quandoGravar`; `entregaGravada` = o
botão de pagar solto); a seção "O passo seguinte abre no clique" do `conferir-checkout` segura a ação
2,5 s (`route`) pra provar que o passo abre antes.

**O PIX NO CELULAR** (0201): no `<Pix>` (`components/checkout/pix.tsx`, no obrigado e no pedido da
conta) o "Copiar código Pix" vem logo depois do QR; abaixo de 560 px (`checkout-loja.css`) o QR some e
o botão fica largo. A frase de cima tem as duas versões (`.feito__no-computador`/`.feito__no-celular`;
`fraseNoCelular` no obrigado). O `conferir-pagamento` confere as posições nas duas larguras.

**O BALÃO DO PEDIDO** (0203): quem acabou de comprar e volta pra loja vê, no canto de baixo, o pedido
(o Pix a pagar, em análise, pago, vencido); tocar abre o resumo com o Pix pra copiar. As regras moram
em `apps/loja/src/lib/pedido-recente.ts`: o `abrirPedido` grava, junto do crachá, o cookie LEGÍVEL
`pedido_recente` (só o id, 1 hora); o vigia (`components/pedido-recente/vigia.tsx`, no layout, dentro
da sacola e de um `<Suspense>` por causa do `usePathname`) só baixa o balão (`./balao.tsx`, com
`estilos/balao-do-pedido.css`) e só pergunta a `/api/pedido-recente` com esse cookie — quem não
comprou não faz requisição. A rota exige o crachá do MESMO pedido e o `meu` do Medusa. Fica 30 min
depois do pedido (esticado até 10 min depois do vencimento do Pix enquanto ele não é pago), pergunta
de 20 em 20 s enquanto o pagamento não entra, não aparece em `/checkout*`, e sai de vez (o
`localStorage` `balao-escondido:<id>`, e a memória da aba) pelo X, pelo prazo, pelo "Refazer" ou
quando a rota recusa. O "Refazer" do Pix vencido é o `refazerPedido` (o `comprarDeNovo` pelo crachá,
em `lib/acoes/pedido.ts`). Camadas: 58, embaixo da barra de compra (60), da sacola (70) e do pop-up
(80); com a barra de compra na tela, sobe por cima dela. Conferidor:
`apps/loja/ferramentas/conferir-balao.mjs` (34), na pilha do `conferir-pagamento`; ele esconde o "N"
do `next dev`, que mora no mesmo canto e come o clique.

**Os parceiros de pagamento** (desde a 0132) estão numa lista só: `src/lib/pagamento/parceiros.ts`
no backend e `PARCEIROS` em `apps/loja/src/lib/checkout-visivel.ts` na loja — parceiro novo entra
nas duas, e o `parceiros.unit.spec.ts` confere. Cada parceiro é um provedor do Medusa que grava na
sessão o MESMO estado (`src/lib/pagamento/estado.ts`: forma, situação, QR do Pix, final do cartão,
recusa, estornado), na sua chave de `data` (`data.pagarme`). Tudo que LÊ o pagamento pergunta à
lista — `sessaoDoParceiro` (a sessão que chegou mais longe) e `estadoDaSessao` (só a chave do
parceiro dono da sessão: um `data.pagarme` forjado numa sessão do provisório não vira pagamento):
os e-mails de confirmação, venda nova, cancelamento e devolução, o painel (pedido e Marketing), a
nota, a versão pública do pedido, a porta do cartão e, na loja, a tela de obrigado, a conta e a
recusa do passo 3. Nenhum deles tem id de provedor escrito; o provisório (`pp_system_default`) não
é parceiro. O que FALA com o parceiro continua dele: o provedor, a conciliação e a conferência de
estornos (`conciliar-pagamentos.ts` e `estornos.ts` são do Pagar.me), o aviso (Edge Function), o
script da região e o passo 3 (o cartão vira token no Pagar.me).

**O Mercado Pago é o Pix reserva** (desde a 0140): um segundo provedor, `src/modules/mercadopago/`
(id `pp_mercadopago_mercadopago`), SÓ de Pix — cartão continua só no Pagar.me (cartão recusado não
vai pro outro parceiro: quem recusa é o banco de quem compra, e mandar pra outro atrai o robô
testando cartão e a contestação). O mesmo desenho do Pagar.me, com três diferenças: (1) a criação vai
com `X-Idempotency-Key` = o id da sessão, então a resposta perdida é repetida com a mesma chave e
volta o MESMO Pix — a dúvida "gerou ou não?" só sobra se todas as tentativas caírem, e aí a frase
é a do Pix (QR que ninguém viu não cobra ninguém); (2) Pix pendente SE CANCELA lá (`PUT
status=cancelled`): o QR de pedido cancelado e o do Pix vencido morrem na hora; (3) o aviso vai
DIRETO pro Medusa, em `/hooks/payment/mercadopago_mercadopago`, sem a Edge Function — o
`getWebhookActionAndData` confere o `x-signature` (HMAC-SHA256 sobre `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`,
com o `MERCADOPAGO_WEBHOOK_SEGREDO`, ver `aviso.ts`) e LÊ o pagamento na API antes de acreditar.
**A conta é a mesma das vendas do Mercado Livre**: nada toca num pagamento sem a referência de uma
sessão (`payses_…`) E a origem desta instalação no `metadata` (`ehDaLoja`) — o conferidor semeia uma
venda do Mercado Livre e confere que ninguém mexe nela. A conciliação dele é
`src/lib/conciliar-mercadopago.ts`, rodada pelo `conciliarPagamentos` depois da do Pagar.me (sem
o `MERCADOPAGO_ACCESS_TOKEN`, não faz nada); o que as duas dividem — o relatório, o pedido preso, as
escritas no Medusa e o dinheiro que entra num pedido já cancelado (devolvido pelo Medusa, pra todo
parceiro) — mora em `src/lib/pagamento/conciliacao.ts`, e a entrada da loja, o dinheiro em
centavos e a origem, em `src/lib/pagamento/{entrada,comum}.ts`. O `npm run backend:pagamento`
liga os dois na região quando o token existe (e confere o token numa leitura antes).

**A TROCA PELO PARCEIRO ESTÁVEL** (entrega 0150) — quem escolhe o parceiro é a loja, no `finalizar`
(`apps/loja/src/lib/acoes/checkout.ts`), pela ROTA: os parceiros da região e os que o disjuntor
tirou do caminho (`GET /store/pagamento`, `rotaAgora` em `lib/checkout.ts`, a regra em
`rotaDoPagamento`, `lib/checkout-visivel.ts`, com teste no backend:
`lib/pagamento/__tests__/rota-da-loja`). Com os dois de pé, o Pix vai pelo Pagar.me e o Mercado Pago
é a reserva: o Pix que não nasce num parceiro (a sessão "falhou" ou "incerto" — `pixNaoNasceu`, em
`lib/pagamento.ts`) abre sessão no próximo e fecha o carrinho de novo, NO MESMO CLIQUE. Com outro
esperando, a loja manda `reserva: true` na entrada, e o provedor desiste cedo — 10 s pra criar
(`PIX_COM_RESERVA_MS`) e sem as perguntas de "nasceu?"; o Pix que nascer tarde lá não chega a
ninguém, e a conciliação fecha. Cartão NUNCA vai pro outro parceiro. O DISJUNTOR
(`src/lib/pagamento/disjuntor.ts`, puro, com teste) conta só o parceiro que NÃO ATENDEU — a `falha`
"fora" que o provedor grava no estado (sem resposta, tempo esgotado, 5xx, 401/403; `falhaDoErro`), e
não a "recusa" (ele disse não) nem o "interno" (nem saiu daqui): três seguidas, entre as tentativas
e não no relógio, tiram o parceiro do caminho por 5 minutos (`PAGAMENTO_DISJUNTOR_SEGUNDOS` só no
local), contados da última; depois, a próxima compra é o teste — deu certo, voltou. As tentativas
são as linhas de `obs_tentativa`, agora com `provedor` e `forma` (a porta do `complete` anota o Pix
também, sem as travas do cartão; `terminadasDosParceiros`, no serviço). Na loja: o Pix pula o
parceiro fora; o cartão sai da tela (apagado, "Fora do ar agora. Paga no Pix") enquanto o Pagar.me
estiver fora e o Pix puder sair pelo outro — e a aba que ficou aberta descobre no clique. COM TODOS
FORA, NINGUÉM SAI: a loja segue tentando, como antes do disjuntor (tirar o último parceiro seria
loja sem pagamento). A virada — caiu, ou voltou — manda um e-mail por hora pro dono
(`lib/pagamento/aviso.ts`, `lib/emails/parceiro-fora.ts`; "Um parceiro de pagamento caiu" no
`AVISOS_DA_EQUIPE`), com o texto de quem mais está ligado e de pé. A parte 8 do
`conferir-mercadopago.mjs` derruba o Pagar.me falso e confere tudo isso; as partes de antes levam a
tela ao Mercado Pago trocando o provedor escondido do passo 3 (a dica da tela vai primeiro na fila,
se o parceiro estiver de pé).

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

**O ROBÔ TESTANDO CARTÃO** (entrega 0129) — quem tem uma lista de cartões roubados tenta um atrás do
outro numa loja pequena, pra descobrir quais funcionam; as recusas saem no nome da loja, e o
Pagar.me pode segurar a conta. A porta do `complete` (`src/lib/cartao/porta.ts`, no
`api/middlewares.ts`) segura a tentativa ANTES de o Medusa chamar o `authorizePayment`, e só a que
vai pro Pagar.me: a sessão do nosso provedor, no cartão, ainda `nova` (sessão que já foi nem passa
por ela; o Pix é anotado desde a 0150, pro disjuntor dos parceiros — as contas do robô são só de
cartão, e o Pix tem as travas dele desde a 0163, logo abaixo).
A regra é pura, com teste (`src/lib/cartao/robo.ts`, `LIMITES`): por sacola, 5 por
hora; por pessoa, 8 — a pessoa é o `quemPede`, o IP que a loja manda em `x-cliente-ip` assinado com
o `REVALIDAR_SEGREDO` (o `finalizar` manda os dois, pelo `cabecalhosDeQuemPede`); o que chega sem a
assinatura, todo mundo junto, 3 por hora; e o FREIO: 8 recusas nos últimos 30 minutos, sendo pelo
menos 3 de cada 4 das que terminaram — com ele, a loja toda passa 3 tentativas a cada 10 minutos, e
2 por sacola e por pessoa. Recusa é o banco, a análise de fraude e o dado do cartão que o Pagar.me
não aceitou; o Pagar.me fora do ar é erro, e não liga o freio. Barrada, a resposta é 429 com
`cartao_limite` ou `cartao_freio` no `message`, e quem escreve a frase é a loja (`recusaDaPorta`, em
`apps/loja/src/lib/pagamento.ts`): o Pix agora, ou o cartão depois — nada foi cobrado. Cada
tentativa é uma linha em `obs_tentativa` (módulo observabilidade): "andando" ANTES de contar — dez
ao mesmo tempo viram dez linhas antes de qualquer conta —, e fechada quando a resposta sai, lendo a
sessão. O IP não vai pro banco: o `quem` é um HMAC dele com o segredo (`semOIp`). Se anotar ou
contar falhar (a migração ainda não rodou), a tentativa segue sem a trava, com `[cartão]` no log. A
recusa que liga o freio manda UM e-mail por hora pro dono (`lib/cartao/aviso.ts`; "Robô testando
cartão" no `AVISOS_DA_EQUIPE`), e o vigia faz dois problemas de estado: `robo-no-cartao` (grave,
enquanto o freio estiver ligado) e `cartao-sem-a-loja` (atenção: tentativa sem a assinatura nas
últimas 24 horas — robô, ou o `REVALIDAR_SEGREDO` diferente entre a Vercel e o Railway). A
Observabilidade do painel tem o bloco "Cartão" (as últimas 24 horas); o vigia apaga o que passa de
30 dias. `GET /admin/cartao` mostra as 24 horas, o freio e as 20 últimas tentativas;
`POST /admin/cartao` com `{"acao": "soltar"}` recomeça as contas (uma linha "solta", com quem
soltou). NO LOCAL: a loja precisa do mesmo `REVALIDAR_SEGREDO` do backend — sem ele, todo cartão cai
no balde das sem assinatura, 3 por hora —; o `conferir-pagamento` solta o cartão no começo e no fim
(a seção do robô liga o freio de propósito) e precisa do segredo no ambiente dele também; e o
`pedido-de-teste.mjs` assina o `complete` quando o segredo está no ambiente, com um IP por pedido.
Falta a verificação invisível de robô (BotID ou Turnstile) — ver o ESTADO.

**O PIX QUE SEGURA O ESTOQUE** (entrega 0163, auditoria de 27/09) — o pedido no Pix nasce com os
produtos reservados e o uso do cupom gasto, e só cai quando o QR vence e a conciliação cancela (uns
40 minutos). Sem trava, um robô com CPFs gerados deixava a loja "esgotada" sem pagar nada, e cada
cancelamento mandava e-mail pro endereço digitado. A mesma porta, no Pix (`LIMITES_DO_PIX` e
`decidirPix`, em `robo.ts`; a conta é o `contarPix` do módulo observabilidade): até 10 unidades de
cada produto num pedido (`pix_quantidade`, 400 — em 2.879 pedidos da Nuvemshop ninguém levou mais
de 4; o cartão não tem teto, porque cobra na hora), e até 3 Pix por pessoa em 40 minutos, pagos ou
não, o de agora incluído (`pix_limite`, 429); o que chega sem a assinatura divide um balde de 3. A
frase é da loja (`recusaDaPorta`), e o 10 dela tem que bater com o `LIMITES_DO_PIX.unidades`. O
"soltar" do `POST /admin/cartao` recomeça as contas do Pix junto com as do cartão. NOS CONFERIDORES:
todo Pix sai da mesma máquina — pelo navegador, com o IP local assinado; pela API, sem assinatura —,
e o quarto em 40 minutos esbarra. Por isso o `pedido-de-teste.mjs` assina cada `complete` com um IP
de documentação sorteado (`ipDeTeste`, 2001:db8::/32 — cada pedido é uma pessoa, e rodadas
seguidas não somam), o `conferir-pagamento` e o `conferir-mercadopago` fecham pela API do mesmo
jeito, e os conferidores que geram Pix pelo navegador soltam as travas no começo.

**O VALOR DO PAGAMENTO NO FECHAMENTO** (entrega 0163, auditoria de 27/09) — o Medusa abre a sessão
de pagamento com o valor que a coleção tinha naquela hora, SEM a trava do carrinho
(`createPaymentSessionsWorkflow`), e o fechamento autoriza o valor da sessão sem comparar com o
total (o próprio core avisa, em `completeCartWorkflow`). Abrir a sessão no mesmo instante em que o
carrinho cresce deixava uma sessão com o valor de antes: pedido de R$ 1.010 fechado com Pix de
R$ 10. O gancho `validate` do fechamento (`src/workflows/hooks/valor-do-pagamento.ts`, a regra em
`src/lib/pagamento/valor.ts`) recusa, dentro da trava do carrinho, a sessão que cobra diferente
do total ou em outra moeda: 400 com `valor_divergente`, e a loja escreve a frase. O Medusa aceita
UM tratador por gancho: outra regra do fechamento entra nesse arquivo. A segunda trava é o
`capturasDo` (`src/lib/dados-do-pedido.ts`): a cobrança cujos pagamentos capturados somam menos
que o valor dela não faz o pedido "pago" pra etiqueta, pra nota nem pro e-mail de confirmado — com
`payment_collections.amount` e `payment_collections.payments.amount` na consulta (sem eles, vale
como antes).

**OS LIMITES QUE SEGURAM A LOJA DE PÉ** (entrega 0168, auditoria de 27/09) — o que é público tem
limite de frequência e de tamanho, e o limite enxerga a pessoa:

- **A rede de quem pede** (`redeDoIp`, em `src/lib/quem-pede.ts`): o IPv4 inteiro e o IPv6 pelo
  bloco /64 — é a chave de TODO limite por pessoa (códigos, cartão, Pix, frete, CRM, telemetria).
- **Reservar antes do banco** (`reservar`, em `src/lib/limite.ts`): rota que confere o limite e só
  depois espera o banco CONTA na hora e devolve a vaga se não mandar nada (o código de entrar, a
  troca de e-mail e o código do painel). Conferir (`cabe`) e contar no fim deixa pedidos ao mesmo
  tempo passarem juntos.
- **O teto do dia** (`criarTetoDoDia`, no mesmo arquivo): um total por chave que zera à meia-noite
  (UTC). O CRM grava até 10.000 eventos por rede e 200.000 pela loja por dia; a telemetria, 10.000
  e 150.000 — folga pra uma rodada inteira de conferidores, que sai toda do mesmo IP. Passou, 429 e nada gravado.
- **O frete** (`/store/frete`): até 100 linhas e 30 produtos diferentes por pergunta; 200 cotações
  por pessoa em 10 minutos (assinadas pela loja — o `cotarFrete` manda o `cabecalhosDeQuemPede`),
  300 sem assinatura e 5.000 pela loja.
- **O corpo grande só depois da porta**: as rotas do painel que recebem arquivo em base64 (as
  fotos, a base da Nuvemshop) sobem com `bodyParser: false` e leem o corpo na própria rota, depois
  da porta e da área, até 7 MB (`lerCorpoGrande`, em `src/lib/corpo-grande.ts`). Rota nova do
  painel com arquivo grande: o mesmo molde, nunca `sizeLimit` no middleware.
- **A senha do admin**: 10 senhas erradas por rede e 30 por e-mail em 15 minutos
  (`freioDaSenhaDoAdmin`, no `middlewares.ts`); a certa devolve a vaga. O cadastro do admin (é por
  ele que o convite entra), 10 por hora por rede.
- **O avise-me** refaz as páginas da loja no máximo a cada 5 minutos, por produto e pela lista.
- **As fotos do catálogo**: uma conversão por foto de cada vez; a que não abriu, 1 minuto sem nova
  tentativa.
- **A API da loja é do servidor da loja** (`soDaLoja`, no `middlewares.ts`): a loja assina TODA
  chamada ao Medusa (o cliente do SDK com `globalHeaders`, em `apps/loja/src/lib/medusa.ts`, e o
  `medusa()` de `lib/conta.ts`). Por padrão, a chamada a `/store` sem assinatura passa e vai pro log
  (`[loja] N pedido(s) em /store sem a assinatura`, uma linha por hora); com
  `STORE_SO_DA_LOJA=true` no backend, é recusada (401). Chamada nova da loja ao Medusa: pelo SDK ou
  pelo `medusa()`, nunca por um `fetch` solto. NOS CONFERIDORES, com a trava ligada no local: o que
  o próprio conferidor pede direto à API tem que ir assinado — um `--require` que embrulha o
  `fetch` e põe o `x-loja-segredo` nas chamadas a `/store` do Medusa local resolve sem mexer neles.

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
novo" → `POST /admin/pedidos/:id/estorno`) e UM e-mail pra cada dono do painel (sem ninguém no
painel, pra cada usuário do admin — `lib/equipe/avisados.ts`); o do pagamento
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

**A quantidade do item do pedido, no `query.graph`, só vem com o item inteiro.** Ela mora no
`detail` do item (a tabela `order_item`), não na linha (`order_line_item`), e o Medusa (2.21) procura
`items.quantity` na linha: pedido campo a campo, sem nenhum total na lista, o item volta SEM a
quantidade. Com um total (`total`, `item_total`, `shipping_total`…) funciona por tabela — o Medusa
carrega o item inteiro pra fazer a conta —, e é por isso que a nota, a Frenet, os anúncios e o
painel nunca erraram. Foi o que pôs "0×" nos e-mails do caminho da encomenda (o #19, em 25/09;
entrega 0116). Pedido lido pra mostrar item: `items.*`, como a confirmação, o cancelamento e o
`lerPedido` de `lib/envios/medusa.ts`. O `conferir-envio` confere a quantidade nos três e-mails.
**O jeito leve** (entrega 0199): pedir junto o `items.detail.quantity` — a quantidade vem certa
campo a campo, sem o item inteiro. O `items.*` traz TUDO da linha, inclusive a descrição do produto
(medido na 0199: um item com a descrição de 2 mil caracteres, 3,9 KB com `items.*` e 250 bytes com os
campos e o `detail`). Leitura que se repete (o CRM, de 5 em 5 minutos, em todos os pedidos) vai
campo a campo com o `detail`: `pedidosParaAsEtiquetas` e os pedidos do Pix no motor. Leitura de um
pedido só pode seguir com o `items.*`.

**O QUE PASSA DO PRAZO VIRA AVISO** (entrega 0175, auditoria de 27/09) — nada fica parado calado:

- **A nota que passa dos três dias** (`notaAtrasada` e o passo 4 do `acompanharNotas`, em
  `lib/erp/notas.ts`): o pedido pago depois do `notas_desde`, não cancelado, com TODOS os
  pagamentos fora da janela da varredura e sem nota que ande (nem linha, ou "a emitir" com a loja
  tentando) vira "não sai sozinha" — `definitivo`, com o `MOTIVO_DA_NOTA_ATRASADA` e o último erro
  entre parênteses —, com um e-mail pra operação e o dono (o jeito `atrasada`: conferir no ERP se
  a nota já foi feita à mão; um só, em `avisos.atrasada`, mesmo que outro aviso tenha saído antes).
  A loja NÃO emite sozinha depois dos três dias: nota em dobro é problema com a Receita. O "Tentar
  de novo" (painel e admin) emite. Olha 30 dias pra trás, 50 por rodada; o painel reconhece pelo
  motivo (`notaPassouDosTresDias`, a etiqueta "3 dias sem nota").
- **A Frenet que passa dos três dias** (`registroAtrasado`, em `lib/envios/registro.ts`): o
  registro que não entrou e não foi recusado de vez fica `definitivo` com `desistiu_em` — o painel
  mostra "O pedido não entrou na Frenet", com o "Mandar de novo", e não "tentando entrar" pra sempre.
- **O cancelado que ficou no painel da Frenet**: o `tirarDoParceiro` grava `tentativas_ao_tirar` e
  `tentou_tirar_em`; a varredura do registro (`tirarCanceladosQueFicaram`, dentro do
  `registrarPendentes`) tenta de novo por `DIAS_TIRANDO` (7) dias depois do cancelamento, com a
  espera do registro — e o cancelado cujo evento se perdeu sai na primeira rodada. A primeira
  falha manda "O pedido #N foi cancelado e continua na Frenet" pra operação e o dono
  (`lib/emails/cancelado-na-frenet.ts`, um só: `avisou_ao_tirar_em`), e o painel mostra o problema
  (`canceladoNaFrenet`) até ele sair.
- **O aviso assinado por pedido** (`soDoPedido`, na `LeituraDoAviso`): a rota acha o pedido da
  assinatura, e o núcleo só mexe em envio dele — o código ou o `ShipmentId` do corpo que achar o
  envio de outro pedido (ou a etiqueta de outro, no admin) é "ignorado".
- **O CSV da newsletter** (o do painel e o do admin): a célula que começa com `=`, `+`, `-`, `@`,
  tab ou quebra vai com um `'` na frente — a planilha mostra como texto. E o `normalizarEmail`
  recusa o e-mail que começa com `=`, `+` ou `-` e o que tem `"(),:;<>[]\` ou caractere de
  controle (o `+tag` no meio, o `'` e o acento passam).
- **A avaliação sem o link** (`POST /store/avaliacoes` com `numero` e `email`, desde a 0193 — o
  link por e-mail da 0175 saiu, escolha do dono): o número e o e-mail têm que bater, e a resposta
  não traz nada do pedido (`{ ok: true }` ou o motivo; nem o `faltam`); a página lista a loja
  inteira, nunca os produtos do pedido. O que não bate conta à parte, mais apertado (10 por hora
  por IP assinado, 30 sem, 200 da loja), e a vaga é reservada ANTES de procurar (sem `await` entre
  conferir e reservar); achou o pedido, ela volta.

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
`POST /admin/envios/registrar`); `tirarDoParceiro` no `order.canceled` (e a varredura tenta de
novo o que não saiu — ver **O QUE PASSA DO PRAZO VIRA AVISO**). Vão os pagos, não
cancelados, sem envio criado no admin e pagos DEPOIS de o registro ligar — o "desde" fica no
metadata da loja (`fb_parceiros`), gravado na primeira rodada ligada, pra não duplicar no painel o
pedido que já teve etiqueta à mão. Uma vez só: trava por pedido e o registro em
`metadata.fb_parceiro`, gravado pela porta do metadata do pedido (ver **O metadata do pedido**,
abaixo) — registro perdido aqui é o mesmo pedido entrando duas vezes no painel.
Recusa da Frenet (400, erro no item) é definitiva e o log pede a etiqueta à mão; queda, tempo e
token recusado voltam na varredura, com espera crescente (10 min até 6 h), por três dias — e
depois a loja para e diz (`desistiu_em`). No
painel o pedido se chama **FB-<número>** (`referenciaDoPedido`) — a Nuvemshop segue na mesma conta,
com a numeração dela —, e o núcleo aceita esse nome de volta. Registrado o pedido, nasce um envio
"aguardando", SEM código, com o `ShipmentId` — o aviso acha o pedido por ele; sem código, ninguém
mostra nem pergunta por ele. Cada pedido leva o `TrackingNotificationUrl` dele, montado com o
`MEDUSA_BACKEND_URL`: `?pedido=FB-N&assinatura=HMAC(FRENET_WEBHOOK_TOKEN)`, que só vale pra aviso
daquele pedido (`lerAviso`) e só mexe em envio dele (`soDoPedido`). A chave da porta nunca vai em URL. No conferidor de envio, a seção 7c
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
vai pro ERP no `payment.captured`, pela varredura `acompanhar-notas` (5 em 5 minutos; a nota PARADA —
rejeitada ou denegada, esperando alguém corrigir no ERP — de 30 em 30, nos minutos 4 e 34:
`horaDasParadas`, entrega 0199; a rota do admin olha tudo) e pelo aviso
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

O **aviso de venda nova** (`src/lib/avisar-venda.ts`; o desenho em `emails/venda-nova.ts`) é esse
molde, pro dono: sai no `pagamento-capturado.ts` logo depois da confirmação do cliente, e pela mesma
varredura — no fim do job `confirmar-pedidos` e no `POST /admin/pedidos/confirmar`, que devolve o
relatório `vendas`. Vai pro papel dono (`emailsPraAvisar`; a linha "Venda nova" de
`AVISOS_DA_EQUIPE`), um e-mail por pessoa, com a chave `venda-nova/<id>/<para>`. O registro
(`metadata.emails.venda`) só é gravado quando todos receberam: com um dono recebendo e o outro não,
a varredura manda de novo, e a chave segura o repetido de quem já tinha. Sem dado de quem comprou,
como os outros avisos da equipe: os itens e os totais são os do e-mail do cliente
(`paraPedidoDoEmail`, `linhaDoItem`, `totais`), e o `VendaDoAviso` não tem onde pôr nome, endereço
nem o final do cartão. Não sai pra pedido cancelado (o Pix pago num pedido já cancelado volta pra
quem pagou — não é venda), sem o Pagar.me ou que já saiu pra entrega; o cartão em análise só avisa
quando é cobrado. O botão abre o pedido no painel (`DASHBOARD_URL`) ou, sem ele, no admin. O
`conferir-pagamento` confere o aviso em cada caminho: Pix pelo aviso, cartão na hora e depois da
análise, o Resend fora, o "Check status", e nenhum pro Pix vencido, pro reprovado e pro Pix pago
depois do cancelamento.

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
`emails.devolvido`, `emails.venda`, `estornos`, `fb_parceiro` e `fb_bump` — e UMA porta de escrita:
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

Os **mais vendidos da home** (entrega 0180, pedido da loja em 28/09): o carrossel
(`components/home/colecao.tsx`, até 12) e a vitrine "Todos os produtos" (`vitrine.tsx`, até 8 —
antes era o catálogo, até 12) começam pelo que mais vendeu. O BACKEND conta
(`apps/backend/src/lib/mais-vendidos.ts`, pura, com testes): as unidades dos últimos 90 dias,
somando os pedidos pagos do Medusa (dinheiro capturado e sem cancelar — o `pagamentoDo` do painel)
e os "confirmado" da base da Nuvemshop que o CRM guardou (`crm_base_pedido`, `vendidosDaBase` no
service do CRM); o item vira o produto de hoje pelo SKU (o do Bling, igual nas duas lojas) e, sem
SKU que case, pelo endereço; no empate, o que esteve em mais pedidos, depois o endereço.
`GET /store/mais-vendidos` devolve só a ordem (`{ handles }`, sem quantidade nenhuma) e só pra loja
(`daLoja`), com 10 min de memória; a loja guarda 1 h (`maisVendidos`, tag `mais-vendidos`; o erro
vira lista vazia por minutos, e a home fica na ordem de sempre). A LOJA ordena
(`maisVendidosPrimeiro`, em `lib/catalogo.ts`): os que venderam, na ordem da API; os que não
venderam, na ordem de sempre; o esgotado no fim de tudo — e só então corta (cortar antes deixaria
de fora o mais vendido que o Medusa devolvesse no fim da lista). A Nuvemshop sai da conta sozinha
quando os 90 dias passarem da virada (fim de dezembro). O palco "Alta performance" segue na ordem
do painel. O conferidor é o `conferir-catalogo` (seção 14, com o `REVALIDAR_SEGREDO` no ambiente):
ele avisa a loja pra refazer a ordem e os produtos antes de olhar a home, porque os conferidores
que compram mudam a conta e o estoque.

A **newsletter** do rodapé é um módulo próprio (`src/modules/newsletter/`, tabela
`newsletter_inscricao`): só o e-mail, a origem e a data do consentimento, como a Política de
Privacidade promete. Entra por `POST /store/newsletter` (a mesma resposta pra quem já estava na
lista, e os limites por IP assinado do código da conta) e se vê, baixa em CSV e remove no admin, em
"Newsletter". Remover APAGA — é o "pode sair quando quiser" e o pedido de exclusão da LGPD. A
tabela `loja.newsletter` do Supabase, do plano antigo, ficou sem uso.

O **produto esgotado e o avise-me** (entrega 0124). Esgotado é OUTRA caixa de compra
(`CompraEsgotada`, em `components/produto/compra.tsx`): o preço, a faixa "Esgotado" e o "avise-me
quando chegar" (`components/produto/avise-me.tsx`, a ação `lib/acoes/avise-me.ts`) no lugar do
botão — sem frete, unidades, leve junto e garantias; a barra fixa vira "Avise-me" e leva pro campo.
A régua é a de sempre (`temEstoque`, `esgotado` em `lib/medusa.ts`; com `allow_backorder` a variante
vende e o número não limita); a `Dobra` põe o selo na foto e o "enquanto isso" pra categoria. O card
diz "Esgotado" e "Avise-me" sem CSS novo (ele mora na home, que não tem folga), e o carrossel da PDP
põe o esgotado no fim. No backend, o módulo `src/modules/avise-me/` (tabela `aviso_de_estoque`: o
e-mail, a variante e a data do pedido) recebe `POST /store/avise-me` — só produto no site e
esgotado (o com estoque é 409 `tem_estoque`, e a rota avisa a loja da página velha), a mesma
resposta pra quem já esperava, os limites da newsletter. O job `avisar-quem-espera` (4-59/5, um
minuto depois da cópia do Bling; `POST /admin/avise-me/rodar` é o gêmeo) faz, nesta ordem: (1)
avisa a loja do produto que esgotou ou voltou desde a rodada anterior (a foto fica na memória; a
primeira rodada depois de subir avisa todos) — a última unidade vendida é reserva, não mexe no
nível, e ninguém avisava a loja: a PDP seguia com "Adicionar à sacola" por até uma hora; (2) manda o
"Voltou pro estoque" (`lib/emails/avise-me.ts`, com UTM `utm_campaign=avise-me`) pra quem espera
um produto que voltou, de quem pediu primeiro, 60 por rodada, com `idempotencia` `avise-me/<id>`;
enviado, a linha fica sem o e-mail (`avisado_em`) — 422 apaga, queda conta `falhas` e para a rodada.
O aviso à loja usa o perfil `"agora"` do `/api/revalidar` (`{ expire: 0 }`): o `"seconds"` ainda
serve a página velha por até um minuto, e quem clica no e-mail logo que ele chega cairia no
"Esgotado". A regra pura (`planoDaRodada`, `produtosQueMudaram`, `vendeAgora`) tem teste. O painel
lê `avisos` em `GET /dashboard/produtos/:id` (esperando e avisados), e o "Tirar" da newsletter apaga
os pedidos de aviso do e-mail. O conferidor é o `ferramentas/conferir-avise-me.mjs`: esgota um
produto pelo admin (o spray, ou `ESGOTAR`) e devolve no fim, lê os pedidos em `GET /admin/avise-me`
e os e-mails no Resend falso (`PORTA_RESEND`, a do `RESEND_URL` do backend), com a loja no
`LOJA_URL` do backend — senão a rodada não tem pra quem avisar e a página não vira.

A **esteira de avaliações** da home ("Nossos clientes nos amam", `components/home/amam.tsx`) mostra
até quatro depoimentos de cada produto — avaliação ou trecho de entrevista —, sorteados a cada
visita e repartidos em DUAS FILEIRAS, como no protótipo: a de cima corre pra esquerda e a de baixo
pra direita (`.amam__esteira--volta`), cada uma com metade dos de cada produto (`emDuasFileiras`).
O mesmo depoimento posto em vários produtos (a mesma pessoa, o mesmo texto) conta uma vez só — na
esteira e na nota média (`lib/avaliacoes.ts`). O sorteio é no navegador
(`components/home/esteira-de-avaliacoes.tsx`): a home continua estática, e a semente da visita entra
por `useSyncExternalStore` (`lib/use-semente-da-visita.ts`). Os cartões só são desenhados quando a
seção chega a uma tela de distância: no carregamento vai só o lugar, com a altura das duas fileiras
reservada (`.amam__lugar`), e os TEXTOS só vêm nessa hora — a esteira busca
`conteudo/depoimentos.ts` com `import()`, e do servidor vêm só as fotos (por prop, os 160 trechos
iam dentro do HTML da home: 5 KB comprimidos, 0,3 s de LCP no CI). A foto do cartão é
`getImageProps` no tamanho da caixa (54 px, só 1x e 2x). A volta dura 7,5 s por cartão na fileira
de cima e 9,5 s na de baixo (o ritmo do protótipo): com mais depoimentos, ela fica mais longa, e não
mais rápida. A página do produto mostra TRÊS depoimentos dele, sorteados com a mesma semente
(`components/produto/depoimentos-sorteados.tsx`): o HTML sai com os três da semente fixa, e o
navegador troca pelos da visita logo depois da hidratação. O cartão é o mesmo nas duas
(`components/depoimento.tsx`). `ferramentas/conferir-esteira.mjs` confere os sorteios e a lista de
trechos, sem servidor.

**Trecho de entrevista não é avaliação** (`TRECHOS`, em `conteudo/depoimentos.ts`; VAZIA desde a
0213, pedido do dono: com as avaliações de quem comprou chegando, os 160 trechos saíram): aparece como
"Entrevista com cliente", sem nome, sem estrela e sem selo, e fica fora da nota média e do
`AggregateRating` — na esteira e na seção "O que diz quem usou" (três por visita) da página do
produto de que ele fala (uma vez só; os do Fator não se repetem nos kits). Avaliação de verdade,
com o nome e a nota que a pessoa deu, vem de quem comprou (a página `/avaliar`, abaixo) ou de
`AVALIACOES`, e ENTRA ANTES dos trechos: nos quatro de cada produto da esteira e nos três da
página, as avaliações primeiro e os trechos completam (`avaliacoesPrimeiro`, em
`lib/avaliacoes.ts`); entre as do mesmo tipo, a mesma chance, sem olhar a nota. Com 20 trechos por
produto, a primeira avaliação de verdade aparecia em uma visita a cada sete. As regras estão no
topo do próprio arquivo.

**As avaliações de quem comprou** (entrega 0152). Três pontas, no molde do avise-me:

- **O e-mail** "Pedido #N: o que você achou?" (`lib/emails/avaliacao.ts`) sai da rodada
  `pedirAvaliacoes` (`lib/avaliacoes/pedir.ts`), no job `pedir-avaliacoes` (de hora em hora, no
  minuto 37) e em `POST /admin/avaliacoes/pedir` (o gêmeo, que passa por cima do relógio). A regra
  é pura, com teste (`lib/avaliacoes/regras.ts`): o pedido que CHEGOU INTEIRO — todo pacote dele
  `entregue` no núcleo dos envios, nenhum na rua (`chegouEm`; o "aguardando" sem código é o registro
  no parceiro, não conta) — há pelo menos 24 horas e no máximo `JANELA_EM_DIAS` (10), pago, não
  cancelado e com produto sem nota (`decidirPedido`); só das 9h às 20h59 de Brasília
  (`dentroDoHorario`). A hora é o `envio.entregue_em`: a da transportadora, ou o "Mark as delivered"
  do admin, que entra no núcleo igual. Uma vez por pedido, com o molde dos e-mails de pedido: o
  registro em `metadata.emails.avaliacao` (`email`, `dispensado` com o motivo, ou `recusado` — o
  422 do Resend), pela porta do metadata, e a chave `pedir-avaliacao/<id>`. A etiqueta `tipo` é
  `pedir-avaliacao` ("Pedido de avaliação" no CRM). O e-mail lista só os produtos ainda sem nota.
- **A página escondida `/avaliar`** (loja): sem conta. O botão do e-mail leva a
  `/avaliar/<pedido>.<assinatura>` (`app/avaliar/[link]/route.ts`), que guarda o link num cookie
  `httpOnly` (`avaliar`, só no caminho `/avaliar`, 60 dias; `lib/avaliar.ts`) e manda pra
  `/avaliar?produto=…` LIMPA, com as UTMs: o link não fica no endereço, no histórico nem no GA4, que
  manda a URL inteira. O link é um HMAC do id do pedido com uma chave derivada do `JWT_SECRET`
  (`lib/avaliacoes/link.ts`); não vence. A página lê o pedido em `GET /store/avaliacoes/pedido`
  (número, nome sugerido — o primeiro nome e a inicial, `nomeSugerido` —, os produtos e se já têm
  nota) e manda em `POST /store/avaliacoes` (o link vem do cookie, nunca do formulário). **Sem o
  link** (desde a 0193: o endereço que o dono manda pelo WhatsApp, quem comprou na loja antiga), a
  página é UM formulário (`components/avaliar/direto.tsx`): o número do pedido, o e-mail da compra,
  o nome, o produto (um `<select>` com a loja inteira, `produtosParaAvaliar` — os mais vendidos
  primeiro —, e a foto do escolhido; `?produto=<id ou handle>` abre marcado), as estrelas e o
  texto, num `POST /store/avaliacoes` com `numero` e `email` no lugar do `p`. O Medusa acha o pedido
  (`acharPedidoDireto`, em `lib/avaliacoes/pedido.ts`) na loja nova pelo `display_id` e, sem achar,
  na base da Nuvemshop que o CRM guardou (`pedidosDaBase` do e-mail, o número exato; aceita o
  `confirmado`), e o produto tem que ser do pedido ou vir num kit dele (`produtosQueOPedidoAvalia`:
  o avulso de cada componente pela tabela de SKUs do CRM, `componentesDoItem` + `skuAvulso`;
  produto de uma unidade só não abre outro). A avaliação da loja antiga guarda o id `nso_…` da
  linha da base e o número de lá. Respostas: 404 `pedido_nao_encontrado`, 409 `nao_aceita`,
  `fora_do_pedido` ou `ja_avaliou`. Depois do "valeu", "Avaliar outro produto" remonta o
  formulário com o pedido, o e-mail e o nome. O `<select>` é NÃO controlado (`defaultValue`), e os
  campos são refeitos a cada resposta (`key` = rodada): o `reset()` que o React dá no formulário
  depois da ação volta o select controlado pra primeira opção. Uma avaliação por produto de cada
  pedido (índice único; 409 `ja_avaliou`), só de pedido pago e não cancelado — a entrega não entra
  na conta: quem recebeu sem o rastreio dizer ainda avalia pela página. Os limites são na memória,
  por IP assinado (os da newsletter; o do número e e-mail que não batem, na regra da auditoria
  acima). O texto vai como a pessoa escreveu (`limparTexto` só tira espaço nas pontas, caractere de
  controle e linha em branco repetida). Fica fora do Google (o `Disallow` do robots e o `noindex`),
  e o `proxy.ts` não baixa a caixa do `/avaliar/` (`CAMINHOS_COM_ID`).
- **O painel** (Pessoas → Avaliações; a área `avaliacoes`, dos três papéis no padrão): as novas
  (da mais antiga), as do site e as recusadas; aprovar põe no site, recusar não põe (ou tira), e a
  recusada pode ser APAGADA de vez (`apagarAvaliacao` — o pedido de exclusão da LGPD; dois passos,
  com confirmação). Tudo pelo `moderarAvaliacao` (`lib/avaliacoes/moderar.ts`), que avisa a loja
  (`avaliacoes`, perfil "seconds") quando o site muda, e com a linha no registro da equipe. O número
  do pedido só vai pra quem abre os Pedidos; o da loja antiga (`pedido.nuvemshop`) sai como "Pedido
  #N da Nuvemshop", sem link — não tem página no painel. O Início diz "N avaliações esperando". O
  admin do Medusa tem o mesmo em `POST /admin/avaliacoes/:id`.

O site lê as aprovadas em `GET /store/avaliacoes` (`avaliacoesDoSite`: o produto pelo HANDLE de
agora, só produto publicado, nada do pedido), pela `avaliacoesPublicadas` da loja (`lib/medusa.ts`,
etiqueta `avaliacoes`, dias; o 404 do Medusa de antes da rota é lista vazia) e o
`avaliacoesDoMedusa` (`lib/avaliacoes-do-medusa.ts`, com o selo de compra verificada: toda uma veio
de pedido pago). A página do produto soma as aprovadas às de `AVALIACOES` (a nota e a conta olham todas; pro
sorteio vão as 24 mais recentes, pra lista não crescer dentro do HTML) e põe a nota no Product pelo
`itemref="avaliacoes-nota"` da dobra — só quando ela existe. A esteira da home NÃO recebe as
avaliações no HTML: o pedaço à parte que ela já buscava com `import()` virou
`lib/depoimentos-da-esteira.ts`, que junta os textos de `conteudo/depoimentos.ts` com a
`/api/avaliacoes` da loja, na hora em que a seção chega perto. **Esse pedaço não importa
`lib/avaliacoes.ts`** (nem a conversão mora lá): módulo dividido entre o JavaScript da primeira
tela e um pedaço à parte vira um TERCEIRO pedaço, que a home baixa a mais — na 0152 isso custou
+180 bytes comprimidos na home e na PDP, só de mudar onde o `semRepetidas` era chamado. Medido com
`next build` da main e da entrega contra o `medusa-falso.mjs`, somando os scripts do HTML de cada
página: a entrega ficou com +87 bytes (o `avaliacoesPrimeiro`) e +13 no HTML. O `medusa-falso.mjs` do CI responde
`/store/avaliacoes` vazio. Conferidores: `apps/loja/ferramentas/conferir-avaliacoes.mjs` (o pedido
entregue há dois dias por um aviso da Frenet com a hora dela, o e-mail, a página, o que o Medusa
guardou, a página sem o link — o Kit Completo que abre o óleo e não o Fator, o e-mail errado, o
formulário que volta com o produto e a nota, o "avaliar outro produto", o Pix não pago e os dez
chutes que dão 429 —, a aprovada na página do produto e a limpeza no fim; as chamadas à API vão
assinadas com o IP da rodada, e o `umSo` espera o formulário ficar um só: no `next dev`, o bloco do
streaming fica um instante em dobro, com a cópia escondida) e
`apps/dashboard/ferramentas/conferir-avaliacoes.mjs` (as avaliações pelo número e o e-mail, uma de
um pedido da loja antiga — o arquivo de vendas da rodada entra pela base do CRM —, a tela, aprovar,
tirar, apagar, o Início e o marketing sem o número do pedido).

**Os criadores** (entrega 0189): a página escondida da proposta pra quem grava vídeo pros
anúncios — os criativos (25 desde a 0196) pelo fixo ou pela comissão — e a inscrição dela. Três
pontas:

- **A página `/criadores`** (loja; `app/criadores/page.tsx`, `components/criadores/`,
  `estilos/telas/criadores.css`): fora do menu, do sitemap e do Google (o `Disallow` do robots e o
  `noindex`), e sem o pop-up da 1ª compra (`SEM_POPUP`, em `lib/primeira-compra.ts`: quem chega lá
  vem se inscrever, não comprar). O link vai por mensagem; o painel copia. Não é página montável (o
  registro de `lib/secoes/` é da home e da PDP). OS NÚMEROS DA PROPOSTA — o fixo, a porcentagem, o
  pedido médio da calculadora, os prazos de gravar e de responder — moram num lugar só, a `OFERTA` de
  `lib/criadores-visivel.ts`: o texto, a calculadora, as dúvidas e o conferidor leem de lá. A
  COMISSÃO NÃO TEM PRAZO (0196, decisão dele: "o que vender, vamos pagar"): a calculadora não soma
  "em N meses" — mostra em que mês a comissão passa do fixo (`mesesPraPassarDoFixo`). Os criativos
  são `ideias × ganchosPorIdeia` (5 × 5 = 25): a matriz (`components/criadores/matriz.tsx`) tem
  os ganchos escritos de cada ideia — mudou a conta, muda a matriz junto (o conferidor confere). O
  celular do topo (`camera.tsx`) troca de foto em cada momento — gancho, corpo e fecho, em
  `components/criadores/fotos/` (de um criador, com autorização e contrato; em pé, 9:16) —, com a
  frase embaixo, acima da barra do tempo, pra não cobrir a barba. O kit
  são quatro produtos do Medusa pelo handle (`listarProdutos`), e a prévia do link (`og:image`) é a
  foto do kit completo. A inscrição usa os campos do checkout (`.campo`) e manda pela ação
  `inscreverCriador` (`lib/acoes/criadores.ts`), que confere antes com a mesma régua do Medusa e
  assina o IP de quem pede. Os modelos do formulário remontam a cada envio (`key`): o React 19
  limpa o formulário depois da ação, e o rádio controlado ficaria desmarcado com o estado dizendo o
  contrário. As classes são todas `criadores__*` — duas delas já colidiram entre o celular animado
  e o formulário; nome novo, confira antes que não existe.
- **O Medusa** (`src/modules/criadores`, a tabela `criador_inscricao`): `POST /store/criadores`
  confere campo a campo na ordem da página (`lerInscricao`, puro, com teste) — nome e sobrenome,
  WhatsApp em dígitos (sem o 55), e-mail, cidade, Instagram ou TikTok (sem @ nem link), barba,
  vídeo (só `http(s)`: o painel mostra como link), modelo e a autorização com os 18 anos — e
  responde igual pra qualquer e-mail: quem manda de novo ATUALIZA a sua (uma por e-mail), e a
  recusada volta pra fila (`workflows/criadores/inscrever.ts`). CPF, endereço e Pix não entram:
  vêm no contrato, depois do sim. Os limites são na memória, por IP assinado (10 por hora; 30 sem
  assinatura; 300 da loja toda). O log não leva dado da pessoa.
- **O painel** (Pessoas → Criadores; a área `criadores`, do dono e do marketing — a operação não
  vê WhatsApp e e-mail de quem não é cliente): as novas (da mais antiga), as aprovadas e as
  recusadas, com o botão do WhatsApp (a mensagem pronta, `mensagemPraCriador`), os perfis, o vídeo
  e o modelo; os números de cima contam as novas e quantas querem cada modelo; o link da página e
  o "Copiar o link da página" saem do `LOJA_URL`. Aprovar e recusar pelo `decidirInscricao`
  (`lib/criadores/decidir.ts`), com a linha no registro da equipe só com o modelo; apagar de vez só
  a recusada (dois passos, com confirmação — o pedido de exclusão da LGPD). O admin do Medusa tem
  `GET /admin/criadores[?email=]` e `POST /admin/criadores/:id`.

Conferidores: `apps/loja/ferramentas/conferir-criadores.mjs` (o `noindex` e o sitemap, a oferta e
a calculadora contra a `OFERTA` do código, o kit contra a API, o "Quero o fixo", cada campo
recusado no lugar certo, o que chega no banco, o pop-up que não aparece e o celular) e
`apps/dashboard/ferramentas/conferir-criadores.mjs` (a tela, o WhatsApp, aprovar, recusar, a
reinscrição que volta pra fila, apagar, e a operação sem acesso).

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
houver dono ativo (`workflows/equipe/garantir-dono.ts`). **Quem abre o quê é UMA matriz**, conferida
no servidor: o padrão no código (`ACESSO_PADRAO`, em `src/lib/equipe/regras.ts`) com o que o dono
mudou por cima (a tabela `equipe_acesso`, só as diferenças; `matrizCom` junta). O painel só esconde o
que ela nega. O dono muda as colunas da operação e do marketing em Configurações → Equipe e acessos
(entrega 0139): `POST /dashboard/acessos` recebe a coluna INTEIRA de cada papel, e `lerAcessos`
recusa a coluna do dono (abre tudo, sempre), as linhas fixas (`AREAS_FIXAS`: `inicio` pra todos,
`equipe` só do dono) e o que mora `DENTRO_DE` uma área sem ela (o estorno nos pedidos, editar nos
produtos, a newsletter nos clientes, a meta no marketing); o `mudarAcessosWorkflow` grava as
diferenças e deixa a linha `mudou_acessos` no registro. Todas as rotas `/dashboard/*` passam pela
`portaDoPainel` (`src/lib/equipe/acesso.ts`): assinatura, token do ator `equipe`, e o membro e a
matriz relidos do BANCO a cada pedido (`pedido.areas`) — tirado da equipe, o token de 30 dias não
abre mais nada no clique seguinte, e a tabela salva vale no clique seguinte também. Rota nova já
nasce trancada; a área nova entra no `ACESSO_PADRAO` antes da rota, com os papéis que abrem no
padrão (vale o padrão até o dono mudar, sem migração), e a rota começa com
`exigirArea(pedido, res, "<área>")`. O que mora dentro de uma tela que a rota já abriu (um botão, um
bloco, um item do Início) pergunta `abre(pedido, "<área>")` — nunca `papel === "dono"`: o dono pode
ter dado a área pra outro papel. **Os papéis que o dono cria** (entrega 0223): tabela
`equipe_papel` (só o nome; `listPapeisCriados`…, porque a chave "Papeis" vira "Papeises" no tipo
do Medusa), e o id (`papel_01K…`) vai no `papel` do membro e da `equipe_acesso` — os dois viraram
texto. O papel criado nasce abrindo só o Início (`abreNoPadrao`) ou copiando a coluna da operação
ou do marketing (`areasDoPapelNovo`); cada caixinha marcada é uma linha na `equipe_acesso`.
`matrizCom(ajustes, personalizados)` só dá coluna aos papéis da lista (`papeisCriados`, ou só o de
quem pede, no `membroAtivo`), e `lerAcessos` exige a coluna de cada papel criado, nem mais nem
menos (`papeis_mudaram`, 409). Criar, renomear e apagar: `POST /dashboard/papeis` e
`/dashboard/papeis/:id` (`workflows/equipe/papeis.ts`, na trava da equipe, com registro); só
apaga papel sem ninguém ativo ou convidado. O dado pessoal é a linha `contatos` (telefone,
endereço, cidade, pedidos na ficha e a lista inteira de clientes): nos três de sempre ela segue o
papel (`AREAS_DO_PAPEL`: a operação abre, o marketing não, e a tabela não muda isso); no papel
criado, é caixinha. As rotas perguntam `abre(pedido, "contatos")` ou `papelDosDados(pedido)` (o
papel fixo cujas regras de dado pessoal valem), nunca `papel === "marketing"`; o CPF inteiro segue
só do dono. O papel segue decidindo pra quem vai cada aviso por e-mail (`emailsPraAvisar`, só os
três de sempre — o papel criado não recebe aviso) e as abas de baixo do celular (no papel criado,
as quatro primeiras do menu que ele abre). Toda escrita na equipe
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

**A velocidade do painel e as listas em páginas** (entrega 0146). Três regras pra toda tela:

- **A leitura sai antes do `SoPara`.** O `SoPara` espera a pergunta "quem é" (`/dashboard/eu`)
  antes de desenhar o miolo; lida dentro dele, a leitura da tela só saía depois — duas idas ao
  Medusa, uma atrás da outra, em todo clique. A página chama `void ler(caminho)` (o GET com o
  `cache` do React, em `apps/dashboard/src/lib/medusa.ts`) ANTES de devolver o `SoPara`, e o miolo
  chama `await ler(caminho)` com o mesmo caminho: a resposta é a mesma, e as duas perguntas saem
  juntas. O Marketing faz igual com os leitores de `lib/marketing.ts` (todos com `cache`). Quem
  barra continua sendo o Medusa: o papel sem a área recebe 403, e o miolo mostra o "sem acesso".
- **Toda área tem um esqueleto** (`loading.tsx`, com o `components/esqueleto.tsx`: `inicio`,
  `lista`, `detalhe`, `abas`, e `aba` pra quem tem o título no layout, como as Configurações). O
  clique troca a tela na hora — o Next guarda o esqueleto de cada link do menu de antemão — e os
  dados entram quando chegam. Área nova ganha o seu. Com o esqueleto, a página que dá `notFound()`
  depois de ler responde 200 (a resposta já começou); o painel não é indexado, e a tela é a mesma.
- **Lista que cresce vem em páginas** (`apps/backend/src/lib/painel/paginas.ts`: `lerPagina` lê o
  `?pagina=`, `paginar` recorta e devolve `paginacao: { pagina, paginas, porPagina, itens }`; página
  que não existe vira a última). As contas (as fitas de filtro, os números de cima, a busca) olham a
  lista inteira; só a página viaja. Pedidos, clientes e carrinhos vêm de 30 em 30, os cupons de 20
  (com a busca pelo código, `?busca=`) e a newsletter de 50 (o CSV pede `?todos=1`). No painel, o
  pé é o `components/paginas.tsx`, e o endereço de cada página leva o filtro e a busca de agora.
  **O total do pedido pesa**: o Medusa não guarda, calcula pedido a pedido (itens, impostos,
  ajustes, frete e créditos) — pedir `total` numa leitura de centenas de pedidos dobrava o tempo
  dela. A lista de pedidos, a de clientes, os usos dos cupons e o Início leem SEM o total
  (`pedidosRecentes({ semTotal: true })`, `pedidosDosClientes({ semTotal: true })`) e pedem o
  total depois, só de quem precisa (`totaisDos`): os pedidos da página, o "gastou" de quem está
  na página (`vendidosDaPagina`/`comGastos`), os pedidos pagos que usaram um código e, no Início,
  `precisamDoTotal` (os pagos nos últimos 8 dias, o que espera pagamento e os de hoje). Busca de
  lista usa o `Form` do `next/form` (troca só a tela, sem recarregar o painel).

**O painel mais visual, com menos texto** (entrega 0148; o desenho aprovado pelo dono está em
<https://claude.ai/artifact/DLk4uCe8UcrjFLpzqZP3xx>). Frase que explica a tela não fica mais embaixo do título:
vai no "?" (`Ajuda`, em `apps/dashboard/src/components/visual.tsx` — um `<details>`, sem JavaScript; a
`Cabeca` recebe `ajuda`). As peças do mesmo arquivo trocam frase por desenho: `Sigla` (as iniciais da
pessoa, numa das quatro cores da marca), `Fotos` (até três fotos dos produtos e "+N"), `Forma` (o ícone do
Pix ou do cartão), `Passos` (os seis passos do caminho em tracinhos: preto feito, amarelo agora, vermelho
com problema) e `Faisca` (as barrinhas da semana dentro de um número); o CSS mora em `estilos/visual.css`.
O backend manda os dados de cada uma: `LinhaDaLista` ganhou `fotos`, `produtos` e `passos` (o
`caminhoDo` do pedido aberto, só os estados) e `LinhaDoCliente` ganhou `canais` (e-mail e WhatsApp).
**A fila do Início junta o que é igual** (`filaDosPedidos`, em `lib/painel/inicio.ts`): sete "a nota do
#N não sai sozinha" viram um item, com `chave` (estável, a do painel), `quantos` (o número do selo),
`etiquetas` (curtas: o motivo — `motivoCurto` traduz os motivos conhecidos do ERP, como "sem CPF/CNPJ" —,
o valor dos estornos, a idade do cartão em análise mais antigo, o que falta pra despachar) e `pedidos`
(do mais antigo pro mais novo; o painel mostra seis e "+N"); o `texto` é a explicação, e vai no "?".
Com um pedido só, o link vai direto nele; com vários, na lista filtrada. Os contratos dos conferidores
continuam: o `.fila__titulo` é só o título da API (o número do selo mora fora dele), o `.numero__sub` das
visitas tem o mesmo texto (a seta é desenho), a frase das ofertas de cada cliente segue na linha, em
`sr-only`, e o título de cada bloco (`.bloco__titulo`) não leva o número — ele fica ao lado.

**O mesmo desenho no resto do painel, parte A** (entrega 0155: o pedido aberto, os Produtos — a lista e a
página de cada um —, os Carrinhos e os Cupons). `Faixa` (em `components/visual.tsx`): o título e as
`etiquetas` à vista, a frase inteira no "?", o botão embaixo (`acoes`); o `.faixa__titulo` continua só o
título. As faixas do pedido ganharam `etiquetas` no backend (`faixasDo`, em `lib/painel/pedido.ts`: o
motivo curto da nota — o `motivoCurto` mora ali agora, e o Início importa de lá —, "vale até 14:30", a
transportadora e o código, o prazo do cancelamento da nota, a próxima tentativa do estorno); o pagamento
ganhou `tipo` (o ícone) e as ações ganharam `saiAs` (a hora da nota, numa pílula; a `dica` vai no "?").
`Pilula` é a pílula com ícone ("Só pra ver" no alto do produto de quem não edita, no lugar da frase em
cada bloco; "Estorno é com o dono."; o aviso de volta) e `Fichas` quebra uma frase com " · " em fichas
(as regras do cupom e da promoção). O "?" de uma faixa e o do título de um bloco (`.bloco__titulos`)
abrem embaixo da linha, a partir da esquerda dela: numa coluna da direita, abrir do "?" pra direita saía
da tela. A `Cabeca` mostra o selo e o "?" juntos. Carrinhos: `LinhaDoCarrinho` ganhou `fotos` e
`produtos` (o `fotosDos` do pedido, agora exportado) e `falhou` (o pagamento tentado que não passou: o
passo fica vermelho); a frase do passo segue na linha, em `sr-only` e no `title`. Cupons: `CupomNaLista`
ganhou `selo` ("15%", "R$ 20", "Frete grátis" — `seloDoCupom`), `usados` e `limite` (a barrinha dos
usos). Tudo campo a mais: o painel novo com o backend de antes mostra as telas sem os desenhos novos.

**Parte B** (entrega 0158: Observabilidade, Configurações, Marketing e Layout da home; só no painel).
`CabecaDoBloco` (em `components/visual.tsx`: o título, o "?" e, à direita, o que vier) no lugar do
`bloco__sub` que só explicava; o `bloco__sub` que traz dado (a meta do mês, o estado da conexão do ERP)
fica. Nas Configurações, o `Bloco` e o `LinhasDeStatus` já põem o `sub` no "?". Observabilidade: a faixa
de cima é a `Faixa`; os números têm ícone; o freio do cartão é uma pílula (`[data-freio]`) com a frase
no "?" do bloco; cada integração mostra a frase à vista só quando não está "ok" (verde, ela vai pro
"?"); "Quem é avisado" virou uma linha (`faixa--curta`). NÃO pôr `Ajuda` dentro do cartão de um
problema: o conferidor abre o `details summary` do detalhe técnico, e dois `<details>` quebram o
clique. Marketing: o glossário e a fonte dos números moram no "?" do título do Resumo (`.glossario`
continua existindo, e o KPI mantém o `title` — o conferidor lê os dois); as notas do pé de cada aba
foram pro "?" do bloco ou do título. Layout da home: a faixa de publicar é a `Faixa`, com cada mudança
numa etiqueta (`nomesDasMudancas`, em `lib/home.ts`) e a última publicação numa pílula.

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
papel (o estorno tem linha própria no `ACESSO_PADRAO`, `estornos`, só do dono no padrão) e se
o pedido ainda está no
estado do botão (`src/lib/painel/acoes.ts`, puro; senão 409 `nada_a_fazer`), faz, e grava a linha
no registro da equipe (`lib/painel/anotar.ts`, com o `workflows/equipe/anotar-acao.ts`) — o
histórico do pedido lê o registro e mostra o nome de quem apertou. O aviso de baixo das ações é um só pro painel inteiro (`ComAvisos`, no
layout): a frase sobrevive à página se refazendo — e chega ANTES dela. A resposta da ação traz o
resultado primeiro e o aviso entra na hora; a tela refeita pelo `revalidatePath` entra numa
segunda renderização, a da transição, uns 20 ms depois no `next dev` (perto de 100 ms com o
navegador lento). Conferidor que lê a tela depois do aviso espera ela mudar (`waitFor`,
`waitForFunction`, como o histórico no `conferir-acoes`): lida na hora, às vezes ainda é a de
antes — era o "a pessoa sai da lista" do `conferir-entrar`, que falhava 1 em 3. E o contrário: o
aviso some 6 s depois de entrar (o de erro, 10 s), e a tela refeita pode chegar depois disso — com
a máquina carregada, o Resumo do Marketing refeito passou dos 6 s. Conferidor que confere os dois
lê o aviso quando ele entra (a espera devolve o texto: o `data-vez` diferente do de antes do
clique, sem `data-fora`) e só depois espera a tela — era o "Mudar a meta" do `conferir-marketing`
(entrega 0143). A peça pronta é o `avisoDoClique(pagina, clicar)` do `pecas.mjs` (entrega 0147,
nos cupons, promoções, integrações, clientes e configurações): faz o clique e devolve a frase do
aviso deste clique quando ele entra. Esperar só o `data-vez` mudar não basta: o aviso anterior,
saindo, também muda ele — e a espera soltava antes de a ação terminar.
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
**A memória curta** (entrega 0199, `src/lib/painel/memoria.ts`): as leituras de pedidos e carrinhos
do Marketing (`pedidosDoMarketing` e as vizinhas, em `ler-marketing.ts`, e o Resumo) passam pelo
`lembrar`: a mesma chave (o que se lê e desde quando — o período começa à meia-noite) sai UMA vez
pra quem chega junto (o "O que os dados dizem" roda as seis abas; abrir o Marketing dispara quatro
rotas) e fica guardada `MARKETING_MEMORIA_SEGUNDOS` (90, sem a variável; 0 desliga). A que falhou
não fica. Quem recebe não mexe na lista (as contas montam objetos novos — conferido na 0199). As
telas do dia a dia (Início, Pedidos) NÃO passam por ela: lá, o que mudou aparece na hora.
No `ACESSO_PADRAO`, `marketing` é do dono e do marketing, e `metaDoMes` (mudar a meta) só do dono.
`src/lib/painel/marketing.ts` é puro, com testes: o período (desde a 0191, o da barra do Início —
ver "O Marketing no período"; sem nada, 30 dias) e o de antes; venda é pedido
pago e não cancelado, no instante da captura, com o frete (a regra do Início, `vendasDos`); os
números com a variação (`null` sem nada antes); o gráfico (por hora, por dia, ou por semana nos 90
dias); os mais vendidos em reais (`items.total`); e a meta (`fb_metas` no metadata da loja, um valor
por mês — `{ "2026-09": 12000 }` —, gravada pelo `mudarMetadataDaLoja`). `GET /dashboard/marketing
?periodo=` devolve o Resumo (e `mudaAMeta`); `GET /dashboard/marketing/visitas`, as visitas e as
compras da loja do período e do de antes numa chamada só ao GA4 (`visitasDoMarketing`, em `ga4.ts`,
guardada como as do dia: `date`+`hour` do começo do de antes ao fim do período, com as datas
escritas (`datasComOAntes`; até a 0191, "NdaysAgo"), até 10.000 linhas cada — as
compras com o `SO_AS_COMPRAS_DA_LOJA`) e a conversão, compras ÷ visitas NO MESMO CORTE de hora
(`visitasDoPeriodo` — o Google soma hoje com atraso). **A conversão compara gente igual** (entrega
0135): o GA4 não vê quem recusa os cookies (até a 0166, não via ninguém que não aceitasse), então o
numerador são as compras que ELE viu, não os pedidos pagos do Medusa — dividir todos os pedidos pelas
visitas do GA4 inflava a conversão (quem recusa compra, mas não vira visita). O "Pedidos pagos" do Resumo segue sendo o de todos; `POST
/dashboard/marketing/meta` `{ valor }` (vazio tira) grava e anota `mudou-meta`. **As visitas
contam só o endereço da loja** (`hostsDaLoja(LOJA_URL)`, filtro `hostName` na pergunta): o GA4 é o
mesmo do site da Nuvemshop, que segue no ar até a virada — o `LOJA_URL` troca na virada, e o
filtro junto (o Início ainda conta os dois sites). No painel, `app/(painel)/marketing`, com
`components/marketing.tsx` (visitas e conversão num `<Suspense>`) e `mudar-meta.tsx`. O gráfico
fino (30 barras no celular: 8 px cada) usa `.barras-v--pontas`: a coluna de dentro de cada barra
crescia até a largura do rótulo e empurrava a barra pra fora da caixa. Conferidor:
`conferir-marketing.mjs` (o Google falso do `conferir-visitas`, que agora entende "13daysAgo").

**Marketing, parte 2: o Funil e os Canais** (entrega 0110). As abas (`AbasDoMarketing`) levam o
período junto, e cada aba tem a rota dela, que responde mesmo sem o Google (os dados da loja vêm
sempre; o do Google com `estado`). As perguntas de uma aba vão numa chamada só
(`relatoriosDoMarketing`, em `ga4.ts`: até 5 num `batchRunReports`, guardadas por aba, período e
endereços). **As compras que a loja manda pelo servidor não têm página**: o filtro do endereço
(`hostName`) as deixaria de fora, então o delas é o `transactionId` começando com "order_" (o id do
pedido no Medusa — as do site antigo são números: `SO_AS_COMPRAS_DA_LOJA`). O GA4 dá a origem da
sessão de quem comprou porque a compra vai com o `session_id` do rastro.
- `lib/painel/marketing-funil.ts` (puro, com testes): do site até o pagamento — as sessões, as
  sessões com cada um dos 5 eventos da loja (`view_item` … `add_payment_info`; o filtro pede só
  eles) e as compras —, com a maior perda (`passosDo`); da sacola ao pagamento pelos carrinhos do
  período (`carrinhosDesde`, com o `order.id` pela ligação `order_cart`: cada passo exige os de
  antes); celular × computador (as sessões por `deviceCategory`, o tablet como celular, e os
  pedidos pagos pelo navegador do `fb_rastro` — só com o sim, como as visitas); os achados.
- `lib/painel/marketing-canais.ts` (puro, com testes): as sessões e as compras por origem, meio e
  campanha; `canalDe` é o `nomeDaOrigem` do Início com o anúncio separado da busca ("Google
  (anúncio)", o meio `cpc`/`paid`) e "Influenciadores"; campanha é a do link com UTM (as do GA4
  vêm entre parênteses); `semOrigem` = os pedidos pagos da loja − as compras que o GA4 viu (quem
  recusou os cookies); o achado (o canal que converte mais contra o que traz mais gente, com um
  mínimo de visitas — abaixo dele, "ainda é pouco").
- Rotas `GET /dashboard/marketing/funil` e `/canais` (esta com `loja` — a origem do `LOJA_URL` — e
  `paginas`, a home, a vitrine e os produtos publicados, pro montador). No painel,
  `marketing/funil` e `marketing/canais`, `components/marketing-funil.tsx`,
  `marketing-canais.tsx` e `montar-link.tsx` (o link com UTM: as origens e os meios batem com o
  `canalDe`; o nome sem acento, `\p{Diacritic}`); no Resumo, "Canais que mais venderam".
- O Google falso responde as perguntas do Marketing pelo `painel.marketing` (sessões, eventos,
  compras, aparelhos, origens, vendas e, desde a parte 3, `itens`).

**Marketing, parte 3: os Produtos e as Ofertas** (entrega 0113).
- `lib/painel/marketing-produtos.ts` (puro, com testes): as métricas de item do GA4
  (`itemsViewed`, `itemsAddedToCart`) por `itemId` — o id da variante no Medusa, que a loja manda
  nos eventos; o filtro é `itemId` começando com "variant_" (`SO_AS_VARIANTES_DA_LOJA`: as do
  site antigo são números) —, somadas por produto (`catalogoDos`, de `lerProdutos` e
  `estoquesDos`); o vendido e a receita dos pedidos pagos; os sinais (esgotado, acabando com menos
  de 10, "muita visita, pouca sacola" abaixo de 60% da média com 30 visitas ou mais, vendendo, sem
  venda) e o achado. Sem o Google, a lista vem igual, com as visitas nulas.
- `lib/painel/marketing-ofertas.ts` (puro, com testes): a caixa de compra de cada produto
  publicado (`caixasDos`: o `fb_pdp` pelo `lerPdp` e o `caixaDo`) — "quantas unidades" funcionou
  quando o pedido leva 2 ou mais do produto; "leve junto", quando leva o produto e um dos de junto
  (a loja não marca a origem do item: é a conta possível) —; a oferta do checkout pelo ajuste
  "BUMP-" no item (`PREFIXO_DO_BUMP`), com certeza; os cupons pelos outros códigos dos ajustes.
  Os itens de venda (`vendasDos`) passaram a trazer o `handle` e os `ajustes` (os campos
  `items.product_handle` e `items.adjustments.*` no `pedidosDesde`).
- Rotas `GET /dashboard/marketing/produtos` e `/ofertas` (esta, só da loja). No painel,
  `marketing/produtos` e `marketing/ofertas`, `components/marketing-produtos.tsx` (a linha abre o
  produto no painel) e `marketing-ofertas.tsx`.

**Marketing, parte 4: os Clientes e o Pagamento e frete** (entrega 0115). As duas últimas abas do
protótipo; as duas só da loja (sem o Google).
- `lib/painel/marketing-clientes.ts` (puro, com testes): a pessoa é o e-mail do pedido
  (minúsculo), na história inteira da loja nova (`pedidosComPagamento(container, null)`). Primeira
  compra e volta são partes dos PEDIDOS pagos no período, a mesma regra do Resumo (a volta é 100
  menos a primeira: as duas somam 100); a 2ª compra é a média de dias entre a primeira e a
  segunda, de toda a história. O estado sai do `shipping_address.province` (`ufDe`: a sigla ou o
  nome, com ou sem acento): os 8 de mais receita e "Outros N". Achados: a 2ª compra (com 5
  pessoas ou mais) e o estado com frete médio acima de R$ 30 (3 pedidos ou mais); abaixo de 10
  pedidos, "ainda é pouco".
- `lib/painel/marketing-pagamento.ts` (puro, com testes): o estado que o Pagar.me grava na sessão
  (`lerEstado`). Os pedidos PAGOS são os do Resumo — pagos no período, sem os cancelados; a rota lê
  com a folga do `lerPedidosDesde` —; o Pix e o cartão são as TENTATIVAS feitas no período. O Pix:
  pago, vencido (passou do `pix.expiraEm`; sem ele, uma hora; ou o pedido já cancelado) ou
  esperando. O cartão: a última sessão que não é "nova" de cada pedido e de cada carrinho que não
  fechou (`carrinhosComPagamento`: o recusado na hora não vira pedido); o motivo é a frase da
  recusa (`RECUSAS`). **O Medusa apaga a sessão recusada quando a pessoa tenta de novo no mesmo
  carrinho** (`deletePaymentSession`, sem lixeira): conta a última tentativa de cada carrinho. O
  frete: a parte grátis, o médio de quem pagou, quem desiste (carrinho com CEP e sem entrega
  escolhida) e o "quase lá" (pagou frete a menos de R$ 30 do piso do `fb_configuracoes`).
- **Os parceiros lado a lado** (entrega 0154, `lib/painel/marketing-parceiros.ts`, puro, com
  testes): o Pix de cada parceiro — gerados e pagos dos PEDIDOS do período
  (`pagamentoDo(o).parceiro`; somados, dão os do bloco Pix), o que não gerou e o tempo do clique ao
  QR das TENTATIVAS anotadas (`tentativasDoPeriodo`, no serviço da observabilidade: só as com
  parceiro, desde a 0150), a mediana do pedido ao pago, as tentativas sem resposta e as quedas pela
  regra do disjuntor (três seguidas, até a primeira que ele atendeu; a que não acabou vai até
  agora). "Quem gera mais Pix" só sai com 10 tentativas de Pix em cada um (`MINIMO_PRA_COMPARAR`). O
  cartão fica fora do ranking: só o Pagar.me passa cartão. Achado: o parceiro que ficou fora do ar,
  com os Pix que saíram pelo outro nesse tempo. E o cartão ganhou `cancelados` (o pedido cancelado
  com o cartão em análise: nada cobrado, e não é recusa) — antes, eles ficavam no total e em motivo
  nenhum.
- Rotas `GET /dashboard/marketing/clientes` (com os números da newsletter, `numerosDaNewsletter`)
  e `/pagamento`. No painel, `marketing/clientes` e `marketing/pagamento`,
  `components/marketing-clientes.tsx` e `marketing-pagamento.tsx` (o atalho "Mudar o frete
  grátis" só pra quem abre as Configurações). No celular a fileira de abas rola de lado e começa
  com a acesa à vista (`components/abas-que-rolam.tsx`).

**Marketing: o "O que os dados dizem" do Resumo** (entrega 0122). O bloco do protótipo que junta
as frases de todas as abas.
- A conta de cada aba (a leitura do banco e do Google, e o `montar*` puro dela) saiu das rotas pro
  `lib/painel/ler-marketing.ts` (`lerFunilDoMarketing`, `lerCanaisDoMarketing`, …,
  `lerPagamentoDoMarketing`): a rota de cada aba e a `GET /dashboard/marketing/achados` usam as
  mesmas, então o Resumo diz o mesmo que as abas. As perguntas ao Google são as das abas, com a
  mesma chave no cache.
- `lib/painel/marketing-achados.ts` (puro, com testes): `juntarAchados` põe o "problema" primeiro,
  depois a "oportunidade" e o "bom"; no mesmo tipo, a ordem das abas (`ABAS_COM_ACHADOS`). O
  "ainda é pouco" de cada aba fica na aba — se todas disserem, vira uma frase só
  (`AINDA_E_POUCO`). Cabem `ACHADOS_NO_RESUMO` (6), e `mais` conta as que ficaram nas abas. Sem o
  Google, `semGoogle` diz por que faltam as do funil, dos canais e dos produtos (e sem frase
  nenhuma não se diz "nada fora do comum").
- No painel, `OQueOsDadosDizem` (`components/marketing.tsx`), num `<Suspense>` entre a meta e o
  gráfico; cada frase ganha o atalho pra aba dela, no mesmo período (`Achados` com o `p`).

**O Início no período** (entrega 0186; o desenho aprovado pelo dono:
<https://claude.ai/artifact/T18JBKKpWgHgyt3Zr4Cav6>). A barra de cima escolhe o período, e o Início
inteiro (menos a fila, que é do agora) segue ele.
- `lib/painel/periodo.ts` (puro, com testes): os botões (`hoje`, `ontem`, `7d`, `30d`, `mes`,
  `mes-passado`), as datas escolhidas (`?de=&ate=`, até `MAXIMO_DE_DIAS`; trocadas desviram, o fim
  depois de hoje para em hoje, o que não vale vira hoje com `aviso`), o de antes (mesmo tamanho;
  chegando até agora, para na mesma hora do último dia; "este mês" contra o mês passado até o
  mesmo dia; "mês passado" contra o anterior), `comparar=nenhum`, os baldes do gráfico (hora num
  dia, dia até 62, semana acima, contando de trás pra frente; o de antes pela posição) e
  `janelasNoCorte` (o corte de hora do Google, pra comparar vendas com visitas).
- `GET /dashboard/inicio?periodo=…` devolve, além do de sempre, `periodo`
  (`lib/painel/inicio-periodo.ts`, puro, com testes): vendas, receita e ticket comparados, as
  barras (o de antes com o dia inteiro; o número para na mesma hora), os mais vendidos em
  unidades, `daNuvemshop`, o checkout do período e o do de antes (só quem abre `marketing`) e os
  pedidos feitos no período (os 6 mais novos e o total, só quem abre `pedidos`). As vendas somam o
  Medusa (`vendasDos`) e a Nuvemshop (`vendasDaBase` do CRM: o "confirmado", pelo dia do
  pagamento; o item vira o produto de hoje pelo SKU, `produtosComSku`) — um pedido nunca está nas
  duas. O checkout (`ateOndeFoi`) usa as regras do `ondeParou`: 1 abriu, 2 contato, 3 entrega, 4
  virou pedido, 5 pago; "abriu" é a marca `fb_checkout_em` que a loja põe quando o checkout
  aparece (`abriuOCheckout` → `POST /store/checkout/aberto`, só a loja, uma vez; DIRETO no módulo
  do carrinho — o `POST /store/carts/:id` refaz a cotação do frete e a sessão de pagamento) e,
  no carrinho de antes da marca, o e-mail.
- `GET /dashboard/visitas?periodo=…` devolve `periodo` (`lib/painel/visitas-do-periodo.ts`, puro,
  com testes): as visitas no corte de hoje dos dois lados (`corteDoGoogle`, a regra do
  `comparacaoComOntem`) e as barras; pra quem abre `marketing`, o que as visitas fizeram (as
  sessões com `view_item` e `add_to_cart` por dia; a categoria pelo `page_view` nas vitrines das
  duas lojas, `caminhosDeCategoria`, com as da Nuvemshop do `redirects.json`), as taxas (as vendas
  das duas lojas no mesmo corte ÷ as visitas — como a Nuvemshop mostrava; a do Marketing segue
  contando só as compras que o Google viu —; a sacola ÷ as visitas), as origens e o tempo real
  (`agoraNoSite`). As quatro perguntas vão numa chamada (`relatoriosDoMarketing`), só do endereço
  da loja (`hostsDaLoja`: o domínio é o mesmo desde a Nuvemshop, então antes da virada as visitas
  são as dela). O `tokenDoGoogle` divide o token que está sendo pedido: as duas perguntas do
  Início saem juntas, e a primeira carga pedia dois.
- **As taxas no mesmo corte (entrega 0212; o dono viu "2 vendas em 180 visitas" com o card Vendas
  dizendo 4).** A taxa "visitas que compraram" para na hora do Google, e o painel agora diz as do
  período inteiro: "2 vendas em 180 visitas, até as 12h (4 no dia)" (`Taxa.noPeriodo`, só nela).
  A sacola de ontem era o dia inteiro contra a manhã de hoje: com o período até agora e o de antes,
  vai uma 5ª pergunta (as sessões com `add_to_cart` do último dia do de antes, por hora) e a taxa
  de antes para na hora do corte, dividida pelas visitas no corte. A sacola e o bloco "O que as
  visitas fizeram" dizem "até as Nh" (o checkout, dos carrinhos, vai até agora). O `google-falso`
  responde a 5ª (`inicio.sacolasPorHora`).
- **As visitas até agora (entrega 0216; o dono: "as conversões tão erradas, mostra apenas 2
  compras").** Em 29/09 às 16h o Google tinha 202 visitas POR HORA (até as 12h) e 275 no total
  por origem: o atraso é do relatório por hora, o total do dia vem quase em dia. Quando o período
  chega até agora, vai uma segunda chamada (`perguntasDoAgora`, chave `…:agora`): as visitas por
  dia (só o período) e, pra quem abre o Marketing, as sacolas do último dia do de antes por hora
  (a 5ª da 0212 mudou pra cá — o `batchRunReports` aceita 5). Com o total: o card, o bloco e as
  duas taxas usam o mesmo número (o maior entre o total e o que as horas somaram); a "visitas que
  compraram" é todas as vendas até agora ÷ todas as visitas; o de antes (visitas, vendas e
  sacolas) vai até a hora de agora; `ate` = `null` (some o "até as Nh"). Sem o total (a chamada
  falhou ou veio vazia), o corte do Google, como na 0212. "(data not available)" nas origens =
  "Google ainda processando" (fora das conclusões do Canais). O `google-falso` responde as visitas
  por dia com `inicio.totalDoDia` (sem ele, vazio: o jeito de antes); o `conferir-marketing` acha
  a chamada do Canais pelo `transactionId` (o Início também manda uma de duas).
- Sem parâmetro nenhum (o painel de antes), as duas rotas respondem como sempre; o painel novo com
  o backend de antes (a janela do deploy) mostra o Início de antes (`InicioDeAntes`).
- No painel: `lib/periodo.ts` (o endereço e os tipos), `components/periodo.tsx` (a barra: cada
  botão é link; as datas e o "comparar com" abrem num `<details>`, as datas com o `Form` do
  `next/form` e o `<input type="date">` do navegador), `components/inicio-periodo.tsx` (os números
  com as `Barrinhas` em SVG, os degraus, as taxas e os blocos de baixo; o que é do Google, cada um
  no seu `<Suspense>`) e `estilos/inicio-periodo.css` (sem `clip-path` na barra e nas taxas: o
  chanfro cortaria o que abre por cima). A fila vai em faixa no alto (`Fila faixa`); o "Esperando
  pagamento" saiu dos números — o Pix esperando virou item da fila (`chave` "pix") e o cartão em
  análise diz quanto espera (a segunda etiqueta).
- **`query.graph` só devolve a contagem com `skip`**: sem ele o `metadata` vem vazio, e o
  `metadata.count` vira zero (era o "Produtos em rascunho" do marketing, que nunca aparecia).
- Conferidores: `conferir-pedidos` (os números contra a conta de sempre, os botões, as datas, o
  comparar, o checkout, os pedidos e a marca do checkout), `conferir-visitas` (o Google falso
  responde `inicio.eventos` e `inicio.categorias`) e o `conferir-checkout` da loja (a marca no
  carrinho quando o checkout abre).

**O Marketing no período** (entrega 0191; o pedido do dono: "marketing vai"). As sete abas do
Marketing usam a barra do Início no lugar dos quatro botões de antes, com os 90 dias que o
Marketing já tinha e 30 dias de padrão. Pedidos e Carrinhos seguem sem ela.
- `lib/painel/periodo.ts` ganhou os 90 dias (`ATALHOS`), o `padrao` da tela no `lerPeriodo` (o
  aviso das datas que não valem diz "mostrando os últimos 30 dias"), o `lerAtalho`, o
  `periodoNaTela` (antes no `inicio-periodo.ts`), o `periodoEmFrase` (o fim do título do gráfico:
  "nos últimos 30 dias", "em agosto", "de 14/09 a 20/09"), o `chaveDoPeriodo` (a chave do cache
  do Google: os dias do período e o começo do de antes) e as datas escritas pro Google
  (`datasNoGoogle`, `datasComOAntes`). O `somarDias`, o `meiaNoite` e a `Janela` moram nele; o
  `marketing.ts` reexporta.
- Todas as rotas do Marketing (`/dashboard/marketing` e as de baixo) leem `?periodo=`,
  `?de=&ate=` e `?comparar=nenhum` e devolvem `periodo` como `PeriodoNaTela` (era a string do
  botão). Sem comparar, o `antes` de cada número vem nulo e o Google nem é perguntado sobre o de
  antes. Um período que já acabou vai inteiro; o que chega até agora corta o último dia dos dois
  lados na hora que o Google já somou (`visitasDoPeriodo`, `ate` só nele). O `janelasDo(atalho)`
  ficou só pro CRM, com os três botões dele.
- `GET /dashboard/periodo?…&padrao=` (todo papel: é a área `inicio`): o `PeriodoNaTela` do que o
  endereço pediu. As abas desenham a barra com ele na hora, sem esperar os dados da aba. Sem ele
  (o backend de antes, nos minutos do deploy), o painel monta o que o backend de antes vai mostrar
  (`periodoDoBackendDeAntes` em `lib/ler-periodo.ts`: hoje, 7, 30 ou 90 dias; o resto vira 30).
- No painel: `consultaDoPeriodo(busca, padrao)` e `enderecoDoPeriodo(caminho, …)` em
  `lib/periodo.ts` (`ATALHOS_DO_INICIO` sem os 90 dias); `BarraDoPeriodo` com `caminho` e
  `atalhos` (as datas voltam pra mesma aba) e `LegendaDoPeriodo` com `graficos={false}` ("comparado
  com …": o gráfico do Marketing não desenha o de antes), os dois no `PeriodoDoMarketing`. Cada
  leitor de `lib/marketing.ts` recebe a `consulta`; as frases do de antes saem do `p` (`oDeAntes`:
  "os 7 dias antes", "ontem a esta hora", "o dia 26/09", "julho"), e sem comparar o número não diz
  nada embaixo. O "Um dia só é pouco pra concluir" vale pra qualquer período de um dia.
- Conferidor: `conferir-marketing` (o período na API, no Google e na tela; as abas levando o
  período e o "não comparar"; as datas sem sair da aba; o aviso; o Início sem os 90 dias).

**Produtos** (fase 3, parte 1). `GET /dashboard/produtos` (a lista, com as fitas) e
`GET /dashboard/produtos/:id` (o que vem do Bling, só pra ler; as seções com o texto e o fundo de
cada uma; a caixa de compra; o catálogo pros seletores; as categorias; o `noSite` do "Ver no site"
e o `historico`, lido do registro da equipe) abrem pra todo papel. Mudar é da linha
`editarProdutos` do `ACESSO_PADRAO` (dono e marketing, no padrão): `POST /dashboard/produtos/:id/secao` (o texto e o
fundo de UMA seção, num "Salvar"), `/ordem` (ligar, desligar, subir ou descer uma — sem "Salvar"),
`/caixa`, `/textos` (o nome da loja, o subtítulo e as categorias), `/publicar` e `/imagens`. **O
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
registro da loja (`SECOES_DO_PRODUTO`, em `apps/loja/src/lib/secoes/registro-do-produto.ts`) — seção
nova entra nos três.

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
balm, devolvendo a página dele como estava. **O frete da prévia** (0222): a tarja dos cartões e o
rodapé do "Leve junto" seguem a política de frete GRAVADA, não um piso do painel (era 149,90 fixo,
com a loja anunciando 139,90). O `GET /dashboard/produtos/:id` manda o `frete` (o mesmo do
`/store/configuracoes` — o painel não tem a chave publicável pra perguntar à loja), a página passa
pra `CaixaDeCompra`, e `tarjaDoFrete`/`freteDoRodape` (`apps/dashboard/src/lib/produtos.ts`) repetem
as contas da loja (`frasesDoFrete`, `pisoVale`, `alcancaOPiso`, `fraseDoQueFalta`): mudou lá, muda
aqui. Sem política, ou com piso zero, a prévia não fala de frete; com frete fixo, "Frete R$ 9,90".
O rodapé soma o preço de hoje (o `degraus[0]`, com a promoção), como a loja. O conferidor grava os
quatro modos pelo admin (só o `frete`) e compara a prévia com a rota, e as tarjas com as da página
do balm na loja; a política volta no fim.

**As categorias do produto** (entrega 0151). Um produto pode estar em mais de uma categoria — o
kit de barba em Kits e em Barba —, e a vitrine de cada uma mostra ele (a loja já pedia ao Medusa por
`category_id`, e o "Todos" e o "resto da loja" já contavam por id). Nos Textos do produto: a
**Categoria principal** (o select de antes) e o **"Aparece também em"** (as outras, em caixinhas,
travadas sem a principal). A principal mora na marca `fb_categoria` (`MARCA_DA_CATEGORIA`, em
`lib/erp/marcas.ts`): o Medusa não guarda ordem entre as categorias de um produto, e a primeira da
resposta muda de uma leitura pra outra. Sem a marca (produto mexido fora do painel), vale a primeira
pela ordem do menu — o `rank` no backend, `site.categorias` na loja. Ela decide a trilha da PDP (e o
JSON-LD dela), o `product_type` e a categoria do Google no `/catalogo.xml`, o rótulo do chip no
checkout (sem o metadata ali, que pesa: a ordem do menu) e a reserva do "Quem leva este, leva junto"
sem o modelo — `categoriasDoProduto` no backend (`lib/painel/produtos.ts`, com testes) e
`categoriaPrincipal` na loja (`lib/categorias.ts`), gêmeas. `POST /dashboard/produtos/:id/textos`
recebe `categoriaId` (a principal) e `tambemEm` (as outras); sem `tambemEm` — o painel de antes: o
painel e o backend sobem em horas diferentes —, as outras de hoje ficam (`categoriasGravadas`);
outras sem a principal é 400 `sem_principal`. A lista de Produtos lê o metadata à parte, só de quem
está em mais de uma. A importação do Bling deixa a marca onde deixa as categorias (na primeira vez e
no produto recriado). Mexer nas categorias pelo admin do Medusa NÃO avisa a loja (não há subscriber
de produto): a página fica velha até o próximo aviso — pelo painel, avisa. Os cupons "só com
produtos de" contam o produto pelas categorias dele que o cupom escolheu (ver "Cupons e descontos").
Conferidores: o `conferir-produtos` (a seção "Aparece também em", depois do histórico), o
`conferir-cupons`, o `conferir-catalogo` (a trilha de cada produto) e o `conferir-feed`.

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

**A foto grande da dobra passa no dedo** (entrega 0114). O palco de `components/produto/galeria.tsx`
é um trilho com encaixe (o do banner da home) dentro da moldura `.galeria__palco` — a borda, o canto
cortado, o selo e a lupa continuam no `pdp.css` gerado; o trilho mora no `pdp-galeria.css`, escrito
à mão. A foto da vez (`atual`) SAI DA ROLAGEM (`scrollLeft / clientWidth`): a miniatura (o ponto,
abaixo de 1000 px), as setas do teclado e o zoom fechando rolam o trilho (`irPara`), não trocam
estado. Cada foto é um botão que abre o zoom na foto à vista; as fora de vista ficam `inert`, e a
seta do teclado leva o foco junto (`useLayoutEffect`). SÓ A PRIMEIRA FOTO VEM NO HTML (é o LCP, com
`fetchPriority="high"`): a segunda é montada 300 ms depois do `load`, e as vizinhas da vez quando a
pessoa encosta no palco ou o trilho rola (`montados`) — mandar todas no HTML dividiria a banda com a
primeira. O `conferir-pdp.mjs` passa o dedo pelo CDP (`Input.dispatchTouchEvent`, que passa pela
rolagem de verdade; um TouchEvent montado no DOM não rola nada), no produto com mais fotos do banco.

**As sete seções de todos os produtos** (entrega 0105). O texto de Benefícios, Linha do tempo,
Rotina, Como funciona e modo de uso, Comparação, Pra quem é e Perguntas frequentes dos 15 produtos
mora em `backend/src/scripts/dados/secoes-da-pdp.json`, por handle (os kits do Fator e o Kit 2x
Shampoo dizem `copiaDe` e trazem só o que muda), com a descrição do Google no `seo`. A regra é
`lib/painel/secoes-da-pdp.ts` (`comOsTextos`, pura, com testes): troca só as sete seções, tira o
`false` da visibilidade delas e guarda o que havia (pro log); antes e depois, faixa, fundos, caixa de
compra, vídeos e ordem ficam. A migração `migration-scripts/secoes-da-pdp.ts` aplica UMA vez, no
deploy, pelo `mudarPdp` (na trava, só o `fb_pdp`, a loja avisada). Três campos novos no `fb_pdp`, todos
opcionais: `rotina.passoDeste`/`paraDeste` (o passo do produto da página; sem eles, o "Passo 2 · trata"
do Fator, que era fixo no `rotina.tsx`; a rotina ordena pelo NÚMERO do passo, e o passo sem número vai
depois), `funciona.comoFoto`/`usoFoto` (a foto exata de cada caixa, do armazenamento — no arquivo é
`{ de, n }`, a foto N do produto X, resolvida na migração; sem ela, a 2ª foto do produto, que em vários é
arte de anúncio) e `seo.descricao` (até 160 letras; o painel edita nos Textos, "Descrição no Google";
sem ela, a loja usa o começo da descrição do Bling numa linha e sem cortar palavra, `descricaoDoGoogle`
em `lib/formato.ts`). O `alt` das duas fotos é o nome do produto delas. A linha do tempo virou `<ol>` com
um `<dl>` por passo: o `<dl>` único com o prazo num `<p>` solto dentro do grupo tirava 3 pontos de
acessibilidade do Lighthouse. **SEO 100** nas 15 PDPs (e acessibilidade e boas práticas 100) com a loja
indexável, como no CI (`SITE_INDEXAVEL=true`); em produção é 69 de propósito até a virada (o bloqueio
do Google). **O CI mede a PDP do óleo SEM as seções** (o `medusa-falso.mjs` não tem `fb_pdp`): com as
sete, o HTML da PDP vai de 90 pra 139 KB (o texto aparece no HTML e de novo no payload do React) e o
LCP simulado sobe ~200 ms (2,33 → 2,55 s, A/B local), acima do orçamento de 2,5 s — sem ninguém ter
errado. `content-visibility: auto` nas seções de baixo não mudou nada (o custo não é o layout, é o
tamanho do documento). O `conferir-pdp.mjs` confere cada frase do arquivo na página de cada produto que
existe no banco local, e a página enxuta num produto esvaziado de propósito (e devolvido no fim).
Desde a 0112 (pedido da loja, "mais enxuto"), a Benefícios não tem mais a ressalva (`rodape`, com o
link "leia isto antes") nem a Linha do tempo o aviso (`aviso`): o contrato não lê os dois (o que ainda
estiver gravado sai na próxima gravação da seção), o painel não edita e a loja não desenha. O
"resultado varia" do Fator segue nas Perguntas e no "Pra quem é". As regras `.promessa__rodape` e
`.tempo__aviso` ficaram sem uso no CSS gerado do protótipo (`porte/pdp-partes`).

**A página do Fator nos kits dele** (entrega 0200, pedido da loja em 28/09). Os quatro kits que
trazem o Fator — 2x, 3x, 6x e o Fator + Shampoo (`KITS_DO_FATOR`; os mesmos do `copiaDe` do
`secoes-da-pdp.json`, e um teste confere) — ganham a página do Fator como ela estiver no banco no
deploy: todas as seções de `conteudo` (antes e depois e faixa inclusive), o `layout`, os `fundos` e
os `videos`. Ficam os do kit a `combinada` (a caixa de compra) e o `seo`; nome, fotos, preço e
avaliações nem moram no `fb_pdp`. No Fator + Shampoo ficam também a `rotina` e o `funciona` dele, que
falam do shampoo (o `usoVideo` do Fator entra se o kit não tiver o dele), e as `duvidas` são as do
Fator, na ordem dele — com a resposta do kit quando ele responde a mesma pergunta — e, no fim, as do
kit que falam do shampoo. A regra é `lib/painel/pagina-do-fator-nos-kits.ts` (`paginaDoFatorNoKit`,
pura, com testes: devolve a página já peneirada e o que `mudou`); a migração
`migration-scripts/pagina-do-fator-nos-kits.ts` aplica UMA vez, pelo `mudarPdp`, e põe no log,
inteiro, o que cada kit tinha nas partes trocadas (o caminho de volta). Com a página do Fator vazia,
não copia nada. **Os vídeos são os mesmos arquivos nos cinco produtos**: tirar um vídeo no painel não
apaga o arquivo (só o envio que falha no meio sai do armazenamento) — quem um dia escrever uma limpeza
de arquivo "sem dono" tem que olhar o `fb_pdp` de todos os produtos. É cópia, não ligação: mudar o
Fator depois não muda os kits. O `conferir-pdp` segue igual depois dela (as frases do arquivo
continuam na página de cada kit). Pra repetir no banco local: `delete from script_migrations where
script_name='pagina-do-fator-nos-kits.ts'` e `medusa db:migrate`.

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
pro banner de um slide só), em qualidade 60 (`QUALIDADE_DA_ARTE`, 0117: a arte do celular cai de
57 pra 40 KB sem diferença visível; qualidade nova pede o valor em `images.qualities`, no
`next.config.ts`), e `carrossel-do-banner.tsx` é o carrossel: o trilho do `useCarrossel`
(rolagem com encaixe), a troca sozinha, e a imagem de cada slide montada só quando ele vai
aparecer. Na troca sozinha, a barrinha da bolinha da vez é o RELÓGIO (0106; o palco da Alta
Performance também, desde a 0107): `components/home/use-barra-relogio.ts` (`useBarraRelogio`),
comum aos dois — uma animação do navegador (`Element.animate`) na `…__ponto-cheia` da bolinha da
vez, e o slide troca quando ela termina (`finished`); o mouse ou o foco em cima, a seção fora da
tela e a aba escondida pausam ela (`andando`), e ela continua de onde parou; `quase` faz algo
antes de encher (o banner baixa a arte do próximo). Não volte pra barra no CSS com `setTimeout` ou
`setInterval` do lado: eram dois relógios — a barra começava no HTML do servidor e a contagem só
depois da hidratação (o palco, lá embaixo, chegava com a barra cheia), e a barra enchia com o
slide parado. As bolinhas ficam POR CIMA da arte, no canto de baixo à esquerda (0114), num selo
preto de canto cortado: numa faixa embaixo da arte (da 0106 à 0114) abriam um vão até a barra de
vantagens, e no meio (a pílula de antes da 0106) cobriam o botão desenhado na arte do celular; o
painel pede pra deixar o canto sem texto. Translúcido, o selo fica encardido no amarelo. Sem a
faixa, a home do `conferir-home` (o banner e as ofertas em cima do palco da Alta Performance)
mostra 22% do palco ao abrir numa aba de 900 px — e o palco conta a partir de 20%
(`IntersectionObserver`): o teste do palco abre numa aba de 600 px e confere que ele começou fora
da tela. A caixa é 1920 × 630 (1080 × 1275 abaixo de 768 px, com a do celular) — mais baixa desde
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

**A barra de avisos do topo** (entrega 0119). A esteira amarela de toda página
(`apps/loja/src/components/layout/anuncio.tsx`) é editada no "Layout da home" e vai no rascunho e no
"Publicar" da home, mas NÃO é seção: não está no registro nem no `SECOES_DA_HOME` (não tem ordem nem
chave). Mora no conteúdo da versão, como `anuncio` (`AnuncioDoSite`: `{ frete, avisos }`, até 4
avisos, pelo menos um — a esteira nunca fica vazia; o `id="inicio"` dela é o "voltar ao topo" do
rodapé). O aviso do frete a loja escreve (`frasesDoFrete(...).completa` + "*"): o painel só liga e
desliga. O `marcar` do formulário não manda a chave desmarcado (`paraGravar`), então o leitor lê
`frete === true` nos dois lados. No painel/backend: `pendentes.anuncio` (uma mudança a mais —
`quantasMudancasNaHome`), `anuncioDaHome` (o formato de uma seção, sempre ligada e fixa, com o
`avisoDoFrete` de hoje: GÊMEO da frase da loja, e o `conferir-home` compara a prévia da gaveta com
a esteira), `POST /dashboard/home/anuncio` e a linha do registro `editou-secao-da-home` com `secao:
"anuncio"`. No painel, a linha `[data-anuncio]` fica em cima e FORA da `.secoes`, e a gaveta é o
`EditorDaHome` (com a prévia, `ComoFicaAFaixa`). Parte da home que não é seção entra no `lib/home.ts`
do backend (tipo, semente, leitor e `EXIGE`), no da loja (tipo, leitura e a reserva
`conteudo/home.ts`) e no painel (definição própria, como o `ANUNCIO_DA_HOME`). **A esteira lê o
`home()` no layout**: o "Publicar" da home refaz TODA página (a etiqueta `home`), não só a inicial.
**A velocidade não depende do texto**: `pista()` tira as voltas (cada lista com pelo menos 200
letras, que cobre a tela de 1440) e o ciclo do tamanho dos avisos, contados em letras; a régua é a
esteira de sempre (o frete e a "Compra 100% segura", 3 voltas em 38 s, o ciclo do `anuncio.css`), e
com ela a pista sai SEM `style` — o HTML de antes, byte a byte. Medido: 39–44 px/s de um aviso curto
a quatro compridos (sem o ajuste, 17–146). Mudou o ciclo do CSS, mude o `CICLO_DO_CSS`. A chave de
cada `<li>` é a posição: dois avisos iguais no painel não se fundem. No `conferir-home`, a seção da
barra vem DEPOIS do histórico: o histórico mostra as 20 últimas linhas, e cada "Salvar"/"Publicar"
dela empurraria as da rodada pra fora.

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
`numerosDaNewsletter` do Início usa a mesma conta da aba. Desde a 0145, a ficha traz também a
parte do CRM (as 5 etiquetas e o caminho da pessoa) pra quem abre o CRM — ver "O CRM, parte 3". O
conferidor é o `apps/dashboard/ferramentas/conferir-clientes.mjs` (55, com as etiquetas e a
previsão da 0220), com os mesmos falsos e variáveis do `conferir-pedidos`. As etiquetas do CRM se
contam por `[data-etiquetas-crm] [data-etiqueta]`: a previsão fica no mesmo bloco, com a mesma
classe `.etiqueta` (as dela são `[data-previsao]`) — contar `.etiqueta` dá 8 pra quem comprou
(0224).

**Cupons e descontos** (fase 6, entrega 0085; do jeito da Nuvemshop desde a 0128). Cupom é
promoção do Medusa com código: quem aplica e recusa é o Medusa, no carrinho. `src/lib/cupons.ts` é
puro, com testes, e faz o seguinte:

- lê o formulário (`lerCupomNovo`), que é o "Criar cupom" da Nuvemshop: código (letras, números,
  "-" e "_", sem o prefixo `BUMP-` das ofertas), tipo (`porcento`, `reais` ou `frete`, este com o
  `soMaisBarato`), a quem vale (`aplicarA` loja/categorias/produtos, com os `alvos` conferidos no
  catálogo), `combina`, por cupom (`limite`), por cliente (`porCliente` N ou `primeiraCompra`),
  o período (`de`/`ate`, "AAAA-MM-DDTHH:MM" em Brasília) e o valor do carrinho (`minimo`). Aceita
  também o formulário de antes (o painel e o backend sobem em horas diferentes);
- monta a promoção (`promocaoDoCupom`): porcentagem em `items` com `allocation: across` (o `each`
  do 2.21 pede `max_quantity`), reais em `order`, frete grátis como 100% em `shipping_methods`
  (`across`; o "só na mais barata" é uma regra de alvo `shipping_methods.shipping_option_id` com os
  ids da entrega econômica, que a rota acha pela `faixa`), o limite total no `limit` do Medusa e a
  forma do cupom no `metadata.fb_cupom` (`cupomGuardado` lê também o de antes da 0128:
  `umaVezPorCliente` e o "vale até" só com a data);
- faz das condições que o Medusa não tem regras comuns (`regrasDoCupom`), sobre campos que o gancho
  `setPromotionContext` do `updateCartPromotionsWorkflow`
  (`src/workflows/hooks/contexto-dos-cupons.ts`) põe no contexto (`contextoDosCupons`):
  `fb_cupons.produtos` (o `somaDosProdutos`, a medida do frete grátis), `fb_cupons.agora`,
  `fb_cupons.pedidos`, `fb_cupons.usados` e `fb_cupons.vezes.<CÓDIGO>` (os pedidos não
  cancelados do e-mail do carrinho, numa consulta), `fb_cupons.itens.produtos` e
  `fb_cupons.itens.categorias` (o "só com produtos de" é um `eq` sobre a lista — no Medusa, `eq`
  com lista quer dizer "todos entre os escolhidos", como a Nuvemshop pede; produto sem categoria
  entra como `sem-categoria`; o produto em mais de uma categoria entra só com as que o cupom da
  conta escolheu — o gancho lê as regras dos cupons que estão na conta, `cuponsNaConta` (a regra
  do `getPromotionCodesToApply`) e `categoriasEscolhidas` —, senão o cupom de Kits recusava o kit
  que também é de Barba; entrega 0151) e `fb_cupons.frete_da_loja` (o pedido já ganhou o frete
  grátis ou fixo pelo valor; sem a política, "sim");
- põe junto de toda condição a trava `fb_cupons.conferido = "sim"`, que o gancho só escreve quando
  leu tudo. O Medusa lê número que falta como zero (`MathBN`): sem a trava, uma conta sem o gancho
  (ou com a consulta dos pedidos falhando) deixaria passar o "vale até" e o "por cliente". O teste
  roda as regras no avaliador do próprio Medusa (`areRulesValidForContext`).

O "não combina" da Nuvemshop: o cupom não desconta produto com preço promocional e não vale no
pedido com o frete da loja. O produto sai por uma regra de ALVO, `items.fb_promocional = "nao"`:
o gancho devolve `items` com essa marca em cada linha (`linhasMarcadas`, o `compare_at_unit_price`
acima do preço), e o Medusa mescla o que o gancho devolve por cima do carrinho (espalhar raso, em
`getActionsToComputeFromPromotionsStep`) — as linhas são as mesmas, espalhadas, com a marca a mais.

UM CUPOM POR PEDIDO: o gancho `validate` do mesmo workflow recusa (`NOT_ALLOWED`) um segundo
código de campanha quando alguém PÕE um código (`add`, o que a API da loja faz); a oferta do
checkout não conta, e a conta a cada mudança no carrinho (`replace` com os MESMOS códigos) passa
(`outroCupomNoCarrinho`). O `replace` que traz código novo e deixa dois é recusado: é o que o
`promo_codes` no corpo de `POST /store/carts` e `POST /store/carts/:id` faz, e por ele cinco
cupons somavam (entrega 0136). Esse corpo ainda é fechado antes, no middleware
(`cupomSoPelaPortaDosCupons`, em `src/api/middlewares.ts`): cupom só entra por
`/store/carts/:id/promotions`, que é o que a loja usa.

UMA OFERTA DO CHECKOUT POR CARRINHO (entrega 0163): o mesmo gancho recusa um segundo código
`BUMP-` (`outraOfertaNoCarrinho`, as mesmas contas do `outroCupomNoCarrinho`). O código de cada
produto é fixo e não vence, e a regra "uma por vez" morava só no `alternarBump` da loja: quem
falasse direto com a API somava 10% numa unidade de cada produto. O campo de cupom da loja
(`aplicarCupom`) recusa `BUMP-` e `PROMO-` digitados.

O `metadata` DO CARRINHO É FECHADO (entrega 0163): o Medusa copia o `metadata` do carrinho pro
pedido no fechamento, e o do pedido é onde a loja guarda os registros dela (`estornos`, `emails`,
`fb_parceiro`, `fb_cupons`, `fb_bump`…) — um `estornos` plantado acendia a faixa grave "o estorno
não saiu" no painel. `semMetadataNoCarrinho`, no `middlewares.ts`, recusa `metadata` no corpo de
`POST /store/carts` e `POST /store/carts/:id`; a loja não usa (o CPF mora no `metadata` do
ENDEREÇO, que continua livre).

O USO VOLTA NO CANCELAMENTO (entrega 0136). O Medusa conta o uso (`used`, contra o `limit`) no
fechamento do carrinho — o Pix gerado já conta — e só desfaz se o próprio fechamento falhar;
cancelar o pedido não mexe. O subscriber `devolver-uso-dos-cupons.ts` (no `order.canceled`) chama
`devolverUsoDosCupons` (`src/lib/uso-dos-cupons.ts`): o `revertUsage` do Medusa com os ajustes do
pedido, só dos códigos que contam uso (com limite ou orçamento de campanha — a oferta e o cupom
ilimitado ficam de fora), e UMA vez: o registro `fb_cupons.uso_devolvido` entra no metadata antes,
na trava do metadata do pedido. A migração `uso-dos-cupons-cancelados.ts` fez o mesmo com os
pedidos que já estavam cancelados. O cupom em reais que não combina mira os PRODUTOS
(`target_type: items`): regra de alvo numa promoção de alvo "order" o Medusa recusa na criação.

Sem e-mail, a lista de pedidos é vazia e "por cliente"/"primeira compra" deixam aplicar. O
workflow refaz os códigos do carrinho a cada mudança e tira o que deixou de valer (o e-mail chegou,
o produto saiu) — e tira também o código que não gerou nenhum ajuste: o cupom de FRETE sem entrega
escolhida é recusado como se não existisse. Por isso a loja guarda esse código
(`apps/loja/src/lib/cupom-pendente.ts`, cookie `cupom`) depois de perguntar ao Medusa se ele é de
frete (`GET /store/cupons/frete`, só a loja pergunta — `daLoja` — e com limite por IP), e tenta de
novo quando o checkout abre e depois de pendurar a entrega (`salvarEntrega`, `escolherFrete`). O
mesmo cookie serve o LINK DO CUPOM: `apps/loja/src/app/discount/[codigo]/route.ts` (o caminho da
Nuvemshop, fora do "tudo em minúscula" do `proxy.ts`) guarda o código, põe na sacola se houver, e
manda pra home. O `use_by_attribute` do orçamento de campanha do Medusa não serve: sem e-mail no
carrinho, ele derruba a conta com erro. O "incluir o custo de envio no desconto" e o "valor máximo
de desconto" da Nuvemshop não existem aqui: uma promoção desconta os produtos OU o frete, e a
porcentagem do Medusa não tem teto.

O DESCONTO DO FRETE NÃO SE REPETE: o `discount_total` do Medusa soma o do frete, e o
`shipping_total` já vem descontado. Onde a tela ou o e-mail mostram "Desconto" junto do frete
(resumo do checkout, obrigado e conta — `apps/loja/src/lib/desconto.ts` —, e o e-mail do pedido —
`descontoDosProdutos` em `src/lib/confirmar-pedido.ts`), o desconto é `discount_total −
shipping_discount_total`. A sacola não mostra desconto (soma `item_total` + frete), a nota fiscal
fecha a conta pelo total, e o Pagar.me recebe os itens e o frete já descontados.

As rotas ficam na área `cupons` (dono e marketing):

- `GET /dashboard/cupons`: os cupons de campanha (`ehCupomDeCampanha`: com código, não automático,
  sem `BUMP-`), os usos por código nos ajustes dos pedidos (`usosPorCodigo`: não cancelados; o
  vendido, só dos pagos), os descontos automáticos em frase (`src/lib/painel/cupons.ts`), o
  `catalogo` (categorias e produtos, pro "Aplicar a") e a `loja` (o `LOJA_URL`, pro link do cupom);
- `POST /dashboard/cupons`: 422 com os erros por campo, 409 se o código já existe (em qualquer
  caixa);
- `POST /dashboard/cupons/:id` `{ acao: "pausar" | "ligar" }`: só cupom de campanha; muda o
  `status`.

As três anotam no registro da equipe. Os conferidores são o
`apps/dashboard/ferramentas/conferir-cupons.mjs` (cria os cupons pelo painel, aplica pela Store
API, faz os pedidos com o `pedidoPix(..., { cupom })` do `pedido-de-teste.mjs`; o do "não combina"
tira um produto da "Promoção de lançamento" do banco local durante o teste e devolve no fim) e a
seção "Cupons do jeito da Nuvemshop" do `apps/loja/ferramentas/conferir-checkout.mjs` (um por
pedido, o de frete guardado, o link).

**Os cupons da Nuvemshop** (entrega 0126). `src/lib/cupons-da-nuvemshop.ts` guarda a lista de
26/09 escrita como a Nuvemshop mostra (desconto, usos, vigência, limites) e a lê no `CupomNovo` do
painel (`lerCupomDaNuvemshop`). `planoDosCupons` diz o que criar (de Z a A: a lista do painel põe o
mais novo em cima e lê de A a Z), o que já existe (em qualquer caixa) e o que fica de fora, com o
motivo: frete grátis, "1 limite" sem a `condicao`, vencido no dia do deploy. A migração
`src/migration-scripts/cupons-da-nuvemshop.ts` cria um por um com o `promocaoDoCupom` e guarda a
linha de lá em `metadata.fb_nuvemshop`; cupom recusado pelo Medusa vai pro log sem parar o deploy.
Os códigos mantêm o "_" (o formulário do painel não aceita; o Medusa e a loja, sim). Pra rodar de
novo no banco local, apague a linha dela em `script_migrations`. Lista nova é migração nova, com
outro nome: esta já rodou em produção.

**As promoções do painel** (entrega 0133): o "Leve X, pague Y" — o "Compre X e pague Y" da
Nuvemshop. É uma promoção AUTOMÁTICA do Medusa (`is_automatic`, ninguém digita código), do tipo
"compre-leve" (`buyget`): a cada `comprando` unidades dos produtos dela, as `comprando − pague`
mais baratas saem com 100%. `src/lib/promocoes.ts` é puro, com testes, e faz o formulário
(`lerPromocaoNova`: nome, comprando/pague, "Aplicar a" — o `lerAlcance` do cupom —, "vale em
produto com preço promocional", o período — o `lerPeriodo` do cupom — e a etiqueta que a loja
mostra), a promoção do Medusa (`promocaoDoMedusa`), a guardada (`metadata.fb_promocao`), as marcas
das linhas, o que a loja mostra e a lista do painel. O que o Medusa faz, e onde difere da
Nuvemshop (o teste trava as duas contas, rodando o `getComputedActionsForBuyGet` dele):

- ele reserva como "compradas" as LINHAS de maior subtotal e dá de graça a mais barata de cada
  grupo: com um produto só, é a conta da Nuvemshop; com produtos de preços diferentes numa sacola
  grande, dá a mais barata DE CADA GRUPO (3 de R$ 100 e 3 de R$ 50: aqui R$ 150, lá R$ 100);
- sem `max_quantity` ele dá UMA unidade de graça por carrinho e para: vai `MAX_GRATIS` (99);
- o lado "compra" precisa de ao menos uma regra: a loja toda é a marca do preço existir na linha.

O CÓDIGO é `PROMO-` + oito letras sorteadas pela rota. Ele aparece em `cart.promotions` e nos
ajustes do pedido, e por isso fica fora de tudo que trata cupom: o "um cupom por pedido"
(`outroCupomNoCarrinho`), a lista de cupons (`ehCupomDeCampanha`), o código de cupom novo (recusa
`PROMO-`), os cupons do Marketing, o "Venda nova" (`avisar-venda.ts`), o `coupon` da compra
mandada pro Meta/GA4/TikTok (`anuncios/enviar.ts`), e na loja o `cuponsDoCarrinho`, o campo de
cupom do checkout e o link `/discount`. No pedido do painel o ajuste dele se chama "Promoção".

AS MARCAS DAS LINHAS moram no mesmo gancho dos cupons (`contexto-dos-cupons.ts` →
`marcarPromocoes`, depois do `linhasMarcadas`): toda linha ganha `fb_preco_promocional` ("sim"
com o de/por — a regra "não vale em produto com preço promocional" lê essa), e a linha de uma
promoção que DISPAROU (valendo agora, com unidades bastantes) vira `fb_promocional` "sim" — a
marca que o cupom que não combina já lia: ele não desconta o item da promoção. O que combina
desconta o que sobrou (o Medusa aplica o compre-leve primeiro). As promoções que o gancho lê vêm
de `lib/promocoes-ativas.ts`, guardadas 30 s na memória; criar, pausar e ligar pelo painel limpam
(`esquecerPromocoes`). O período usa a hora do gancho (`fb_cupons.agora`), com a trava de ela
estar lá (`agora > 0`) — não a do cupom (`conferido`), que cai quando o histórico do e-mail falha.

NÃO SOMA COM O DESCONTO POR QUANTIDADE (decisão da loja): nos produtos em que uma promoção vale
agora (`promocoesNaLoja`), `sincronizarPrecosPorQuantidade` deixa de fora as faixas que chegam no X
dela, e devolve quando ela acaba. As que acabam antes ficam (`faixasComPromocao`, entrega 0142 — até
ali saíam todas, e o cartão de 2 da PDP sumia): num "leve 3", sai só a de 3 ou mais, e 2 unidades
seguem com os 4%; num "leve 2", saem as duas. A faixa é preço de lista (vale por linha) e não sabe
da promoção: numa promoção de vários produtos, 2 de um com os 4% e 1 de outro disparam o "leve 3"
com os 4% junto — a fresta conhecida. O conjunto (produto e X) entra na foto da rodada de minuto em
minuto: promoção que começa ou acaba pela hora avisa a loja com o perfil `"agora"` (com `"seconds"`,
a página refeita por trás lia a escada guardada, com o selo velho — visto no conferidor). Sem
conseguir ler as promoções, a rodada não escreve nada: devolver as faixas daria os dois descontos.
Criar, pausar e ligar (`lib/painel/promocoes.ts` → `valerNaLoja`) refazem as faixas na hora e avisam
a loja com `"agora"`.

AS ROTAS: `POST /dashboard/promocoes` (cria; 422 com os erros por campo) e
`POST /dashboard/promocoes/:id` `{ acao: "pausar" | "ligar" }`, na área `cupons` (dono e
marketing), com o registro da equipe; a lista vem no `GET /dashboard/cupons` (`promocoes`: nome,
etiqueta, frase, situação — valendo, agendada, pausada, encerrada —, pedidos, desconto e vendido,
pelo `usosPorCodigo`), e o "Desconto por quantidade" dos automáticos avisa que não soma. A loja lê
`GET /store/promocoes`: as que valem agora, com os produtos de cada uma (o de/por de agora conta:
a promoção que não vale no promocional deixa esses de fora), guardada 30 s e nunca servindo uma
que já acabou (`ate`). No painel, o bloco "Promoções" da tela de Cupons e descontos, com a gaveta
"Nova promoção" no desenho do "Novo cupom" (`components/promocoes.tsx`, `lib/promocoes.ts`).

NA LOJA (`src/lib/promocoes.ts`, sem dependência; a lista em `promocoesDaLoja`, `lib/medusa.ts`, com
a etiqueta `produtos` — o 404 é o Medusa de antes da rota, e vira "nenhuma"): no card, o selo da
etiqueta em cima e o do "-X%" logo embaixo (`.produto__selos`, a pilha que cresce com a etiqueta que
quebra a linha; entrega 0142 — até ali a etiqueta tomava o lugar do "-X%"); o selo embaixo do preço
na PDP (`.compra__promocao`, `estilos/pdp-promocao.css`); o degrau da promoção na escada
(`escadaDeQuantidade` devolve `{ degraus, promocao, unitarios }`: "3 unidades" pelo preço de 2, com
a etiqueta na nota; sem a lista, a escada sai sem ele e guardada por minutos); e o total da `Compra`
pela conta de grupos (`gratisEm`) vezes o preço de uma unidade NAQUELA quantidade (`unitarioEm`, dos
`unitarios` — o de 1, 2 e 3 ou mais que o backend responde): num "leve 3", 2 unidades pagam a faixa
de 2. Na sacola, cada linha de produto em promoção ganha o recado (o `paraAGaveta`, que as ações e o
`/api/sacola` usam): a etiqueta, quantas saíram de graça — pelo AJUSTE do Medusa na linha
(`items.adjustments.code/amount` no `CAMPOS_CARRINHO`), porque com vários produtos só ele sabe qual
linha foi — e, na última linha da promoção, o empurrão: "mais 1 sai de graça", ou "mais 1 por R$
4,90" quando a terceira custa a diferença da faixa de 2 (`precoDoEmpurrao`, feito no servidor, só
com a promoção inteira na linha). As linhas em promoção levam os `unitarios` da escada guardada da
PDP (a da primeira variação; de outra, não). Sem CSS novo na sacola e sem conta nova na gaveta (a
home não tem folga). O "+" prevê o total da linha já sem as de graça e com o preço da unidade na
quantidade nova (`totalPrevisto`); antes mostrava o preço de 3 até a resposta.

O conferidor é o `apps/dashboard/ferramentas/conferir-promocoes.mjs` (com os falsos, o admin
local e, com `LOJA`, a loja): o formulário pela API e pela gaveta, a conta no carrinho de verdade
(2, 3, 5 e 6 unidades; o produto de fora), a faixa de 3 que sai e a de 2 que fica, e as duas
voltando na pausa, o cupom que combina e o que não combina (este tira um produto da "Promoção de
lançamento" do banco local e devolve no fim), um pedido Pix e a lista, a pausada e a agendada, o
celular, e na loja o card (os dois selos, um embaixo do outro), a PDP (o cartão de 2 e o de 3), a
sacola (o empurrão com preço; com as ações seguradas 1,5 s, pra ver o total previsto) e o selo
saindo depois da pausa. Pausa e apaga as promoções da rodada no fim.

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
  com as notas e os envios, a conexão do ERP, as rotinas e os sinais de hoje e de ontem. Dos pedidos,
  só o que a conta usa: `CAMPOS_DO_VIGIA` (id, número, data, situação e metadata — o estorno e a
  Frenet moram nele; entrega 0199). Com os campos da lista vinha o total, que o Medusa CALCULA lendo
  itens, impostos, ajustes e frete de cada pedido: medido na 0199, ~1,8 KB por pedido contra ~0,35
  KB, e ~20 vezes mais lento. Conta nova que precise de outro campo do pedido: ponha nos
  `CAMPOS_DO_VIGIA`, nunca volte pra lista inteira. Apaga os sinais de mais de 60 dias e os problemas
  resolvidos há mais de 90 — uma vez por hora, na rodada dos primeiros minutos (`horaDeLimpar`,
  0199): os prazos são de semanas.
- **Os dois tipos.** O problema de estado (`sozinho`) não se marca: a rota responde 409
  `sai_sozinho`. O de evento se marca pelo `resolverProblemaWorkflow`, e volta se acontecer de novo
  depois. As rotinas todas paradas (o vigia também) viram um problema na hora da leitura, sem
  tabela: é o worker fora do ar.
- **As rotas**, na área `observabilidade` (dono e operação): `GET /dashboard/observabilidade`
  (`lib/observabilidade/tela.ts`: a loja agora pelo `LOJA_URL`, guardada 1 minuto; o Medusa ligado
  desde; a conexão do ERP e a última nota) e `POST /dashboard/observabilidade/problemas/:id`
  `{ acao: "resolver" }`. O `GET /dashboard/eu` devolve `avisos.observabilidade`: os graves que o
  papel vê, pro número vermelho do menu — contados no banco (`listAndCountProblemas`, com o
  `filtroDoPapel`, que é o `podeVer` no filtro; mudou um, mude o outro, e o teste amarra os dois).
  Até a 0167 ele contava as linhas de uma página de 100, e o menu parava em 100.

O conferidor é o `apps/dashboard/ferramentas/conferir-observabilidade.mjs`. Ele cria as falhas nos
falsos: o Resend recusa, a Frenet cai, e o Pagar.me não estorna.

**A parte 2: o que o navegador manda** (entrega 0090). A loja mede e manda, e o painel mostra:

- **Na loja:** `components/telemetria/telemetria.tsx` mora no layout raiz. Ele guarda o LCP, o INP
  e o CLS do `useReportWebVitals` (uma de cada por envio, pelo nome: no desenvolvimento, o React
  liga o medidor duas vezes) e o erro dos scripts da própria loja (`error` e
  `unhandledrejection`). O medidor (`vitais.tsx`) só baixa depois do `load` (0194): o `web-vitals`
  do Next pesa ~3 KB comprimidos e entrava no LCP de toda página no Lighthouse do CI. O navegador
  guarda o LCP, o CLS e o primeiro toque desde o começo, e o medidor lê o que já passou — só a
  visita que esconde a aba no instante da carga fica sem o LCP (a de antes também quase nunca o
  mandava). O ouvinte do erro continua na hidratação. O `avisar-404.tsx` mora no `not-found.tsx`, e as telas de erro contam o
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

**O vigia de fora** (entrega 0137). A Observabilidade mora dentro do Medusa: se o serviço cai no
Railway, ou fica de pé sem rodar as rotinas, nada avisa. Então um serviço de fora (o UptimeRobot,
na conta do dono) espera um "estou viva": o job `vigiar-a-loja` chama o `VIGIA_DE_FORA_URL` (o
heartbeat do UptimeRobot) no FIM da rodada, depois de conferir a loja e pôr os problemas em dia
(`lib/observabilidade/vigia-de-fora.ts`, `avisarOVigiaDeFora`). Parou de chegar, o UptimeRobot
avisa no celular. O endereço é segredo (quem tem ele finge que a loja está viva): mora só no
Railway, e o sinal do dia (`vigia-de-fora`, em `obs_sinal`) guarda a falha sem ele. Sem a variável,
nada sai, e a linha "Vigia de fora" das integrações fica desligada. No mesmo UptimeRobot moram os
monitores de endereço — a loja, o `/health` do Medusa e o `/entrar` do painel —, que avisam
quando um deles não responde. Pra testar local: um servidor que anota o que chega (o
`vigia-falso.mjs` do scratchpad da 0137, na 5980) e o `VIGIA_DE_FORA_URL` do Medusa apontando pra
ele; o recado sai nos minutos 1, 6, 11… da hora.

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
- **Pra quem vai o aviso da equipe:** `AVISOS_DA_EQUIPE` diz o papel de cada um (a nota e o
  cancelado que ficou na Frenet: operação e dono; a venda nova, o Bling caído e o estorno: dono), e
  `destinatarios` escolhe os e-mails — quem
  está ativo no papel; sem ninguém, o dono; sem ninguém no painel, os usuários do admin, como antes.
  O `avisarAEquipe` do ERP, o dos estornos e o `avisarVenda` chamam o `emailsPraAvisar`
  (`lib/equipe/avisados.ts`).

As rotas: `GET /dashboard/configuracoes` e
`POST /dashboard/configuracoes/{empresa,frete,emergencia,nota,pagamento}`. Todas anotam no
registro da equipe. O conferidor é o `apps/dashboard/ferramentas/conferir-configuracoes.mjs` — o do painel,
que não é o `apps/loja/ferramentas/conferir-configuracoes.mjs` da loja. Ele guarda as configurações
e a janela no começo e devolve no fim, mesmo quando falha. O `conferir-observabilidade.mjs` confere
que o e-mail do estorno vai pro dono, e não pra operação.

**A parcela mínima do cartão** (Configurações → Pagamento, entrega 0157). `pagamento.parcelaMinima`
em `fb_configuracoes` (`lib/configuracoes.ts`), em reais: PÚBLICA (`soOPublico`), porque vale nas
três pontas, como o frete — o que a loja anuncia ("3x de R$ X" só quando a parcela passa dela: o
card de produto, a vitrine da home, a caixa de compra da PDP, a sacola, o resumo do checkout e as
Dúvidas), o que o checkout oferece (`parcelasPossiveis`, no passo 3) e o que o Medusa aceita. O PISO
é o do banco, `PARCELA_MINIMA_CENTAVOS` (R$ 5,00, em `lib/pagamento/entrada.ts`, que o provedor
segue conferindo): a leitura devolve o piso pra qualquer valor abaixo dele, acima do teto
(`PARCELA_MINIMA_TETO`, R$ 1.000) ou sem número. O provedor não enxerga as configurações (é módulo
isolado), então quem confere a da loja é uma porta na abertura da sessão de pagamento
(`parcelaMinimaDaLoja`, em `lib/pagamento/parcela.ts`, no `POST
/store/payment-collections/:id/payment-sessions`): cartão em parcelas que não cabem responde 400 com
`parcela_minima`, e o `finalizar` da loja escreve a frase e refaz a tela. Na loja, o valor chega
pelo `configuracoes()` (`lerPagamento`: o Medusa de antes da 0157 não manda, e vale o piso) e, nas
telas de cliente, pelo `useParcelaMinima()` (`components/configuracoes/contexto.tsx`, no layout
raiz). O painel grava por `POST /dashboard/configuracoes/pagamento` (`lerParcelamento`: "30,00"; 422
fora da faixa). O `conferir-pagamento.mjs` grava uma mínima que tira o 3x, pela rota das
configurações do admin, e confere a rota pública, a recusa do Medusa e as parcelas do passo 3 — e
devolve a de antes.

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
  a versão e os parceiros — `sim.3.gmtc`. Resposta de outra versão (`VERSAO_DO_CONSENTIMENTO`) ou
  um sim sem um parceiro que entrou depois volta a ser "sem resposta" (`respostaQueVale`; a faixa
  aparece de novo, e as tags ligam igual); o "não" vale pra qualquer lista. Desde a 0230 o "sim" é o
  "Entendi" da faixa (um botão só, o da Nuvemshop) e o "não" vem da recusa na política de
  privacidade (`mudar-resposta.tsx`). A versão sobe com parceiro ou finalidade nova — a política promete
  avisar antes de valer. A 3 (entrega 0130) é a do CRM: a própria loja está em todo sim, e por
  isso a faixa aparece SEMPRE, com ou sem parceiro ligado no painel.
- **O pé da tela** (entrega 0097): a faixa (`components/analytics/consentimento.tsx`) mora no pé
  da tela, EM CIMA da barra que estiver presa lá — a de compra da PDP, a do total no checkout do
  celular. Cada barra diz a própria altura em `--pe-da-tela`, no `<html>`, pelo `usePeDaTela`
  (`lib/use-pe-da-tela.ts`: medida com `ResizeObserver`, num registro em que vale a maior — o
  Next guarda telas visitadas escondidas, e a cópia que se esconde não pode apagar a medida da
  que está na tela). Barra nova presa embaixo: use o `usePeDaTela`. Até 25/09 a barra da PDP
  (z-index 60) cobria os botões da faixa, e a faixa (z-50, depois no DOM) cobria o botão do
  checkout. No celular a faixa é menor: letra de 12 px, com o "Entendi" ao lado do texto.
- **As tags** (`components/analytics/`): `tags.tsx` (no layout raiz, com o GA4 da Vercel de
  reserva) chama `ligarIntegracoes(i)` (`integracoes.ts`, baixado por `import()` só quando
  alguma tag liga) sem resposta ou com o sim — TODAS de uma vez, como a Nuvemshop (entrega 0230):
  o GA4 e o Google Ads com o `consent default` todo `granted`, a Meta com o PageView, o TikTok e a
  Clarity com o `consentv2` liberado. Com o "não", nenhuma liga; se já estavam na página, `recusar`
  (`mudar-resposta.tsx`) liga o `ga-disable-<código>`, nega o `consentv2`, apaga os cookies dos parceiros
  (`_ga`, `_ga_*`, `_gcl_*`, `_fbp`, `_fbc`, `_ttp`, `_clck`, `_clsk`, em cada domínio de cima) e
  recarrega. A resposta que muda antes do `import()` chegar cancela o que ele ia montar. Os
  trechos são os oficiais, com o código conferido de novo. As trocas de página cada plataforma
  conta sozinha (GA4, Meta, TikTok e Clarity escutam o histórico): não mande `page_view` à mão.
- **A campanha do link** (entrega 0162): cada plataforma lê a campanha no ENDEREÇO da página em
  que liga — as UTMs e o clique do anúncio (`gclid`, `gbraid`, `wbraid`, `gad_*`, `dclid`,
  `srsltid`, `fbclid`, `ttclid`, `msclkid`) —; desde a 0230 todas ligam na chegada e leem ali.
  Até então as do sim esperavam o "Aceitar", e quem aceitava depois de trocar de página chegava
  sem campanha em todas (27/09: a Clarity só via o site). O
  `guardarACampanha` (`lib/chegada.ts`, no efeito do `tags.tsx`) guarda a da página de chegada na
  aba (`fb_campanha`; outro link na mesma aba troca), e o `devolverACampanha`, no começo do
  `ligarIntegracoes`, a devolve ao endereço antes dos scripts quando ele não tem campanha nenhuma —
  uma vez por campanha (`fb_campanha_devolvida`). É o `history.replaceState(null, …)` do guia do
  Next: o roteador assume o endereço e não o desfaz. Parâmetro de plataforma nova: no
  `DA_CAMPANHA`.
- **Os eventos** saem só por `lib/rastrear.ts`: `gtag('event', …)` pro GA4 e o Ads (o
  `dataLayer.push` de objeto, sem GTM, o gtag.js ignora), os padrões da Meta e do TikTok, e marcas
  na Clarity. São duas portas, cada uma com a sua fila na página: a dos parceiros abre quando as
  tags ligam (sem resposta ou com o sim) e leva os eventos de todos; a do CRM, só com o "Entendi"
  (o efeito do produto roda antes do das tags); porta que não abre leva a fila junto com a página. Onde nascem: `view_item` na caixa de compra,
  `add_to_cart`/`remove_from_cart` pela diferença da sacola no provedor
  (`rastrearMudancaDaSacola` — pega a página do produto, o leva junto, a oferta e o "+"),
  `begin_checkout` e `add_shipping_info` nas etapas, `add_payment_info` no pagar. O `item_id` é o
  id da variante, o mesmo da compra do servidor.
- **Os passos pelo servidor** (entrega 0231, pros gestores de tráfego não perderem quem usa
  bloqueador): o ViewContent, o AddToCart, o InitiateCheckout e o AddPaymentInfo saem com um id
  (`novoId`, no `rastrear`) — o mesmo no `fbq(…, { eventID })`, no `ttq.track(…, { event_id })` e no
  envio pelo servidor —, e a Meta e o TikTok juntam os dois. A visita à página (PageView/"Pageview")
  só vai pelo servidor de quem teve o pixel bloqueado: `vigiarOScript` (`integracoes.ts`) marca o
  bloqueio pelo erro do script, ou, na Meta, pelo `fbq.callMethod` que não aparece 2 s depois do
  load (o bloqueador que troca o script por um vazio); daí em diante, uma visita por troca de página
  (o `history.pushState` embrulhado e o `popstate`, contando só o caminho). O caminho:
  `lib/pelo-servidor.ts` (baixa com as tags e se registra no `rastrear`; junta 1,5 s, até 20, e o
  resto sai no `pagehide` pelo `sendBeacon`) → `app/api/passos` (confere que não é "não", que é da
  própria loja pelo `sec-fetch-site`, lê `_fbp`/`_fbc`/`_ttp`, o IP e o navegador; com a Meta
  bloqueada, cria o `_fbp` e o `_fbc` do `fbclid` no formato da Meta) → `POST /store/anuncios/passos`
  (só a loja; 60 lotes por minuto por IP, 3.000 pra loja) → `mandarPassos` (`enviar.ts`, sem trava
  nem registro; as integrações com um minuto de memória, esquecida quando o dono salva) com o
  formato em `lib/anuncios/passos.ts` (puro, com testes: a página só com a origem e o caminho, da
  loja; o horário até uma hora atrás). O GA4 fica de fora: não junta navegador e servidor, e o
  Measurement Protocol não cria visita — o Início e o Marketing contariam dobrado. No conferidor, o
  fbevents.js de mentira define o `callMethod`; sem ele a loja acharia que está bloqueado.
- **O rastro da compra** (`apps/loja/src/lib/rastro.ts`): a ação de finalizar lê a resposta sobre
  os cookies e, de quem não disse não (0230), `_ga`/`_ga_<código>`, `_fbp`/`_fbc`, `_ttp`, o IP,
  o navegador (o aparelho da compra no Funil) e a página; e
  manda DEPOIS da resposta (`after()`) pra `POST /store/pedidos/rastro` (só a loja, `daLoja`;
  `registrarRastroWorkflow` grava `fb_rastro` uma vez). NÃO vai no metadata do carrinho — que o
  2.21 copia pro pedido (conferido em 25/09) —, porque qualquer update do carrinho roda o
  `refreshCartItemsWorkflow`: cota o frete de novo e refaz a coleção de pagamento, na hora de
  pagar.
- **A compra pelo servidor** (`apps/backend/src/lib/anuncios/`): `compra.ts` é puro — `decidir`
  (código no painel, chave no Railway; o "não" dispensa todas; de quem não disse não, vai pras
  três, com `ad_user_data`/`ad_personalization` `GRANTED` — 0230, como as tags; o GA4 sem o
  `client_id` dispensa; sem rastro, espera 30 minutos) e
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

O conferidor é o `apps/dashboard/ferramentas/conferir-integracoes.mjs` (35; a seção "A faixa e as
barras do pé da tela" confere, no celular e no computador, que o meio de cada botão da faixa e o da
barra é o próprio botão, e o tamanho da faixa no celular; a "A campanha do link, pra quem aceita
depois" chega com UTMs, `gclid` e `fbclid`, troca de página pelo Next e só então aceita). Ele troca
os scripts de fora por um de mentira (o `route` do Playwright), que anota o endereço da página na
hora em que carrega (`__endereco`), e lê as filas dos trechos (`dataLayer`,
`fbq.queue`, `ttq`, `clarity.q`); a compra, no `apps/loja/ferramentas/anuncios-falsos.mjs` (4370,
`PORTA_ANUNCIOS`), com os pedidos da `fabricaDePedidos` (que devolve o `carrinho` pro crachá da
tela de obrigado).

**O catálogo pros anúncios** (entrega 0134). `/catalogo.xml` (`apps/loja/src/app/catalogo.xml/
route.ts`, montado em `src/lib/feed-de-produtos.ts`) é o arquivo que o Google Merchant Center
(Shopping, Performance Max) e o Gerenciador de Comércio da Meta (anúncio de catálogo, remarketing
dinâmico, Instagram Shopping) buscam: RSS 2.0 com os campos `g:` do Google, que a Meta também lê.
Uma linha por VARIAÇÃO, com o id `variant_…` — o mesmo do `item_id`/`content_ids` do
`lib/rastrear.ts` e da compra pelo servidor (`backend/src/lib/anuncios/enviar.ts`, `variant_id`);
id diferente e o remarketing dinâmico não acha o produto. O preço é o do card: sem promoção,
`g:price`; com ela, `g:price` é o cheio e `g:sale_price` o que se paga. Sem EAN no Medusa (a
importação do Bling não traz), `identifier_exists: no` com a marca e o SKU no `mpn`; com EAN
(`ean`, `upc` ou `barcode` da variação), `g:gtin`. A categoria do Google vem da categoria da loja
(`CATEGORIA_DO_GOOGLE`: cabelo 1901, o resto 528). Vai SÓ a foto principal — as artes a mais
(antes e depois, "88% de eficácia") derrubam conta de anúncio —, e em JPEG, pelo Medusa:
`GET /catalogo/fotos/<handle>.jpg` (`backend/src/api/catalogo/fotos/[foto]/route.ts`,
`lib/foto-do-catalogo.ts`), fora de `/store` porque o robô não manda a chave publicável; a Meta
não aceita WebP no catálogo, e as fotos da loja são WebP. As convertidas ficam na memória (60, um
dia); o `?v=` do catálogo é um resumo do endereço da original, então foto nova vira endereço novo.
A rota sai pronta no build e segue a marca `produtos` da vitrine (o `listarProdutos` do sitemap).
O proxy não passa por ela (o `matcher` pula `.xml`). Os links usam o `NEXT_PUBLIC_SITE_URL`: só
servem pro Merchant Center e pra Meta DEPOIS da virada, no domínio verificado. O conferidor é o
`apps/loja/ferramentas/conferir-feed.mjs` (só lê: o XML num `DOMParser` de verdade, cada linha
contra a API, e os links e as fotos abrindo).

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

**O CRM, parte 1: a loja anota o que cada pessoa faz** (entrega 0130, a Fundação do "Ciclo da
Barba"). Só de quem disse sim à faixa de cookies, e ligado ao e-mail da pessoa quando ela diz quem
é. Os fluxos de e-mail vêm nas próximas partes e leem daqui.

- **No navegador** (`apps/loja/src/lib/anotar.ts`): o mesmo evento que vai pro Google sai também
  pro CRM — `mandar()`, em `lib/rastrear.ts`, chama `anotar` — e dois são só daqui, por
  `anotarNaLoja`: a `visita` (uma por sessão, com a campanha do link e o domínio de onde veio,
  guardados na aba desde a primeira página — `chegadaDaVisita`, em `lib/chegada.ts`, no
  `tags.tsx`) e o
  `contato_informado` (o e-mail no passo 1 do checkout, nas etapas; uma vez por carrinho na
  sessão, `umaVez`). Tudo espera o mesmo
  "Entendi" da faixa. Junta 2 segundos num envio (até 20), manda pelo `sendBeacon` ao sair da
  página, e o mesmo produto visto duas vezes em 2 segundos conta uma (o efeito dobrado do React no
  desenvolvimento). O `anotar.ts` só baixa depois do sim (`import()` no `rastrear`); o que precisa
  existir antes (guardar a chegada e o "onde") é o `chegada.ts`, pequeno. No `next dev` recém-subido
  o primeiro envio espera a compilação desse pedaço.
- **Na loja** (`app/api/eventos/route.ts` e `lib/crm.ts`): o POST confere o sim NO SERVIDOR (o
  cookie da resposta) — sem ele, 204 e nada. Com ele, o visitante é o cookie `fb_visitante`
  (`httpOnly`, um UUID, um ano renovado a cada recado), e vão juntos o carrinho e o token de quem
  está logado; o corpo é montado aqui (do navegador, só os eventos). O DELETE (o "não" da faixa)
  apaga o cookie e manda `POST /store/crm/esquecer`. A newsletter e a entrada na conta anotam do
  servidor (`anotarNoServidor`, com a identificação). Fora: robô e preview da Vercel.
- **No backend:** `POST /store/crm/eventos` só aceita a loja (`daLoja`); 30 recados por minuto por
  visitante, 120 por IP e 3.000 da loja. A regra do que entra é `lib/crm/eventos.ts` (puro, com
  testes): os tipos do CRM em português (`produto_visto`, `sacola_entrou`, `pix_copiado`…), os
  dados cortados por tipo, a página sem o que identifica alguém (`normalizarPagina`, a da
  telemetria), e `newsletter`/`conta_entrou` só com a identificação que o servidor da loja põe.
- **De quem é o navegador — nunca do que o navegador diz:** o token do cliente (o middleware com
  `allowUnauthenticated`; a conta vale mais que o resto), o e-mail do carrinho nos passos do
  checkout, ou a newsletter. `identificar` passa o e-mail pras anotações de antes que estavam sem
  (as de outro e-mail ficam com o dele).
- **As tabelas** (`src/modules/crm/`): `crm_visitante` (a `chave` é o cookie embaralhado,
  `chaveDoVisitante`; o e-mail, o cliente, como se identificou e a origem da primeira visita) e
  `crm_evento` (tipo, dados, página, carrinho e `em` — a hora do servidor menos o "há quanto
  tempo" do navegador). `esquecer` e `limpar` apagam de verdade. O job `limpar-o-crm` (minuto 41,
  de hora em hora) tira o que passou de 13 meses (`DIAS_DO_CRM` = 400).
- **O painel:** a área `crm` (dono e marketing), no menu em Pessoas. `GET /dashboard/crm?periodo=`
  (hoje, 7d — o padrão — ou 30d) monta a tela em `lib/painel/crm.ts` (puro): os números
  (visitantes, com e-mail, pessoas, anotações), o caminho em etapas com os 13 tipos e as 30
  últimas em frase, com o e-mail mascarado (`emailNoLog`).
- **Mudar de ideia:** a política de privacidade tem o botão "Mudar minha resposta sobre os
  cookies" (`components/analytics/mudar-resposta.tsx`): apaga a resposta e recarrega, a faixa
  volta, e o "não" apaga o que foi anotado (se as tags já estavam na página, o "não" recarrega de
  novo pra tirá-las). O link "Como usamos seus dados" da faixa não pré-carrega a política
  (`prefetch={false}`): com a faixa em toda primeira tela, o prefetch baixava o HTML, o CSS e o JS
  das páginas institucionais no meio do carregamento.

O conferidor é o `apps/dashboard/ferramentas/conferir-crm.mjs` (97 com as partes 2 a 5): a rota (assinatura, lote,
esquecer), a loja com a recusa da política (nada sai, nenhum cookie) e com o "Entendi" (a chegada com a
campanha, o produto, a sacola e o e-mail do checkout chegando nas anotações de antes), a
newsletter, a conta (o código pelo Resend falso), a tela do dono, do marketing no celular e da
operação (sem acesso), e o "não" depois do sim apagando tudo. Precisa do Medusa mandando o código
pro Resend falso (`PORTA_RESEND`).

**O CRM, parte 2: os avisos do Resend** (entrega 0138). O que acontece com cada e-mail depois que
ele sai — chegou, atrasou, foi aberto, levou clique, voltou, virou reclamação de spam — volta pro
CRM:

- **No envio:** `enviarEmail` (`lib/email.ts`) põe a etiqueta `tipo` no e-mail — o `tipo` dito na
  chamada, ou o `<o que>` da chave de idempotência ("pedido-confirmado"). Os de cliente sem chave
  dizem o tipo (`envio-<momento>`, `codigo-de-entrar`, `codigo-do-email-novo`, `email-trocado`).
  E-mail novo pra cliente: dê um tipo, e o nome dele em `NOME_DO_EMAIL` (`lib/painel/crm.ts`).
- **O aviso:** `POST /hooks/resend` (o corpo cru, no `middlewares.ts`), assinado no padrão Svix com
  o `RESEND_WEBHOOK_SEGREDO` (o `whsec_…` da tela do webhook no Resend), com 5 minutos de tolerância.
  A regra é `lib/crm/resend.ts`, pura: `assinaturaConfere` e `lerAvisoDoResend` — fica o endereço,
  a etiqueta e as horas; o clique vira a página da loja sem id (ou o domínio de fora); a devolução
  passa pelo `semDadoPessoal`. Nada de assunto (o do código de entrar tem o código), IP ou
  navegador. Sem o segredo, ou com a assinatura errada, 401.
- **A tabela** `crm_email`: uma linha por e-mail (o id do Resend), e cada aviso preenche a sua
  hora — a de primeira vez fica com a mais antiga, a de última com a mais nova (`least`/`greatest`:
  o aviso repetido ou fora de ordem não muda nada). O clique conta como aberto. `equipe` = o e-mail
  foi pra alguém da equipe do painel ou do admin (a venda nova, o código do painel): fica fora das
  contas. O `limpar-o-crm` tira o e-mail que saiu há mais de 13 meses.
- **A tela:** "Os e-mails da loja", no CRM — os e-mails de cliente que saíram no período e quantos
  deles chegaram, foram abertos, levaram clique, não chegaram e viraram spam; o mesmo por tipo; e
  os 15 com novidade por último, em frase. Sem o segredo, a frase diz que os avisos não estão
  ligados.
- **No Resend (o dono, uma vez):** Webhooks → Add endpoint, com `https://<api do Railway>/hooks/resend`
  e os eventos de e-mail; o "Signing secret" vai pro Railway como `RESEND_WEBHOOK_SEGREDO`. Pra ter
  aberto e clique, ligar o rastreio de abertura e de clique no domínio (Domains).

O `conferir-crm.mjs` (65) assina os avisos como o Resend (precisa do mesmo
`RESEND_WEBHOOK_SEGREDO` do Medusa): a etiqueta do e-mail do código, a assinatura errada e a velha,
o clique sem o IP e sem o id do pedido, a abertura repetida contando uma vez, o que voltou, o do dono
fora das contas, e a tela.

**O CRM, parte 3: a ficha de cada pessoa** (entrega 0145). Na ficha do cliente (Clientes → a
pessoa), quem abre o CRM vê as cinco etiquetas do plano, no alto, e o caminho da pessoa, embaixo
dos pedidos. A operação abre a ficha sem essa parte.

- **As etiquetas** (`lib/crm/etiquetas.ts`, puro, com testes): `etiquetasDaPessoa` recebe os
  pedidos de todos os cadastros com o mesmo e-mail, os sinais (o último clique num e-mail da loja,
  a última anotação do site, a newsletter) e a hora, e devolve cada uma com o porquê em frase:
  - **etapa** — lead (sem compra paga), 1ª compra (paga, a caminho), em tratamento (chegou),
    recorrente (2 pagas), em risco (20 dias depois do dia de comprar de novo; sem saber quanto
    dura, 60 dias sem pedido) e sunset (45 dias em risco sem clicar nem visitar);
  - **engajamento** — o sinal mais novo (clique, visita, compra, newsletter): até 30 dias quente,
    até 90 morno, depois frio;
  - **tratamento** — os dias desde a entrega do primeiro Fator;
  - **próxima compra** — a entrega do último pedido pago + o que dura o primeiro produto a acabar;
  - **sensível a cupom** — as últimas 3 compras todas com cupom (a oferta do checkout, `BUMP-`, e
    a promoção automática, `PROMO-`, não contam).
- **Quanto dura cada frasco:** pelo endereço do produto (`componentesDoProduto`: "kit-3-…" são 3,
  "…-duplo" são 2, o kit de dois produtos é um de cada, o `kit-completo-para-barba` está em
  `KITS`), vezes a quantidade, vezes os dias de `DIAS_PADRAO` (Fator 30; shampoo 65, óleo 70 e
  balm 80 desde a 0229, pelas vendas da Nuvemshop de fev–set/2026; spray 45; pasta 60) — os
  Ajustes do CRM mudam cada um. Produto novo com nome fora do
  padrão: ponha em `KITS`. Sem o aviso de entrega, o pedido conta como entregue 7 dias depois de
  pago, a partir de 10 dias pago (o porquê diz "estimada").
- **A entrega** é o "entregue" mais tarde entre o envio do Medusa (`delivered_at`) e o aviso da
  Frenet (`entregue_em`); o pedido lê `items.product_handle` (`CAMPOS_DO_DETALHE`).
- **O caminho** (`montarFichaDoCrm`, em `lib/painel/crm.ts`): as anotações do site, os e-mails da
  loja (a frase dos avisos do Resend) e as compras pagas, do mais novo pro mais velho, até 25; e
  de onde a pessoa chegou da primeira vez (a origem do primeiro visitante com o e-mail dela; sem
  origem, "Direto"). O serviço do módulo lê tudo de uma vez (`pessoa(email)`).
- **Quem vê o quê:** a rota da ficha (`GET /dashboard/clientes/:id`) põe `cliente.crm` só com a
  área `crm`; sem a área `pedidos` (o marketing, no padrão), o número do pedido não aparece nem
  na etiqueta nem no caminho.

O `conferir-crm.mjs` confere a ficha da conta da rodada (lead, quente pelo clique, "Direto", o
caminho com o e-mail clicado e o site, a tela, e a operação sem a parte do CRM); o
`conferir-clientes.mjs`, as etiquetas com pedidos de verdade (1ª compra, a oferta do checkout fora
do cupom, o Pix esperando fora da compra, o marketing sem o número do pedido).

**O CRM, parte 4: os Ajustes** (entrega 0149). CRM → Ajustes (`/crm/ajustes`, a aba do lado do
Resumo): quanto dura cada tipo de produto e as regras das etiquetas, que valem na ficha de cada
cliente.

- **A regra** é `lib/crm/ajustes.ts`, pura, com testes:
  - `lerAjustesGuardados`: o `fb_crm` do metadata da loja por cima de `AJUSTES_PADRAO`. É
    tolerante: o número fora do limite, o apagado ou o morno antes do quente volta pro padrão;
  - `lerMudancaDosAjustes`: estrita. Recebe o formulário inteiro e devolve cada campo errado com a
    frase, em `dias.<tipo>` ou `regras.<regra>`;
  - `soOQueMudou`: só o diferente do padrão vai pro metadata. Quando o padrão mudar (o histórico da
    Nuvemshop), o número que ninguém mexeu acompanha;
  - `montarTelaDosAjustes`: os produtos publicados que contam como cada tipo (pelo
    `componentesDoProduto`) e os que ficam fora da conta.
- **As regras** são `RegrasDasEtiquetas` (`etiquetas.ts`), com o padrão em `REGRAS_PADRAO`: a
  tolerância do em risco (20 dias), o em risco sem previsão (60), o sunset (45), o quente (30), o
  morno (90) e as compras do cupom (3). A entrega estimada (7 dias depois de pago, a partir de 10)
  segue fixa.
- **As rotas:** `GET/POST /dashboard/crm/ajustes`, na área `crm`. O POST grava pelo
  `mudarMetadataDaLoja` e anota `mudou-ajustes-do-crm` no registro da equipe. A ficha
  (`GET /dashboard/clientes/:id`) lê o metadata da loja junto e passa os ajustes pro
  `fichaDoCrmDoCliente`.
- **O painel:** `components/ajustes-do-crm.tsx` tem o desenho da tabela dos acessos: amarelo =
  diferente do padrão, as mudanças sem salvar, Desfazer, Voltar ao padrão e Salvar. A ação é
  `lib/acoes/crm.ts`, e as abas são `AbasDoCrm`. O `/crm`, os Ajustes e a ficha do cliente leem
  junto com o "quem é" (`void ler(caminho)`, o padrão da 0146).
- Produto novo com o nome fora do padrão aparece em "Fora da conta da próxima compra": ponha ele em
  `KITS` (`etiquetas.ts`).

O `conferir-crm.mjs` (85) cria um pedido de Fator entregue pela `fabricaDePedidos`, com a Frenet e o
Pagar.me falsos. Pra isso precisa de ADMIN_EMAIL/ADMIN_SENHA, MEDUSA_WEBHOOK_SEGREDO, PORTA_FALSA e
PORTA_PAGARME_FALSO. Ele confere:
- o número errado recusado;
- a operação sem os Ajustes;
- o marketing mudando o Fator pra 40 dias no celular, e a próxima compra da ficha andando junto;
- o "Voltar ao padrão".

No fim, os Ajustes voltam ao padrão: o banco local é de todos os conferidores.

**O CRM, parte 5: a base da Nuvemshop** (entrega 0156). CRM → Base da Nuvemshop (`/crm/base`): o
dono manda os três arquivos que a loja antiga exporta (Clientes, Vendas e Carrinhos abandonados), e
o CRM passa a conhecer a loja antiga inteira.

- **A leitura** é `lib/crm/nuvemshop.ts`, pura, com testes (`lerArquivoDaNuvemshop`):
  - o arquivo se reconhece pelo cabeçalho, com as colunas por nome e sem acento ("Data de envío");
  - a letra é UTF-8 se o arquivo for UTF-8 válido, senão Latin-1 (o que a Nuvemshop exporta);
  - o CSV aceita `;` ou `,`, e aspas com o separador e a quebra de linha dentro;
  - o dinheiro vem com ponto ("94.58") ou "R$1.093,18"; a data é de Brasília (UTC−3), e a data
    sem hora fica ao meio-dia;
  - no arquivo de vendas, a linha com "Data" é o pedido, e as de baixo com o mesmo número são mais
    itens dele. O de carrinhos funciona igual;
  - **fica só o que o CRM usa**: da pessoa, o e-mail, o primeiro nome, o "Aceita" da coluna
    Marketing (e a data), a newsletter, a conta e o "desde"; do pedido, o número, as datas, o
    pagamento, o envio, os valores, o cupom e os itens pelo SKU; do carrinho, a data, o tipo, o
    total e os itens. CPF, telefone, endereço, rastreio e cartão são jogados fora ali mesmo —
    menos a entrega de cada pedido das vendas, desde a 0202 (ver "O CRM, parte 18").
- **As tabelas** (módulo `crm`): `crm_base_pessoa` (única pelo e-mail), `crm_base_pedido` (pelo
  número; os valores em centavos) e `crm_base_carrinho` (pelo id). `importarDaNuvemshop` grava em
  lotes de 200, com `on conflict … do update`: mandar de novo atualiza, nada duplica, ninguém sai.
- **O SKU manda** (`componentesDoItem`, em `etiquetas.ts`): a tabela `SKUS` diz o que vem em cada
  produto (FBKIT02 = shampoo e balm, FBKIT04 = shampoo e óleo…), antes do endereço. Vale pros
  pedidos da loja antiga, pros da nova (`items.variant_sku`) e pro "o que conta como cada tipo" dos
  Ajustes. Produto novo: ponha o SKU em `SKUS`.
- **As etiquetas contam a loja antiga:** a ficha soma os pedidos da base pelo e-mail
  (`pedidoDaBase`; confirmado = pago, estorno = cancelado, a entrega é a estimada) e o caminho diz
  "pagou o pedido #N na Nuvemshop". A aba da base (`montarTelaDaBase`) conta quem é quem na base
  inteira: cada pessoa com os pedidos das duas lojas (`pedidosParaAsEtiquetas`, no `ler.ts`), os
  sinais do CRM (`sinaisDeTodos`) e os Ajustes. Mostra quantos em cada etapa e engajamento, e
  quantos deles aceitam ofertas.
- **O histórico nos Ajustes:** `recomprasPorTipo` mede, pra cada tipo, a mediana dos dias entre uma
  compra e a seguinte que traz o mesmo tipo, por unidade. Os Ajustes mostram "Na Nuvemshop: X dias
  (N recompras)". O botão "Usar os números da Nuvemshop" põe no campo os tipos com 10 recompras ou
  mais, e o dono decide se salva.
- **A rota:** `GET/POST /dashboard/crm/base`, na área `crm`. O POST recebe um arquivo por vez,
  comprimido no navegador (`CompressionStream`), em base64 (`{ nome, gzip }`); o corpo vai até 12 MB
  (`middlewares.ts`), e o arquivo aberto até 8 MB. O registro da equipe anota só as contagens
  (`importou-base-da-nuvemshop`).
- A política de privacidade da loja conta o que veio da loja antiga, e o que não veio.

O `conferir-crm.mjs` (97) monta os três arquivos na hora, em Latin-1, com gente da rodada, e
confere:
- a operação sem a base;
- o arquivo errado e o que nem abre;
- os três pela tela, com a linha sem e-mail de fora;
- os números da API;
- mandar de novo sem duplicar;
- a ficha de quem comprou nas duas lojas (recorrente, e o pedido da Nuvemshop no caminho);
- nenhum CPF, telefone ou endereço nas respostas;
- o histórico e o botão nos Ajustes;
- o celular.

**O CRM, parte 6: o modelo dos e-mails e o sair da lista** (entrega 0161). Todo e-mail de oferta
do CRM sai de um modelo só, e toda pessoa sai da lista em um clique.

- **O modelo** é `lib/emails/crm.ts`, puro, com testes. `emailDoCrm` monta:
  - em cima, o "Oi, Nome!", o título, o texto e o botão;
  - os blocos, cada um num cartão: produtos (foto, preço e o de/por), cupom, depoimento, passos,
    selo e texto;
  - o pé: por que a pessoa recebeu, o **Sair da lista em 1 clique**, a empresa com o CNPJ, e os
    links (loja, Instagram, TikTok, WhatsApp);
  - a versão em texto.
  Todo link pra loja leva `utm_medium=email&utm_campaign=crm-<campanha>` (`linkDoCrm`) e cai em
  Marketing → Canais como E-mail.
- **O link de sair** (`lib/crm/sair.ts`, puro, com testes) é o e-mail cifrado (AES-256-GCM, com a
  chave derivada do `JWT_SECRET`). Não vence, e ninguém faz o de outra pessoa. Trocar o
  `JWT_SECRET` invalida os links velhos.
- **No pé do e-mail:** `<loja>/sair/<t>`. A rota da loja (`app/sair/[t]/route.ts`) guarda o link
  num cookie `httpOnly`, só do `/sair`, e manda pra `/sair` limpa, como a da avaliação: o link não
  fica na barra nem no Analytics. A página pergunta antes. Abrir o link não tira ninguém, porque o
  antivírus do e-mail de empresa abre todo link. O botão é uma ação do servidor que chama
  `POST /crm/sair`, com o IP assinado. No proxy, `sair` está no `PAGINAS_RAIZ`, e `/sair/` no
  `CAMINHOS_COM_ID` (o link é base64: em minúsculas, não vale). O robots deixa o `/sair` fora do
  Google.
- **No cabeçalho:** `List-Unsubscribe`. Quando o `MEDUSA_BACKEND_URL` é https, vai junto o
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058): é o "cancelar inscrição" que o
  Gmail e o iPhone mostram no alto, e que o Gmail e o Yahoo cobram de quem manda oferta. Sem
  https, o cabeçalho leva a página da loja.
- **`POST /crm/sair`** fica fora do `/store`, porque quem chama não tem a chave publicável. Ele
  tira o e-mail das ofertas em todo lugar (`tirarDasOfertas`, em `lib/ofertas.ts`, a mesma do
  "tirar" da newsletter no painel):
  - a newsletter;
  - o "aceito ofertas" da conta;
  - o avise-me;
  - a base da Nuvemshop.
  O limite é 30 por hora por IP e 2.000 por hora da loja. A resposta é a mesma pra quem estava na
  lista e pra quem não estava. `GET /crm/sair` manda pra página da loja.
- **A base mandada de novo não põe de volta quem saiu.** O "aceita ofertas" da `crm_base_pessoa`
  fica com a decisão mais nova: a data da coluna Marketing da Nuvemshop, ou a hora em que a pessoa
  saiu.
- **O remetente** é o `EMAIL_REMETENTE_CRM` (`remetenteDoCrm`); sem ele, o da loja. O bom é um
  subdomínio só pra oferta (`news.fuckingbarba.com.br`, verificado no Resend), pra oferta no spam
  não levar o pedido junto.
- **No painel:** CRM → E-mails (`/crm/emails`).
  - Três exemplos: boas-vindas, hora de repor e carrinho. O Medusa monta com os produtos, os
    preços, a empresa e o WhatsApp de verdade (`GET /dashboard/crm/emails`, `exemplosParaAEquipe`).
    O cupom e o depoimento são de mentira.
  - A prévia é um `iframe` sem script (`sandbox`), com os links abrindo em outra aba.
  - "Mandar pra mim" (`POST /dashboard/crm/emails/teste`, 10 por hora por pessoa) manda com
    `[Teste]` no assunto e a etiqueta `crm-teste`. O link de sair do teste é o de quem pediu, e
    vale de verdade.
- **Os e-mails de pedido** (confirmado, cancelado e envio) ganharam o TikTok no pé, do lado do
  Instagram.
- Aqui é só o desenho e o sair da lista. Quem manda, quando e pra quem são os fluxos: a próxima
  parte.

O `conferir-crm.mjs` confere:
- a operação sem o modelo;
- os três exemplos, com o sair, o Instagram e o TikTok no pé, e a campanha em todo link;
- a aba, a prévia e o "Mandar pra mim" (o assunto, o remetente, a etiqueta e o cabeçalho);
- o sair pela página: abrir não tira, o cookie `httpOnly`, a newsletter depois do botão, e o link
  que não vale;
- o clique único sem a chave da loja, tirando da base;
- mandar a base de novo sem pôr de volta;
- o `GET` indo pra loja, e o link mexido recusado;
- o celular.
O `conferir-links.mjs` confere o `/sair` fora do Google. Pra fazer o link de uma pessoa da base
como o e-mail faria, o conferidor precisa do `JWT_SECRET` do Medusa.

**O CRM, parte 7: os fluxos de compra** (entrega 0165). Os primeiros e-mails que saem sozinhos, os
de "dinheiro rápido" do plano: o **Pix pendente** e o **checkout abandonado**. Vão pra quem digitou
o e-mail (escolha do dono: é sobre a compra que a pessoa começou), e nasceram ligados.

- **As regras** são `lib/crm/fluxos.ts`, puras, com testes:
  - os toques de cada fluxo:
    - Pix: 15 minutos antes de vencer, depois 1 e 2 dias;
    - checkout: 30 minutos, 4 horas, 1 dia e 2 dias;
  - `toqueDaVez`: se a rotina parou e dois toques venceram, só o mais novo sai (o outro fica
    pulado). Toque vencido há mais de 12 horas não sai mais; o aviso do Pix vale só até vencer;
  - `decidir`, por pessoa:
    - só vale o que começou depois de o fluxo ligar (`desde`);
    - comprou, parou;
    - um fluxo por vez: a entrada de maior prioridade (o Pix) é dona da pessoa até acabar;
    - o teto é de 3 e-mails em 24 horas e 6 em 7 dias;
    - 5% ficam no grupo de controle (sorteado pelo e-mail);
    - de madrugada (22h às 8h em Brasília), só o urgente: o aviso do Pix e o de 30 minutos;
    - o cupom só no toque de 1 dia, e um a cada 60 dias por e-mail.
- **O motor** é `lib/crm/motor.ts` (`rodarOsFluxos`), e a rotina é `fluxos-do-crm` (a cada 5
  minutos, minuto 3, na trava).
  - **Uma leitura por rodada** (entrega 0199, `lib/crm/leitura.ts`): os fluxos medidos em dias
    (estreia, reposição, jornada e resgate) dividem os pedidos da loja nova, a base da Nuvemshop,
    as pessoas que aceitam ofertas, os sinais e o metadata da loja (`leituraDaRodada`, o 3º
    argumento dos `publicoDa…`; quem chama sem ela ganha uma nova). Antes, cada fluxo ligado relia
    tudo sozinho. **A base da Nuvemshop fica na memória** entre as rodadas: cada rodada pergunta só
    a `versaoDaBase` (a contagem e o último `updated_at` de `crm_base_pedido`, que a importação grava
    em toda linha) e relê quando ela muda — vale com dois processos, sem aviso entre eles. Quem lê a
    lista não mexe nela (os `pedidoDa…` montam objetos novos). Fluxo novo medido em dias: leia pela
    leitura, não pelo banco.
  - **Os pedidos da janela vêm leves** (id, e-mail, situação e data: o "comprou"), porque a janela é
    a do fluxo mais longo (o resgate, semanas). Os do Pix vêm completos (os itens do e-mail e o
    código do Pix), só na janela do Pix.
  - As entradas dos últimos 3 dias: os carrinhos com e-mail que não fecharam, e os pedidos com Pix
    que não foi pago. O "comprou" é um pedido não cancelado depois do começo, sem maiúsculas no
    e-mail.
  - Ficam de fora:
    - a equipe;
    - quem saiu da lista (`crm_saiu`) sem um "sim" novo depois;
    - o e-mail que voltou de vez ou foi marcado como spam (`semEntrega`).
  - O toque é RESERVADO antes do envio (índice único fluxo, chave e toque, em `crm_envio`) e
    confirmado depois. O que não saiu volta pra fila, e o cupom dele é apagado.
  - No máximo 60 e-mails por rodada, com 600 ms entre eles.
  - O ligado sem `desde` (a primeira rodada depois do deploy) ganha a hora e só a rodada seguinte
    olha as pessoas: ligar não dispara pros carrinhos de antes.
- **O cupom** é `lib/crm/cupom.ts`: `VOLTA-` e 6 letras, promoção do Medusa pelo `promocaoDoCupom`
  (o mesmo do painel).
  - Porcento na loja toda, uma vez, vence em 2 dias.
  - SOMA com o preço promocional: quase todo produto tem o de/por.
  - Fica fora da lista de Cupons do painel (`api/dashboard/cupons`); a aba Fluxos conta os dados e
    os usados.
- **Os e-mails** são `lib/emails/fluxos.ts` (`emailDoFluxo`), no modelo do CRM.
  - O pé diz "Você recebeu porque começou uma compra" (`porque`, novo no `EmailDoCrm`).
  - O Pix vai no bloco novo `pix`: o copia e cola, e o QR só se for https (o do Mercado Pago é
    data:, que o Gmail não mostra).
  - A etiqueta é `crm-checkout` / `crm-pix` ("Checkout abandonado" e "Pix pendente" em "Os e-mails
    da loja").
- **O link de voltar** é `lib/crm/voltar.ts`: `<id>.<vence>.<HMAC>`, com chave derivada do
  `JWT_SECRET`, e vence em 7 dias. O id do carrinho vale como senha, então nunca vai cru.
  - `POST /store/crm/voltar` (`lib/crm/voltar-ao-checkout.ts`) devolve o carrinho aberto. Pro
    pedido do Pix cancelado, monta um carrinho novo com os mesmos produtos, o e-mail, os endereços e
    o cliente (o produto esgotado fica de fora). Clicar de novo devolve o mesmo (`fb_crm_refeito`,
    no pedido).
  - Na loja, `app/voltar/[t]/route.ts` põe o carrinho no cookie, guarda o `?cupom=` como cupom
    pendente e manda pro `/checkout` com as UTMs. `/voltar/` está no `CAMINHOS_COM_ID` do proxy e
    fora do Google.
  - O e-mail de cancelamento do Pix vencido ganhou o "Refazer o pedido" com o mesmo link
    (`avisar-cancelamento.ts`).
- **Sair da lista:** `tirarDasOfertas` também anota em `crm_saiu`. É a única marca pra quem nunca
  aceitou ofertas e recebe os fluxos de compra.
- **No painel:** CRM → Fluxos (`/crm/fluxos`), na área `crm`.
  - Cada fluxo tem a chave de ligar (desligar guarda o `desde`; ligar de novo começa agora), os
    números de 30 dias e os toques. Os números: quem recebeu, quem comprou em até 7 dias do
    primeiro e-mail e quanto (o 1º pedido), os cupons usados, e o mesmo pro controle.
  - Cada toque tem o "Mandar pra mim" (`POST /dashboard/crm/fluxos/teste`, 10 por hora por
    pessoa, na memória). O desconto do cupom vai de 5% a 30% (padrão 10%). O `conferir-crm` clica
    8 deles por rodada (0229): a 2ª rodada na mesma hora cai nos "Mandar pra mim" sem bug nenhum —
    reinicie o Medusa entre as rodadas.
  - A configuração mora no metadata da loja (`fb_crm_fluxos`). A regra da tela e do mudar é
    `lib/painel/fluxos.ts`.
  - `POST /dashboard/crm/fluxos/rodar` roda agora; fora de produção aceita `{ agora, email }`, que
    é como o conferidor faz o tempo andar.
- **A política de privacidade** conta os até quatro e-mails de uma compra no meio (legítimo
  interesse), e os cookies necessários ficaram completos (a conta e os dos links dos e-mails).

O `conferir-crm.mjs` faz os dois fluxos de ponta a ponta, com o tempo andando pelo `rodar`, e
confere:
- o checkout, toque por toque;
- o cupom e o link que devolve o carrinho com o cupom aplicado;
- quem comprou, quem saiu, o controle, e o fluxo desligado e religado;
- o Pix: o aviso com o copia e cola, o vencido com o "Refazer o pedido" no cancelamento, o
  desconto de 1 dia e o link que monta o carrinho novo (e o mesmo no segundo clique);
- a aba: a chave, o "Mandar pra mim", o desconto e o celular.
Os e-mails de teste saem fora do grupo de controle (o sorteio é o mesmo do motor). A
`conferir-observabilidade` contava 13 rotinas (14 desde as campanhas, "O CRM, parte 19").

**O CRM, parte 8: o carrinho abandonado** (entrega 0169). O terceiro fluxo de compra: pôs na
sacola, não foi pro checkout, e a loja sabe quem é. As horas são as do dono: 1 hora, 12 horas (o
que os clientes acharam), 1 dia (o desconto), 3 dias (o desconto vence amanhã) e 5 dias (a última).

- **De quem é a sacola:** ela não tem e-mail (a loja cria o carrinho sem login; o e-mail só entra
  no checkout), então quem diz é o CRM. `crm.carrinhosComDono(desde)` pega o e-mail da anotação
  mais nova com aquele `carrinho_id`. Só aparece quem aceitou os cookies e já se identificou (a
  conta, a newsletter, uma compra de antes), porque o `identificar` põe o e-mail até nas anotações
  de antes. O motor começa por essas sacolas e só carrega elas: as sem dono, que são quase todas,
  nem saem do banco.
- **As regras** (`lib/crm/fluxos.ts`):
  - prioridade 3, depois do Pix e do checkout;
  - o cupom do carrinho vale 3 dias (`validadeDoCupom`), pro e-mail de 3 dias poder dizer
    "vence amanhã";
  - a janela de cada fluxo é o último toque, a validade dele e mais um dia (`diasDoFluxo`):
    4 dias no Pix e no checkout, 7 no carrinho.
- **Para quando:** a pessoa compra, ou abre o checkout depois (um carrinho com o e-mail dela
  mexido depois da sacola). Aí quem cuida é o fluxo do checkout.
- **O e-mail de 12 horas** leva as avaliações de verdade (as aprovadas no painel, de 4 e 5
  estrelas, as mais novas primeiro) dos produtos da sacola. Sem nenhuma, leva "Como funciona".
  O nome vem da conta com aquele e-mail, se tiver.
- **O botão** é o mesmo link de voltar (`/voltar/<carrinho>`): põe a sacola de volta e cai no
  checkout, com o cupom quando tem.
- **A política de privacidade** diz que a sacola ganha até cinco e-mails, e só quando a loja já
  sabe quem é a pessoa.

O `conferir-crm.mjs` faz a sacola sem e-mail e o evento do CRM com a newsletter (como a loja manda),
e confere:
- os cinco toques, e o cupom de 3 dias;
- o link que devolve a sacola com o cupom aplicado;
- quem abre o checkout depois: a sacola para, e o fluxo do checkout assume.

**Os e-mails dos fluxos e a aba do Gmail** (entrega 0170). Os testes do dono caíam em Promoções.
O estilo de cada e-mail (`EmailDoCrm.estilo`, decidido em `emailDoFluxo`) escolhe o jeito dele e
quem manda:

- **"pedido"**: o aviso do Pix (`pix-vence`) tem a cara dos e-mails de pedido. O pé diz o número
  do pedido, sem o sair da lista e sem o cabeçalho `List-Unsubscribe`. Sai do remetente dos
  pedidos (`EMAIL_REMETENTE`), sem endereço de resposta.
- **"oferta"**: o que leva cupom fica com o modelo da marca, como antes. Promoções é o lugar dele.
- **"pessoal"**: os lembretes sem desconto (`emailPessoal`, em `lib/emails/crm.ts`). É texto
  simples, sem foto nem botão, com um link só. Os produtos vão em lista, só pelo nome, e as
  avaliações entre aspas. Fecha com "Qualquer dúvida, é só responder este e-mail." e a assinatura (`QUEM_ASSINA`).
  O sair da lista fica no pé, em letra pequena, sem o cabeçalho. O fundo branco é declarado: o
  Mail do iPhone escurece o e-mail sem cor de fundo, e a letra escura sumiria.
- **Quem manda** é `comQuemManda` (em `lib/crm/motor.ts`; o "Mandar pra mim" dos fluxos usa a
  mesma) com `remetenteDoEstilo` (em `lib/email.ts`):
  - o pessoal sai do endereço do CRM, com o nome "Matheus, da FuckingBarba"
    (`NOME_DO_REMETENTE_PESSOAL`);
  - a resposta dos dois do CRM (oferta e pessoal) vai pro e-mail de atendimento das Configurações
    (`responderPara`, o `reply_to` do Resend);
  - sem o atendimento, o pessoal manda pro WhatsApp.
- `enviarEmail` só manda `headers` quando tem algum.

O `conferir-crm.mjs` confere o remetente, a falta de foto e de cabeçalho no pessoal, o cabeçalho na
oferta e o pé do aviso do Pix.

**O pessoal sem preço** (entrega 0173). Mesmo depois da 0170, a maioria dos testes do dono caía em
Promoções. Na checagem de todos os e-mails, o que pesa:
- tudo sai do mesmo remetente, no domínio que já mandava as newsletters do Perfit;
- o rastreio de cliques do Resend troca todos os links;
- o preço com "de R$" no pessoal;
- a caixa de quem testa, que o Gmail treina por pessoa.

O que mudou no código:
- o pessoal lista os produtos só pelo nome, sem preço, no HTML (`blocoPessoal`) e no texto
  (`blocoPessoalEmTexto`);
- a versão em texto também perdeu o link de cada produto, que furava o "um link só".

Os e-mails de pedido e de conta ficam com a cara padrão (a moldura), por escolha do dono. O resto é
no painel do Resend e no DNS: o rastreio de cliques desligado e o endereço só das ofertas
(`EMAIL_REMETENTE_CRM`). O `conferir-crm.mjs` confere que o de 30 minutos sai sem "R$" e sem link
de produto.

**Os textos dos lembretes** (entrega 0174). No teste do dono, dois e-mails caíram em Principal: o de
30 minutos do checkout e o aviso do Pix. O de 1 hora do carrinho ("Esqueceu isso aqui?") caiu em
Promoções. A diferença era a frase: o de 30 minutos fala de pedido e de pagamento, e o do carrinho
usava o assunto clássico de e-mail de carrinho.

Os lembretes sem desconto trocaram as frases de propaganda por frases de compra:
- **Saíram:** "Esqueceu isso aqui?", "Última chamada", "Ainda dá tempo", "em 1 clique" e "ainda tá
  aqui".
- **Carrinho:**
  - 1 h: "Sua compra ficou pela metade";
  - 12 h: "Sobre o <produto> que você escolheu";
  - 24 h e 3 d, sem cupom: "Sua compra continua separada" e "Seus produtos continuam separados";
  - 5 d: "O último lembrete da sua compra";
  - o botão é "Terminar a compra", e o bloco dos produtos, "O que você escolheu".
- **Checkout e Pix:**
  - 24 h, sem cupom: "Seu pedido continua guardado" e "Quer refazer o seu pedido?";
  - 48 h, sem cupom: "O último lembrete do seu pedido".
- **No painel,** os nomes dos toques acompanham (`FLUXOS`, em `lib/crm/fluxos.ts`).

Um teste de unidade passa por todos os lembretes sem desconto e recusa essas frases.

**Os lembretes na cara da marca** (entrega 0176). O dono achou o texto simples "cru, diferente dos
outros". Os testes dele mostraram que o que pesou foram as palavras, e não a foto: o aviso do Pix,
com a logo e a foto do produto, caiu em Principal. Os lembretes sem desconto voltaram pra cara da
marca, com os textos da 0174, no estilo novo `"lembrete"` (`EmailDoCrm.estilo`):
- o modelo da marca, com as fotos e o sair da lista no pé;
- sem o cabeçalho `List-Unsubscribe`, que é marca de e-mail em massa;
- sai com o nome de quem assina, "Matheus, da FuckingBarba" (`remetenteDoEstilo`), e a resposta vai
  pro atendimento. É o mesmo do texto simples, pra que o teste mude só a cara;
- o de 4 horas diz onde tirar a dúvida (`ondeTirarDuvida`, em `emailDoFluxo`): a resposta do
  e-mail, o WhatsApp do pé ou a página de contato.

O `"pessoal"` (`emailPessoal`) continua no código, mas não é saída pra Promoções: o dono quer TODO
e-mail na cara da loja (recusou o texto simples na 0176 e de novo na 0195). Se um lembrete cair em
Promoções, mexer nas palavras e tirar emoji, nunca na cara.

O `conferir-crm.mjs` confere a cara do lembrete no de 30 minutos. E conserta duas contas de hora do
carrinho, que falhavam rodando entre 21h e 22h:
- o "antes de 1 hora" vai na hora de verdade, sem o `diurno`. Empurrado pra manhã, ele passava da 1
  hora, e o motor mandava o de 1 hora antes da conta;
- o `diurno` leva direto pras 8h05, o fim da madrugada do motor, e não mais em degraus de 15 minutos
  até as 9h. O degrau passava das 12 horas da sacola, e o motor pulava o de 1 hora (`toqueDaVez`
  manda o último vencido).

**O CRM, parte 9: o pop-up da 1ª compra** (entrega 0177). O nome e o e-mail em troca de um cupom,
com o e-mail do cupom na hora. O protótipo foi aprovado pelo dono antes. A sequência de
boas-vindas, com as 4 trilhas, é a 0178.

- **O fluxo "boas-vindas"** (`lib/crm/fluxos.ts`) tem um toque só, `boas-vindas-agora`, que o
  motor não manda (`ehToqueDeCompra`): quem manda é a rota do pop-up. A chave dele na aba Fluxos
  liga e desliga o pop-up da loja. O bloco não tem o card do controle: o cupom foi pedido.
  `IdDoToque` = os de compra (`IdDoToqueDeCompra`, os de `lib/emails/fluxos.ts`) mais esse.
- **O cadastro** (`lib/crm/primeira-compra.ts`), pela rota `POST /store/crm/primeira-compra`:
  - `lerCadastro` confere o nome (2 letras, até 60), o e-mail (`normalizarEmail`) e a página (só
    caminho da loja);
  - um cupom por e-mail, pra sempre, pelo registro dos fluxos (`crm_envio`, chave = o e-mail). Quem
    já se cadastrou recebe o mesmo código, sem e-mail novo;
  - quem já comprou (pedido não cancelado com o e-mail) não ganha cupom, mas entra na lista;
  - o "sim" vai pra newsletter com a origem `popup`, o `nome` e a `pagina` (colunas novas,
    `Migration20260928010000`). Quem já estava pelo rodapé ganha os dois, sem mudar a data;
  - o cupom é `BEMVINDO-XXXXXX` (`criarCupomDoFluxo` com `prefixo` e `primeiraCompra`): o % dos
    fluxos, uso único, 3 dias, e só vale se o e-mail do carrinho não tem pedido (a regra
    `fb_cupons.pedidos = 0` dos cupons do painel). Fica fora da lista de Cupons (`ehCupomDoCrm`);
  - o e-mail (`lib/emails/boas-vindas.ts`) é oferta, com o botão `/discount/<código>` e os produtos
    da TRILHA da página (`trilhaDaPagina`: o Fator é crescer, óleo/balm/shampoo é cuidar,
    pasta/spray e Para cabelo é cabelo, o resto é geral). Sai na hora, sem controle e sem a
    madrugada; o e-mail que voltou ou marcou spam (`semEntrega`) não recebe, mas o código aparece
    na tela;
  - limites como os da newsletter: 10 por hora por pessoa (60 sem a assinatura da loja), 300 por
    hora na loja toda.
- **A loja:**
  - o vigia (`components/primeira-compra/vigia.tsx`) está em toda página, e é pequeno de propósito.
    Ele lê o endereço do navegador (`location`), e não do `usePathname`: no layout, fora de um
    `<Suspense>`, o Next 16 recusa o `usePathname` nas páginas dinâmicas (o obrigado do checkout, o
    pedido da conta);
  - o pop-up (`./popup.tsx`) e o CSS dele (`estilos/primeira-compra.css`) só são baixados quando
    ele aparece. As regras ficam em `lib/primeira-compra.ts`;
  - aparece depois de 20 s, da metade da página rolada ou do mouse saindo (computador), e sempre
    depois da faixa respondida e com a sacola fechada. No celular, a primeira tela da página de
    chegada fica livre;
  - não aparece no checkout, na conta, nas páginas de passagem e nas de lei, nem pra quem tem
    sessão (`sessao`), comprou neste navegador (`fb_cliente`, gravado no fim do checkout), se
    cadastrou (`fb_popup = cadastrado`, também na newsletter do rodapé) ou fechou nos últimos 30
    dias (`fb_popup = fechado.<hora>`);
  - `/api/primeira-compra` responde se aparece e o % e os dias do painel. A ação
    `lib/acoes/primeira-compra.ts` guarda o cupom pro checkout (`lib/cupom-pendente.ts`), marca o
    `fb_popup` e identifica no CRM (`anotarNoServidor`, com o sim dos cookies);
  - o formulário é `onSubmit`, e não `action`: o `action` do React limpa os campos a cada envio, e
    o erro faria a pessoa digitar tudo de novo;
  - o `/discount/<código>` leva os `utm_` junto pra home.
- **A política de privacidade** conta o pop-up: o nome, o e-mail e a página, e os dois cookies da
  escolha.

O conferidor é o `apps/loja/ferramentas/conferir-primeira-compra.mjs` (21). Ele usa o relógio do
Playwright (`page.clock`), pra os 20 segundos passarem na hora. Os conferidores que não são dele
nascem com o `fb_popup` (`faixa-respondida.mjs`, `pecas.mjs` e `conferir-integracoes`): depois de
20 segundos o pop-up cobriria o botão, como a faixa cobria. O `conferir-crm.mjs` confere o bloco
Boas-vindas, o "Mandar pra mim" dele e a chave ligando e desligando o pop-up.

**O CRM, parte 10: a sequência das boas-vindas** (entrega 0178). Depois do cupom do pop-up vêm os
e-mails da TRILHA de quem se cadastrou: 1, 2, 5, 7 e 10 dias depois. Quem manda é o motor.

- **O fluxo** `boas-vindas` ganhou os toques `boas-vindas-1d` … `-10d` e `semControle` (a pessoa
  pediu). A entrada no motor é cada cadastro do pop-up (`crm.cadastrosDasBoasVindas`, o toque
  `boas-vindas-agora` que saiu), com a chave = o e-mail. Ela vem por último na fila
  (prioridade 4): se a pessoa abre o checkout, o fluxo do checkout manda nela, e os dias que passarem
  nesse meio ficam como pulados. Comprou, parou.
- **A trilha, na hora de cada e-mail** (`trilhaDaPessoa`, em `lib/crm/boas-vindas.ts`):
  - a escolha do "Barba ou cabelo?" vale mais;
  - depois, a página do cadastro (`pagina`, na newsletter), pelo `trilhaDaPagina`.
- **O conteúdo é o da página de cada produto** (`fb_pdp`, lido por `lerPdp` em
  `conteudosDasTrilhas`): a linha do tempo, o modo de uso com a dica, as dúvidas e a promessa, sem
  as estrelas da ênfase (`semMarcas`). O e-mail não inventa o que a página não diz, e a página sem
  a seção faz o dia virar pulado. Os produtos de cada trilha estão em `PRODUTOS_DAS_TRILHAS`; o
  nome curto com o artigo ("a pasta matte"), em `CURTOS`.
- **Os e-mails de cada trilha** (`emailDaTrilha`, `lib/emails/boas-vindas.ts`):
  - **crescimento:** 1 dia, quando o resultado aparece (a linha do tempo do Fator e até 2
    avaliações aprovadas); 5 dias, o modo de uso; 7 dias, as dúvidas; 10 dias, o tratamento de 90
    dias com 3 unidades;
  - **cuidado:** 1 dia, a rotina em 3 passos (o modo de uso do Kit Completo); 5 dias, óleo ou balm
    (a promessa de cada um, com a dica do kit); 7 dias, as dúvidas do que a pessoa viu; 10 dias,
    o Kit Completo;
  - **cabelo:** 1 dia, matte ou brilho (a promessa das duas pastas); 5 dias, como aplicar; 7 dias,
    as dúvidas. Não tem o de 10 dias;
  - **geral:** 1 dia, "Barba ou cabelo?", com os 3 botões de escolha; 5 dias, as dúvidas da loja
    (o prazo de postagem e o frete grátis das Configurações, o pagamento e a troca). Sem escolha,
    para aí;
  - **2 dias, em todas:** o cupom do pop-up vence amanhã. É oferta; os outros são lembrete.
- **O link de escolha** (`lib/crm/escolha.ts`): o e-mail e a trilha cifrados (AES-256-GCM, chave
  derivada do `JWT_SECRET`, como a do sair da lista). `GET /crm/escolha?t=…` anota
  (`crm.anotarEscolha`: o toque `boas-vindas-escolha` no registro, com a trilha no `como`, e a última
  vale) e manda pra loja, na página da escolha, com a campanha. A escolha não é e-mail: não conta
  no teto (`registrosDoMotor`, em `lib/crm/fluxos.ts`, deixa o `TOQUE_DA_ESCOLHA` de fora) nem na
  tela.
- **O modelo de e-mail** ganhou 3 blocos (`lib/emails/crm.ts`), na marca, no texto e no pessoal:
  - `lista`, o modo de uso na vertical;
  - `perguntas`, as dúvidas;
  - `escolhas`, os botões com endereço pronto.
- **O "Mandar pra mim"** dos dias novos manda a trilha do crescimento.
- **`dadosDaLoja` e `comQuemManda`** foram pra `lib/crm/envio.ts`: o motor e o cadastro do pop-up
  importavam um ao outro.

O `conferir-crm.mjs` faz as duas pessoas de ponta a ponta, com o tempo andando:
- quem se cadastrou no óleo recebe os 6 e-mails da trilha do cuidado;
- quem não viu produto recebe o "Barba ou cabelo?", clica em "Cuidar da barba" e passa a receber
  os do cuidado.

**O CRM, parte 11: a estreia da loja nova** (entrega 0181). A campanha pra base da Nuvemshop é um
fluxo do motor que começa DESLIGADO (`FLUXOS.estreia`, com `comecaDesligado`): quem liga é o dono,
no painel.

- **Quem entra** (`publicoDaEstreia`, em `lib/crm/estreia.ts`):
  - a base que aceita ofertas (`crm.pessoasDaEstreia`);
  - menos quem tem pedido pago na loja nova, de qualquer data;
  - o motor ainda tira a equipe, quem saiu da lista e o e-mail que voltou, e 5% vão pro controle.
  A chave de cada entrada é o e-mail.
- **O jeito do e-mail** (`segmentoDaEstreia`) sai das etiquetas do CRM com os Ajustes, a mesma
  conta da aba da base:
  - `repor`: o dia de comprar de novo cai em até 14 dias, ou já passou sem estar em risco;
  - `cliente`: está no meio do tratamento;
  - `sumido`: está em risco ou em sunset;
  - `lead`: nunca teve compra paga.
- **O cupom** sai no toque `estreia-agora`:
  - só pra `sumido` (`VOLTA-`) e `lead` (`BEMVINDO-`, com a regra de primeira compra);
  - com o % dos fluxos, valendo 3 dias, e com a regra dos 60 dias (`darCupom`).
  O `estreia-2d` lembra do cupom. Quem não tem cupom fica como pulado. O `cupomQueAindaVale`
  ganhou o fluxo, porque a chave da estreia é o e-mail, como a das boas-vindas.
- **Os lotes** (`filaDaEstreia`, `loteDaPosicao`, `comecoDoLote`):
  - a fila vai de repor pra cliente, sumido e lead, com o mais recente antes;
  - são 200, 400, 800 e o resto;
  - o começo de cada entrada é o do lote dela. O 1º lote sai quando o dono liga, e os outros às
    10h de Brasília dos dias seguintes. Ligado de madrugada, os dias contam a partir do dia em que
    o 1º lote sai;
  - depois de `fimDaEstreia` (o último lote mais 4 dias), o motor nem lê a base.
- **Os produtos do e-mail:**
  - quem já comprou vê os da última compra, pelo SKU (`produtosPorSku`: o código do Bling é o
    mesmo na Nuvemshop e no Medusa);
  - quem nunca comprou vê os mais pedidos;
  - o botão do de repor diz o que acaba primeiro ("Ver o óleo", com o nome curto de
    `CURTO_DO_COMPONENTE`) e leva pro produto AVULSO daquilo (`oQueAcaba`, com o `skuAvulso` de
    `lib/crm/etiquetas.ts`, entrega 0183). Se o item veio avulso, é ele mesmo, e a pasta brilho
    continua brilho. Se veio num kit ou em pacote, é o avulso do tipo; o kit segue na lista "O que
    você levou da última vez".
- **Os e-mails** (`emailDaEstreia`, em `lib/emails/estreia.ts`) são "oferta", menos o de
  `repor`. Esse é "lembrete" desde a entrega 0182, escolha do dono depois do teste em que os 4
  caíram em Promoções: assinado, sem o `List-Unsubscribe`, com o `PORQUE_DO_LEMBRETE_DA_ESTREIA`
  (sem a palavra "ofertas") e sem o frete grátis na lista. O teste de unidade recusa palavra de
  propaganda nele, como nos lembretes dos fluxos. A lista "O que tem na loja nova" junta o que as
  Configurações dizem (frete grátis, prazo) e o que a loja faz de verdade (a conta por código, o
  rastreio na conta).
- **No painel,** o bloco Estreia mostra o público (`publicoNaTela`: os 4 jeitos e os lotes). O
  "Mandar pra mim" do `estreia-agora` manda os 4 jeitos (`exemplosDoToque`): a rota de teste
  manda um e-mail por jeito e responde `quantos`.
- **O motor** agrupa os registros por e-mail (`registrosDe`), porque a estreia põe milhares de
  pessoas numa rodada. E o começo dos pedidos cai pra agora quando nenhum fluxo tem janela.
- **Os tipos dos toques:** `ehToqueDeCompra` olha o começo do toque (pix, checkout, carrinho); os
  outros são `ehToqueDasBoasVindas` e `ehToqueDaEstreia`.

O `conferir-crm.mjs`:
- importa uma base pequena: um de cada jeito, e mais quem não aceita ofertas;
- confere que a estreia começa desligada, com o público na tela;
- liga e roda o motor lote a lote, até o e-mail chegar. Cada pessoa recebe o seu jeito, e os dois
  cupons entram na sacola;
- confere que o "vence amanhã" só chega pra quem ganhou cupom;
- desliga no fim, porque o banco local é de todos os conferidores;
- na aba, confere os 5 fluxos e o "Mandar pra mim" com os 4 jeitos.

**As ofertas por e-mail ligadas por padrão** (entrega 0184). É o parecer do advogado do dono
(28/09): o "aceitar ofertas" vem ligado, e a pessoa desliga quando quiser.

- **Quem compra ou cria conta** ganha o sim, com a regra pura `ofertasPorPadrao` (em
  `lib/ofertas-por-padrao.ts`): `metadata.ofertas.email` recebe a data do cadastro, com
  `origem: "padrao"`. Quem faz é `subscribers/ofertas-por-padrao.ts`, em dois momentos:
  - `customer.created`, só pra cliente com conta (o primeiro código);
  - `order.placed`, pro cliente do pedido. Pode ser o convidado: o Medusa cria esse cliente dentro
    do carrinho sem emitir o `customer.created`, e é na compra que ele vira cliente de fato.
  - `cart.created` e `cart.updated` (entrega 0205), pro cliente do carrinho: é o convidado que
    nasce quando a pessoa digita o e-mail no checkout. Quem digitou e não comprou também ganha o
    sim (escolha do dono, 29/09). O carrinho avisa a cada mudança: quem já tem o sim para antes
    de ler a `crm_saiu`.
  - Quem já tem o sim fica com o dele. Quem saiu da lista (`crm_saiu`) não volta sozinho. O
    WhatsApp não muda.
- **Os clientes de antes** com conta ou pedido ganharam o mesmo pela migração
  `migration-scripts/ofertas-por-padrao.ts`, que roda uma vez no deploy.
  Os convidados de antes, que só deixaram o e-mail, ganharam pela
  `migration-scripts/ofertas-no-checkout.ts` (0205), que roda uma vez no deploy.
- **Desmarcar na conta é sair da lista.** Quando o e-mail passa de marcado a desmarcado, a ação de
  "Meus dados" (`lib/acoes/dados.ts`, na loja) chama `POST /store/crm/sair-das-ofertas`. A rota
  usa só o token de cliente e roda o `tirarDasOfertas`: tira da newsletter e da base da
  Nuvemshop e anota em `crm_saiu`, então os fluxos param. Marcar de novo é um sim novo, com a data
  de agora, e o `quemVoltouPraLista` do motor vê.
- **No painel,** o sim por padrão aparece como "por padrão, no cadastro" (`consentimentosDa`). O
  marketing passa a ver todo cliente que não saiu.
- **A política de privacidade** conta: quem compra, cria conta ou deixa o e-mail no checkout
  recebe as ofertas por e-mail, e desliga no "Sair da lista" ou na conta.
- **A base da Nuvemshop** não muda: o "Não aceita" de lá continua não.

Os conferidores:
- `conferir-conta.mjs` (loja): a caixa do e-mail vem marcada, com a origem padrão. Desmarcar tira o
  sim, e ele não volta sozinho.
- `conferir-clientes.mjs` (painel): a Ana ganha o sim quando compra, e a loja tira quando ela pede
  (ela é quem "não aceita" dali pra baixo).

**O CRM, parte 12: a reposição** (entrega 0185, a etapa 3 do plano, "o laço do LTV"). O produto
que a pessoa comprou está pra acabar. É um fluxo do motor que começa DESLIGADO
(`FLUXOS.reposicao`), com prioridade 4: depois dos de compra, antes das boas-vindas e da estreia.

- **Quando cada tipo acaba** (`reposicoesDaPessoa`, em `lib/crm/reposicao.ts`, pura):
  - pra cada tipo (`Componente`), vale a ÚLTIMA compra paga que o trouxe, na loja nova ou na
    Nuvemshop, juntas pelo e-mail;
  - acaba na entrega, ou na estimada (`ENTREGA_ESTIMADA_DIAS` depois de pago), mais as unidades ×
    os dias do tipo (os Ajustes). O kit dá um de cada tipo.
  - Comprou o mesmo tipo de novo, a compra nova vira a última, e a entrada (chave
    `<pedido>|<tipo>`) é outra: a conta recomeça.
- **Quem entra:** todo cliente, por escolha do dono (28/09), com o sair da lista. A janela é de 8
  dias antes a 11 depois do dia de acabar (`naJanelaDaReposicao`). O começo da entrada é o dia de
  acabar, que também é o `inicio`: ligar não dispara pro que acabou antes.
- **Os toques:** 7 e 2 dias antes, 3 e 10 dias depois (o `depois` é negativo antes do dia). Sem
  cupom e sem frete grátis. Quem não repôs fica pro resgate (a etapa 4).
- **Os e-mails** (`emailDaReposicao`, em `lib/emails/reposicao.ts`) são todos "lembrete", sem
  palavra de propaganda (o teste recusa). Todos mostram "O de sempre", os produtos da última
  compra pelo SKU, e o de 7 dias mostra também "Pra durar mais" (`SUBIR_PARA`: 3 Fatores, o Kit
  Completo), se a pessoa já não levou. Quando o de sempre é um kit, todos mostram também o
  produto sozinho, "Só o shampoo" (`SO_ELE`/`soEleDa`: o shampoo avulso e o duplo, o óleo, o
  balm — 0229): de quem voltou depois do Kit Completo, o shampoo sozinho saiu mais que o kit.
- **O "Refazer o pedido"** é o link de voltar com o tipo `repor` (`lib/crm/voltar.ts`):
  - `repor-order_…`: a compra da loja nova num carrinho novo, com os endereços e a conta.
    Clicar de novo devolve o mesmo carrinho (`fb_crm_reposto`, no pedido).
  - `repor-nso_…`: a compra da Nuvemshop, pelos SKUs (`crm.pedidoDaBasePorId`), com o e-mail e,
    desde a 0202, a entrega daquele pedido ("O CRM, parte 18"), na região BRL e no canal padrão.
  - Os dois passam por `voltarAoCheckout` (`lib/crm/voltar-ao-checkout.ts`): o `carrinhoNovo`
    e o `refazerPedido` são os do Pix vencido. O Pix continua só refazendo pedido cancelado.
  - A página `/voltar/<t>` da loja aceita os prefixos novos.
- **O nome** vem da conta (o `first_name`) ou da loja antiga (`crm.nomesDaBase`).
- **No painel:** o bloco Reposição, na aba Fluxos. O "Mandar pra mim" traz o Fator acabando e,
  desde a 0229, o shampoo de quem levou o Kit Completo (com o "Só o shampoo").

O `conferir-crm.mjs` faz duas pessoas de ponta a ponta:
- uma da loja antiga que NÃO aceitou ofertas lá: recebe os 4 e-mails, e o "Refazer o pedido"
  monta a sacola com o Fator, pelo SKU;
- uma da loja nova: o shampoo acaba, e a sacola vem com o endereço da última compra.
A data de pagamento da Nuvemshop vem sem hora, e vale o meio-dia de Brasília (`dataDeBrasilia`):
é daí que o conferidor conta o dia de acabar.

**O CRM, parte 13: a jornada do resultado** (entrega 0187, a etapa 3 do plano). São os e-mails de
depois que o pedido chega. É um fluxo do motor que começa DESLIGADO (`FLUXOS.jornada`), com
prioridade 5: depois da reposição, antes das boas-vindas.

- **Um pedido, uma jornada** (`lib/crm/jornada.ts`):
  - a chave é o pedido da loja nova, e os da Nuvemshop já chegaram há tempo;
  - o começo (e o `inicio`) é a chegada: o aviso de entrega da Frenet, ou `CHEGA_SEM_AVISO_DIAS`
    (10) depois de pago (`chegadaDo`). Ligar não dispara pro que chegou antes;
  - pedido novo começa outra jornada, e o motor fica com a mais nova (um fluxo por vez).
- **Os toques**, contados da chegada (`emailDaJornada`, em `lib/emails/jornada.ts`):
  - quando chega: o modo de uso da página do produto;
  - 3 dias: não pular dia, com a linha do tempo do Fator (só com ele);
  - 7 dias: o check-in, "Como tá indo?";
  - 21 dias: a rotina completa (`sugestoesDaRotina`, a matriz do plano, pelo que a pessoa tem em
    todas as compras, até dois produtos). Quem tem o shampoo, o óleo e o balm (o Kit Completo) e
    não tem o Fator ganha o Fator, e o e-mail vira o dele: "O próximo passo da sua barba", com a
    linha do tempo e duas avaliações de 4 e 5 estrelas (`fatorSugerido`, 0229). A mesma regra
    muda o "combina" do site e o de 24 horas da navegação de quem olhou o Kit Completo;
  - 60 dias: o dia 60 do Fator (só com ele).
  O texto é o da página de cada produto (`conteudosDasTrilhas`): sem a seção, o dia fica como
  pulado. Todos são "lembrete", sem palavra de propaganda (o teste recusa).
- **O check-in** tem só dois botões: "Tá indo bem" e "Tenho uma dúvida". Nada de "não gostei":
  foi escolha do dono.
  - O link é `lib/crm/checkin.ts`: o pedido e a resposta cifrados, como o da escolha.
  - `GET /crm/checkin` anota a resposta no registro dos fluxos (`crm.anotarCheckin`, o toque
    `jornada-checkin`, e a última vale) e redireciona:
    - "bem" vai pra página de avaliar o pedido (`linkDaAvaliacao`);
    - "duvida" vai pro WhatsApp da loja com a mensagem pronta (`whatsappDaDuvida`). Sem o número
      nas Configurações, vai pra `/contato`.
  - A resposta não é e-mail: o `registrosDoMotor` deixa o `TOQUE_DO_CHECKIN` de fora do teto,
    como a escolha.
- **O nome** das pessoas (a conta ou a loja antiga) é o `nomesDasPessoas` do motor, o mesmo da
  reposição.
- **No painel,** o bloco Jornada fica na aba Fluxos. O "Mandar pra mim" traz a jornada do Fator,
  com um pedido de mentira (o clique do check-in cai na home).

O `conferir-crm.mjs` liga a jornada antes de entregar um pedido do Fator e anda até os 60 dias:
- confere os 5 e-mails;
- clica nos dois botões do check-in: um vai pro avaliar, o outro pro WhatsApp ou pro contato;
- confere que a rotina completa traz o óleo;
- e, com um pedido do Kit Completo, que o de 21 dias é o do Fator (0229).

**O CRM, parte 14: o aviso da reposição no site** (entrega 0188, a etapa 3 do plano: "o site usando
a ficha"). Quem está com a conta aberta vê "Seu Fator de Crescimento acaba em 5 dias", com o
"Refazer o pedido", na visão geral da conta e na home. Não é e-mail: não depende do fluxo ligado
nem da lista.

- **A conta é a dos e-mails:** a ficha do site (parte 15) lê os pedidos de uma pessoa (os da loja
  nova pelo e-mail do pedido, `pedidosParaAsEtiquetas(container, { email })`, e os da base da
  Nuvemshop) e passa as reposições dela (`reposicoesDaPessoa`, com os dias dos Ajustes) pro aviso.
- **O aviso** é `avisoDaReposicao` (`lib/crm/reposicao.ts`), puro, com testes:
  - de vários tipos, o que acaba primeiro (o que já acabou vem antes), na janela dos e-mails
    (`naJanelaDaReposicao`);
  - só se a loja ainda vende algum produto da última compra desse tipo (a foto, e o que o
    "Refazer" monta);
  - os dias contam no calendário de Brasília (`diasAteAcabar`, `diasNoCalendario`): "acaba em 5
    dias", "amanhã", "hoje"; depois, "Acabou o óleo?" (`textoDoAviso`, sem palavra de propaganda);
  - o botão é o link de voltar dos e-mails (`repor-order_…` ou `repor-nso_…`);
  - a `chave` (o tipo e o dia de acabar) é o que o "fechar" da home guarda.
- **A rota** é `GET /store/crm/ficha` (era `/store/crm/reposicao` até a 0190), só com token de
  cliente (`authenticate` nos middlewares). O e-mail sai da conta do token (`contaDoToken`), 60 por
  hora por conta, e qualquer tropeço vira `{ ficha: null }`.
- **Na loja:**
  - `lib/ficha.ts` (sem diretiva; era `lib/reposicao.ts`) tem os tipos e o cookie `fb_conta`, e
    `lib/ficha-valida.ts`, o `avisoValido`;
  - `lib/ficha-da-conta.ts` pergunta ao Medusa com a sessão;
  - na conta, o bloco **Pra repor** (`PraRepor`, em `components/conta/pedidos.tsx`) vem antes
    do "Comprar de novo", que some quando é o mesmo pedido. Pra quem só comprou na loja antiga,
    ele vem antes do "Nenhum pedido ainda".
- **Na home** a página é a mesma pra todo mundo (vem do cache), e o cookie da sessão é só do
  servidor. Por isso existe o **`fb_conta`**: um cookie que o navegador lê, com um sorteio
  (`sorteioDaConta`) e nada de quem é.
  - Ele é gravado no código de entrar (`confirmarCodigo`) e apagado no `sair` e no `/conta/sair`.
  - O proxy (trabalho 6) grava um novo na primeira visita à conta de quem tem sessão e não tem
    o `fb_conta` (quem entrou antes da 0188).
  - Só com ele o navegador pergunta a ficha (`/api/ficha`, parte 15). O
    `components/reposicao/na-home.tsx` mostra o aviso 1,5 s depois de ela chegar, com a faixa de
    cookies respondida e a sacola fechada. O cartão (`./aviso.tsx` + `estilos/reposicao.css`) só
    baixa quando há aviso: é fixo num canto e não empurra a página.
  - O X guarda a `chave` no `localStorage`, e o aviso só volta na próxima reposição.
  - `/api/ficha` sem sessão apaga o `fb_conta`.
- **A política de privacidade** conta o aviso e o cookie novo.

**O CRM, parte 15: o site usando a ficha — o tratamento, as compras e o que combina** (entrega
0190, fecha a etapa 3 do plano). As avaliações com foto saíram do plano: o dono quer só texto
(28/09), e as de hoje já são só texto.

- **A ficha do site** é `lib/crm/ficha-do-site.ts`: `lerFichaDoSite` junta os pedidos da pessoa,
  os Ajustes, os produtos pelo SKU e a linha do tempo da página do Fator (`lerPdp`, sem as
  marcas). O `fichaDoSite`, puro e com testes, devolve:
  - `reposicao`: o aviso da parte 14;
  - `tratamento`: o dia do tratamento com o Fator. Conta da chegada do primeiro Fator da
    sequência (a entrega, ou pago + 7). Cada compra que chega antes de o anterior acabar, mais a
    `toleranciaDaReposicao` dos Ajustes, continua a sequência. Some quando o último acaba: aí
    quem fala é a reposição. É diferente da etiqueta "dia do tratamento" do painel, que conta do
    primeiro Fator de todos;
  - o próximo marco do tratamento é o primeiro da linha do tempo depois de hoje. `diaDoPasso` lê
    o "quando" do dono: "Dia 30"; "Semanas 1 e 2" = 14; "3 a 6 meses" = 180, o fim da faixa. O
    alvo da barra é o marco com `alvo` (sem ele, `ALVO_PADRAO`, 90). `linhaDoTempo` diz se a
    seção está ligada na página (o link desce até `#tempo-titulo`);
  - `compras`: a última compra paga de cada produto (o da loja nova pelo endereço, o da
    Nuvemshop pelo SKU), em dias de Brasília;
  - `combina`: `sugestoesDaRotina` (a matriz do e-mail de 21 dias), pelo que a pessoa tem em
    todas as compras, com o porquê (`PORQUE_DA_ROTINA`). Nunca o que ela já comprou.
- **Na loja:**
  - `lib/ficha-valida.ts` tem o `fichaValida` (cada parte conferida), longe do `lib/ficha.ts`
    (o `quandoComprou`, o cookie) de propósito: o Turbopack não tira de um módulo o que a página
    não chama, e com os dois juntos a validação ia pra home e pra página do produto de todo
    mundo;
  - `components/ficha/usar-ficha.ts` (`useFicha`) é o gancho da home e da página do produto. Sem
    o `fb_conta`, não faz nada nem baixa nada. Com ele, baixa `./ler-ficha.ts`, que pergunta
    `/api/ficha` uma vez por aba (memória da página + `sessionStorage`, meia hora, preso ao
    sorteio). Quem chama junto (dois componentes, ou o StrictMode do `next dev`, que monta tudo
    duas vezes) espera a mesma pergunta. O "Refazer o pedido" da home chama `esquecerFicha`;
  - na conta, o bloco **Seu tratamento** (`SeuTratamento`, em `components/conta/pedidos.tsx`)
    vem depois do "Pra repor": o dia, a barra até o alvo, o próximo marco e o link da página do
    Fator;
  - na página do produto, `components/ficha/na-foto.tsx` põe um selo no pé da foto. É o espaço
    `noPe` da `Galeria`, que a `Dobra` passa. No que a pessoa comprou: "Você comprou há 25
    dias". No que combina: o porquê. Fica por cima da foto (`.galeria__ficha`, em
    `pdp-galeria.css`) e não empurra nada.
- **A política de privacidade** conta o que o site mostra das compras.

O `conferir-crm.mjs` ("A ficha no site", logo depois da reposição por e-mail, com o fluxo
desligado) sobe o Fator da loja antiga pago há 32 dias (acaba em 5; é o dia 26 do tratamento) e
entra na loja com esse e-mail:
- confere o 401 sem token, e o `fb_conta` inventado apagado;
- sem conta, a home e a página do produto não perguntam nada;
- na conta: o "Pra repor" (e o "Refazer" até o checkout) e o "Seu tratamento" (dia 26 de 90);
- na home: o aviso fixo, a resposta guardada na aba, e o X que não volta;
- na página do Fator, "Você comprou há 32 dias" por cima da foto; na do óleo, "Combina com o
  Fator que você já tem", sem perguntar de novo;
- confere o `fb_conta` que o proxy grava e o sair que leva ele.
A página da conta ainda chegando tem o bloco duas vezes (a parte escondida do streaming): o
conferidor lê o visível (`filter({ visible: true })`).

**O CRM, parte 16: o resgate e o sunset** (entrega 0192, a etapa 4 do plano). É um fluxo do motor
que começa DESLIGADO (`FLUXOS.resgate`), com prioridade 8: o último da fila.

- **Quem entra** (`lib/crm/resgate.ts`, `publicoDoResgate`): a etapa "em risco" das etiquetas. As
  etiquetas agora dizem desde quando (`etapa.desde`): o dia de acabar mais a
  `toleranciaDaReposicao` dos Ajustes, ou 60 dias sem pedido. É oferta, então só entra quem comprou
  na loja nova (o sim por padrão) ou aceitou ofertas na antiga. A chave é o e-mail e o dia em que
  a pessoa ficou em risco (`chaveDoResgate`): outra queda, outro resgate.
- **Os toques**, contados desse dia (`emailDoResgate`, em `lib/emails/resgate.ts`):
  - no dia: "Tá tudo bem com a barba?", lembrete, com os 4 botões do plano (escolha do dono), sem
    emoji;
  - 7 dias: 15% (`DESCONTO_DO_RESGATE`, um cupom que vale 3 dias), só pra quem não respondeu,
    com o "Refazer o pedido" já com o desconto (`/voltar/<t>?cupom=`);
  - 9 dias: o cupom vence amanhã;
  - 45 dias: "Posso continuar te escrevendo?" (o toque "Quer continuar recebendo?"), lembrete, só
    pra quem não deu sinal nenhum: nem resposta a este resgate, nem clique, abertura ou visita
    depois do começo dele.
  - OS DOIS SEM CUPOM FICAM NA CARA DA LOJA (entrega 0197). No teste do dono, os quatro caíram em
    Promoções. A 0195 passou os dois pra texto simples, e ele não quis: todo e-mail no padrão da
    loja. Saiu o que tinha cara de campanha: os emojis dos 4 botões (e dos 2 do check-in da
    jornada) e, no de 45 dias, o "continuar recebendo nossos e-mails". Os dois do cupom continuam
    oferta (Promoções é o lugar do desconto).
- **Os botões** passam pelo Medusa (`GET /crm/resgate?t=…`). O `t` é a resposta, o pedido, o que
  acabou e a chave, cifrados como o check-in. A resposta mora no registro (o toque
  `resgate-resposta`, a última vale, `crm.anotarRespostaDoResgate`). Ela não conta no teto, mas o
  cupom dela conta nos 60 dias (o `registrosDoMotor` devolve ela como "pulado").
  - "Tá caro": o cupom de 15% na hora, pro `/discount/<código>` da loja. O clique repetido leva o
    mesmo, e quem já tem cupom do CRM valendo leva esse;
  - "Esqueci de repor": o link de voltar (repor);
  - "Não vi resultado": o WhatsApp com a mensagem pronta (sem o número, `/contato`);
  - "Comprei em outro lugar" e o "Sim": a loja.
- **O sunset:** quem recebeu o "Quer continuar recebendo?" e, em 7 dias (`PRAZO_DO_SIM`), não
  teve nem o "Sim" nem clique, visita ou compra depois dele, fica ADORMECIDO (`adormecido`,
  `quemAdormeceu` no motor). Abrir não conta: abrir e não clicar no "Sim" é a resposta.
  - Adormecido só recebe os fluxos que ele mesmo começa (`FLUXOS_DE_QUEM_AGE`: Pix, checkout,
    carrinho, boas-vindas). O relatório da rodada conta `adormecidos`.
  - Os sinais vêm sem limite de data (`crm.sunsetDosEmails`, e as compras da loja nova), então o
    sunset vale até a pessoa voltar.
- **No painel**, o resgate aparece na aba Fluxos. O "Mandar pra mim" manda os botões e o cupom de
  mentira: os botões vão pra loja, porque um "Tá caro" de mentira criaria um cupom de verdade.
- **A política de privacidade** conta.

O `conferir-crm.mjs` ("O resgate e o sunset") sobe duas pessoas da loja antiga. Cada uma tem o Fator
e 3 balms, pagos há 56 dias: o Fator acabou e a pessoa fica em risco amanhã. O conferidor liga o
resgate e a reposição e anda no tempo:
- uma responde: confere cada botão (o cupom na hora e o mesmo no 2º clique, o refazer, o WhatsApp
  ou o contato, a loja), e ela não recebe o cupom de 7 dias nem o sunset;
- a outra some: recebe os 15% em 7 dias, o "vence amanhã" em 9 e o sunset em 45;
- lá na frente, os 3 balms acabando: a reposição sai pra quem respondeu e não sai pra quem
  adormeceu (o `adormecidos` da rodada).
No arquivo da Nuvemshop, a linha com a data é o pedido, e a sem data é mais um item dele: o
conferidor escreve assim o pedido de dois produtos.

**O CRM, parte 17: a navegação abandonada** (entrega 0198, a etapa 4 do plano). O último dos 4 de
abandono do plano: quem a loja conhece (aceitou os cookies e já disse quem é) e mostrou interesse
num produto, sem pôr nada na sacola. É um fluxo do motor que começa DESLIGADO
(`FLUXOS.navegacao`), com prioridade 4, logo depois do carrinho: a reposição, a jornada, as
boas-vindas, a estreia e o resgate desceram uma casa.

- **O interesse** (`interessesDaPessoa`, em `lib/crm/navegacao.ts`, puro): a 2ª visita à página
  do produto (com pelo menos 1 minuto e até 7 dias entre as duas: recarregar não conta), 1 minuto
  na página (`produto_lido`) ou o vídeo do "Vê na prática" (`video_assistido`). O começo é a hora
  dele; a chave é o e-mail, o produto e o dia em Brasília (`chaveDaNavegacao`).
- **Os dois tipos novos da loja** são só do CRM, com o mesmo "Entendi" (`SoDaLoja`, em
  `lib/rastrear.ts`):
  - o `produto_lido` sai de `depoisDeUmMinutoNaFrente` (`apps/loja/src/lib/um-minuto.ts`, só na
    página do produto): é a soma do tempo com a aba na frente, e trocar de aba pausa;
  - o `video_assistido` sai do `abrir` do `VeNaPratica` (o `item` vem da `dobra.tsx`);
  - os dois levam o item no formato do Google, uma vez por sessão (`umaVez`). No backend, entram
    em `TIPOS` e `DO_NAVEGADOR` (`lib/crm/eventos.ts`) com o item do `produto_visto`; no painel,
    na etapa "Olhou" ("ficou 1 minuto vendo …", "viu o vídeo de …").
- **Quem lê:** `crm.navegacoesDesde` (as anotações de quem tem e-mail: as visitas, o minuto, o
  vídeo, a sacola e o checkout) e `publicoDaNavegacao` (o produto pela variante, só os
  publicados). As visitas contam desde 7 dias antes da janela; o interesse é que precisa ser dela.
- **Sai** quem, depois do interesse, pôs qualquer coisa na sacola, começou o checkout (pelas
  anotações ou pelo carrinho com e-mail) ou comprou.
- **Uma a cada 7 dias por pessoa** (`navegacaoDaVez`, aplicada antes do `decidir` por
  `comANavegacaoDaVez`): a que já tem toque no registro vai até o fim; outra, só 7 dias depois da
  última; entre as novas, a mais nova.
- **Os toques** (`emailDaNavegacao`, em `lib/emails/navegacao.ts`), sem cupom e como lembrete, na
  cara da loja e sem emoji:
  - 3 horas: "Ficou de olho no …?" — o produto, até 3 avaliações aprovadas (4 e 5 estrelas) e até
    3 dúvidas da página. Sem avaliação nem dúvida, pulado;
  - 24 horas: "Quem levou o … também levou…" — o produto e a rotina completa
    (`sugestoesDaNavegacao`: a matriz da jornada, com o produto olhado como se fosse da pessoa, e
    o que ela já tem nas compras das duas lojas, `oQueAPessoaTem`). Sem o que sugerir (a pasta, o
    spray), pulado.
- **O adormecido do sunset** recebe (é um fluxo de quem age), e a visita já o acorda.
- **No painel**, a aba Fluxos ganha o card; o "Mandar pra mim" usa o Fator (`exemplosDaNavegacao`).
- **A política de privacidade** conta os dois e-mails e o que a loja anota.

O `conferir-crm.mjs` confere a navegação assim:
- no navegador, 1 minuto na página do óleo, com o relógio de mentira do Playwright (`clock.install`
  e `fastForward`, numa aba à parte);
- no motor, com o tempo andando: duas visitas ao Fator (os e-mails de 3 horas e de 1 dia), 1
  minuto na página, quem pôs na sacola depois (nada) e a regra dos 7 dias (o óleo, olhado logo
  depois, fica sem e-mail);
- a tela com os nove fluxos e o "Mandar pra mim".
O banco de teste não tem vídeo no "Vê na prática": o vídeo fica com o teste do backend.

**O CRM, parte 18: a entrega dos pedidos da Nuvemshop** (entrega 0202, escolha do dono). O
"Refazer o pedido" da reposição abria o checkout de quem veio da loja antiga só com o e-mail: a
pessoa digitava nome, celular, CPF e endereço de novo. Agora a base guarda a entrega de cada
pedido do arquivo de vendas, e o carrinho novo já vem com ela: a pessoa cai na escolha do frete.

- **O que se lê** (`entregaDoPedido`, em `lib/crm/nuvemshop.ts`, puro): o nome e o celular de quem
  recebe ("Nome para a entrega", "Telefone para a entrega"; sem eles, os do comprador), o CPF ou
  CNPJ ("CPF / CNPJ", só com os dígitos verificadores certos, `documentoDaNuvemshop`), e o
  endereço: rua, número, complemento, bairro, cidade, CEP e o estado por extenso, que vira a sigla
  (`ufDoEstado`; a Nuvemshop escreve até "Rorâima"). O celular fica como a loja grava:
  "+55" + DDD + número (`telefoneDaLoja`). Sem o endereço inteiro, ou fora do Brasil, a entrega é
  nula e o checkout pergunta, como antes.
- **O resto continua de fora:** o CPF, o telefone e o endereço dos arquivos de clientes e de
  carrinhos, o rastreio e o cartão.
- **No banco, cifrada** (`crm_base_pedido.entrega`, `lib/crm/entrega-da-base.ts`): AES-256-GCM, com
  a chave que sai do `JWT_SECRET` com o rótulo `fb-crm-base-entrega`, como as dos links do CRM.
  Trocou o segredo: `abrirEntrega` devolve nulo, e o "Refazer o pedido" volta a abrir só com o
  e-mail até o arquivo de vendas ir de novo. Mandar o arquivo de novo sem as colunas da entrega
  não apaga a que já estava (`coalesce`).
- **O carrinho** (`enderecosDaEntrega`): o mesmo formato do `montarEndereco` da loja
  (`apps/loja/src/lib/endereco.ts`) — rua e número em `address_1`, complemento e bairro em
  `address_2`, os quatro também no `metadata`, e o documento só no endereço de cobrança. Mudou lá,
  muda aqui.
- **No painel**, a entrega nunca volta: depois de mandar as vendas, o aviso diz só quantos pedidos
  vieram com o endereço ("N com o endereço de entrega", o `comEntrega` da rota).
  O texto embaixo do botão da tela (`components/base-da-nuvemshop.tsx`) diz o que fica e o que é
  jogado fora — mudou o que fica, muda ali também (a 0202 esqueceu, e a 0204 consertou).
- **A política de privacidade** conta que a entrega veio, cifrada, e pra quê.

O `conferir-crm.mjs` manda o pedido da loja antiga da reposição com as colunas da entrega, como a
Nuvemshop exporta, e confere que o "Refazer o pedido" monta a sacola com o nome, o celular, o
endereço e o CPF daquele pedido.

**O CRM, parte 19: as campanhas** (entrega 0206, a etapa 4 do plano: o calendário de campanhas).
Os e-mails de data — a Black Friday, o Natal, um lançamento: quem cuida do CRM escreve, escolhe o
público e a hora, e a rotina `campanhas-do-crm` manda aos poucos. CRM → Campanhas
(`/crm/campanhas`, a aba entre Fluxos e Ajustes). As escolhas do dono (29/09): o teste do assunto,
sem cupom, e o que vendeu mais em 7 dias só apontado na tela.

- **As regras** (`lib/crm/campanhas.ts`, puro, com testes):
  - `lerCampanha` confere o formulário campo a campo: o nome, o assunto, o assunto B (opcional,
    diferente do A), a prévia, o título, o texto em parágrafos, o botão (a página inicial, a lista
    ou um produto publicado, `caminhoQueVale`), até 3 produtos publicados e o público. Pra agendar,
    a hora entre 5 minutos e 120 dias daqui. O 422 volta com o erro de cada campo;
  - os públicos (`PUBLICOS`): todos que aceitam ofertas, quem já comprou, quem nunca comprou e quem
    está em risco (o sunset conta como em risco), pela etapa das etiquetas (`cabeNoPublico`);
  - o sorteio é o sha256 do e-mail com a campanha: o assunto, metade de cada (`varianteDa`); o
    controle, 5%, outro a cada campanha (`noControleDaCampanha`);
  - o e-mail (`emailDaCampanha`) é oferta — a cara da loja, o cancelar inscrição no cabeçalho —,
    sem cupom, com a marca `crm-campanha-<nome>` no link (`marcaDaCampanha`);
  - o resultado (`resultadoDaCampanha`): por assunto, quem recebeu, quem comprou em até 7 dias e o
    1º pedido de cada um (`primeiraVez` e `compras`, as contas da aba Fluxos), e o controle contado
    igual. O `vendeuMais` só aponta: abertura e clique estão desligados no Resend. Ele fecha 7 dias
    depois do fim do envio (`resultadoFechou`) e fica guardado na campanha (`resultadoGuardado`):
    a tela não relê o registro das antigas.
- **O banco:** `crm_campanha` (o modelo `Campanha` do módulo crm; a migration
  `Migration20260929160000`, escrita à mão). A situação: rascunho → agendada → enviando
  (`comecou_em`) → enviada (`acabou_em`), ou parada. Só o rascunho e a agendada se mudam, só a que
  está saindo para, só o rascunho se apaga (`lib/crm/mudar-campanha.ts`, fora da rota pelo lint do
  Medusa). Quem recebeu mora no `crm_envio`: o fluxo `campanha`, a chave `<campanha>|<e-mail>` e o
  toque `a`, `b` ou `controle`. O `crm.registrosDaCampanha` lê pelo `split_part`: o `_` do LIKE
  casaria qualquer letra.
- **O envio** (`rodarAsCampanhas`, em `lib/crm/enviar-campanhas.ts`; a rotina, a cada 5 minutos,
  na trava do mesmo nome):
  - antes de tudo, guarda o resultado de uma que fechou (`fecharUmResultado`);
  - a agendada que chegou na hora vira "enviando";
  - uma por vez, a que começou antes. 24 horas depois do começo, ela acaba;
  - de madrugada (22h às 8h), espera;
  - o público de agora (`publicoDaCampanha`): a newsletter e o sim da conta (`newsletterDa`; quem
    compra, cria conta ou deixa o e-mail no checkout ganha o sim por padrão, 0184 e 0205), e quem
    aceitou na Nuvemshop; menos a equipe, quem saiu sem voltar, o e-mail que voltou ou reclamou e
    quem adormeceu no sunset. Tira quem já está no registro;
  - o controle só é anotado. Quem passou do teto (`passouDoTeto`: 3 no dia e 6 na semana, contando
    os e-mails dos fluxos) fica pra depois. O resto é reservado, sai e é confirmado, como os toques
    (idempotência `crm-campanha/<id>/<e-mail>`, etiqueta `crm-campanha`). Até 100 por rodada, um por
    segundo, em lotes de 200: muita gente no teto no começo da lista não trava a campanha. 5 falhas
    numa rodada (o Resend fora do ar) param a rodada, e a próxima tenta de novo;
  - uma rodada com o relógio antes do começo não manda: só o conferidor anda no tempo, e a rotina de
    verdade mandaria a campanha dele pra todo mundo.
- **As rotas** (`/dashboard/crm/campanhas`, quem abre o CRM):
  - GET, a tela (`montarTelaDasCampanhas`, em `lib/painel/campanhas.ts`): a ordem (a que está
    saindo, as agendadas pela hora, os rascunhos e as que saíram), os públicos com quantas pessoas
    cada um tem agora, os produtos publicados e o resultado;
  - POST `{ acao, id?, campanha?, agenda? }`, no registro da equipe (salvou, agendou, desmarcou,
    parou ou apagou a campanha);
  - `/previa` (o "Ver como fica", os dois assuntos) e `/teste` (o "Mandar pra mim": "[Teste] " no
    assunto, a etiqueta `crm-teste`, 10 por hora);
  - `/rodar`: a rotina agora; `{ agora, email }` só fora de produção.
- **No painel:**
  - a lista (`components/campanhas-do-crm.tsx`), a nova (`/crm/campanhas/nova`) e a de cada uma
    (`/crm/campanhas/[id]`), todas da mesma leitura;
  - o rascunho e a agendada abrem no formulário (`components/formulario-da-campanha.tsx`): a hora de
    Brasília no campo (sai como `${v}:00-03:00`), quanto tempo o envio leva pro público escolhido,
    a prévia num quadro sem script (o `sandbox` do modelo dos e-mails), "Mandar pra mim", Salvar,
    Agendar, Desmarcar e Apagar (com o segundo clique). O teste ligado com o assunto B vazio é
    barrado na tela: o Medusa leria "sem teste", calado;
  - a que saiu mostra o resultado e o "Ver como chegou"; a que está saindo, o "Parar o envio" (com o
    segundo clique). Com menos de 400 pessoas no teste, a tela avisa que a diferença pode ser sorte.
- **A observabilidade** ganha a 14ª rotina (`ROTINAS`): a `conferir-observabilidade` conta 14.

O `conferir-crm.mjs` confere as campanhas assim:
- a operação sem acesso (403), e o formulário conferido pela API e pela tela;
- pela tela: escrever com o assunto B, "Ver como fica", "Mandar pra mim" (os dois assuntos), salvar
  e agendar (a hora de Brasília na lista);
- o envio, com o tempo andando: antes da hora, nada; A recebe o assunto A e B o B (as pessoas saem
  do mesmo sorteio do Medusa); C, no controle, não recebe; ninguém recebe duas vezes; de madrugada,
  espera; 24 horas depois, acaba;
- a tela com os números de cada assunto e do controle; 7 dias depois do fim, o resultado guardado
  (o mesmo);
- parar pela tela (e a parada não se muda mais), desmarcar e apagar; o celular.
No fim, nenhuma campanha fica agendada nem saindo: a rotina de verdade mandaria pra todo mundo.

**O CRM, parte 20: o recado do Matheus nas campanhas** (entrega 0210, pedido do dono: a campanha
de teste caiu em Promoções). Cada campanha escolhe como chega (`jeito`, `JEITOS` em
`lib/crm/campanhas.ts`):

- **Oferta** (o padrão, e o de antes): o estilo oferta, com o remetente da loja e o "cancelar
  inscrição" do Gmail no cabeçalho. Promoções é o lugar dela.
- **Recado** (`emailDaCampanha` com o estilo lembrete): a mesma cara da loja, assinado "Matheus, da
  FuckingBarba", sem o cabeçalho, com o sair da lista no pé. Tenta o Principal, mas quem decide é
  o Gmail. Nenhum campo escrito leva emoji: o `lerCampanha` recusa com `temEmoji`, e o erro fica no
  campo. O risco, dito na tela: sem o botão de cancelar do Gmail, quem não quer mais pode marcar
  spam. É pra campanha sem preço.
- **O banco:** `crm_campanha.jeito` (texto, padrão "oferta"; a migration `Migration20260929190000`,
  à mão). A linha sem ele é oferta (`textoDoBanco`).
- **No painel:** o "Como chega" no formulário (dois cartões, `JEITOS` em
  `components/formulario-da-campanha.tsx`); o jeito na lista (só o recado aparece) e no alto da
  campanha (`nomeDoJeito`); a 9ª regra.

O `conferir-crm.mjs` confere:
- o emoji recusado no recado, e o jeito que não existe;
- pela tela, o recado escolhido e o "Mandar pra mim" assinado pelo Matheus, sem o cabeçalho e com o
  sair da lista no pé;
- o envio do recado, com o tempo andando, e a lista dizendo que é recado.

**O CRM, parte 21: o indique um brother** (entrega 0215, a etapa 4 do plano; escolhas do dono,
29/09). Cada cliente ganha um link: quem faz a 1ª compra com ele ganha 15%, e quem indicou ganha
um cupom de 15% quando o brother paga.

- **O link** (`lib/crm/indicacao.ts`) é um cupom do Medusa, `BROTHER-7KQ2MX` (`cupomDoAmigo`):
  - 15% na loja toda, só na 1ª compra (a regra dos cupons do painel e do pop-up: nenhum pedido na
    loja nova com o e-mail), uma vez por pessoa, sem data e sem limite de usos;
  - mora na tabela `crm_indicador` (e-mail e código únicos; a migration `Migration20260929210000`,
    à mão) e nasce uma vez por e-mail (`garantirIndicador`, na trava `indicador:<e-mail>`): no
    primeiro convite, ou no "Pegar meu link" da conta;
  - o link é o `/discount/<código>` da loja (guarda o cupom e põe na sacola), e o "Mandar no
    WhatsApp" é o `wa.me/?text=` com a mensagem pronta (`mensagemDoWhatsApp`).
- **O convite vai NA JORNADA DO RESULTADO**: dois toques novos em `FLUXOS.jornada` —
  `jornada-indique` em 10 dias e `jornada-indique-30d` em 40. Um fluxo à parte ficaria atrás da
  jornada (um fluxo por vez) e perderia a hora. O motor decide:
  - o convite só pra quem está gostando: o "Tá indo bem" do check-in deste pedido, 4 ou 5 estrelas
    nele (a avaliação nova ou aprovada; `notas`, em `lerDadosDaJornada`), ou a 2ª compra
    (`recorrente`, em `jornadasDaPessoa`: outro pedido pago antes, numa das duas lojas). E um a
    cada 2 meses: o que o motor lê do registro. Sem isso, o dia é pulado;
  - o lembrete, só se o convite desta jornada saiu e nenhum brother comprou desde então;
  - os dois são oferta (`lib/emails/indicacao.ts`, a etiqueta `crm-indicacao`): o código, o
    WhatsApp, o "Ver na minha conta" e o link por extenso. Com a jornada desligada, nada sai;
  - o assunto do convite é pela LINHA DO PEDIDO (entrega 0217, pedido do dono): a `trilha` da
    jornada (a do pop-up, `trilhaDosComponentes`: o Fator manda, depois a barba, depois o cabelo).
    O Fator, "Conhece alguém com a barba falhada?"; a barba, "…que precisa cuidar da barba?"; o
    cabelo, "…que precisa dar um jeito no cabelo?"; o geral, o de antes. A frase diz o produto da
    mesma linha (`produtoDaLinha`, no motor: num pedido do óleo com a pasta, o óleo). O "Mandar
    pra mim" manda os três jeitos.
- **O prêmio** (`lib/crm/premio-da-indicacao.ts`; o subscriber `premio-da-indicacao.ts`, no
  `payment.captured`): o pedido com um código de brother foi PAGO (o Pix pago, o cartão aprovado):
  - quem indicou ganha um cupom de 15%, só dele, que vale 60 dias (`VALEU-7KQ2MX`,
    `criarCupomDoFluxo`), até 10 por ano (`PREMIOS_POR_ANO`);
  - o brother que é a própria pessoa não conta. A equipe e quem passou dos 10 ficam no registro
    como pulados;
  - o prêmio é reservado no `crm_envio` (o fluxo `indicacao`, a chave `premio|<pedido>`, o toque
    `indicacao-premio`): o aviso do pagamento repetido não dá dois;
  - o e-mail sai na hora, sem controle e sem a madrugada (é o prêmio combinado), menos pra quem
    saiu da lista e pro e-mail que voltou: o cupom vale do mesmo jeito. O brother nunca aparece;
  - o prêmio conta no teto e na regra de um cupom a cada 60 dias, como os outros.
- **Minha conta** (`GET` e `POST /store/crm/indicacao`, só com token de cliente, 60 por hora;
  `indicacaoDaConta`): o link com o "Copiar", o "Mandar no WhatsApp", quantos brothers compraram e
  os cupons ganhos. Sem link, o "Pegar meu link" cria na hora. Na loja: `lib/indicacao.ts` (os
  tipos e a conferência), `lib/indicacao-da-conta.ts`, `lib/acoes/indicacao.ts` e
  `components/conta/indique.tsx`, no bloco `[data-bloco-indique]` da visão geral.
- **Os cupons do indique são do CRM** (`ehCupomDoCrm` conta `BROTHER-` e `VALEU-`): ficam fora da
  lista de Cupons do painel.
- **No painel**, a aba Fluxos mostra os dois toques novos na jornada (com o "Mandar pra mim" do
  link de mentira, `BROTHER-EXEMPLO`) e o bloco "Indique um brother" (`IndiqueNosFluxos`): quem
  tem o link, os brothers que pagaram nos 30 dias, o que compraram e os cupons de quem indicou
  (`indicacao`, em `montarTelaDosFluxos`).
- **A política de privacidade** conta o que a loja anota (a compra veio do link), e que o aviso não
  diz quem comprou.
- **O limite conhecido:** a "primeira compra" olha só a loja nova, como no pop-up. Quem comprou só
  na Nuvemshop também ganha os 15% do link.

O `conferir-crm.mjs` confere, na jornada do Fator:
- o convite em 10 dias pra quem respondeu "Tá indo bem" (oferta, o código e o WhatsApp);
- o brother que paga o Pix com o código: o cupom `VALEU-` de quem indicou, sem o e-mail do brother,
  e um só;
- Minha conta: o mesmo link, "1 brother comprou" e o cupom; e o brother pegando o link dele;
- em 40 dias, o lembrete pulado (o brother já comprou);
- a aba Fluxos com os números do indique.

**O CRM, parte 22: a previsão por cliente** (entrega 0220, a etapa 5 do plano, "a máquina" — a
escolha do dono: a previsão primeiro; a melhor hora e o A/B automático depois). Pra cada pessoa
que comprou, nas duas lojas (`lib/crm/previsao.ts`, puro):

- **A próxima compra:** com 3 compras ou mais, pelo RITMO dela (a mediana dos intervalos; compras a
  menos de 7 dias uma da outra contam como uma, `datasDasCompras`). Com menos, a da etiqueta: o
  dia em que o produto da última compra acaba (os dias dos Ajustes). A etiqueta não muda: a
  reposição e o resgate continuam pelo produto.
- **A chance de sair:** baixa antes do dia de comprar; média até a tolerância dos Ajustes (20 dias)
  depois dele; alta depois disso. O engajamento "quente" (visitou ou clicou há pouco) desce um
  nível; o sunset é sempre alta. Sem saber o dia, pelos dias sem comprar: a regra "sem previsão"
  dos Ajustes (60) e o dobro.
- **O LTV:** o que já gastou, e o previsto nos próximos 12 meses — o ticket médio por compra vezes
  as compras que cabem no ano (pelo ritmo, pelo tempo do produto ou, sem nenhum, uma a cada 4
  meses), vezes a chance de continuar (`CONTINUA`: 0,9 / 0,6 / 0,25).
- Tudo com o porquê em frase: é conta, não modelo. Com pouco histórico na loja nova, melhora com o
  tempo.
- **Na ficha do cliente** (`previsaoNaFicha`, `PrevisaoNaFicha` em `components/crm.tsx`): os três,
  embaixo das etiquetas; o `fichaDoCrmDoCliente` calcula com os pedidos das duas lojas.
- **A aba CRM → Previsão** (`/crm/previsao`; `GET /dashboard/crm/previsao`, quem abre o CRM):
  - `previsoesDeTodos` (`lib/crm/previsoes.ts`) lê o mesmo que a rodada dos fluxos (os pedidos das
    duas lojas, os sinais, os Ajustes), o total de cada pedido da loja nova e os clientes, sem a
    equipe;
  - `montarTelaDaPrevisao` (`lib/painel/previsao.ts`, puro) monta os números — quem compra em 7 e
    em 30 dias (com o ticket somado), a chance de sair, o que os de chance alta já gastaram, o LTV
    médio e o previsto — e as duas listas (a semana pelo ticket, os de chance alta pelo que já
    gastaram, 20 cada), com o e-mail mascarado e o link da ficha de quem tem cadastro na loja nova;
  - `?email=` busca uma pessoa, e aí o e-mail volta inteiro (foi quem busca que digitou).

O `conferir-crm.mjs` confere:
- a operação sem acesso;
- o velho da base (12 Fatores, um a cada 45 dias): ritmo 45, a próxima compra e o LTV, pela API e
  pela busca na tela;
- o e-mail só mascarado nas listas;
- a previsão na ficha do cliente do Fator, e a aba no celular.

O `conferir-clientes.mjs` (0224) confere a previsão na ficha com pedidos de verdade: o LTV "já
gastou" da Ana e do Bruno é o cobrado, o Caio (só o Pix esperando) vem sem previsão, e na tela os
três valores são os da API.

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

**O Financeiro — o DRE da loja** (entrega 0225; o desenho aprovado pelo dono:
<https://claude.ai/artifact/5SL83dZ9v74zEUxbBrqi5z>). Análise → Financeiro, a área `financeiro` do
`ACESSO_PADRAO` (só o dono no padrão; no papel criado, fechada). Três abas: DRE, Despesas e Custos
e imposto. Escolhas do dono (30/09): Simples Nacional; o custo de cada produto digitado no painel;
o DRE desde o começo do vendas.csv, somando a Nuvemshop — e começa em FEVEREIRO (`COMECO_DO_DRE`:
janeiro teria dois dias de venda contra um mês de despesas).

- **A conta** mora em `apps/backend/src/lib/financeiro/` (pura, com testes): `dre.ts` (cada venda,
  o mês, a soma de meses, o que a tela recebe), `regras.ts` (os meses, o período, as categorias, os
  campos, o valor que vale num dia), `despesas.ts` (em que mês cada uma entra; mudar e apagar a que
  repete), `tela.ts`, `tela-das-despesas.ts`, `tela-dos-custos.ts`. `ler.ts` e `gravar.ts` falam
  com o banco. As regras da conta estão no quadro do `dre.ts`: a venda conta no mês do pagamento
  (a primeira captura, como no Início); o estorno, no mês em que saiu; o cancelado depois de pago
  ENTRA na receita e sai inteiro nos estornos (sem custo e sem embalagem); os descontos fecham com
  o cobrado (produtos + frete − `totalDo`), os ajustes dizem de onde veio cada um pelo prefixo
  (PROMO-, BUMP-, os do CRM) e o centavo do Pagar.me vira "Centavos do arredondamento"; o % de cada
  linha é de cada R$ 100 da RECEITA BRUTA (a mesma base do "de cada R$ 100" e da margem da tela).
- **A Nuvemshop** vem do `crm_base_pedido` (`pedidosDaBaseDoFinanceiro`, no `CrmService`): os
  confirmados e os estornados (o estornado entra e sai no mesmo mês), os produtos antes dos cupons =
  total + desconto − frete, o item pelo SKU de hoje (`mapaDosSkus`). A taxa e o frete de antes da
  loja nova (`DIA_DA_LOJA_NOVA`, 27/09) só entram LANÇADOS, mês a mês, nas categorias `taxas` e
  `frete`; a tela de Despesas mostra quais meses faltam (`mesesComVendaNaBase`).
- **O banco** (`src/modules/financeiro`): `fin_despesa` (a despesa do mês da competência; a que
  repete vai de `mes` até `ate`, ou até parar) e `fin_valor` (um valor que vale a partir de um dia:
  `custo:<produto>`, `embalagem`, `simples` — este desde o dia 1 do mês, em centésimos de ponto).
  Dinheiro em CENTAVOS no banco; o DRE soma em reais. Mudar o custo cria uma linha nova com o dia:
  as vendas de antes seguem com o custo de antes (`vigente`). Sem a alíquota do mês, o DRE usa a do
  último mês que tem e AVISA. O kit é um produto como outro (o catálogo não guarda a composição): o
  dono digita o custo dele.
- **Todo número incompleto diz que é**: a etiqueta amarela da linha (`falta`: "2 sem custo", "% de
  agosto", "falta lançar", "3 sem a taxa", "1 sem a cotação") e o "Pra fechar certinho"
  (`pendencias`, com a aba onde se resolve). No mês a mês, a linha com falta e os totais depois
  dela vêm marcados (`incompletas`). Somando meses, o detalhe que conta ("Óleo · 5 unidades",
  "Pagar.me, cartão (2 pedidos)") soma o número (`porNome`), e a fonte vira "misto" quando um mês
  é automático e outro lançado.
- **A taxa e o frete de cada pedido da loja nova** (entrega 0226, a parte 2). O FRETE é a cotação
  da Frenet do checkout: o `validateFulfillmentData` do provedor guarda o `preco` no
  `data.servico` do método de entrega (o custo da etiqueta, ANTES da política de frete grátis ou
  fixo). A TAXA do cartão vem dos recebíveis do Pagar.me (`GET /payables?charge_id=`, um por
  parcela: `fee` + `anticipation_fee` + `fraud_coverage_fee`, `lerRecebiveis`), e a do Pix do
  Mercado Pago, do `fee_details` (o que não é `fee_payer: "payer"`). O PIX DO PAGAR.ME NÃO TEM A
  TAXA NA API (o Pagar.me fatura no mês seguinte): ela vem da % do contrato, digitada em Custos e
  imposto (`fin_valor` "taxa-pix-pagarme", centésimos de ponto, com "vale desde"). Na conta
  (`taxaDe`, no `dre.ts`): a taxa do cartão e a do Mercado Pago voltam na proporção do estorno; a do
  Pix do Pagar.me não volta. As tarifas de gateway e de antifraude do Pagar.me vêm no extrato do mês
  e entram LANÇADAS. Quem busca é o job `custos-dos-pedidos` (de 30 em 30 min,
  `lib/financeiro/custos-dos-pedidos.ts`): pedido pago da loja nova dos últimos 90 dias, até 40 por
  rodada, grava em `fin_pedido` (a taxa, e o frete COTADO DE NOVO no pedido sem a cotação do
  checkout — os de antes da 0226 e o que caiu no preço de emergência —, pelo mesmo código de
  serviço), tenta até 48 vezes. `POST /admin/financeiro/custos-dos-pedidos` roda a rodada na hora
  (o conferidor usa). O Pagar.me falso responde os recebíveis (`recebiveisDa`, a tabela pública do
  cartão; o Pix sem taxa) e o Mercado Pago falso põe o `fee_details` (0,99%) no Pix pago.
- **As rotas** (todas `exigirArea(…, "financeiro")`): `GET /dashboard/financeiro?periodo=mes|
  mes-passado|ano` (ou `?de=2026-06&ate=2026-09`, e `?comparar=nenhum`) — as linhas somadas com o
  % e a variação, o "de cada R$ 100", as pendências e cada mês numa coluna; `GET|POST
  /dashboard/financeiro/despesas` (`?mes=`; o POST `{ descricao, categoria, valor, mes, repete }`),
  `POST …/despesas/:id` (`{ visto, … }`: a que repete, mudada num mês depois do primeiro, fecha no
  mês de antes e continua com o valor novo — `planoDaMudanca`) e `POST …/despesas/:id/apagar`
  (`{ visto }`: na que repete, tira dali em diante); `GET|POST /dashboard/financeiro/custos` e
  `POST /dashboard/financeiro/simples` (`{ mes, aliquota }`; vazio tira). 422 `{ erro: "campo",
  campo }`. Registro da equipe: lancou-despesa, mudou-despesa, apagou-despesa, mudou-custos,
  mudou-simples.
- **No painel**: `app/(painel)/financeiro/` (o DRE, `despesas/` e `custos/`, um `loading.tsx`),
  `components/financeiro.tsx` (a barra dos meses — as peças da `.periodo`, com duas listas de mês —,
  os números, o "de cada R$ 100", o "Pra fechar", o DRE com cada linha num `<details>`, o mês a mês),
  `financeiro-despesas.tsx`, `financeiro-custos.tsx` e `financeiro-planilha.tsx` (o "Baixar pro
  contador": CSV com ";" e vírgula no decimal, com centavos, montado no navegador); `lib/financeiro.ts`
  (tipos e endereços), `lib/acoes/financeiro.ts`, `estilos/financeiro.css`.
- **O conferidor** é o `apps/dashboard/ferramentas/conferir-financeiro.mjs` (71): o DRE fecha (cada
  total, cada mês, o período = a soma dos meses), três pedidos da rodada (um Pix pago com a oferta,
  um Pix cancelado depois de pago, um cartão em 3x) mexem na receita, nos descontos e nos estornos
  pelo que o admin diz — e, depois da rodada do job, na taxa (a % do Pix e os recebíveis do cartão)
  e no frete pago (a cotação guardada) —, o
  custo, a embalagem e o Simples salvos pela tela entram na conta, a despesa lançada pela tela cai
  na linha dela, a que repete muda só dali em diante, a tela e a planilha são a API, a operação não
  abre, o celular e o console. Faz login do dono três vezes por rodada: no banco local, o limite de 5
  códigos/hora por e-mail pede o `zerar-envios-dono` entre rodadas.

**O WhatsApp da loja e o atendente** (entrega 0232; parte 1 de 4 — ver o ESTADO). Quem escreve pro
número da loja recebe a resposta de uma IA que vende e tira dúvida, só com o que o sistema diz.

- **A Meta:** o mesmo app e o mesmo número de antes (a Cloud API oficial). `src/lib/whatsapp/meta.ts`
  lê o aviso (`lerAvisoDaMeta`: só do `WHATSAPP_NUMERO_ID` — o app tem o número de teste da Meta —; a
  reação e o aviso do sistema não viram mensagem), confere a assinatura (`x-hub-signature-256`, HMAC
  do corpo CRU com o `WHATSAPP_APP_SEGREDO` — `preserveRawBody` no `middlewares.ts`), devolve o
  desafio do "Verificar e salvar" (`WHATSAPP_VERIFICACAO`), manda texto (com a prévia do link) e o
  "digitando…". A Graph é a `v26.0`, a mesma da compra pelo servidor. Texto livre só dentro de 24 h
  da última mensagem da pessoa: fora disso a Meta responde 131047, e a conversa sai da fila.
- **A porta:** `api/hooks/whatsapp/route.ts` — o `GET` da verificação e o `POST` que SÓ GUARDA
  (`receber`: a conversa por telefone e a mensagem por `wamid`, os dois com `insert … on conflict`;
  o `anotarSituacao` nunca desce de "lida" pra "entregue"). Banco fora: 503, e a Meta manda de novo.
- **O módulo** `src/modules/whatsapp/`: `whatsapp_conversa` (uma por telefone; `situacao` bot ou
  equipe; `pendente_desde` é a fila; `tentativas`) e `whatsapp_mensagem` (`autor` cliente, bot ou
  equipe; `tipo`; `dados` com o uso da IA, e `automatica` na resposta automática do outro lado, que
  nunca entra na fila — `ehRespostaAutomatica`, a lista que veio do sistema antigo).
- **A rodada** (`lib/whatsapp/responder.ts`, job `responder-no-whatsapp`, de minuto em minuto, com a
  trava): até 20 conversas da fila, 4 ao mesmo tempo. `decidir` (`regras.ts`): espera `ESPERA_S`
  (15 s) depois da última mensagem; larga a da equipe até `VOLTA_PRO_BOT_EM_H` (24 h) depois da
  última dela; larga a janela fechada. Teto de `TETO_POR_HORA` (12) respostas por conversa: passou,
  vai pra equipe calada. A IA ou a Meta fora: `tentativas`+1 e a próxima rodada tenta; na
  `TENTATIVAS_ANTES_DO_SOCORRO` (3ª), sai a `RESPOSTA_DE_SOCORRO` e a conversa vai pra equipe.
  `respondida` só tira da fila o que a IA leu: a mensagem que chegou no meio da resposta espera a
  próxima rodada. Sem `WHATSAPP_TOKEN`/`WHATSAPP_NUMERO_ID`, `ANTHROPIC_API_KEY` ou `LOJA_URL`, a fila
  espera e o log diz o que falta. `fb_whatsapp.ligado = false` no metadata da loja (`ajustes.ts`):
  ninguém responde sozinho, e a fila esvazia (a equipe responde).
- **A IA** (`atendente.ts`): `claude-opus-5-5`, esforço `low`, `fallbacks: "default"` (cabeçalho
  `server-side-fallback-2026-07-01`) — a recusa que sobra vira equipe. Pelo SDK oficial
  (`@anthropic-ai/sdk`; `ANTHROPIC_URL` só nos testes). O `system` tem dois pedaços: as
  instruções + regras do dono + dúvidas + catálogo (`instrucoesDoAtendente`, determinístico e SEM
  HORA — fica no cache de 1 h: `cache_control` com `ttl: "1h"`) e o contexto da conversa (a hora
  cheia e o nome do WhatsApp). A conversa vira `user`/`assistant` em `conversaPraIa` (o cliente é
  `user`; a loja, `assistant`; a da equipe vai marcada; termina sempre no cliente). Ferramenta:
  `chamar_a_equipe` (strict). Nunca `tool_choice` forçado (o Opus 5.5 recusa com 400). A resposta é
  limpa pro WhatsApp em `textoPraEnviar` (negrito de um asterisco, sem link markdown, até 4000).
- **O que ele sabe** (`catalogo.ts`, memória de 2 min): os produtos publicados com o preço de
  `precosDasVariantes`, as faixas de `FAIXAS`/`totalDaFaixa` (sem a que chega no X de um "Leve X,
  pague Y" valendo — `faixasComPromocao`), as promoções de `promocoesParaALoja`, o esgotado de
  `lerSituacoes`, e o `fb_pdp` (sem as seções escondidas na página). As dúvidas da loja vêm do JSON-LD
  `FAQPage` da página `/duvidas` (`duvidas.ts`, de hora em hora; a loja fora, fica a última boa): as
  respostas são função das configurações, e escrevê-las de novo aqui seria anunciar dois fretes.
  Links com `utm_source=whatsapp&utm_medium=atendimento`.
- **Observabilidade:** a rotina nova no `ROTINAS`; as integrações `whatsapp` (a Meta) e `anthropic`
  (a IA), com o cartão na área "WhatsApp".
- **O conferidor** é o `apps/loja/ferramentas/conferir-whatsapp.mjs` (45, sem navegador, ~5 min): sobe
  o `whatsapp-falso.mjs` (a Meta, a IA com roteiro pela mensagem — "humano", "RECUSA", "IAFORA" — e a
  página /duvidas, tudo na 4380) e lê as conversas direto do banco (`DATABASE_URL`). O backend sobe
  com `WHATSAPP_URL`, `ANTHROPIC_URL` e `LOJA_URL` apontando pra 4380 e as variáveis de teste do
  cabeçalho do conferidor. As conversas da rodada saem do banco no fim.

## Fora dos limites

- `apps/backend/.medusa/`, `apps/loja/.next/`, `apps/dashboard/.next/`, `node_modules/` — gerados.
- **CSS que começa com "Gerado por …"** em `apps/loja/src/estilos/` (quase todo `pdp*.css` e
  `checkout*.css`). Sai de `ferramentas/porte/pdp-partes/agrupa-pdp.py` (fonte: `estilo.css` da mesma
  pasta) e de `ferramentas/porte/checkout-partes/agrupa-checkout.py` (fonte:
  `prototipo-checkout.html`). Edite a fonte e rode o script — o que se escreve no gerado some na
  próxima rodada. Arquivo sem o cabeçalho é escrito à mão e se edita direto.
- Schema `public` do Supabase — do Medusa; migra pelo `medusa db:migrate`, nunca por SQL manual.
- `redirects.json` — só cresce; nunca remova uma linha (é o que preserva o Google). As linhas de
  exemplo do começo, de endereços que nunca existiram, saíram na 0125: o mapa agora é o da
  Nuvemshop, conferido pelo `apps/loja/ferramentas/conferir-enderecos-antigos.mjs`.
