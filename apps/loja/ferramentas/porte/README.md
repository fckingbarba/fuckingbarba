# Porte do protótipo → React

Ferramentas de uso único, rodadas à mão quando uma seção do protótipo vira componente.
Não entram no build nem no CI.

`prototipo.html` é o protótipo HTML aprovado — a home inteira num arquivo, com o CSS num
único `<style>`. É a fonte da verdade do desenho: se o componente e ele discordarem, quem
está errado é o componente.

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
