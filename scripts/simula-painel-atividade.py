"""Gera o roteiro do Playwright que mostra o painel /admin com dados dos casos FICTÍCIOS
(Antônio e Sofia, exemplos), sem login e sem gravar nada: as chamadas ao Supabase são
respondidas pelo próprio navegador de teste com o que foi lido aqui (somente leitura).

Uso: python scripts/simula-painel-atividade.py
     depois, no Playwright, rodar o arquivo .playwright-mcp/simulacao-painel.js
     (abre http://localhost:8090/admin; o dev server precisa estar no ar).
Serve para tirar prints do /admin sem digitar a senha de ninguém. Os nomes que aparecem são fictícios.
Ao terminar: apagar a chave sb-...-auth-token do localStorage e chamar context.unrouteAll().
"""
import base64
import json
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "scripts"))
import migra  # noqa: E402

tok = migra.token_cli()
UID = "00000000-0000-4000-8000-000000000001"
PESSOA = "Ana Souza (teste)"
EMAIL = "ana.teste@teste.inclusao.local"

cols = migra.q(tok, "select column_name from information_schema.columns where table_schema='public' and table_name='estudantes_identidade'")
chave = "estudante_id" if any(c["column_name"] == "estudante_id" for c in cols) else "id"
ex = f"(select i.{chave} as id from estudantes_identidade i where i.nome ilike '%exemplo%')"

estudantes = migra.q(tok, f"""
  select e.id, e.codigo, e.escola_id, e.turma_id, e.ano_turma,
         jsonb_build_object('nome', i.nome) as estudantes_identidade
  from estudantes e join estudantes_identidade i on i.{chave} = e.id
  where e.id in {ex}""")
escolas = migra.q(tok, f"select * from escolas where id in (select escola_id from estudantes where id in {ex})")
municipios = migra.q(tok, f"select * from municipios where id in (select municipio_id from escolas where id in (select escola_id from estudantes where id in {ex}))")
turmas = migra.q(tok, f"select * from turmas where escola_id in (select escola_id from estudantes where id in {ex})")
respostas = migra.q(tok, f"select id, estudante_id, formulario_id, status from respostas where estudante_id in {ex}")
sinteses = migra.q(tok, f"select id, estudante_id, tipo from sinteses_ia where estudante_id in {ex}")

linhas = migra.q(tok, f"""
  select a.quando, a.acao, a.alvo, a.detalhe
  from auditoria a
  where a.alvo in (select 'estudantes:' || id from {ex} x)
     or a.detalhe->>'estudante' in (select id::text from {ex} x)
     or a.alvo in (select 'respostas:' || r.id from respostas r where r.estudante_id in {ex})
     or a.alvo in (select 'sinteses_ia:' || s.id from sinteses_ia s where s.estudante_id in {ex})
     or a.alvo in (select 'feedbacks:' || f.id from feedbacks f where f.estudante_id in {ex})
     or a.acao in ('acesso.login', 'acesso.logout')
  order by a.quando desc""")

# no máximo 2 de cada ação, para o print mostrar todos os tipos
vistos: dict[str, int] = {}
atividade = []
for l in linhas:
    limite = 2 if l["acao"] in ("respostas.update", "tela.abriu_formulario") else 1
    if vistos.get(l["acao"], 0) >= limite:
        continue
    vistos[l["acao"]] = vistos.get(l["acao"], 0) + 1
    atividade.append({**l, "quem": UID, "quem_nome": PESSOA, "quem_email": EMAIL, "origem": "app"})

# ações de tela primeiro, depois as gravadas pelos gatilhos do banco
atividade.sort(key=lambda a: a["acao"].split(".")[1] in ("insert", "update", "delete"))

municipio_id = municipios[0]["id"] if municipios else None
perfil = {"id": UID, "nome": PESSOA, "papel": "superadmin", "municipio_id": municipio_id, "escola_id": None, "trocar_senha": False}
usuarios = [{"id": UID, "nome": PESSOA, "email": EMAIL, "papel": "superadmin",
             "municipio_id": municipio_id, "municipio": municipios[0]["nome"] if municipios else None, "escola_id": None, "escola": None,
             "ultimo_acesso": None, "criado_em": "2026-09-14T12:00:00Z", "bloqueado": False,
             "escolas_ids": [], "escolas_nomes": [], "trocar_senha": False}]


def b64(o):
    return base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip("=")


# sessão de mentira: só existe no navegador de teste, o Supabase de verdade nunca a recebe
jwt = ".".join([b64({"alg": "HS256", "typ": "JWT"}), b64({"sub": UID, "role": "authenticated", "aud": "authenticated", "exp": 4102444800}), "simulacao"])
usuario = {"id": UID, "aud": "authenticated", "role": "authenticated", "email": EMAIL,
           "app_metadata": {}, "user_metadata": {}, "created_at": "2026-09-14T12:00:00Z"}
sessao = {"access_token": jwt, "token_type": "bearer", "expires_in": 3600, "expires_at": 4102444800, "refresh_token": "simulacao", "user": usuario}

F = {"atividade": atividade, "estudantes": estudantes, "escolas": escolas, "municipios": municipios, "turmas": turmas,
     "respostas": respostas, "sinteses_ia": sinteses, "perfil": perfil, "usuarios": usuarios, "usuario": usuario, "sessao": sessao}

js = """async (page) => {
  const F = __F__;
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  await page.context().unrouteAll();
  await page.context().route('https://__REF__.supabase.co/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const json = (corpo, status = 200) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
    const um = (obj) => {
      const quer = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
      if (!quer) return json(obj ? [obj] : []);
      return obj ? json(obj) : json({ code: 'PGRST116', message: 'nenhuma linha', details: null, hint: null }, 406);
    };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (p.startsWith('/auth/v1/user')) return json(F.usuario);
    if (p.startsWith('/auth/v1/')) return json({});
    if (req.method() !== 'GET' && !p.startsWith('/rest/v1/rpc/')) return json([], 201); // nada é gravado
    if (p === '/rest/v1/perfis') return um(F.perfil);
    if (p === '/rest/v1/rpc/admin_atividade') return json(F.atividade);
    if (p === '/rest/v1/rpc/admin_usuarios') return json(F.usuarios);
    for (const t of ['estudantes', 'municipios', 'escolas', 'turmas']) if (p === '/rest/v1/' + t) return json(F[t]);
    for (const t of ['respostas', 'sinteses_ia']) {
      if (p === '/rest/v1/' + t) {
        const id = (url.searchParams.get('id') || '').replace('eq.', '');
        return um(F[t].find((x) => x.id === id));
      }
    }
    return json([]);
  });
  await page.goto('http://localhost:8090/entrar');
  await page.evaluate((s) => localStorage.setItem('sb-__REF__-auth-token', JSON.stringify(s)), F.sessao);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:8090/admin');
  await page.waitForTimeout(2500);
  return page.url() + ' | ' + F.atividade.length + ' registros';
}
""".replace("__F__", json.dumps(F, ensure_ascii=False)).replace("__REF__", migra.REF)

os.makedirs(os.path.join(RAIZ, ".playwright-mcp"), exist_ok=True)
destino = os.path.join(RAIZ, ".playwright-mcp", "simulacao-painel.js")
open(destino, "w", encoding="utf-8").write(js)
print(destino, len(js), "bytes;", len(atividade), "registros;", len(estudantes), "estudantes")
print(sorted(vistos.items()))
