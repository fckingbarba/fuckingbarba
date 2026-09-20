# Vetorizar a marca

`vetoriza.py` traça os PNGs da logo e cospe SVG. Rodado à mão, quando a arte muda — não
entra no build nem no CI.

```bash
python3 vetoriza.py <entrada.png> saida/<nome>.svg
```

Os caminhos que ele gera vão pra `src/components/marca.tsx` (que é **gerado**, não escrito à
mão) e pro `src/app/icon.svg`.

## O que ele faz, e por que cada passo existe

**Separa por cor antes de traçar.** O potrace só entende preto e branco: jogar a imagem
inteira nele misturaria o raio amarelo com as letras brancas num borrão só. Cada cor vira uma
camada, é traçada sozinha, e as duas voltam como dois `<path>` no mesmo SVG.

**Guarda a cobertura, não a máscara.** Foi o erro da primeira versão: se cada camada vira
booleano logo de cara, o antisserrilhado do PNG some antes de qualquer ampliação, e o que
sobra pra ampliar é uma escada. Guardando _quanto_ de cada cor há em cada pixel (0 a 1), a
borda continua carregando a informação de onde ela passava dentro do pixel.

**Amplia e só então binariza.** É aqui que aquele antisserrilhado vira curva em vez de
degrau. `BICUBIC`, não `LANCZOS` — o lanczos cria halo nas bordas duras de uma logo, e halo
vira ondulação no contorno.

**Inverte antes de entregar ao potrace.** O construtor do `potracer` chama `invert()`
sozinho, então quem entra como `True` sai como fundo. Passando a máscara crua, a primeira
tentativa desenhou um retângulo amarelo com o raio vazado no meio; passando `uint8` 0/1 ele
compara com 127, acha tudo preto e devolve só a moldura da tela.

## Os padrões saíram de medir

Varrendo escala 8/16 e tolerância de 0,2 a 2,5, a silhueta resultante **não mudou** — 4,6% de
diferença em todas — e só o tamanho do arquivo variou, de 34 KB a 21 KB. Então ficam os
valores mais baratos: escala 8, tolerância 1,2, uma casa decimal.

Conferindo no tamanho original (119×95), o traço reproduz o PNG com **nenhum pixel divergindo
mais que 50%** e 1,6% de diferença média de silhueta — que é a colocação subpixel da borda, o
piso da medida.

## O limite

Vetorizar não inventa detalhe que o arquivo não tinha. De um PNG de 119 px sai um contorno de
119 px de informação: liso, escalável, fiel ao original — e ainda assim uma aproximação do
desenho que o designer fez. Pra impresso, banner ou qualquer peça fora da tela, peça o
arquivo original (AI, EPS, PDF ou SVG).
