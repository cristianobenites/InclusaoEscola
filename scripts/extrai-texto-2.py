"""Extrai o texto do segundo acervo (recebido em 07/11/2026: curso Decola AEE e modelos de
documentos de preenchimento) para `<acervo>/texto-extraido`, um .txt por documento no formato
`grupo__titulo.txt` com marcas <<pág N>> (PDF e PPTX) que o ingere-conhecimento.py entende.

Grupos novos (migração 0010): curso (roteiros, slides e projeto pedagógico da formação do Instituto,
prioridade 15) e modelo (PDI, Estudo de Caso, Anedotário, Protocolo de Conduta, Portage, prompts;
prioridade 25). Vídeos (.mp4) não são lidos. Documentos com dados de criança real são pulados.

Uso: python scripts/extrai-texto-2.py [pasta-do-acervo]
"""
import html
import json
import pathlib
import re
import sys
import unicodedata
import zipfile

import pymupdf
from openpyxl import load_workbook
from pptx import Presentation

ACERVO = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else r"C:/Users/Benites/Desktop/Vinicius/base-conhecimento-2")
SAIDA = ACERVO / "texto-extraido"
SAIDA.mkdir(exist_ok=True)

# nome do arquivo (sem extensão, em minúsculas) → (grupo, título legível). O que não estiver aqui é ignorado.
MAPA = {
    "decola aee — trilha professor de aee": ("curso", "Decola AEE - Trilha do Professor de AEE (roteiro e atividades, 4 h)"),
    "decola_aee_—_professor_de_aee_-_4_horas_assíncronas": ("curso", "Decola AEE - Trilha do Professor de AEE (slides)"),
    "arquitetura assíncrono": ("curso", "Curso Profissional de Apoio na Prática - Arquitetura do curso assíncrono"),
    "projeto pedagógico enviado mec": ("curso", "Curso Profissional de Apoio na Prática - Projeto Pedagógico enviado ao MEC"),
    "slides assincrono": ("curso", "Curso Profissional de Apoio na Prática - Slides do Módulo 1"),
    "relatorio_modulos_1_a_8": ("curso", "Curso Profissional de Apoio na Prática - Relatório dos módulos 1 a 8"),
    "roteiros_teleprompter_modulos_1_a_4.md": ("curso", "Curso Profissional de Apoio na Prática - Aulas dos módulos 1 a 4 (roteiros)"),
    "roteiros_teleprompter_modulos_5_a_8.md": ("curso", "Curso Profissional de Apoio na Prática - Aulas dos módulos 5 a 8 (roteiros)"),
    "módulo 1 - introdução": ("curso", "Curso Domine o PEI - Módulo 1, Introdução"),
    "pdi branco educ. infantil": ("modelo", "Modelo de PDI - Educação Infantil"),
    "pdi branco ensino fundamental": ("modelo", "Modelo de PDI - Ensino Fundamental"),
    "pdi branco ensino médiol": ("modelo", "Modelo de PDI - Ensino Médio"),
    "estrutura do plano de desenvolvimento individual (pdi)": ("modelo", "Estrutura do Plano de Desenvolvimento Individual (PDI)"),
    "estudo de caso": ("modelo", "Modelo de Estudo de Caso"),
    "anedotario": ("modelo", "Modelo de Anedotário (Rota do PEI/PDI)"),
    "protocolo de conduta": ("modelo", "Modelo de Protocolo de Conduta (AEE)"),
    "580 completo portage": ("modelo", "Inventário Portage completo (580 itens)"),
    "motor portage": ("modelo", "Inventário Portage - área Motora"),
    "linguagem portage": ("modelo", "Inventário Portage - área Linguagem"),
    "autocuidados portage": ("modelo", "Inventário Portage - área Autocuidados"),
    "cognição portage": ("modelo", "Inventário Portage - área Cognição"),
    "socialização portage": ("modelo", "Inventário Portage - área Socialização"),
    "tabela modelo portage": ("modelo", "Inventário Portage - tabela modelo de registro"),
    "prompt gerar objetivos educacionais": ("modelo", "Prompts para gerar objetivos educacionais, habilidades BNCC e estratégias (PEI)"),
}
PULAR = {
    "camila abrão": "roteiro por instrutora; o conteúdo já está nos cadernos de teleprompter (módulos 1 a 8)",
    "silvia ferraresi": "roteiro por instrutora; o conteúdo já está nos cadernos de teleprompter (módulos 1 a 8)",
    "vanessa cologis": "roteiro por instrutora; o conteúdo já está nos cadernos de teleprompter (módulos 1 a 8)",
    "roteiros idp sp": "só a distribuição de módulos por instrutora",
    "1_domine-o-pei": "PDF só com imagens (sem texto extraível); precisaria de OCR",
    "nossa-jornada-de-hoje-5h": "PDF só com imagens (sem texto extraível)",
    "protocolo de conduta preenchido": "exemplo preenchido com dados de saúde de uma criança real (ainda que sem nome): não entra na base",
    "agenda_de_gravacao_mmproduction_corrigida": "agenda de gravação (logística), sem conteúdo pedagógico",
}


