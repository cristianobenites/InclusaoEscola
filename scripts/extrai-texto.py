"""Extrai o texto dos PDFs e DOCX do acervo para a pasta texto-extraido (um .txt por documento, com <<pág N>>).
Uso: python scripts/extrai-texto.py [pasta-do-acervo]
"""
import glob, html, json, os, pathlib, re, sys, zipfile
from pypdf import PdfReader

ACERVO = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else r"C:/Users/Benites/Desktop/Vinicius/base-conhecimento")
SAIDA = ACERVO / "texto-extraido"
SAIDA.mkdir(exist_ok=True)
GRUPOS = {"Cadernos MEC": "caderno", "Artigos": "artigo", "Documentos passo a passo": "regra"}

def limpa(t):
    t = t.replace("\x00", "")
    t = re.sub(r"[ \t]+", " ", t)
    return re.sub(r"\n{3,}", "\n\n", t).strip()

inv = []
for pasta, grupo in GRUPOS.items():
    for f in sorted((ACERVO / pasta).glob("*")):
        if f.suffix.lower() == ".pdf":
            r = PdfReader(str(f))
            t = limpa("".join(f"\n\n<<pág {i+1}>>\n" + (p.extract_text() or "") for i, p in enumerate(r.pages)))
            pags = len(r.pages)
        elif f.suffix.lower() == ".docx":
            x = zipfile.ZipFile(f).read("word/document.xml").decode("utf8")
            x = re.sub(r"</w:p>", "\n", x); x = re.sub(r"<w:tab/>", "\t", x)
            t = limpa(html.unescape(re.sub(r"<[^>]+>", "", x)).replace("\ufeff", ""))
            pags = None
        else:
            continue
        g = "referencia" if f.stem.startswith("Referências") else grupo
        (SAIDA / f"{g}__{f.stem}.txt").write_text(t, encoding="utf-8")
        inv.append({"arquivo": f.name, "grupo": g, "paginas": pags, "chars": len(t)})
        print(f"{len(t):>8} {g:<10} {f.name}")
json.dump(inv, open(SAIDA / "_inventario.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(inv), "documentos")
