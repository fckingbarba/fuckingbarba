import json, re, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extrai import filtra, render, seletores

nos = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "arvore.json")))

# tokens do protótipo -> tokens do app (Tailwind v4 @theme)
TOKENS = {
    "--color-bg": "--color-menta",
    "--color-accent-dark": "--color-amarelo-escuro",
    "--color-accent": "--color-amarelo",
    "--color-card-bg": "--color-papel",
    "--color-text-muted": "--color-tinta-suave",
    "--color-text": "--color-tinta",
    "--suave": "--ease-suave",
}

GRUPOS = {
    "base":       (["btn", "sr-only", "pula", "fora-de-vista", "js-revela"],
                   ["ponto-enche"],
                   ['section[id]', 'footer[id]', '[id^="produto-"]']),
    "cabecalho":  (["cabecalho", "menu", "menu-aberto"],
                   ["sacola-halo", "sacola-bate", "contador-pula"], []),
    "anuncio":    (["anuncio"], ["anuncioDesliza"], []),
    "rodape":     (["rodape"], [], []),
    "banner":     (["banner"], [], []),
    "trustbar":   (["trustbar"], [], []),
    "ofertas":    (["offers"], ["offersTick", "offersPulso"], []),
    "colecao":    (["colecao"], [], []),
    "hero":       (["hero"], [], []),
    "beneficios": (["benefits", "benefit-card"], [], []),
    "provas":     (["provas", "depo", "avaliacao", "estrelas", "carrossel", "minicard"], [], []),
    "amam":       (["amam"], ["amamCorre"], []),
    "vitrine":    (["vitrine"], [], []),
    "produto":    (["produto"], ["freteAlterna", "frete-estufa", "frete-sobe"],
                   ['[data-comprar]']),
    "sobre":      (["sobre"], [], []),
    "fechamento": (["fechamento"], [], []),
    "sacola":     (["sacolinha", "carrinho-aberto", "voo"],
                   ["item-pisca", "item-entra", "total-pula", "icone-lanca"], []),
}

def faz_filtro(prefixos, keyframes, cruas):
    def quer(sel):
        s = sel.strip()
        if s.startswith("@keyframes"):
            nome = s.split("{")[0].replace("@keyframes", "").strip()
            return nome in keyframes
        if s.startswith("@"):
            return False
        for c in cruas:
            if s.startswith(c):
                return True
        for p in prefixos:
            if re.match(r"\." + re.escape(p) + r"(?![a-z0-9_-])", s):
                return True
            if re.match(r"\." + re.escape(p) + r"(__|--)", s):
                return True
        return False
    return quer

# Raízes de seção que precisam voltar pra entrelinha padrão do navegador.
# O protótipo não tinha regra nenhuma em body: cada seção declarava a própria
# fonte e herdava `line-height: normal`. O preflight do Tailwind põe 1.5 na
# raiz, e isso engorda cada bloco que não declara a sua — 4,7px na esteira,
# 30px nas colunas do rodapé. Devolvemos o ambiente original na raiz de cada
# seção (só na raiz: em `*` isso empataria com regras do próprio protótipo).
RAIZES = {
    "anuncio": [".anuncio"],
    "cabecalho": [".cabecalho", ".menu"],
    "rodape": [".rodape"],
    "banner": [".banner"],
    "trustbar": [".trustbar"],
    "ofertas": [".offers"],
    "colecao": [".colecao"],
    "produto": [".produto"],
    "hero": [".hero"],
    "beneficios": [".benefits"],
    "provas": [".provas"],
    "amam": [".amam"],
    "vitrine": [".vitrine"],
    "sobre": [".sobre"],
    "fechamento": [".fechamento"],
    "sacola": [".sacolinha"],
}

