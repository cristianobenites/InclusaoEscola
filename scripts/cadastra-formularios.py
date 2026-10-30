"""Cadastra/atualiza no banco (tabela formularios) todas as versões dos formulários em src/formularios/*.json.
Precisa rodar sempre que um JSON novo entrar: a tabela respostas tem chave estrangeira para (id, versao).
Uso: python scripts/cadastra-formularios.py
"""
import glob
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import migra  # noqa: E402

RAIZ = pathlib.Path(__file__).resolve().parent.parent


def s(x: str) -> str:
    return "'" + x.replace("'", "''") + "'"


def main():
    tok = migra.token_cli()
    for arq in sorted(glob.glob(str(RAIZ / "src" / "formularios" / "*.json"))):
        d = json.load(open(arq, encoding="utf-8"))
        esquema = json.dumps(d, ensure_ascii=False).replace("'", "''")
        migra.q(tok, f"""insert into formularios (id, versao, titulo, descricao, esquema)
            values ({s(d['id'])}, {d['versao']}, {s(d['titulo'])}, {s(d['finalidade'])}, '{esquema}'::jsonb)
            on conflict (id, versao) do update set esquema = excluded.esquema, titulo = excluded.titulo, descricao = excluded.descricao""")
        print(f"ok  {d['id']} v{d['versao']}")
    print(migra.q(tok, "select id, versao, titulo from formularios order by id, versao"))


if __name__ == "__main__":
    main()
