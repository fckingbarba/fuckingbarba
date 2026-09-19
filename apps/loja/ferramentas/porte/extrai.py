"""Extrai regras de CSS do protótipo preservando @media/@supports e keyframes."""
import re, sys, json

def le_css(caminho):
    h = open(caminho, encoding="utf-8").read()
    # Comentários de HTML primeiro: o protótipo tem um <style> de exemplo
    # dentro de um <!-- ... --> e sem isso ele entra no CSS como lixo.
    h = re.sub(r"<!--.*?-->", "", h, flags=re.S)
    partes = re.findall(r"<style[^>]*>(.*?)</style>", h, re.S)
    return "\n".join(partes)

def tira_comentarios(css):
    return re.sub(r"/\*.*?\*/", "", css, flags=re.S)

def parse(css, i=0, fim=None):
    """Devolve lista de nós: {'tipo':'regra','sel':..,'corpo':..} ou
    {'tipo':'at','prelude':..,'filhos':[..]} ou {'tipo':'at-simples','texto':..}"""
    if fim is None:
        fim = len(css)
    nos = []
    buf = ""
    while i < fim:
        c = css[i]
        if c == "{":
            prelude = buf.strip()
            buf = ""
            # acha o fechamento correspondente
            prof = 1
            j = i + 1
            while j < fim and prof:
                if css[j] == "{": prof += 1
                elif css[j] == "}": prof -= 1
                j += 1
            corpo = css[i+1:j-1]
            if prelude.startswith("@") and not prelude.startswith("@font-face") and not prelude.startswith("@page"):
                nome = prelude.split()[0]
                if nome in ("@media", "@supports", "@layer", "@container"):
                    nos.append({"tipo":"at","prelude":prelude,"filhos":parse(corpo)})
                else:
                    nos.append({"tipo":"bruto","texto":prelude + "{" + corpo + "}"})
            else:
                nos.append({"tipo":"regra","sel":prelude,"corpo":corpo.strip()})
            i = j
        elif c == ";" and buf.strip().startswith("@"):
            nos.append({"tipo":"bruto","texto":buf.strip()+";"})
            buf = ""
            i += 1
        else:
            buf += c
            i += 1
    return nos

def seletores(sel):
    return [s.strip() for s in sel.split(",") if s.strip()]

def filtra(nos, quer):
    """quer(sel) -> bool para um seletor individual."""
    saida = []
    for n in nos:
        if n["tipo"] == "regra":
            sels = [s for s in seletores(n["sel"]) if quer(s)]
            if sels:
                saida.append({"tipo":"regra","sel":",\n".join(sels),"corpo":n["corpo"]})
        elif n["tipo"] == "at":
            filhos = filtra(n["filhos"], quer)
            if filhos:
                saida.append({"tipo":"at","prelude":n["prelude"],"filhos":filhos})
        elif n["tipo"] == "bruto":
            if quer(n["texto"]):
                saida.append(n)
    return saida

def divide_decls(corpo):
    """Divide em `;` que não estejam dentro de aspas ou parênteses —
    senão um url('data:image/svg+xml;utf8,…') vira duas declarações."""
    saida, buf, prof, aspas = [], "", 0, None
    for c in corpo:
        if aspas:
            buf += c
            if c == aspas:
                aspas = None
            continue
        if c in "\"'":
            aspas = c; buf += c; continue
        if c == "(":
            prof += 1
        elif c == ")":
            prof -= 1
        if c == ";" and prof == 0:
            if buf.strip(): saida.append(buf.strip())
            buf = ""
            continue
        buf += c
    if buf.strip(): saida.append(buf.strip())
    return saida

def render(nos, ident=0):
    p = "  " * ident
    out = []
    for n in nos:
        if n["tipo"] == "regra":
            decls = divide_decls(n["corpo"])
            corpo = "".join(f"\n{p}  {d};" for d in decls)
            out.append(f"{p}{n['sel']} {{{corpo}\n{p}}}")
        elif n["tipo"] == "at":
            out.append(f"{p}{n['prelude']} {{\n" + "\n".join(render(n['filhos'], ident+1)) + f"\n{p}}}")
        else:
            out.append(p + n["texto"])
    return out

if __name__ == "__main__":
    css = tira_comentarios(le_css(sys.argv[1]))
    nos = parse(css)
    print(f"{len(nos)} nós de topo", file=sys.stderr)
    json.dump(nos, open(sys.argv[2], "w"))
