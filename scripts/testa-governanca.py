"""Prova as regras de acesso (migração 0013) com pessoas FICTÍCIAS de cada papel.

Cria dois municípios de teste ("ZZ Teste de Governança" e "ZZ Outro Município"), escolas, usuários
e estudantes; consulta o banco como cada pessoa (mesma RLS do app) e confere o que ela enxerga
e o que ela consegue alterar. No fim apaga tudo o que criou.

Uso: python scripts/testa-governanca.py
Sai com código 1 se alguma regra falhar.
"""
import json
import pathlib
import secrets
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from migra import q, token_cli  # noqa: E402

TOK = token_cli()
DOMINIO = "teste-governanca.inclusao.local"
falhas = []
linhas = []


def sql(texto):
    return q(TOK, texto)


def lit(v):
    return "null" if v is None else "'" + str(v).replace("'", "''") + "'"


def como(uid, consulta):
    r = sql(f"select _teste.como({lit(uid)}, {lit(consulta)}) as r")[0]["r"]
    return r


def faz(uid, comando):
    return sql(f"select _teste.faz({lit(uid)}, {lit(comando)}) as r")[0]["r"]


def confere(nome, obtido, esperado):
    ok = obtido == esperado
    linhas.append(("OK   " if ok else "FALHA") + " " + nome + ("" if ok else f"\n        esperado: {esperado}\n        obtido:   {obtido}"))
    if not ok:
        falhas.append(nome)


def limpa():
    # apaga só o que este teste criou (inclusive os registros de auditoria gerados por ele)
    sql(f"""
    do $$
    declare ids uuid[];
    begin
      select coalesce(array_agg(x), '{{}}') into ids from (
        select id as x from auth.users where email like '%@{DOMINIO}'
        union all select id from municipios where nome like 'ZZ %' and uf = 'ZZ'
        union all select s.id from escolas s join municipios m on m.id = s.municipio_id where m.nome like 'ZZ %' and m.uf = 'ZZ'
        union all select e.id from estudantes e join escolas s on s.id = e.escola_id join municipios m on m.id = s.municipio_id where m.nome like 'ZZ %' and m.uf = 'ZZ'
      ) t;
      delete from estudantes where id = any(ids);
      delete from auth.users where id = any(ids);
      delete from municipios where id = any(ids);
      delete from auditoria a where a.quem = any(ids)
        or exists (select 1 from unnest(ids) x where a.alvo like '%' || x::text || '%' or a.detalhe::text like '%' || x::text || '%');
    end $$;
    drop schema if exists _teste cascade;
    """)


