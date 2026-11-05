"""Gera embeddings (gemini-embedding-001, 768 dims) para os trechos da base de conhecimento
que ainda não têm, lendo o texto direto do banco (não precisa dos arquivos originais).

Uso: GEMINI_API_KEY=... python scripts/gera-embeddings.py
"""
import json
import os
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(__file__))
import migra  # noqa: E402

LOTE = 50


def embeddings(textos, chave):
    corpo = {"requests": [{"model": "models/gemini-embedding-001", "content": {"parts": [{"text": t}]}, "taskType": "RETRIEVAL_DOCUMENT", "outputDimensionality": 768} for t in textos]}
    req = urllib.request.Request("https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents",
                                 data=json.dumps(corpo).encode("utf-8"), headers={"Content-Type": "application/json", "x-goog-api-key": chave})
    for tentativa in range(8):
        try:
            r = json.loads(urllib.request.urlopen(req, timeout=120).read().decode("utf-8"))
            return [e["values"] for e in r["embeddings"]]
        except Exception as e:
            if tentativa == 7:
                raise
            espera = 30 * (tentativa + 1)  # cota por minuto do plano gratuito
            print(f"  espera {espera}s (cota):", str(e)[:80], flush=True); time.sleep(espera)


def main():
    chave = os.environ.get("GEMINI_API_KEY")
    if not chave:
        raise SystemExit("defina GEMINI_API_KEY no ambiente")
    tok = migra.token_cli()
    feitos = 0
    while True:
        linhas = migra.q(tok, f"select id, texto from conhecimento_trechos where embedding is null order by id limit {LOTE}")
        if not linhas:
            break
        vetores = embeddings([l["texto"] for l in linhas], chave)
        valores = ",".join(f"({l['id']}, '{json.dumps(v)}'::vector)" for l, v in zip(linhas, vetores))
        migra.q(tok, f"update conhecimento_trechos t set embedding = v.e from (values {valores}) as v(id, e) where t.id = v.id")
        feitos += len(linhas)
        print(f"  {feitos} trechos com embedding", flush=True)
        time.sleep(3.0)
    print(migra.q(tok, "select count(*) total, count(embedding) com_embedding from conhecimento_trechos"))


if __name__ == "__main__":
    main()
