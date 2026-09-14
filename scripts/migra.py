"""Aplica as migrações de supabase/migrations no projeto pela Management API.

Usa o token do Supabase CLI (npx supabase login) guardado no Windows Credential Manager.
Controle: tabela public._migracoes (nome, quando).
Uso: python scripts/migra.py            -> aplica as pendentes
     python scripts/migra.py --forca 0001_base.sql -> reaplica uma
     python scripts/migra.py --sql "select 1"      -> consulta avulsa
"""
import ctypes
import ctypes.wintypes as w
import json
import pathlib
import sys
import urllib.error
import urllib.request

REF = "cmuynbifmywajjtbktpw"
RAIZ = pathlib.Path(__file__).resolve().parent.parent
PASTA = RAIZ / "supabase" / "migrations"


class _CRED(ctypes.Structure):
    _fields_ = [("Flags", w.DWORD), ("Type", w.DWORD), ("TargetName", w.LPWSTR),
                ("Comment", w.LPWSTR), ("LastWritten", ctypes.c_ulonglong),
                ("CredentialBlobSize", w.DWORD), ("CredentialBlob", ctypes.POINTER(ctypes.c_char)),
                ("Persist", w.DWORD), ("AttributeCount", w.DWORD), ("Attributes", ctypes.c_void_p),
                ("TargetAlias", w.LPWSTR), ("UserName", w.LPWSTR)]


def token_cli() -> str:
    p = ctypes.POINTER(_CRED)()
    if not ctypes.windll.advapi32.CredReadW("Supabase CLI:supabase", 1, 0, ctypes.byref(p)):
        raise SystemExit("token do Supabase CLI não encontrado: rode `npx supabase login`")
    return ctypes.string_at(p.contents.CredentialBlob, p.contents.CredentialBlobSize).decode("utf-8").strip()


def q(tok: str, sql: str):
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{REF}/database/query",
        data=json.dumps({"query": sql}).encode("utf-8"),
        headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json"})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=180).read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise SystemExit(f"falhou ({e.code}): {e.read().decode('utf-8')[:800]}")


def main():
    tok = token_cli()
    if len(sys.argv) > 2 and sys.argv[1] == "--sql":
        print(json.dumps(q(tok, sys.argv[2]), ensure_ascii=False, indent=1))
        return
    forca = sys.argv[2] if len(sys.argv) > 2 and sys.argv[1] == "--forca" else None
    q(tok, "create table if not exists public._migracoes (nome text primary key, quando timestamptz default now())")
    feitas = {r["nome"] for r in q(tok, "select nome from public._migracoes")}
    for arq in sorted(PASTA.glob("*.sql")):
        if arq.name in feitas and arq.name != forca:
            print("já aplicada:", arq.name)
            continue
        print("aplicando:", arq.name)
        q(tok, arq.read_text(encoding="utf-8"))
        q(tok, f"insert into public._migracoes (nome) values ('{arq.name}') on conflict (nome) do update set quando = now()")
    print("ok")


if __name__ == "__main__":
    main()
