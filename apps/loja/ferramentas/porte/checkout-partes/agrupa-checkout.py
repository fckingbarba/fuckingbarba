"""
Corta o CSS do `prototipo-checkout.html` nos arquivos que a loja importa, do
mesmo jeito que `../agrupa.py` faz com a home e `../pdp-partes/agrupa-pdp.py`
com a PDP.

    python3 agrupa-checkout.py ../../../src/estilos

POR QUE UMA FERRAMENTA, de novo:

  1. A ORDEM IMPORTA e media query não soma especificidade — quem ganha é
     quem vem depois. Recortar na mão embaralha isso e o bug aparece no
     celular, três dias depois.

  2. O que não casar com grupo nenhum SAI IMPRESSO no fim. Regra que some
     sem aviso é o jeito mais silencioso de a página quebrar.

  3. Os tokens do protótipo (--color-text, --suave) não existem no app, que
     usa os nomes do @theme (--color-tinta, --ease-suave).

O QUE MUDA DE NOME NO CAMINHO, e por quê:

  `.depo` → `.depoimento`. A home JÁ TEM um bloco `.depo` (os depoimentos da
  seção de provas), com outro desenho. Os dois arquivos entram no mesmo
  `globals.css`, então o `.depo` do checkout e o da home brigariam pela
  mesma regra — e ganharia o que fosse importado por último, que é o tipo de
  coisa que ninguém liga a uma mudança feita noutra página.

O QUE NÃO SOBE: `.btn`, `.sr-only` e `.pula`, que já estão em `base.css` e no
`globals.css`; e `:root`, `html` e `body`, porque os tokens e o reset do app
são os do Tailwind, não os do protótipo.
"""

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from extrai import filtra, parse, render, seletores, tira_comentarios  # noqa: E402

AQUI = os.path.dirname(os.path.abspath(__file__))
PROTOTIPO = os.path.join(os.path.dirname(AQUI), "prototipo-checkout.html")

# tokens do protótipo -> tokens do app (Tailwind v4 @theme).
# A ordem importa: --color-accent-dark antes de --color-accent, senão a troca
# do prefixo deixa "--color-amarelo-dark" pra trás.
TOKENS = {
    "--color-bg": "--color-menta",
    "--color-accent-dark": "--color-amarelo-escuro",
    "--color-accent": "--color-amarelo",
    "--color-text-muted": "--color-tinta-suave",
    "--color-text": "--color-tinta",
    "--suave": "--ease-suave",
    "--menta-escura": "--color-menta-escura",
    "--menta": "--color-menta",
    "--fundo": "--color-cinza",
    "--linha": "--color-linha",
    "--erro": "--color-erro",
    "--font-sans": "--font-sans",
}

# classe do protótipo -> classe da loja (colisão com CSS que já existe)
RENOMEIA = {"depo": "depoimento"}

# nome do arquivo -> (prefixos de classe, keyframes, seletores crus)
GRUPOS = {
    "checkout": (
        [
            "topo", "pagina", "passos", "feito-passo", "painel", "bloco",
            "acoes", "cabeca", "campos", "campo", "marcar", "opcoes", "opcao",
            "pagamento", "bandeiras", "aviso-frete", "completa", "bump",
            "confia", "erros-envio", "barra", "fluxo",
        ],
        ["entra", "gira"],
        # `.btn` inteiro fica de fora (já está em base.css), mas o modificador
        # fantasma nasceu neste protótipo — é o "← Voltar" de cada passo, e
        # sem ele o botão de voltar sai igual ao de avançar.
        ["[hidden]", "[data-endereco]", ".btn--fantasma"],
    ),
    "checkout-resumo": (
        ["resumo", "itens", "item", "cupom", "totais", "pix-dica", "depoimento", "confianca"],
        [],
        [],
    ),
    "checkout-confirma": (["feito"], [], []),
}

# Já existe em base.css / globals.css, ou é reset que o app resolve de outro
# jeito. `estrelas` fica de fora porque a home já tem a dela, com SVG.
IGNORAR = ["btn", "sr-only", "pula", "estrelas"]
CRUAS_IGNORADAS = (":root", "*", "html", "body")


def faz_filtro(prefixos, keyframes, cruas):
    def quer(sel):
        s = sel.strip()
        if s.startswith("@keyframes"):
            return s.split("{")[0].replace("@keyframes", "").strip() in keyframes
        if s.startswith("@"):
            return False
        if s.startswith(CRUAS_IGNORADAS):
            return False
        if any(s.startswith(c) for c in cruas):
            return True
        return any(
            re.match(r"\." + re.escape(p) + r"(?![a-z0-9_-])", s)
            or re.match(r"\." + re.escape(p) + r"(__|--)", s)
            for p in prefixos
        )

    return quer


def troca_tokens(css):
    for velho, novo in TOKENS.items():
        css = css.replace(f"var({velho})", f"var({novo})")
    return css


def renomeia(css):
    for velho, novo in RENOMEIA.items():
        css = re.sub(r"\." + re.escape(velho) + r"(?=__|--|[^a-z0-9_-])", f".{novo}", css)
    return css


CABECALHO = (
    "/* Gerado por ferramentas/porte/checkout-partes/agrupa-checkout.py —\n"
    "   não edite à mão. A fonte é ferramentas/porte/prototipo-checkout.html. */\n"
)


def css_do_prototipo():
    html = open(PROTOTIPO, encoding="utf-8").read()
    return html.split("<style>", 1)[1].split("</style>", 1)[0]


def main():
    destino = sys.argv[1] if len(sys.argv) > 1 else "saida-checkout"
    os.makedirs(destino, exist_ok=True)

    css = tira_comentarios(renomeia(css_do_prototipo()))
    nos = parse(css)

    for nome, (prefixos, kf, cruas) in GRUPOS.items():
        quer = faz_filtro(prefixos, kf, cruas)
        texto = troca_tokens("\n".join(render(filtra(nos, quer))))
        open(os.path.join(destino, f"{nome}.css"), "w", encoding="utf-8").write(
            CABECALHO + texto + "\n"
        )
        print(f"{nome:20s} {len(texto):7d} bytes  {texto.count('{'):4d} blocos")

    # Quem ficou de fora — a parte importante do relatório.
    todos = set()

    def colhe(ns):
        for n in ns:
            if n["tipo"] == "regra":
                todos.update(seletores(n["sel"]))
            elif n["tipo"] == "at":
                colhe(n["filhos"])
            else:
                todos.add(n["texto"][:60])

    colhe(nos)

    cobertos = set()
    for _, (prefixos, kf, cruas) in GRUPOS.items():
        quer = faz_filtro(prefixos, kf, cruas)
        cobertos |= {s for s in todos if quer(s)}

    fora = sorted(
        s
        for s in todos - cobertos
        if not s.strip().startswith(CRUAS_IGNORADAS)
        and not any(
            re.match(r"\." + re.escape(p) + r"(__|--|(?![a-z0-9_-]))", s.strip()) for p in IGNORAR
        )
    )
    print(f"\n--- {len(fora)} seletor(es) sem grupo ---")
    for s in fora:
        print("   ", s.replace("\n", " ")[:110])


if __name__ == "__main__":
    main()