def main():
    limpa()
    sql("""
    create schema if not exists _teste;
    revoke all on schema _teste from public, anon, authenticated;
    create or replace function _teste.como(p_uid uuid, p_sql text) returns jsonb language plpgsql as $f$
    declare r jsonb;
    begin
      perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
      perform set_config('request.jwt.claim.sub', p_uid::text, true);
      set local role authenticated;
      begin
        execute 'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (' || p_sql || ') t' into r;
      exception when others then
        r := jsonb_build_object('erro', sqlerrm);
      end;
      reset role;
      return r;
    end $f$;
    create or replace function _teste.faz(p_uid uuid, p_sql text) returns jsonb language plpgsql as $f$
    declare r jsonb;
    begin
      perform set_config('request.jwt.claims', jsonb_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
      perform set_config('request.jwt.claim.sub', p_uid::text, true);
      set local role authenticated;
      begin
        execute 'with _x as (' || p_sql || ' returning *) select coalesce(jsonb_agg(to_jsonb(_x)), ''[]''::jsonb) from _x' into r;
      exception when others then
        r := jsonb_build_object('erro', sqlerrm);
      end;
      reset role;
      return r;
    end $f$;
    """)

    base = sql("""
    with m1 as (insert into municipios (nome, uf) values ('ZZ Teste de Governança', 'ZZ') returning id),
         m2 as (insert into municipios (nome, uf) values ('ZZ Outro Município', 'ZZ') returning id),
         a as (insert into escolas (municipio_id, nome) select id, 'ZZ Escola A' from m1 returning id),
         b as (insert into escolas (municipio_id, nome) select id, 'ZZ Escola B' from m1 returning id),
         c as (insert into escolas (municipio_id, nome) select id, 'ZZ Escola C' from m2 returning id)
    select (select id from m1) m1, (select id from m2) m2, (select id from a) a, (select id from b) b, (select id from c) c
    """)[0]
    M1, M2, A, B, C = base["m1"], base["m2"], base["a"], base["b"], base["c"]

    def usuario(apelido, papel, municipio, escolas):
        arr = "array[" + ",".join(lit(e) for e in escolas) + "]::uuid[]" if escolas else "'{}'::uuid[]"
        return sql(
            f"select _cria_usuario({lit(apelido + '@' + DOMINIO)}, {lit(secrets.token_urlsafe(18))}, {lit('ZZ ' + apelido)}, "
            f"{lit(papel)}::papel, {lit(municipio)}, {arr}) as id"
        )[0]["id"]

    u = {
        "secretaria": usuario("secretaria", "gestao", M1, []),
        "direcao_a": usuario("direcao-a", "direcao", M1, [A]),
        "coord_a": usuario("coord-a", "coordenacao", M1, [A]),
        "aee_ab": usuario("aee-ab", "professor_aee", M1, [A, B]),
        "regente1_a": usuario("regente1-a", "professor_regente", M1, [A]),
        "regente2_a": usuario("regente2-a", "professor_regente", M1, [A]),
        "regente3_b": usuario("regente3-b", "professor_regente", M1, [B]),
        "sem_escola": usuario("sem-escola", "professor_regente", M1, []),
        "secretaria_outro": usuario("secretaria-outro", "gestao", M2, []),
    }

    # cada pessoa cadastra o próprio estudante (testa a regra de inserção)
    def cadastra(quem, escola, nome):
        r = faz(u[quem], f"insert into estudantes (escola_id) values ({lit(escola)})")
        if isinstance(r, dict):
            return r
        eid = r[0]["id"]
        faz(u[quem], f"insert into estudantes_identidade (estudante_id, nome) values ({lit(eid)}, {lit(nome)})")
        return eid

    s1 = cadastra("regente1_a", A, "ZZ Estudante 1")
    s2 = cadastra("regente2_a", A, "ZZ Estudante 2")
    s3 = cadastra("regente3_b", B, "ZZ Estudante 3")
    s4 = cadastra("secretaria_outro", C, "ZZ Estudante 4")
    nomes = {s1: "E1", s2: "E2", s3: "E3", s4: "E4"}
    confere("cada pessoa consegue cadastrar estudante na própria escola", all(isinstance(x, str) for x in (s1, s2, s3, s4)), True)

    form = sql("select id, versao from formularios where id = 'ficha-observacao' order by versao desc limit 1")[0]
    faz(u["regente1_a"], f"insert into respostas (estudante_id, formulario_id, formulario_versao, dados) values ({lit(s1)}, {lit(form['id'])}, {form['versao']}, '{{\"teste\": true}}')")

    def ve(quem):
        r = como(u[quem], "select e.id from estudantes e where e.escola_id in (" + ",".join(lit(x) for x in (A, B, C)) + ")")
        return sorted(nomes.get(x["id"], "?") for x in r) if isinstance(r, list) else r

    def conta(quem, consulta):
        r = como(u[quem], consulta)
        return r[0]["n"] if isinstance(r, list) else r

    # --- 1. quem enxerga quais estudantes
    esperado = {
        "regente1_a": ["E1"], "regente2_a": ["E2"], "regente3_b": ["E3"], "sem_escola": [],
        "direcao_a": ["E1", "E2"], "coord_a": ["E1", "E2"], "aee_ab": ["E1", "E2", "E3"],
        "secretaria": ["E1", "E2", "E3"], "secretaria_outro": ["E4"],
    }
    for quem, esp in esperado.items():
        confere(f"estudantes visíveis para {quem}", ve(quem), esp)

    # --- 2. registros seguem o estudante
    confere("regente 2 NÃO lê respostas do estudante do regente 1", conta("regente2_a", f"select count(*) n from respostas where estudante_id = {lit(s1)}"), 0)
    confere("regente 2 NÃO lê o nome do estudante do regente 1", conta("regente2_a", f"select count(*) n from estudantes_identidade where estudante_id = {lit(s1)}"), 0)
    confere("AEE da escola lê as respostas do estudante", conta("aee_ab", f"select count(*) n from respostas where estudante_id = {lit(s1)}"), 1)
    confere("regente da outra escola NÃO lê", conta("regente3_b", f"select count(*) n from respostas where estudante_id = {lit(s1)}"), 0)
    confere("Secretaria de outro município NÃO lê", conta("secretaria_outro", f"select count(*) n from respostas where estudante_id = {lit(s1)}"), 0)

    # --- 3. equipe do estudante
    r = como(u["regente1_a"], f"select equipe_adiciona({lit(s1)}, {lit(u['regente3_b'])})::text as r")
    confere("não dá para incluir na equipe alguém de outra escola", isinstance(r, dict) and "erro" in r, True)
    r = como(u["regente2_a"], f"select equipe_adiciona({lit(s1)}, {lit(u['regente2_a'])})::text as r")
    confere("ninguém se inclui sozinho na equipe de um estudante que não vê", isinstance(r, dict) and "erro" in r, True)
    como(u["regente1_a"], f"select equipe_adiciona({lit(s1)}, {lit(u['regente2_a'])})::text as r")
    confere("incluído na equipe, o regente 2 passa a ver o estudante", ve("regente2_a"), ["E1", "E2"])
    confere("e passa a ler as respostas dele", conta("regente2_a", f"select count(*) n from respostas where estudante_id = {lit(s1)}"), 1)
    eq = como(u["regente1_a"], f"select nome, motivo from equipe_do_estudante({lit(s1)}) order by nome")
    confere("lista 'quem acompanha' traz AEE, coordenação, direção, quem cadastrou e a equipe",
            sorted((x["nome"], x["motivo"]) for x in eq) if isinstance(eq, list) else eq,
            sorted([("ZZ aee-ab", "funcao"), ("ZZ coord-a", "funcao"), ("ZZ direcao-a", "funcao"), ("ZZ regente1-a", "cadastrou"), ("ZZ regente2-a", "equipe")]))
    como(u["direcao_a"], f"select equipe_remove({lit(s1)}, {lit(u['regente2_a'])})::text as r")
    confere("retirado da equipe pela direção, deixa de ver", ve("regente2_a"), ["E2"])

    # --- 4. o que ninguém consegue fazer
    r = faz(u["regente2_a"], f"insert into estudantes (escola_id) values ({lit(B)})")
    confere("regente não cadastra estudante em escola onde não atua", isinstance(r, dict) and "erro" in r, True)
    r = faz(u["regente1_a"], f"update perfis set papel = 'superadmin' where id = {lit(u['regente1_a'])}")
    confere("ninguém altera o próprio papel", isinstance(r, dict) and "erro" in r, True)
    r = faz(u["regente1_a"], f"update perfis set municipio_id = {lit(M2)} where id = {lit(u['regente1_a'])}")
    confere("ninguém altera o próprio município", isinstance(r, dict) and "erro" in r, True)
    r = faz(u["regente1_a"], f"update perfis set nome = 'ZZ regente1-a' where id = {lit(u['regente1_a'])}")
    confere("a pessoa altera o próprio nome", isinstance(r, list) and len(r) == 1, True)
    r = faz(u["regente1_a"], f"insert into perfis_escolas (perfil_id, escola_id) values ({lit(u['regente1_a'])}, {lit(B)})")
    confere("ninguém se liga sozinho a outra escola", isinstance(r, dict) and "erro" in r, True)
    r = faz(u["regente1_a"], f"insert into estudantes_equipe (estudante_id, perfil_id) values ({lit(s2)}, {lit(u['regente1_a'])})")
    confere("ninguém se coloca direto na equipe de outro estudante", isinstance(r, dict) and "erro" in r, True)
    r = como(u["direcao_a"], f"select admin_cria_usuario('x@{DOMINIO}', 'senha-de-teste-123', 'ZZ x', 'gestao', {lit(M1)})::text as r")
    confere("direção não cria usuário", isinstance(r, dict) and "erro" in r, True)
    r = como(u["secretaria"], f"select admin_cria_usuario('y@{DOMINIO}', 'senha-de-teste-123', 'ZZ y', 'professor_regente', {lit(M2)})::text as r")
    confere("Secretaria não cria usuário em outro município", isinstance(r, dict) and "erro" in r, True)

    # --- 5. o que cada um enxerga de pessoas, escolas e auditoria
    confere("regente só vê o próprio perfil", conta("regente1_a", "select count(*) n from perfis"), 1)
    confere("regente só vê a própria escola", conta("regente1_a", "select count(*) n from escolas"), 1)
    confere("AEE vê as duas escolas em que atua", conta("aee_ab", "select count(*) n from escolas"), 2)
    confere("Secretaria vê as escolas do município (e só elas)", conta("secretaria", "select count(*) n from escolas"), 2)
    confere("Secretaria vê os perfis do município (e só eles)", conta("secretaria", "select count(*) n from perfis"), 8)
    confere("Secretaria lista os usuários do município no painel", conta("secretaria", "select count(*) n from admin_usuarios()"), 8)
    confere("direção não lista usuários no painel", conta("direcao_a", "select count(*) n from admin_usuarios()"), 0)
    confere("coordenação não lê a auditoria", conta("coord_a", "select count(*) n from auditoria"), 0)
    confere("Secretaria de outro município não lê a auditoria deste", conta("secretaria_outro", f"select count(*) n from auditoria where quem = {lit(u['regente1_a'])}"), 0)

    # --- 6. saída da escola: perde o acesso na hora
    sql(f"delete from perfis_escolas where perfil_id = {lit(u['regente1_a'])}")
    confere("quem deixa a escola deixa de ver, mesmo tendo cadastrado o estudante", ve("regente1_a"), [])

    # --- 7. sem login, nenhuma função responde
    r = sql("""select count(*) n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege('anon', p.oid, 'execute')""")[0]["n"]
    confere("nenhuma função do banco pode ser chamada sem login", r, 0)
    r = sql("select has_function_privilege('authenticated', '_cria_usuario(text,text,text,papel,uuid,uuid[],boolean)', 'execute') as x")[0]["x"]
    confere("a criação interna de usuário não é chamável pelo app", r, False)


if __name__ == "__main__":
    try:
        main()
    finally:
        limpa()
    sys.stdout.reconfigure(encoding="utf-8")
    print("\n".join(linhas))
    print(f"\n{len(linhas) - len(falhas)} de {len(linhas)} regras conferidas." + (" FALHAS: " + json.dumps(falhas, ensure_ascii=False) if falhas else " Tudo certo."))
    sys.exit(1 if falhas else 0)
