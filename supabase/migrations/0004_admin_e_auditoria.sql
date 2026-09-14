-- Painel de administração (usuários) e auditoria automática de tudo que acontece no banco.

-- 1. e-mail no perfil (para listar usuários sem tocar no auth pelo front)
alter table perfis add column if not exists email text;
update perfis p set email = u.email from auth.users u where u.id = p.id and p.email is null;

create or replace function cria_perfil() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into perfis (id, nome, papel, municipio_id, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'papel')::papel, 'professor_regente'),
    (select id from municipios order by criado_em limit 1),
    new.email
  ) on conflict (id) do update set email = excluded.email;
  return new;
end $$;

-- 2. auditoria automática por gatilho (quem, o quê, antes/depois)
create or replace function registra_auditoria() returns trigger language plpgsql security definer set search_path = public as $$
declare
  linha jsonb;
  alvo text;
begin
  linha := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  alvo := tg_table_name || ':' || coalesce(linha->>'id', linha->>'estudante_id', '');
  insert into auditoria (quem, acao, alvo, detalhe)
  values (
    auth.uid(),
    tg_table_name || '.' || lower(tg_op),
    alvo,
    jsonb_build_object(
      'tabela', tg_table_name,
      'antes', case when tg_op <> 'INSERT' then to_jsonb(old) end,
      'depois', case when tg_op <> 'DELETE' then to_jsonb(new) end
    )
  );
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['municipios','escolas','turmas','perfis','estudantes','estudantes_identidade','respostas','sinteses_ia','estudos_caso'] loop
    execute format('drop trigger if exists auditoria_%s on %I', t, t);
    execute format('create trigger auditoria_%s after insert or update or delete on %I for each row execute function registra_auditoria()', t, t);
  end loop;
end $$;

create index if not exists auditoria_quando_idx on auditoria (quando desc);
create index if not exists auditoria_quem_idx on auditoria (quem);

-- 3. quem pode administrar o quê
create or replace function admin_pode(mun uuid) returns boolean language sql stable security definer set search_path = public as $$
  select sou_superadmin() or (meu_papel() = 'gestao' and mun is not distinct from meu_municipio())
$$;

-- 4. lista de usuários (com último acesso e bloqueio, que ficam no auth)
create or replace function admin_usuarios()
returns table (
  id uuid, nome text, email text, papel text, municipio_id uuid, municipio text, escola_id uuid, escola text,
  ultimo_acesso timestamptz, criado_em timestamptz, bloqueado boolean
) language sql stable security definer set search_path = public as $$
  select p.id, p.nome, coalesce(p.email, u.email), p.papel::text, p.municipio_id, m.nome, p.escola_id, s.nome,
         u.last_sign_in_at, p.criado_em, coalesce(u.banned_until > now(), false)
  from perfis p
  join auth.users u on u.id = p.id
  left join municipios m on m.id = p.municipio_id
  left join escolas s on s.id = p.escola_id
  where sou_superadmin() or (meu_papel() = 'gestao' and p.municipio_id = meu_municipio())
  order by p.criado_em desc
$$;