# Pedaços cujo HTML ainda não existe na loja. Saem num arquivo `-adiado.css`
# separado, que NINGUÉM importa — é CSS de marcação que não foi escrita, e
# mandar isso pro navegador é peso puro.
#
# Não é a mesma coisa que apagar: quando a marcação nascer, é só mover as
# regras de volta (ou passar a importar o arquivo), com a ORDEM DE ORIGEM
# intacta — que é o que o recorte à mão sempre estraga.
ADIADAS = {
    # A gaveta subiu sem o cross-sell "leve junto" e sem o desfazer de
    # remoção. O bloco "Frete e prazo" (`sacolinha__entrega`, `__cep`,
    # `__opcao`, `__opcoes`) saiu daqui quando a cotação da Frenet entrou —
    # a marcação dele é `components/sacola/entrega.tsx` —, e o "leva junto"
    # (`sacolinha__leve`) em 23/09, com `components/sacola/leva-junto.tsx`.
    "sacola": [
        "sacolinha__desfazer",
        "voo",
    ],
}


def faz_adiada(nome):
    prefixos = ADIADAS.get(nome)
    if not prefixos:
        return lambda sel: False

    def adiada(sel):
        # Aqui o casamento é por prefixo cru, e não com fronteira de palavra
        # como no `faz_filtro`: os nomes já vêm completos ("sacolinha__leve") e
        # o que pende deles é sufixo com hífen — `-titulo`, `-lista`, `-add`.
        # Com fronteira, `.sacolinha__leve-add` escapava e sobrava CSS órfão.
        #
        # `sel` é UM seletor, nunca a lista: o `filtra` separa as vírgulas
        # antes. É por isso que `.sacolinha__leve-titulo, .sacolinha__entrega-
        # titulo` sai em duas regras, uma em cada arquivo.
        s = sel.strip()
        return any(s.startswith("." + p) for p in prefixos)

    return adiada


def entrelinha(nome):
    raizes = RAIZES.get(nome)
    if not raizes:
        return ""
    sel = ",\n".join(raizes)
    return (
        "/* Entrelinha padrão do navegador, como no protótipo: o preflight do\n"
        "   Tailwind põe 1.5 na raiz e isso empurra tudo que não declara a sua. */\n"
        f"{sel} {{\n  line-height: normal;\n}}\n"
    )

def troca_tokens(css):
    for velho, novo in TOKENS.items():
        css = css.replace(f"var({velho})", f"var({novo})")
    return css

destino = sys.argv[1] if len(sys.argv) > 1 else "saida"
os.makedirs(destino, exist_ok=True)
relatorio = {}
usados = set()
for nome, (prefixos, kf, cruas) in GRUPOS.items():
    quer = faz_filtro(prefixos, kf, cruas)
    adiada = faz_adiada(nome)
    sub = filtra(nos, quer)

    css = troca_tokens("\n".join(render(filtra(sub, lambda s: not adiada(s)))))
    css = entrelinha(nome) + css
    open(os.path.join(destino, f"{nome}.css"), "w").write(css + "\n")
    n = sum(1 for _ in re.finditer(r"\{", css))
    relatorio[nome] = (len(css), n)

    if ADIADAS.get(nome):
        resto = troca_tokens("\n".join(render(filtra(sub, adiada))))
        cabeca = (
            "/* NÃO IMPORTADO — a marcação destes blocos ainda não existe na loja.\n"
            "   Quando ela nascer, mova as regras pro arquivo do lado, na ordem em\n"
            "   que estão aqui. Ver ADIADAS em ferramentas/porte/agrupa.py. */\n"
        )
        open(os.path.join(destino, f"{nome}-adiado.css"), "w").write(cabeca + resto + "\n")
        print(f"{nome + '-adiado':12s} {len(resto):7d} bytes  (fora do bundle)")

# quem sobrou de fora
todos = set()
def colhe(ns):
    for n in ns:
        if n["tipo"] == "regra":
            todos.update(seletores(n["sel"]))
        elif n["tipo"] == "at":
            colhe(n["filhos"])
        else:
            todos.add(n["texto"][:40])
colhe(nos)
cobertos = set()
for nome, (prefixos, kf, cruas) in GRUPOS.items():
    quer = faz_filtro(prefixos, kf, cruas)
    cobertos |= {s for s in todos if quer(s)}
fora = sorted(todos - cobertos)
for nome, (tam, n) in relatorio.items():
    print(f"{nome:12s} {tam:7d} bytes  {n:4d} blocos")
print("\n--- seletores não atribuídos ---")
for s in fora:
    print("   ", s.replace("\n", " ")[:100])
