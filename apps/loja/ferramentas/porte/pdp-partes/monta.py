#!/usr/bin/env python3
"""Monta o protótipo da PDP a partir do protótipo da home.

    python3 pdp-partes/monta.py

A carcaça da loja (esteira, cabeçalho, menu, busca, gaveta da sacola,
rodapé) e todo o CSS de `.btn`, `.produto` e `.colecao` são COPIADOS do
`prototipo.html`, não reescritos. É de propósito: as duas páginas
precisam divergir zero, e a única forma de garantir isso é ter uma
fonte só. Mexeu no botão da home, roda este script de novo.

O que este script faz, em ordem:

    cabeca.html    entra no lugar das linhas de <head> antes do <style>
    <style>        fica inteiro, e `estilo.css` é colado ANTES do </style>
    carcaça de cima  fica (até o fim da gaveta da sacola)
    corpo.html     entra no lugar das seções da home dentro do <main>
    </main>, rodapé e todos os <script> ficam
    roteiro.js     é colado antes do </body>

Os limites são encontrados por marcador de texto, não por número de
linha: se o protótipo da home crescer, o script continua achando.
"""

from pathlib import Path
import sys

AQUI = Path(__file__).resolve().parent
PORTE = AQUI.parent
HOME = PORTE / "prototipo.html"
SAIDA = PORTE / "prototipo-pdp.html"


def fatia(texto: str, marcador: str, nome: str) -> int:
    """Posição de um marcador, ou um erro que diz qual sumiu."""
    pos = texto.find(marcador)
    if pos == -1:
        sys.exit(
            f"não achei {nome} ({marcador!r}) em {HOME.name}.\n"
            "O protótipo da home mudou de forma; ajuste os marcadores aqui."
        )
    return pos


# Um trecho da carcaça fala do banner da HOME, que aqui não existe. Como a
# carcaça é copiada byte a byte, a nota vinha junto e mentia. Trocamos os
# dois parágrafos; se o texto mudar na home, o script para e avisa, em vez
# de publicar um comentário errado em silêncio.
NOTA_HOME = """  3) O banner NÃO usa <h1>: ele vem antes da seção "Fórmulas de alta
     performance", que já tem o <h1> da página. Dois <h1> confundem a
     leitura da página, e peça promocional é conteúdo, não estrutura."""

NOTA_PDP = """  3) O <h1> desta página é o NOME DO PRODUTO, na coluna de compra. O
     cabeçalho e a esteira de avisos não levam título nenhum: são carcaça,
     não conteúdo. Um <h1> por página, e ele diz o que a página vende."""


def main() -> None:
    home = HOME.read_text(encoding="utf-8")

    # "<style>" sozinho pega a MENÇÃO ao <style> dentro do comentário de
    # abertura da home, dez linhas antes da tag de verdade. Com as quebras
    # de linha em volta, só a tag casa.
    abre_estilo = fatia(home, "\n<style>\n", "a abertura do <style>") + 1
    fecha_estilo = fatia(home, "\n</style>\n", "o fim do <style>") + 1

    # a carcaça de cima termina onde a primeira seção da home começa
    primeira_secao = fatia(
        home, '<section class="banner"', "a primeira seção da home"
    )
    fecha_main = fatia(home, "</main>", "o fim do <main>")
    fecha_body = fatia(home, "</body>", "o fim do <body>")

    carcaca = home[fecha_estilo:primeira_secao]
    fatia(carcaca, NOTA_HOME, "a nota do banner na carcaça")
    carcaca = carcaca.replace(NOTA_HOME, NOTA_PDP)

    pdp = "".join(
        [
            (AQUI / "cabeca.html").read_text(encoding="utf-8"),
            home[abre_estilo:fecha_estilo],
            (AQUI / "estilo.css").read_text(encoding="utf-8"),
            carcaca,
            (AQUI / "corpo.html").read_text(encoding="utf-8"),
            "\n",
            home[fecha_main:fecha_body],
            (AQUI / "roteiro.js").read_text(encoding="utf-8"),
            home[fecha_body:],
        ]
    )

    SAIDA.write_text(pdp, encoding="utf-8")

    print(f"{SAIDA.relative_to(PORTE.parent)}  ({len(pdp) / 1024:.0f} KB)")
    for marca, conta in (
        ("<main", pdp.count("<main")),
        ("</main>", pdp.count("</main>")),
        ("<h1", pdp.count("<h1")),
        ("data-comprar", pdp.count("data-comprar")),
    ):
        print(f"  {marca:14} {conta}")


if __name__ == "__main__":
    main()