-- 5. criar usuário (mesmo caminho do GoTrue: bcrypt em auth.users + identidade e-mail)
create or replace function admin_cria_usuario(p_email text, p_senha text, p_nome text, p_papel papel, p_municipio uuid, p_escola uuid default null)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare uid uuid;
begin
  if not admin_pode(p_municipio) then raise exception 'sem permissão para criar usuário neste município'; end if;
  if p_papel = 'superadmin' and not sou_superadmin() then raise exception 'só um administrador da plataforma cria outro'; end if;
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'e-mail inválido'; end if;
  if length(coalesce(p_senha, '')) < 8 then raise exception 'a senha precisa ter pelo menos 8 caracteres'; end if;
  if exists (select 1 from auth.users where lower(email) = lower(p_email)) then raise exception 'já existe usuário com este e-mail'; end if;

  uid := gen_random_uuid();
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', lower(p_email),
    crypt(p_senha, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('nome', p_nome, 'papel', p_papel::text), now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', lower(p_email), 'email_verified', true), 'email', null, now(), now());

  insert into perfis (id, nome, papel, municipio_id, escola_id, email)
  values (uid, p_nome, p_papel, p_municipio, p_escola, lower(p_email))
  on conflict (id) do update set nome = excluded.nome, papel = excluded.papel, municipio_id = excluded.municipio_id, escola_id = excluded.escola_id, email = excluded.email;

  insert into auditoria (quem, acao, alvo, detalhe) values (auth.uid(), 'usuario.criou', 'perfis:' || uid, jsonb_build_object('email', lower(p_email), 'papel', p_papel));
  return uid;
end $$;

-- 6. editar dados do usuário
create or replace function admin_atualiza_usuario(p_id uuid, p_nome text, p_papel papel, p_municipio uuid, p_escola uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare atual perfis;
begin
  select * into atual from perfis where id = p_id;
  if atual.id is null then raise exception 'usuário não encontrado'; end if;
  if not admin_pode(atual.municipio_id) or not admin_pode(p_municipio) then raise exception 'sem permissão'; end if;
  if (p_papel = 'superadmin' or atual.papel = 'superadmin') and not sou_superadmin() then raise exception 'sem permissão'; end if;
  update perfis set nome = p_nome, papel = p_papel, municipio_id = p_municipio, escola_id = p_escola where id = p_id;
end $$;

-- 7. redefinir senha
create or replace function admin_redefine_senha(p_id uuid, p_senha text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare mun uuid;
begin
  select municipio_id into mun from perfis where id = p_id;
  if not admin_pode(mun) then raise exception 'sem permissão'; end if;
  if length(coalesce(p_senha, '')) < 8 then raise exception 'a senha precisa ter pelo menos 8 caracteres'; end if;
  update auth.users set encrypted_password = crypt(p_senha, gen_salt('bf')), updated_at = now() where id = p_id;
  insert into auditoria (quem, acao, alvo) values (auth.uid(), 'usuario.redefiniu_senha', 'perfis:' || p_id);
end $$;

-- 8. bloquear / desbloquear
create or replace function admin_bloqueia(p_id uuid, p_bloquear boolean)
returns void language plpgsql security definer set search_path = public as $$
declare mun uuid;
begin
  if p_id = auth.uid() then raise exception 'você não pode bloquear a si mesmo'; end if;
  select municipio_id into mun from perfis where id = p_id;
  if not admin_pode(mun) then raise exception 'sem permissão'; end if;
  update auth.users set banned_until = case when p_bloquear then '2999-01-01'::timestamptz else null end, updated_at = now() where id = p_id;
  insert into auditoria (quem, acao, alvo) values (auth.uid(), case when p_bloquear then 'usuario.bloqueou' else 'usuario.desbloqueou' end, 'perfis:' || p_id);
end $$;

-- 9. atividade: auditoria do app + entradas e saídas do auth, numa lista só
create or replace function admin_atividade(p_desde timestamptz default now() - interval '30 days', p_ate timestamptz default now() + interval '1 day', p_quem uuid default null, p_limite int default 500)
returns table (quando timestamptz, quem uuid, quem_nome text, quem_email text, acao text, alvo text, detalhe jsonb, origem text)
language sql stable security definer set search_path = public as $$
  with permitido as (
    select p.id from perfis p where sou_superadmin() or (meu_papel() = 'gestao' and p.municipio_id = meu_municipio())
  ),
  app as (
    select a.quando, a.quem, a.acao, a.alvo, a.detalhe, 'app'::text as origem
    from auditoria a
    where (a.quem is null or a.quem in (select id from permitido))
  ),
  acesso as (
    select e.created_at as quando,
           (e.payload->>'actor_id')::uuid as quem,
           'acesso.' || (e.payload->>'action') as acao,
           coalesce(e.ip_address, '') as alvo,
           jsonb_build_object('ip', e.ip_address, 'email', e.payload->>'actor_username') as detalhe,
           'auth'::text as origem
    from auth.audit_log_entries e
    where e.payload->>'action' in ('login','logout','user_signedup','user_recovery_requested','user_updated_password','token_revoked')
      and (e.payload->>'actor_id') ~ '^[0-9a-f-]{36}$'
      and (e.payload->>'actor_id')::uuid in (select id from permitido)
  ),
  tudo as (select * from app union all select * from acesso)
  select t.quando, t.quem, p.nome, coalesce(p.email, t.detalhe->>'email'), t.acao, t.alvo, t.detalhe, t.origem
  from tudo t left join perfis p on p.id = t.quem
  where t.quando between p_desde and p_ate and (p_quem is null or t.quem = p_quem)
    and (sou_superadmin() or meu_papel() = 'gestao')
  order by t.quando desc
  limit p_limite
$$;

-- a lista de perfis do painel precisa ver todos os do município (gestao) ou todos (superadmin): já coberto por perfis_ver.
-- gestão pode ler auditoria do próprio município via admin_atividade; a policy direta continua só para superadmin/gestao/coordenacao.