def limpa(t: str) -> str:
    t = t.replace("\x00", "").replace("\ufeff", "")
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r" *\n *", "\n", t)
    return re.sub(r"\n{3,}", "\n\n", t).strip()


def de_pdf(f: pathlib.Path):
    doc = pymupdf.open(str(f))
    partes = [f"\n\n<<pág {i + 1}>>\n" + (pg.get_text() or "") for i, pg in enumerate(doc)]
    return limpa("".join(partes)), len(doc)


def de_docx(f: pathlib.Path):
    x = zipfile.ZipFile(f).read("word/document.xml").decode("utf8")
    x = re.sub(r"<w:tab/>", "\t", x)
    x = re.sub(r"<w:br[^>]*/>", "\n", x)
    x = re.sub(r"</w:p>", "\n", x)
    x = re.sub(r"</w:tc>", "\t", x)  # células de tabela
    x = re.sub(r"</w:tr>", "\n", x)
    t = html.unescape(re.sub(r"<[^>]+>", "", x))
    return limpa(t), None


def de_pptx(f: pathlib.Path):
    pres = Presentation(str(f))
    partes = []
    for i, slide in enumerate(pres.slides, 1):
        linhas = []
        for sh in slide.shapes:
            if sh.has_text_frame:
                linhas += [p.text for p in sh.text_frame.paragraphs if p.text.strip()]
            if getattr(sh, "has_table", False) and sh.has_table:
                for row in sh.table.rows:
                    linhas.append("\t".join(c.text for c in row.cells))
        if slide.has_notes_slide and slide.notes_slide.notes_text_frame:
            n = slide.notes_slide.notes_text_frame.text.strip()
            if n:
                linhas.append("Notas: " + n)
        partes.append(f"\n\n<<pág {i}>>\n" + "\n".join(linhas))
    return limpa("".join(partes)), len(pres.slides)


def de_xlsx(f: pathlib.Path):
    wb = load_workbook(str(f), read_only=True, data_only=True)
    partes = []
    for ws in wb.worksheets:
        partes.append(f"\n\n## Planilha: {ws.title}\n")
        for row in ws.iter_rows(values_only=True):
            cels = [str(c).strip() for c in row if c is not None and str(c).strip()]
            if cels:
                partes.append("\t".join(cels))
    return limpa("\n".join(partes)), None


LEITORES = {".pdf": de_pdf, ".docx": de_docx, ".pptx": de_pptx, ".xlsx": de_xlsx}


def main():
    inv = []
    vistos = set()
    for f in sorted(ACERVO.rglob("*")):
        if not f.is_file() or f.suffix.lower() not in LEITORES or "texto-extraido" in f.parts:
            continue
        chave = unicodedata.normalize("NFC", f.stem).strip().lower()  # nomes vindos do Drive podem vir decompostos
        if chave in PULAR:
            print(f"  pulado   {f.name}: {PULAR[chave]}")
            continue
        if chave not in MAPA:
            print(f"  SEM MAPA {f.name} (adicione em MAPA ou PULAR)")
            continue
        if chave in vistos:
            continue
        vistos.add(chave)
        grupo, titulo = MAPA[chave]
        texto, pags = LEITORES[f.suffix.lower()](f)
        if len(texto) < 200:
            print(f"  vazio    {f.name} ({len(texto)} caracteres); não gerado")
            continue
        nome = re.sub(r"[\\/:*?\"<>|]", "-", titulo)
        (SAIDA / f"{grupo}__{nome}.txt").write_text(texto, encoding="utf-8")
        inv.append({"arquivo": str(f.relative_to(ACERVO)), "grupo": grupo, "titulo": titulo, "paginas": pags, "chars": len(texto)})
        print(f"{len(texto):>8} {grupo:<7} {titulo}")
    json.dump(inv, open(SAIDA / "_inventario.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(len(inv), "documentos extraídos em", SAIDA)


if __name__ == "__main__":
    main()
