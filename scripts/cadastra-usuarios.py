"""Cadastra o município, as escolas e os usuários a partir da planilha enviada pela rede.

A planilha (uma aba) vem em blocos, cada um com um título e as colunas Nome, Email, Escola onde atua, Telefone:
  Professores AEE / Professores Regente / Profissionais Secretaria / Diretor / Coordenador pedagógico

Regras:
  - o bloco define o papel; quem aparece em mais de um bloco fica com o papel de maior alcance;
  - quem aparece em mais de uma escola fica ligado a todas elas;
  - "Secretaria ..." não é escola: vira gestão do município (enxerga todas as escolas);
  - nomes de escola com erro de digitação ou abreviação diferente são unificados;
  - e-mail inválido NÃO é cadastrado (sai no relatório para conferir com a rede);
  - a senha inicial é o próprio e-mail (decisão do projeto em 20/11/2026); a pessoa é lembrada de trocar.
  - telefone não é gravado no sistema.

Uso:
  python scripts/cadastra-usuarios.py "C:/caminho/planilha.xlsx" --municipio "Santa Maria do Salto" --uf MG
      -> só mostra o que seria feito
  ... --aplicar
      -> grava no banco e salva "<planilha> - conferência.xlsx" ao lado da planilha (fora do git)

Pode rodar de novo: quem já existe não é recriado, só recebe as escolas que faltarem.
A planilha tem dados pessoais: nunca colocar no repositório.
"""
import argparse
import difflib
import pathlib
import re
import sys
import unicodedata

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from migra import q, token_cli  # noqa: E402

PAPEIS = [  # (trecho do título do bloco, papel) em ordem de alcance, do maior para o menor
    ("secretaria", "gestao"),
    ("diretor", "direcao"),
    ("direc", "direcao"),
    ("coordenador", "coordenacao"),
    ("coordenac", "coordenacao"),
    ("aee", "professor_aee"),
    ("regente", "professor_regente"),
]
ORDEM = ["gestao", "direcao", "coordenacao", "professor_aee", "professor_regente"]
NOME_PAPEL = {
    "gestao": "Secretaria de Educação", "direcao": "Direção da escola", "coordenacao": "Coordenação pedagógica",
    "professor_aee": "Professor(a) de AEE", "professor_regente": "Professor(a) regente",
}
EMAIL_OK = re.compile(r"^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$")
PARTICULAS = {"de", "da", "do", "das", "dos", "e"}


def sem_acento(t):
    return "".join(c for c in unicodedata.normalize("NFD", t) if unicodedata.category(c) != "Mn")


def limpo(t):
    return re.sub(r"\s+", " ", str(t or "")).strip()


def arruma_nome(t):
    t = limpo(t)
    if t.isupper():  # veio todo em maiúsculas
        t = " ".join(p.lower() if p.lower() in PARTICULAS else p.capitalize() for p in t.split(" "))
    return t


def chave_escola(t):
    k = " " + sem_acento(limpo(t)).lower() + " "
    k = k.replace(" m ", " municipal ").replace(" e.m. ", " em ").replace(".", "")
    return limpo(k)


def lit(v):
    return "null" if v is None else "'" + str(v).replace("'", "''") + "'"


def le_planilha(caminho):
    import openpyxl

    ws = openpyxl.load_workbook(caminho, data_only=True).active
    papel = None
    for linha in ws.iter_rows(values_only=True):
        cel = [limpo(c) for c in linha[:4]] + [""] * 4
        nome, email, escola, fone = cel[:4]
        if not nome:
            continue
        if not email and not escola:  # título de bloco
            chave = sem_acento(nome).lower()
            papel = next((p for trecho, p in PAPEIS if trecho in chave), None)
            if papel is None:
                raise SystemExit(f"bloco sem papel conhecido: {nome!r}")
            continue
        if sem_acento(nome).lower() == "nome":
            continue
        if papel is None:
            raise SystemExit(f"linha antes do primeiro bloco: {nome!r}")
        yield {"nome": arruma_nome(nome), "email": limpo(email).lower(), "escola": escola, "telefone": fone, "papel": papel}


