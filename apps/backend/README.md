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

Todos podem rodar quantas vezes quiser, e todos começam dizendo **em que banco estão
escrevendo** (`src/scripts/onde-estou.ts`), porque `medusa exec` obedece ao `DATABASE_URL` que
estiver no ambiente e não pergunta se você queria mesmo mexer em produção.

| Comando              | O que faz                                                                        |
| -------------------- | -------------------------------------------------------------------------------- |
| `npm run produtos`   | os cinco produtos reais da loja atual, com foto, preço e descrição               |
| `npm run quantidade` | liga o desconto por quantidade (4% levando 2, 6% levando 3) e aposenta os kits   |
| `npm run fotos`      | varre o catálogo inteiro e remove as fotos reprovadas, por URL                   |
| `npm run frete`      | conjunto de entrega, zona Brasil e as opções de frete com o piso do frete grátis |
| `npm run promocoes`  | o desconto do order bump do checkout, como promoção de verdade                   |

Da raiz, os mesmos com o prefixo `backend:` (`npm run backend:frete`).

`produtos`, `kits` e `fotos` **pulam** o que já existe. `frete` e `promocoes` **corrigem**: eles
são a fonte dos números que escrevem, e pular faria com que mudar um valor de frete exigisse
apagar a opção no painel primeiro.

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

### Conferir as promoções

```bash
node ferramentas/conferir-promocoes.mjs
```

O order bump do checkout promete "de X por Y" na tela. O desconto **existe no Medusa** — uma
promoção com código que o checkout aplica quando a pessoa marca a caixinha e remove quando
desmarca. Escrever o desconto só no HTML seria a diferença que o cliente descobre na fatura, e
no Brasil a oferta anunciada vincula (CDC art. 30).

O mesmo vale pro campo de cupom: ele manda o código pro Medusa e mostra a resposta. Não existe
lista de cupom no navegador.

O conferidor trava o limite de **uma unidade**: sem ele, quem marca o bump e sobe a quantidade
leva o desconto em todas.

### Conferir o frete

```bash
node ferramentas/conferir-frete.mjs     # precisa do Medusa de pé
```

Monta carrinhos de verdade pela API da loja e confere que as opções aparecem, que cobram o valor
cadastrado abaixo do piso e que **a mais barata** vai a zero a partir dele.

**Frete grátis é só na opção mais barata.** "Frete grátis" quer dizer que a loja paga o envio
comum, não que ela paga a pressa de quem escolhe Sedex — com a regra nas duas, todo pedido acima
do piso saía por R$ 39,90 de frete em vez de R$ 24,90, e a diferença é margem que some sem
ninguém ver. Quem quiser Sedex acima do piso continua podendo: paga a diferença.

E ele **não é promoção**: é um segundo preço da própria opção, com regra em `item_total` — o
único atributo que o Medusa aceita nessa regra. Promoção funcionaria, e apareceria como desconto
numa linha separada, deixando o cliente fazer a conta de quanto vai pagar de frete.

O piso mora em dois lugares e os dois precisam bater: `FRETE_GRATIS_A_PARTIR_DE` em
`apps/loja/src/lib/site.ts` (o que a loja promete) e `FRETE_GRATIS_A_PARTIR_DE` em
`src/scripts/frete.ts` (o que o checkout cobra).

Documentação: https://docs.medusajs.com

## Configurações da loja

A tela **Configurações da loja** no admin edita o que a vitrine anuncia: a política de frete
(nenhuma / grátis / fixo, com piso, alvo e teto de custo) e os dados da empresa (razão social,
CNPJ, endereço, WhatsApp, e-mail, horário, prazo de postagem).

Mora no `metadata` da store, sob a chave `fb_configuracoes`. O tipo e a validação estão em
`src/lib/configuracoes.ts`, e há um gêmeo na loja — é contrato de rede, conferido de verdade pelo
`apps/loja/ferramentas/conferir-configuracoes.mjs`.

```bash
npm run backend:configuracoes   # semeia num banco novo, ou só relata o que está gravado
```

O script **não sobrescreve** o que já existe (`SOBRESCREVER = false`): o caminho normal é o admin,
e um script que sobrescreve em silêncio desfaz a alteração que alguém fez na tela cinco minutos
antes. Rodando com a configuração já existente, ele apenas imprime o que está valendo e o que
ainda está pendente — que é a primeira pergunta quando a loja anuncia um número estranho.

**`aplicarPolitica()` é a regra que o provider do Frenet vai chamar.** Ela está no backend, e não
dentro do provider, porque é a MESMA regra que a loja anuncia: com ela num lugar só, não existe a
versão em que a tela promete uma coisa e a cotação faz outra. Ela também nunca cobra mais que o
preço real no modo fixo — promoção que encarece não é promoção — e respeita o teto de custo, que
é o que protege a margem quando a cotação ao vivo devolve um frete caro pro interior.

Salvar no admin dispara `POST <LOJA_URL>/api/revalidar` (ver `.env.example`). Sem `LOJA_URL` e
`REVALIDAR_SEGREDO`, a gravação funciona mas a loja segue mostrando o valor velho — e a tela avisa
isso na mensagem de sucesso, em vez de dizer que deu tudo certo.

## A página de produto (PDP)

O texto editorial de cada produto mora no `metadata` do produto, sob `fb_pdp`, e se edita no
widget **Página do produto** — dentro da página do produto no admin, e não numa tela à parte:
preço, foto, estoque e texto são a mesma tarefa, e separar em duas telas cria a segunda visita
que alguém esquece de fazer.

```bash
npm run backend:pdp   # semeia num banco novo, ou só relata o que cada produto tem
```

A semente (`src/scripts/dados/pdp-inicial.json`) é o conteúdo que estava escrito em TypeScript na
loja, extraído uma vez pra que a mudança de endereço não perdesse uma vírgula. O script **não
sobrescreve** o que já existe.

`src/lib/pdp.ts` tem a validação, e ela é usada nos dois sentidos: na gravação e na leitura. Uma
seção só entra se os campos **obrigatórios** dela existirem — meio preenchida não vale, porque na
loja ela vira um cabeçalho solto no meio da página. Salvar derruba duas etiquetas na loja,
`produto:<handle>` e `layout:produto:<handle>`: texto e ordem são dados diferentes, e derrubar só
uma deixaria a página com o texto novo na ordem velha.

**Armadilha do admin local:** abra em `http://localhost:9000/app`, não em `127.0.0.1:9000`. São
origens diferentes pro CORS, e no IP a tela de login aparece sem os campos, dizendo "Register an
auth provider" — que manda procurar o problema no lugar errado. E o `.env` de exemplo traz
`ADMIN_DISABLED=true` (o valor do worker); localmente ele precisa ser `false`, senão `/app` é 404.
