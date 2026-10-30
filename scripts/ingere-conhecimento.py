"""Carrega a base de conhecimento no banco (tabelas conhecimento_fontes / conhecimento_trechos).

Fonte: a pasta com os textos extraídos (padrão: C:/Users/Benites/Desktop/Vinicius/base-conhecimento/texto-extraido),
onde cada arquivo se chama <grupo>__<título>.txt e tem marcadores "<<pág N>>".
Também carrega os arquivos .md de conhecimento/ do repositório (regras e exemplos).

Uso: python scripts/ingere-conhecimento.py            -> insere/atualiza tudo
     python scripts/ingere-conhecimento.py --so regra -> só um grupo
Embeddings: se GEMINI_API_KEY estiver no ambiente, preenche a coluna embedding (gemini-embedding-001, 768 dims).
"""
import glob
import json
import os
import pathlib
import re
import sys
import time
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import migra  # noqa: E402

RAIZ = pathlib.Path(__file__).resolve().parent.parent
PASTA_TEXTO = pathlib.Path(os.environ.get("CONHECIMENTO_TEXTO", r"C:/Users/Benites/Desktop/Vinicius/base-conhecimento/texto-extraido"))
PASTA_MD = RAIZ / "conhecimento"
PRIORIDADE = {"regra": 10, "caderno": 20, "exemplo": 30, "artigo": 40, "referencia": 60}
TAM = 1400   # caracteres por trecho
SOBRA = 200  # sobreposição entre trechos


def sql_str(s: str) -> str:
    return "'" + s.replace("\\", "\\\\").replace("'", "''") + "'"


def fatiar(texto: str):
    """Quebra por página (marcador <<pág N>>) e depois em janelas de TAM caracteres, cortando em fim de frase."""
    partes = re.split(r"<<pág (\d+)>>", texto)
    paginas = [(None, partes[0])] if partes[0].strip() else []
    for i in range(1, len(partes), 2):
        paginas.append((int(partes[i]), partes[i + 1]))
    ordem = 0
    for pag, corpo in paginas:
        corpo = re.sub(r"\s+", " ", corpo).strip()
        if len(corpo) < 80:
            continue
        ini = 0
        while ini < len(corpo):
            fim = min(len(corpo), ini + TAM)
            if fim < len(corpo):
                corte = max(corpo.rfind(". ", ini + TAM // 2, fim), corpo.rfind("? ", ini + TAM // 2, fim), corpo.rfind("! ", ini + TAM // 2, fim))
                if corte > 0:
                    fim = corte + 1
            yield ordem, pag, corpo[ini:fim].strip()
            ordem += 1
            if fim >= len(corpo):
                break
            ini = max(fim - SOBRA, ini + 1)


def embeddings(textos, chave):
    """Gemini embeddings em lote (até 100 por chamada), 768 dimensões."""
    out = []
    for i in range(0, len(textos), 50):
        lote = textos[i:i + 50]
        corpo = {"requests": [{"model": "models/gemini-embedding-001", "content": {"parts": [{"text": t}]}, "taskType": "RETRIEVAL_DOCUMENT", "outputDimensionality": 768} for t in lote]}
        req = urllib.request.Request(
            f"https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key={chave}",
            data=json.dumps(corpo).encode("utf-8"), headers={"Content-Type": "application/json"})
        for tentativa in range(4):
            try:
                r = json.loads(urllib.request.urlopen(req, timeout=120).read().decode("utf-8"))
                out.extend([e["values"] for e in r["embeddings"]])
                break
            except Exception as e:  # cota do free tier: espera e tenta de novo
                if tentativa == 3:
                    raise
                time.sleep(20 * (tentativa + 1))
        time.sleep(1.2)
    return out


def carregar(tok, grupo, titulo, arquivo, texto, chave=None, secao_por_trecho=None):
    pri = PRIORIDADE[grupo]
    fonte = migra.q(tok, f"""insert into conhecimento_fontes (grupo, titulo, arquivo, prioridade)
        values ({sql_str(grupo)}, {sql_str(titulo)}, {sql_str(arquivo)}, {pri})
        on conflict (arquivo) do update set titulo = excluded.titulo, grupo = excluded.grupo, prioridade = excluded.prioridade
        returning id""")[0]["id"]
    migra.q(tok, f"delete from conhecimento_trechos where fonte_id = '{fonte}'")
    trechos = list(fatiar(texto))
    vetores = embeddings([t for _, _, t in trechos], chave) if chave else [None] * len(trechos)
    for i in range(0, len(trechos), 40):
        linhas = []
        for (ordem, pag, t), v in zip(trechos[i:i + 40], vetores[i:i + 40]):
            sec = secao_por_trecho(t) if secao_por_trecho else None
            emb = "null" if v is None else "'" + json.dumps(v) + "'::vector"
            linhas.append(f"('{fonte}', {ordem}, {pag if pag is not None else 'null'}, {sql_str(sec) if sec else 'null'}, {sql_str(t)}, {emb})")
        migra.q(tok, "insert into conhecimento_trechos (fonte_id, ordem, pagina, secao, texto, embedding) values " + ",".join(linhas))
    migra.q(tok, f"update conhecimento_fontes set paginas = (select max(pagina) from conhecimento_trechos where fonte_id = '{fonte}') where id = '{fonte}'")
    print(f"  {grupo:<10} {len(trechos):>4} trechos  {titulo}")
    return len(trechos)


def main():
    so = sys.argv[sys.argv.index("--so") + 1] if "--so" in sys.argv else None
    chave = os.environ.get("GEMINI_API_KEY")
    print("embeddings:", "SIM (Gemini)" if chave else "não (só busca textual); exporte GEMINI_API_KEY para gerar")
    tok = migra.token_cli()
    total = 0
    for arq in sorted(PASTA_TEXTO.glob("*__*.txt")):
        grupo, titulo = arq.stem.split("__", 1)
        if so and grupo != so:
            continue
        total += carregar(tok, grupo, titulo, arq.name, arq.read_text(encoding="utf-8"), chave)
    for arq in sorted(PASTA_MD.rglob("*.md")):
        grupo = "regra" if "regras" in arq.parts else "exemplo"
        if so and grupo != so:
            continue
        titulo = arq.stem.replace("-", " ").capitalize()
        total += carregar(tok, grupo, titulo, str(arq.relative_to(RAIZ)).replace("\\", "/"), arq.read_text(encoding="utf-8"), chave)
    print("total de trechos:", total)
    print(migra.q(tok, "select grupo, count(*) as fontes, sum((select count(*) from conhecimento_trechos t where t.fonte_id = f.id)) as trechos from conhecimento_fontes f group by grupo order by 1"))


if __name__ == "__main__":
    main()
