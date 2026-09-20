"""
Corta `estilo.css` (o CSS da PDP do protótipo) nos arquivos por seção que a
loja importa, do mesmo jeito que `../agrupa.py` faz com o CSS da home.

    python3 agrupa-pdp.py ../../../src/estilos

POR QUE UMA FERRAMENTA, e não copiar e colar à mão:

  1. A ORDEM IMPORTA e não é a que parece. Este CSS foi escrito em camadas —
     o bloco "V2 — o que mudou depois da primeira revisão" reescreve coisa
     definida 2000 linhas antes, e media query NÃO soma especificidade: quem
     ganha é quem vem depois. Recortar na mão embaralha essa ordem e o bug
     que aparece é "a foto tem altura demais no celular", três dias depois.

  2. Eu já quebrei esta página recortando por "o seletor contém X": a regra
     do `box-sizing` foi embora junto com a seção porque a LISTA dela
     mencionava `.versus`. Aqui o filtro roda POR SELETOR dentro da lista, e
     o que não casar com grupo nenhum sai impresso no fim — se aparecer algo
     importante na lista de sobras, é sinal de que falta um grupo.

  3. Os tokens do protótipo (--color-bg, --suave) não existem no app, que usa
     os nomes do @theme (--color-menta, --ease-suave). A troca é mecânica e
     é exatamente o tipo de coisa que a gente esquece num arquivo e só
     descobre quando uma cor sai errada em produção.

O QUE NÃO SAI DAQUI: `.proto`, a chave de protótipo que alterna order bump e
cross-sell. Ela não existe na loja — lá quem decide é o produto.
"""

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from extrai import filtra, parse, render, seletores, tira_comentarios  # noqa: E402

AQUI = os.path.dirname(os.path.abspath(__file__))

# tokens do protótipo -> tokens do app (Tailwind v4 @theme).
# A ordem importa: --color-accent-dark antes de --color-accent, senão a troca
# do prefixo deixa "--color-amarelo-dark" pra trás.
TOKENS = {
    "--color-bg": "--color-menta",
    "--color-accent-dark": "--color-amarelo-escuro",
    "--color-accent": "--color-amarelo",
    "--color-card-bg": "--color-papel",
    "--color-text-muted": "--color-tinta-suave",
    "--color-text": "--color-tinta",
    "--suave": "--ease-suave",
}

# nome do arquivo -> (prefixos de classe, keyframes, seletores crus)
GRUPOS = {
    "pdp": (
        ["pdp", "migalhas", "galeria", "compra", "cross", "videos", "barra-compra"],
        ["barraSobe", "kitPisca"],
        ["[data-comprar]"],
    ),
    "pdp-promessa": (["promessa"], [], []),
    "pdp-antesdepois": (["antesdepois", "caso"], [], []),
    "pdp-tempo": (["tempo"], [], []),
    "pdp-faixa": (["faixa"], [], []),
    "pdp-rotina": (["rotina"], [], []),
    "pdp-funciona": (["funciona", "uso", "ficha"], [], []),
    "pdp-versus": (["versus"], [], []),
    "pdp-quem": (["quem"], [], []),
    "pdp-duvidas": (["duvidas"], [], []),
    "pdp-avaliacoes": (["avaliacoes"], [], []),
    "pdp-relacionados": ([], [], [".colecao--relacionados"]),
}

# Só a raiz: o protótipo não tinha regra em body, então cada bloco herdava
# `line-height: normal` do navegador. O preflight do Tailwind põe 1.5 na raiz
# e engorda tudo que não declara a sua.
RAIZES = {
    "pdp": [".pdp", ".barra-compra"],
    "pdp-promessa": [".promessa"],
    "pdp-antesdepois": [".antesdepois"],
    "pdp-tempo": [".tempo"],
    "pdp-faixa": [".faixa"],
    "pdp-rotina": [".rotina"],
    "pdp-funciona": [".funciona"],
    "pdp-versus": [".versus"],
    "pdp-quem": [".quem"],
    "pdp-duvidas": [".duvidas"],
    "pdp-avaliacoes": [".avaliacoes"],
}

# Não sobe: chave de protótipo e o que já veio no CSS da home.
IGNORAR = ["proto", "colecao", "avaliacao", "estrelas", "carrossel", "btn", "sr-only"]


def faz_filtro(prefixos, keyframes, cruas):
    def quer(sel):
        s = sel.strip()
        if s.startswith("@keyframes"):
            return s.split("{")[0].replace("@keyframes", "").strip() in keyframes
        if s.startswith("@"):
            return False
        if any(s.startswith(c) for c in cruas):
            return True
        return any(
            re.match(r"\." + re.escape(p) + r"(?![a-z0-9_-])", s)
            or re.match(r"\." + re.escape(p) + r"(__|--)", s)
            for p in prefixos
        )

    return quer


def cabecalho(nome):
    raizes = RAIZES.get(nome)
    if not raizes:
        return ""
    sel = ",\n".join(raizes)
    return (
        "/* Gerado por ferramentas/porte/pdp-partes/agrupa-pdp.py — não edite à mão.\n"
        "   Entrelinha padrão do navegador, como no protótipo: o preflight do\n"
        "   Tailwind põe 1.5 na raiz e isso empurra tudo que não declara a sua. */\n"
        f"{sel} {{\n  line-height: normal;\n}}\n"
    )


def troca_tokens(css):
    for velho, novo in TOKENS.items():
        css = css.replace(f"var({velho})", f"var({novo})")
    return css


def main():
    destino = sys.argv[1] if len(sys.argv) > 1 else "saida-pdp"
    os.makedirs(destino, exist_ok=True)

    css = tira_comentarios(open(os.path.join(AQUI, "estilo.css"), encoding="utf-8").read())
    nos = parse(css)

    for nome, (prefixos, kf, cruas) in GRUPOS.items():
        quer = faz_filtro(prefixos, kf, cruas)
        texto = troca_tokens("\n".join(render(filtra(nos, quer))))
        texto = cabecalho(nome) + texto
        open(os.path.join(destino, f"{nome}.css"), "w", encoding="utf-8").write(texto + "\n")
        print(f"{nome:18s} {len(texto):7d} bytes  {texto.count('{'):4d} blocos")

    # Quem ficou de fora. Regra que some sem aviso é o jeito mais silencioso
    # de a página quebrar, então isto aqui é a parte importante do relatório.
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
        if not any(
            re.match(r"\." + re.escape(p) + r"(__|--|(?![a-z0-9_-]))", s.strip()) for p in IGNORAR
        )
    )
    print(f"\n--- {len(fora)} seletor(es) sem grupo ---")
    for s in fora:
        print("   ", s.replace("\n", " ")[:110])


if __name__ == "__main__":
    main()