def unifica_escolas(linhas):
    """Devolve {texto digitado: nome oficial}. Secretaria fica de fora (não é escola)."""
    contagem = {}
    for l in linhas:
        e = limpo(l["escola"])
        if e and "secretaria" not in sem_acento(e).lower():
            contagem[e] = contagem.get(e, 0) + 1
    # 1) mesma chave (abreviação): fica o texto mais longo
    por_chave = {}
    for texto, n in contagem.items():
        g = por_chave.setdefault(chave_escola(texto), {"n": 0, "textos": []})
        g["n"] += n
        g["textos"].append(texto)
    # 2) chaves quase iguais (erro de digitação): fica a mais frequente
    chaves = sorted(por_chave, key=lambda k: -por_chave[k]["n"])
    oficial_da_chave = {}
    for k in chaves:
        perto = difflib.get_close_matches(k, list(oficial_da_chave.values()), n=1, cutoff=0.9)
        oficial_da_chave[k] = perto[0] if perto else k
    nome_oficial = {}
    for k in set(oficial_da_chave.values()):
        textos = [t for kk, alvo in oficial_da_chave.items() if alvo == k for t in por_chave[kk]["textos"] if chave_escola(t) == k]
        nome_oficial[k] = max(textos, key=len)
    return {t: nome_oficial[oficial_da_chave[chave_escola(t)]] for t in contagem}


