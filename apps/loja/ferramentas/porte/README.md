# Porte do protótipo → React

Ferramentas de uso único, rodadas à mão quando uma seção do protótipo vira componente.
Não entram no build nem no CI.

`prototipo.html` é o protótipo HTML aprovado — a home inteira num arquivo, com o CSS num
único `<style>`. É a fonte da verdade do desenho: se o componente e ele discordarem, quem
está errado é o componente.

`prototipo-pdp.html` é o protótipo da página de produto. Ele é **gerado**, não editado à
mão — veja "A PDP" mais abaixo.

## Fatiar o CSS

```bash
python3 extrai.py prototipo.html arvore.json   # analisa o CSS preservando @media e @keyframes
python3 agrupa.py saida                        # um arquivo por seção, com os tokens trocados
```

O `agrupa.py` faz três coisas que valem saber:

- **troca os tokens** do protótipo pelos do app (`--color-accent` → `--color-amarelo`,
  `--color-text` → `--color-tinta`, `--suave` → `--ease-suave`);
- **devolve `line-height: normal`** na raiz de cada seção. O protótipo não tinha regra em
  `body` e herdava a entrelinha padrão do navegador; o preflight do Tailwind põe `1.5`, e isso
  engorda tudo que não declara a sua;
- **avisa o que sobrou de fora.** Ao final ele lista os seletores que nenhum grupo reivindicou —
  se aparecer algo além de `:root` e `html`, falta um grupo em `GRUPOS`.

Copie de `saida/` só os arquivos das seções que você está portando, ponha o comentário de
cabeçalho explicando a seção e importe no `globals.css`.

## Conferir se ficou igual

Com o protótipo e a app no ar (`python3 -m http.server 3200` na pasta do protótipo, `next start`
na porta 3100) e com o Playwright instalado (`npm i -D playwright` na raiz):

```bash
node comparar-dom.mjs                          # árvore, caixa e cor, nó por nó
RAIZES=.vitrine,.produto node comparar-dom.mjs # só as seções que você mexeu
node testar-comportamento.mjs                  # menu, foco, Esc, busca, esteira
```

O `comparar-dom.mjs` neutraliza a revelação ao rolar e abre o menu nos dois lados antes de medir,
senão a comparação mente. Sai com código 1 se alguma seção divergir.

> **O protótipo não carrega a Inter** — ele só a nomeia na pilha de fontes. Pra comparar de
> verdade, sirva junto um `fontes.css` com os `@font-face` que o `next/font` gerou (eles estão
> no CSS do build, em `.next/static/chunks/*.css`) e inclua no `<head>` do protótipo. Sem isso o
> protótipo desenha com a fonte de sistema e toda medida de texto difere — foi o que quase me
> fez "corrigir" um bug que não existia.

## A PDP

`prototipo-pdp.html` **não se edita**. Ele é montado a partir de `prototipo.html` mais as
peças em `pdp-partes/`:

```bash
python3 pdp-partes/monta.py                    # gera prototipo-pdp.html
node pdp-partes/conferir.mjs                   # abre no Chromium e confere
node pdp-partes/largura.mjs                    # quem está estourando a tela no celular
```

A carcaça inteira (esteira, cabeçalho, menu, busca, gaveta da sacola, rodapé) e o CSS de
`.btn`, `.produto` e `.colecao` são **copiados** do protótipo da home, byte a byte. Mexeu
no botão lá, roda o `monta.py` de novo e a PDP acompanha. É o que impede as duas páginas de
divergirem com o tempo — que é como uma loja começa a parecer duas lojas.

Os limites do recorte são achados por marcador de texto, não por número de linha. Se a home
mudar de forma a ponto de um marcador sumir, o script **para e diz qual** em vez de gerar um
arquivo torto.

| arquivo                   | o que é                                                      |
| ------------------------- | ------------------------------------------------------------ |
| `pdp-partes/cabeca.html`  | `<title>`, description e og: da página de produto            |
| `pdp-partes/estilo.css`   | o CSS só da PDP, colado antes do `</style>` da home          |
| `pdp-partes/corpo.html`   | o miolo do `<main>`, no lugar das seções da home             |
| `pdp-partes/roteiro.js`   | galeria, kit, quantidade, frete, rotina, barra fixa, estoque |
| `pdp-partes/monta.py`     | junta tudo                                                   |
| `pdp-partes/conferir.mjs` | roda a página num navegador de verdade                       |
| `pdp-partes/largura.mjs`  | acha o elemento que estoura a largura no celular             |

O `conferir.mjs` existe porque três defeitos passaram pela leitura do código e só apareceram
no navegador:

- **`display` da folha ganhando do `[hidden]`** — a regra do navegador é `[hidden] { display:
none }`, e qualquer `display: flex` nosso, mais específico, passa por cima. O JS marcava
  hidden e o aviso de estoque continuava na tela.
- **`<input>` sem largura dentro de um flex** — o `size` padrão dá ~230px de largura
  intrínseca, que vai pro `min-content` do pai mesmo com `min-width: 0`. A coluna inteira
  ficou 32px mais larga que a tela e o celular ganhou rolagem horizontal.
- **filho a mais num grid** — `<li>` de duas colunas com um `<strong>` solto no meio da
  frase: o `<strong>` virou célula própria e caiu por cima do número do passo.

Os três viraram teste. O script também falha se sobrar bloco de revelar-ao-rolar sem revelar
na hora da foto — sem isso a foto sai com buraco e a gente "conserta" um layout que está certo.
