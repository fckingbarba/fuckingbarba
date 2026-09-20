"""
Vetoriza os PNGs da marca — um SVG por peça, com uma camada por cor.

    python3 vetoriza.py <entrada.png> <saida.svg> [--escala 12] [--limiar 0.5]

COMO FUNCIONA, e por que cada passo existe:

  1. SEPARA POR COR antes de traçar. O potrace só entende preto e branco:
     jogar a imagem inteira nele misturaria o raio amarelo com as letras
     brancas num borrão só. Então cada cor vira uma máscara própria, é
     traçada sozinha, e as duas voltam como dois `<path>` no mesmo SVG.

  2. AMPLIA ANTES DE BINARIZAR, com Lanczos. Parece contraintuitivo —
     ampliar não cria informação. Mas o antisserrilhado do PNG guarda, em
     cada pixel cinza, ONDE dentro daquele pixel a borda passava. Binarizar
     no tamanho original joga isso fora e devolve escada; ampliar primeiro
     e cortar em 50% recupera boa parte da curva original. É a diferença
     entre um contorno em degraus e um contorno quase liso.

  3. TRAÇA COM O POTRACE, que é o mesmo motor que o Inkscape usa no
     "vetorizar bitmap". `alphamax` alto deixa o resultado mais curvo (bom
     pra letra desenhada à mão), `opttolerance` controla quanto ele pode
     simplificar sem se afastar do traço.

     Os padrões (escala 8, tolerância 1.2, uma casa decimal) saíram de medir,
     não de chutar: varrendo escala 8/16 e tolerância de 0.2 a 2.5, a
     silhueta resultante NÃO mudou — 4,6% de diferença em todas —, só o
     tamanho do arquivo, que foi de 34 KB a 21 KB. Então fica o mais barato.

>>> O LIMITE DISTO TUDO É A ORIGEM. Vetorizar não inventa detalhe que não
    estava no arquivo: de um PNG de 119 px sai um contorno de 119 px de
    informação, liso porém aproximado. Serve pra ver o desenho no lugar e
    pra tamanho pequeno; não substitui o arquivo do designer (AI, EPS, PDF
    ou SVG) quando a peça for impressa ou ampliada.
"""

import argparse
import sys
from pathlib import Path

import numpy as np
import potrace
from PIL import Image

# As cores da marca, pra colar no SVG em vez de despejar o RGB médio de cada
# mancha — o amarelo do PNG varia com o antisserrilhado, e o que a loja usa é
# um valor só, o mesmo do @theme.
AMARELO = "#ffd84d"
BRANCO = "#ffffff"
TINTA = "#12181f"


def camadas(im: Image.Image):
    """
    Separa a arte em (nome, cobertura 0..1, cor), do fundo pro topo.

    COBERTURA, NÃO MÁSCARA — e essa é a parte que eu errei na primeira
    tentativa. Se cada camada virasse booleano aqui, o antisserrilhado do PNG
    ia embora antes de qualquer ampliação, e o que sobra pra ampliar é uma
    escada. Guardando quanto de cada cor há em cada pixel (0 a 1), a borda
    continua carregando a informação de onde ela passava dentro do pixel — e
    é isso que a ampliação recupera.
    """
    rgba = np.asarray(im.convert("RGBA")).astype(np.float32) / 255
    r, g, b, a = rgba[..., 0], rgba[..., 1], rgba[..., 2], rgba[..., 3]

    # Quanto o pixel é amarelo, de 0 a 1: no amarelo da marca o azul cai e o
    # vermelho fica alto; no branco os três empatam. A diferença r-b separa
    # os dois sem depender de brilho.
    amarelidao = np.clip((r - b) / 0.45, 0, 1)
    # Quanto ele é escuro (o contorno, quando existe).
    escuridao = np.clip((0.45 - np.maximum(np.maximum(r, g), b)) / 0.45, 0, 1)

    escuro = a * escuridao
    amarelo = a * amarelidao * (1 - escuridao)
    branco = a * (1 - amarelidao) * (1 - escuridao)

    return [("tinta", escuro, TINTA), ("branco", branco, BRANCO), ("amarelo", amarelo, AMARELO)]


def traca(cobertura: np.ndarray, escala: int, limiar: float, alphamax: float, tolerancia: float):
    """Cobertura 0..1 -> lista de curvas do potrace, já na escala pedida."""
    if cobertura.max() < 0.2:
        return None

    # Amplia a COBERTURA e só então binariza: é aqui que o antisserrilhado
    # vira curva em vez de degrau. BICUBIC e não LANCZOS — o lanczos cria
    # sobre-oscilação (halo) nas bordas duras de uma logo, e o halo vira
    # ondulação no contorno traçado.
    suave = Image.fromarray((np.clip(cobertura, 0, 1) * 255).astype(np.uint8), mode="L")
    grande = suave.resize((suave.width * escala, suave.height * escala), Image.BICUBIC)
    binaria = np.asarray(grande) >= int(limiar * 255)

    # INVERTIDO, e isso custou duas tentativas erradas: o construtor do
    # `potracer` chama `invert()` sozinho, então quem entra como True sai
    # como fundo. Passando a máscara crua, a primeira versão desenhou um
    # retângulo amarelo com o raio vazado no meio. E passando uint8 0/1 ele
    # compara com 127, acha tudo preto e devolve só a moldura da tela.
    bitmap = potrace.Bitmap(~binaria)
    return bitmap.trace(
        turdsize=max(2, escala // 3),  # descarta sujeira do tamanho de um pixel original
        alphamax=alphamax,
        opticurve=True,
        opttolerance=tolerancia,
    )


def para_d(caminho, escala: int, casas: int = 1) -> str:
    """Curvas do potrace -> atributo `d`, já dividido de volta pela escala."""

    def p(ponto):
        return f"{round(ponto.x / escala, casas)} {round(ponto.y / escala, casas)}"

    partes = []
    for curva in caminho:
        partes.append(f"M{p(curva.start_point)}")
        for seg in curva:
            if seg.is_corner:
                partes.append(f"L{p(seg.c)}L{p(seg.end_point)}")
            else:
                partes.append(f"C{p(seg.c1)} {p(seg.c2)} {p(seg.end_point)}")
        partes.append("Z")
    return "".join(partes)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("entrada")
    ap.add_argument("saida")
    ap.add_argument("--escala", type=int, default=8)
    ap.add_argument("--limiar", type=float, default=0.5)
    ap.add_argument("--alphamax", type=float, default=1.0)
    ap.add_argument("--tolerancia", type=float, default=1.2)
    ap.add_argument("--titulo", default="")
    args = ap.parse_args()

    im = Image.open(args.entrada)
    L, A = im.size

    paths = []
    for nome, mascara, cor in camadas(im):
        caminho = traca(mascara, args.escala, args.limiar, args.alphamax, args.tolerancia)
        if caminho is None:
            continue
        d = para_d(caminho, args.escala)
        paths.append(f'  <path fill="{cor}" d="{d}"/>')
        print(f"  {nome:8s} {mascara.sum():8.0f} px  ->  {len(d):6d} caracteres de path")

    if not paths:
        sys.exit("nada pra traçar: a imagem está vazia?")

    titulo = f"\n  <title>{args.titulo}</title>" if args.titulo else ""
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {L} {A}" '
        f'fill="none">{titulo}\n' + "\n".join(paths) + "\n</svg>\n"
    )
    Path(args.saida).write_text(svg, encoding="utf-8")
    print(f"  -> {args.saida} ({len(svg)} bytes)")


if __name__ == "__main__":
    main()