def monta(linhas):
    mapa = unifica_escolas(linhas)
    pessoas, problemas = {}, []
    for l in linhas:
        if not EMAIL_OK.match(l["email"]):
            problemas.append(f"E-mail inválido, NÃO cadastrado: {l['nome']} <{l['email']}> ({l['escola']})")
            continue
        p = pessoas.setdefault(l["email"], {"nome": l["nome"], "email": l["email"], "papeis": set(), "escolas": [], "telefone": l["telefone"], "nomes": set()})
        p["nomes"].add(l["nome"])
        p["papeis"].add(l["papel"])
        escola = mapa.get(limpo(l["escola"]))
        if escola and escola not in p["escolas"]:
            p["escolas"].append(escola)
    for p in pessoas.values():
        p["papel"] = min(p["papeis"], key=ORDEM.index)
        if len({sem_acento(n).lower() for n in p["nomes"]}) > 1:
            problemas.append(f"Mesmo e-mail com nomes diferentes (ficou uma conta só, como {p['nome']}): {p['email']} -> {sorted(p['nomes'])}")
        if len(p["papeis"]) > 1:
            problemas.append(f"{p['nome']} aparece em mais de um bloco {sorted(p['papeis'])}: ficou como {NOME_PAPEL[p['papel']]}")
        if p["papel"] == "gestao":
            p["escolas"] = []
        elif not p["escolas"]:
            problemas.append(f"{p['nome']} ({NOME_PAPEL[p['papel']]}) está sem escola: não vai enxergar nenhum estudante")
    return pessoas, sorted(set(mapa.values())), mapa, problemas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("planilha")
    ap.add_argument("--municipio", required=True)
    ap.add_argument("--uf", required=True)
    ap.add_argument("--aplicar", action="store_true")
    a = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    linhas = list(le_planilha(a.planilha))
    pessoas, escolas, mapa, problemas = monta(linhas)

    print(f"Município: {a.municipio} ({a.uf.upper()})")
    print(f"Linhas na planilha: {len(linhas)}  |  pessoas (e-mails válidos e distintos): {len(pessoas)}")
    print("\nEscolas:")
    for e in escolas:
        variantes = sorted(t for t, alvo in mapa.items() if alvo == e and t != e)
        print(f"  - {e}" + (f"   (também escrito: {', '.join(variantes)})" if variantes else ""))
    print("\nPor papel:")
    for papel in ORDEM:
        n = sum(1 for p in pessoas.values() if p["papel"] == papel)
        print(f"  {NOME_PAPEL[papel]:28} {n}")
    print("\nPor escola:")
    for e in escolas:
        print(f"  {e:42} {sum(1 for p in pessoas.values() if e in p['escolas'])}")
    varias = [p for p in pessoas.values() if len(p["escolas"]) > 1]
    if varias:
        print("\nEm mais de uma escola:")
        for p in varias:
            print(f"  {p['nome']}: {', '.join(p['escolas'])}")
    if problemas:
        print("\nPara conferir com a rede:")
        for x in problemas:
            print("  ! " + x)
    if not a.aplicar:
        print("\nSimulação: nada foi gravado. Para gravar, repita com --aplicar.")
        return

    tok = token_cli()
    mun = q(tok, f"select id from municipios where nome = {lit(a.municipio)} and uf = {lit(a.uf.upper())}")
    if not mun:
        mun = q(tok, f"insert into municipios (nome, uf) values ({lit(a.municipio)}, {lit(a.uf.upper())}) returning id")
    mun_id = mun[0]["id"]
    ids_escola = {}
    for e in escolas:
        r = q(tok, f"select id from escolas where municipio_id = {lit(mun_id)} and nome = {lit(e)}")
        if not r:
            r = q(tok, f"insert into escolas (municipio_id, nome) values ({lit(mun_id)}, {lit(e)}) returning id")
        ids_escola[e] = r[0]["id"]

    situacao = {}
    for p in pessoas.values():
        escolas_ids = [ids_escola[e] for e in p["escolas"]]
        arr = "array[" + ",".join(lit(x) for x in escolas_ids) + "]::uuid[]" if escolas_ids else "'{}'::uuid[]"
        ja = q(tok, f"select p.id, p.municipio_id from perfis p join auth.users u on u.id = p.id where lower(u.email) = {lit(p['email'])}")
        if ja:
            if ja[0]["municipio_id"] != mun_id:
                situacao[p["email"]] = "já existia em OUTRO município: não alterado"
                continue
            q(tok, f"insert into perfis_escolas (perfil_id, escola_id) select {lit(ja[0]['id'])}, e from unnest({arr}) e on conflict do nothing")
            situacao[p["email"]] = "já existia (escolas conferidas)"
            continue
        q(tok, f"select _cria_usuario({lit(p['email'])}, {lit(p['email'])}, {lit(p['nome'])}, {lit(p['papel'])}::papel, {lit(mun_id)}, {arr}, true)")
        situacao[p["email"]] = "criado"

    # relatório de conferência ao lado da planilha (sem senha: a senha inicial é o próprio e-mail)
    import openpyxl

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Acessos"
    ws.append(["Nome", "E-mail (também é a senha inicial)", "Papel", "Onde atua", "Telefone", "Situação"])
    for p in sorted(pessoas.values(), key=lambda x: (ORDEM.index(x["papel"]), ", ".join(x["escolas"]), sem_acento(x["nome"]).lower())):
        ws.append([p["nome"], p["email"], NOME_PAPEL[p["papel"]], ", ".join(p["escolas"]) or "Todas as escolas do município", p["telefone"], situacao[p["email"]]])
    for col, largura in zip("ABCDEF", (38, 44, 26, 52, 18, 30)):
        ws.column_dimensions[col].width = largura
    if problemas:
        ws2 = wb.create_sheet("Para conferir")
        for x in problemas:
            ws2.append([x])
        ws2.column_dimensions["A"].width = 140
    origem = pathlib.Path(a.planilha)
    saida = origem.with_name(origem.stem + " - conferência.xlsx")
    wb.save(saida)

    criados = sum(1 for v in situacao.values() if v == "criado")
    print(f"\nGravado: {criados} usuário(s) criado(s), {len(situacao) - criados} já existia(m). Relatório: {saida}")


if __name__ == "__main__":
    main()
