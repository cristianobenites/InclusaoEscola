-- Governança por escola (2026-11-20).
--
-- Antes: quem era de um município enxergava TODOS os estudantes do município.
-- Agora o alcance de cada pessoa vem do papel e das escolas em que ela atua:
--   superadmin ............ tudo (plataforma)
--   gestao ................ todas as escolas do próprio município (Secretaria de Educação)
--   direcao, coordenacao,
--   professor_aee ......... todos os estudantes das escolas em que atua
--   professor_regente ..... só os estudantes que cadastrou ou em cuja equipe foi incluído,
--                           e só enquanto atuar na escola do estudante
-- Respostas, sínteses, feedbacks e decisões seguem o estudante: quem vê o estudante vê os registros dele.
--
-- Também fecha três brechas do protótipo:
--   1. qualquer pessoa conseguia alterar o próprio papel/município (UPDATE livre em perfis);
--   2. o cadastro aberto aceitava o papel escolhido pela pessoa e a colocava no primeiro município;
--   3. coordenação/gestão liam a auditoria de todos os municípios.

-- ---------------------------------------------------------------------------------------------
-- 1. Estruturas
-- ---------------------------------------------------------------------------------------------
create table if not exists perfis_escolas (
  perfil_id uuid not null references perfis(id) on delete cascade,
  escola_id uuid not null references escolas(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (perfil_id, escola_id)
);
create index if not exists perfis_escolas_escola_idx on perfis_escolas (escola_id);

create table if not exists estudantes_equipe (
  estudante_id uuid not null references estudantes(id) on delete cascade,
  perfil_id uuid not null references perfis(id) on delete cascade,
  adicionado_por uuid references perfis(id) on delete set null,
  criado_em timestamptz not null default now(),
  primary key (estudante_id, perfil_id)
);
create index if not exists estudantes_equipe_perfil_idx on estudantes_equipe (perfil_id);

-- senha provisória: a pessoa precisa criar a própria senha no primeiro acesso
alter table perfis add column if not exists trocar_senha boolean not null default false;

-- carga inicial: quem já tinha escola continua nela; a coordenação sem escola (protótipo) fica
-- ligada a todas as escolas do município em que estava, para não perder o que já enxergava.
insert into perfis_escolas (perfil_id, escola_id)
select id, escola_id from perfis where escola_id is not null
on conflict do nothing;
insert into perfis_escolas (perfil_id, escola_id)
select p.id, s.id from perfis p join escolas s on s.municipio_id = p.municipio_id
where p.papel = 'coordenacao' and p.escola_id is null
on conflict do nothing;

-- ---------------------------------------------------------------------------------------------
-- 2. Funções de alcance (SECURITY DEFINER: leem as tabelas sem depender da RLS de quem chama)
-- ---------------------------------------------------------------------------------------------
create or replace function minhas_escolas() returns setof uuid
language sql stable security definer set search_path = public as $$
  select escola_id from perfis_escolas where perfil_id = auth.uid()
$$;

-- atuo nesta escola? (vínculo direto, Secretaria do município ou plataforma)
create or replace function atuo_na_escola(p_escola uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select sou_superadmin()
    or exists (select 1 from perfis_escolas pe where pe.perfil_id = auth.uid() and pe.escola_id = p_escola)
    or (meu_papel() = 'gestao' and exists (select 1 from escolas s where s.id = p_escola and s.municipio_id = meu_municipio()))
$$;

-- vejo este estudante? Recebe as colunas da linha (não consulta estudantes), para valer também
-- na linha que acabou de ser inserida.
create or replace function vejo_estudante(p_id uuid, p_escola uuid, p_criado_por uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select sou_superadmin()
    or (meu_papel() = 'gestao' and exists (select 1 from escolas s where s.id = p_escola and s.municipio_id = meu_municipio()))
    or (
      exists (select 1 from perfis_escolas pe where pe.perfil_id = auth.uid() and pe.escola_id = p_escola)
      and (
        meu_papel() in ('direcao', 'coordenacao', 'professor_aee')
        or p_criado_por = auth.uid()
        or exists (select 1 from estudantes_equipe q where q.estudante_id = p_id and q.perfil_id = auth.uid())
      )
    )
$$;

create or replace function posso_ver_estudante(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select vejo_estudante(e.id, e.escola_id, e.criado_por) from estudantes e where e.id = eid), false)
$$;

-- As políticas de respostas, sínteses, estudos, identidade, feedbacks e decisões chamam esta função.
-- O nome ficou do modelo antigo; o alcance agora é o de posso_ver_estudante.
create or replace function estudante_do_meu_municipio(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select posso_ver_estudante(eid)
$$;

-- papéis que enxergam a escola inteira (usado na equipe do estudante)
create or replace function papel_ve_escola(p papel) returns boolean
language sql immutable as $$
  select p::text in ('direcao', 'coordenacao', 'professor_aee')
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. Autoria do estudante: quem cadastra é sempre quem está logado, e isso não muda depois
-- ---------------------------------------------------------------------------------------------
create or replace function estudantes_autoria() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.criado_por := auth.uid(); end if;
  elsif new.criado_por is distinct from old.criado_por and auth.uid() is not null and not sou_superadmin() then
    new.criado_por := old.criado_por;
  end if;
  return new;
end $$;
drop trigger if exists estudantes_autoria on estudantes;
create trigger estudantes_autoria before insert or update on estudantes for each row execute function estudantes_autoria();

-- ---------------------------------------------------------------------------------------------
-- 4. Políticas
-- ---------------------------------------------------------------------------------------------
alter table perfis_escolas enable row level security;
alter table estudantes_equipe enable row level security;

-- vínculos: a pessoa vê os seus; quem atua na escola vê os da escola. Escrita só pelas funções de administração.
drop policy if exists perfis_escolas_ver on perfis_escolas;
create policy perfis_escolas_ver on perfis_escolas for select to authenticated
  using (perfil_id = auth.uid() or atuo_na_escola(escola_id));

-- equipe: visível para quem vê o estudante. Escrita só pelas funções equipe_adiciona / equipe_remove.
drop policy if exists estudantes_equipe_ver on estudantes_equipe;
create policy estudantes_equipe_ver on estudantes_equipe for select to authenticated
  using (posso_ver_estudante(estudante_id));

-- escolas: cada pessoa vê as suas; a Secretaria vê as do município
drop policy if exists escolas_ver on escolas;
create policy escolas_ver on escolas for select to authenticated
  using (sou_superadmin() or (meu_papel() = 'gestao' and municipio_id = meu_municipio()) or id in (select minhas_escolas()));
drop policy if exists escolas_gerir on escolas;
create policy escolas_gerir on escolas for all to authenticated
  using (sou_superadmin() or (meu_papel() = 'gestao' and municipio_id = meu_municipio()))
  with check (sou_superadmin() or (meu_papel() = 'gestao' and municipio_id = meu_municipio()));

-- turmas: das escolas em que a pessoa atua
drop policy if exists turmas_ver on turmas;
create policy turmas_ver on turmas for select to authenticated using (atuo_na_escola(escola_id));
drop policy if exists turmas_gerir on turmas;
create policy turmas_gerir on turmas for all to authenticated
  using (atuo_na_escola(escola_id)) with check (atuo_na_escola(escola_id));

-- perfis: a pessoa vê o seu; a Secretaria vê os do município. Colegas aparecem só pelas funções da equipe.
drop policy if exists perfis_ver on perfis;
create policy perfis_ver on perfis for select to authenticated
  using (sou_superadmin() or id = auth.uid() or (meu_papel() = 'gestao' and municipio_id = meu_municipio()));
-- a pessoa só altera o próprio NOME; papel, município, escola e e-mail mudam pelas funções de administração
drop policy if exists perfis_editar on perfis;
create policy perfis_editar on perfis for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke insert, update, delete, truncate on perfis from anon, authenticated;
grant update (nome) on perfis to authenticated;

-- estudantes
drop policy if exists estudantes_ver on estudantes;
create policy estudantes_ver on estudantes for select to authenticated
  using (vejo_estudante(id, escola_id, criado_por));
drop policy if exists estudantes_gerir on estudantes;
drop policy if exists estudantes_inserir on estudantes;
create policy estudantes_inserir on estudantes for insert to authenticated
  with check (atuo_na_escola(escola_id));
drop policy if exists estudantes_alterar on estudantes;
create policy estudantes_alterar on estudantes for update to authenticated
  using (vejo_estudante(id, escola_id, criado_por))
  with check (vejo_estudante(id, escola_id, criado_por) and atuo_na_escola(escola_id));
drop policy if exists estudantes_excluir on estudantes;
create policy estudantes_excluir on estudantes for delete to authenticated
  using (
    vejo_estudante(id, escola_id, criado_por)
    and (sou_superadmin() or meu_papel() in ('gestao', 'direcao', 'coordenacao', 'professor_aee') or criado_por = auth.uid())
  );

-- auditoria: leitura direta só da plataforma e da Secretaria (das pessoas do próprio município)
drop policy if exists auditoria_ver on auditoria;
create policy auditoria_ver on auditoria for select to authenticated
  using (
    sou_superadmin()
    or (meu_papel() = 'gestao' and exists (select 1 from perfis p where p.id = auditoria.quem and p.municipio_id = meu_municipio()))
  );

-- auditoria automática das tabelas novas
drop trigger if exists auditoria_perfis_escolas on perfis_escolas;
create trigger auditoria_perfis_escolas after insert or update or delete on perfis_escolas
  for each row execute function registra_auditoria();
drop trigger if exists auditoria_estudantes_equipe on estudantes_equipe;
create trigger auditoria_estudantes_equipe after insert or update or delete on estudantes_equipe
  for each row execute function registra_auditoria();

-- ---------------------------------------------------------------------------------------------
-- 5. Cadastro aberto deixa de dar acesso: a conta nasce sem município, sem escola e como regente.
--    Quem define papel, município e escola é a administração.
-- ---------------------------------------------------------------------------------------------
create or replace function cria_perfil() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into perfis (id, nome, papel, municipio_id, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    'professor_regente',
    null,
    new.email
  ) on conflict (id) do update set email = excluded.email;
  return new;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 6. Administração de usuários (com várias escolas por pessoa)
-- ---------------------------------------------------------------------------------------------

-- criação de fato (sem checar quem chama): usada pela função de administração e pelos scripts de carga.
create or replace function _cria_usuario(p_email text, p_senha text, p_nome text, p_papel papel, p_municipio uuid, p_escolas uuid[] default null, p_trocar boolean default true)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid;
  v_email text := lower(trim(p_email));
  v_escolas uuid[] := coalesce(p_escolas, '{}');
begin
  if v_email is null or v_email !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' then raise exception 'e-mail inválido'; end if;
  if length(coalesce(p_senha, '')) < 8 then raise exception 'a senha precisa ter pelo menos 8 caracteres'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'informe o nome'; end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then raise exception 'já existe usuário com este e-mail'; end if;
  if exists (select 1 from unnest(v_escolas) e where not exists (select 1 from escolas s where s.id = e and s.municipio_id = p_municipio)) then
    raise exception 'há escola que não pertence ao município escolhido';
  end if;

  uid := gen_random_uuid();
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', v_email,
    crypt(p_senha, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('nome', trim(p_nome)), now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', v_email, 'email_verified', true), 'email', null, now(), now());

  insert into perfis (id, nome, papel, municipio_id, escola_id, email, trocar_senha)
  values (uid, trim(p_nome), p_papel, p_municipio, v_escolas[1], v_email, p_trocar)
  on conflict (id) do update set nome = excluded.nome, papel = excluded.papel, municipio_id = excluded.municipio_id,
    escola_id = excluded.escola_id, email = excluded.email, trocar_senha = excluded.trocar_senha;
  insert into perfis_escolas (perfil_id, escola_id) select uid, e from unnest(v_escolas) e on conflict do nothing;

  insert into auditoria (quem, acao, alvo, detalhe)
  values (auth.uid(), 'usuario.criou', 'perfis:' || uid, jsonb_build_object('email', v_email, 'papel', p_papel, 'escolas', to_jsonb(v_escolas)));
  return uid;
end $$;
revoke execute on function _cria_usuario(text, text, text, papel, uuid, uuid[], boolean) from public, anon, authenticated;

drop function if exists admin_cria_usuario(text, text, text, papel, uuid, uuid);
create or replace function admin_cria_usuario(p_email text, p_senha text, p_nome text, p_papel papel, p_municipio uuid, p_escola uuid default null, p_escolas uuid[] default null)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
begin
  if not admin_pode(p_municipio) then raise exception 'sem permissão para criar usuário neste município'; end if;
  if p_papel = 'superadmin' and not sou_superadmin() then raise exception 'só um administrador da plataforma cria outro'; end if;
  return _cria_usuario(p_email, p_senha, p_nome, p_papel, p_municipio,
    coalesce(p_escolas, case when p_escola is null then '{}'::uuid[] else array[p_escola] end), true);
end $$;

drop function if exists admin_atualiza_usuario(uuid, text, papel, uuid, uuid);
create or replace function admin_atualiza_usuario(p_id uuid, p_nome text, p_papel papel, p_municipio uuid, p_escola uuid default null, p_escolas uuid[] default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  atual perfis;
  v_escolas uuid[] := coalesce(p_escolas, case when p_escola is null then null else array[p_escola] end);
begin
  select * into atual from perfis where id = p_id;
  if atual.id is null then raise exception 'usuário não encontrado'; end if;
  if not admin_pode(atual.municipio_id) or not admin_pode(p_municipio) then raise exception 'sem permissão'; end if;
  if (p_papel = 'superadmin' or atual.papel = 'superadmin') and not sou_superadmin() then raise exception 'sem permissão'; end if;
  if p_id = auth.uid() and p_papel is distinct from atual.papel and not sou_superadmin() then raise exception 'você não pode alterar o próprio papel'; end if;
  if v_escolas is not null and exists (select 1 from unnest(v_escolas) e where not exists (select 1 from escolas s where s.id = e and s.municipio_id = p_municipio)) then
    raise exception 'há escola que não pertence ao município escolhido';
  end if;

  update perfis set nome = p_nome, papel = p_papel, municipio_id = p_municipio,
    escola_id = case when v_escolas is null then (case when p_municipio is distinct from atual.municipio_id then null else escola_id end) else v_escolas[1] end
  where id = p_id;

  if v_escolas is not null then
    -- lista enviada: passa a ser exatamente esta
    delete from perfis_escolas where perfil_id = p_id and escola_id <> all (v_escolas);
    insert into perfis_escolas (perfil_id, escola_id) select p_id, e from unnest(v_escolas) e on conflict do nothing;
  elsif p_municipio is distinct from atual.municipio_id then
    -- mudou de município sem lista: os vínculos antigos deixam de valer
    delete from perfis_escolas where perfil_id = p_id;
  end if;
end $$;

create or replace function admin_redefine_senha(p_id uuid, p_senha text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare mun uuid;
begin
  select municipio_id into mun from perfis where id = p_id;
  if not admin_pode(mun) then raise exception 'sem permissão'; end if;
  if length(coalesce(p_senha, '')) < 8 then raise exception 'a senha precisa ter pelo menos 8 caracteres'; end if;
  update auth.users set encrypted_password = crypt(p_senha, gen_salt('bf')), updated_at = now() where id = p_id;
  update perfis set trocar_senha = true where id = p_id and p_id <> auth.uid();
  insert into auditoria (quem, acao, alvo) values (auth.uid(), 'usuario.redefiniu_senha', 'perfis:' || p_id);
end $$;

-- a própria pessoa avisa que já criou a senha pessoal
create or replace function senha_trocada() returns void
language sql security definer set search_path = public as $$
  update perfis set trocar_senha = false where id = auth.uid()
$$;

drop function if exists admin_usuarios();
create or replace function admin_usuarios()
returns table (
  id uuid, nome text, email text, papel text, municipio_id uuid, municipio text, escola_id uuid, escola text,
  ultimo_acesso timestamptz, criado_em timestamptz, bloqueado boolean,
  escolas_ids uuid[], escolas_nomes text[], trocar_senha boolean
) language sql stable security definer set search_path = public as $$
  select p.id, p.nome, coalesce(p.email, u.email), p.papel::text, p.municipio_id, m.nome, p.escola_id, s.nome,
         u.last_sign_in_at, p.criado_em, coalesce(u.banned_until > now(), false),
         coalesce((select array_agg(e.id order by e.nome) from perfis_escolas pe join escolas e on e.id = pe.escola_id where pe.perfil_id = p.id), '{}'),
         coalesce((select array_agg(e.nome order by e.nome) from perfis_escolas pe join escolas e on e.id = pe.escola_id where pe.perfil_id = p.id), '{}'),
         p.trocar_senha
  from perfis p
  join auth.users u on u.id = p.id
  left join municipios m on m.id = p.municipio_id
  left join escolas s on s.id = p.escola_id
  where sou_superadmin() or (meu_papel() = 'gestao' and p.municipio_id = meu_municipio())
  order by p.nome
$$;

-- ---------------------------------------------------------------------------------------------
-- 7. Equipe do estudante: quem acompanha e quem pode ser incluído
-- ---------------------------------------------------------------------------------------------
create or replace function equipe_do_estudante(p_estudante uuid)
returns table (perfil_id uuid, nome text, papel text, motivo text, pode_remover boolean)
language plpgsql stable security definer set search_path = public as $$
declare e estudantes;
begin
  if not posso_ver_estudante(p_estudante) then raise exception 'sem permissão'; end if;
  select * into e from estudantes where id = p_estudante;
  return query
    with da_escola as (
      select p.id, p.nome, p.papel from perfis p join perfis_escolas pe on pe.perfil_id = p.id where pe.escola_id = e.escola_id
    )
    select d.id, d.nome, d.papel::text,
           case when d.id = e.criado_por then 'cadastrou' when q.perfil_id is not null then 'equipe' else 'funcao' end,
           (q.perfil_id is not null and d.id is distinct from e.criado_por and not papel_ve_escola(d.papel)
             and (sou_superadmin() or meu_papel() = 'gestao' or papel_ve_escola(meu_papel()) or e.criado_por = auth.uid() or q.adicionado_por = auth.uid()))
    from da_escola d
    left join estudantes_equipe q on q.estudante_id = e.id and q.perfil_id = d.id
    where d.id = e.criado_por or q.perfil_id is not null or papel_ve_escola(d.papel)
    order by case when papel_ve_escola(d.papel) then 1 else 0 end, d.nome;
end $$;

-- colegas da mesma escola que ainda não acompanham o estudante
create or replace function colegas_para_equipe(p_estudante uuid)
returns table (perfil_id uuid, nome text, papel text)
language plpgsql stable security definer set search_path = public as $$
declare e estudantes;
begin
  if not posso_ver_estudante(p_estudante) then raise exception 'sem permissão'; end if;
  select * into e from estudantes where id = p_estudante;
  return query
    select p.id, p.nome, p.papel::text
    from perfis p join perfis_escolas pe on pe.perfil_id = p.id
    where pe.escola_id = e.escola_id
      and not papel_ve_escola(p.papel) and p.papel::text not in ('superadmin', 'gestao')
      and p.id is distinct from e.criado_por
      and not exists (select 1 from estudantes_equipe q where q.estudante_id = e.id and q.perfil_id = p.id)
    order by p.nome;
end $$;

create or replace function equipe_adiciona(p_estudante uuid, p_perfil uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_escola uuid;
begin
  if not posso_ver_estudante(p_estudante) then raise exception 'sem permissão'; end if;
  select escola_id into v_escola from estudantes where id = p_estudante;
  if not exists (select 1 from perfis_escolas where perfil_id = p_perfil and escola_id = v_escola) then
    raise exception 'esta pessoa não atua na escola do estudante';
  end if;
  insert into estudantes_equipe (estudante_id, perfil_id, adicionado_por) values (p_estudante, p_perfil, auth.uid())
  on conflict do nothing;
end $$;

create or replace function equipe_remove(p_estudante uuid, p_perfil uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e estudantes; q estudantes_equipe;
begin
  if not posso_ver_estudante(p_estudante) then raise exception 'sem permissão'; end if;
  select * into e from estudantes where id = p_estudante;
  select * into q from estudantes_equipe where estudante_id = p_estudante and perfil_id = p_perfil;
  if q.perfil_id is null then return; end if;
  if not (sou_superadmin() or meu_papel() = 'gestao' or papel_ve_escola(meu_papel()) or e.criado_por = auth.uid() or q.adicionado_por = auth.uid()) then
    raise exception 'sem permissão';
  end if;
  delete from estudantes_equipe where estudante_id = p_estudante and perfil_id = p_perfil;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 8. Nenhuma função do banco pode ser chamada sem login.
--    Antes, regras_do_instituto() e busca_conhecimento() respondiam com a chave pública (anon),
--    expondo o material do Instituto. Funções novas: terminar sempre com
--    "revoke execute on function ... from public, anon".
-- ---------------------------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.segredo(text) from authenticated;
revoke execute on function _cria_usuario(text, text, text, papel, uuid, uuid[], boolean) from authenticated, service_role;
