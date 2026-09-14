-- InclusaoEscola: base do banco (2026-09-14)
-- Tudo em pt-BR. Dados de criança: o nome fica em tabela separada (estudantes_identidade),
-- o resto do sistema usa o pseudônimo estudantes.codigo.

create extension if not exists pgcrypto;

do $$ begin
  create type papel as enum ('gestao', 'coordenacao', 'professor_aee', 'professor_regente');
exception when duplicate_object then null; end $$;

create table if not exists municipios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  uf char(2) not null,
  criado_em timestamptz not null default now()
);

create table if not exists escolas (
  id uuid primary key default gen_random_uuid(),
  municipio_id uuid not null references municipios(id) on delete cascade,
  nome text not null,
  inep text,
  criado_em timestamptz not null default now()
);

create table if not exists turmas (
  id uuid primary key default gen_random_uuid(),
  escola_id uuid not null references escolas(id) on delete cascade,
  nome text not null,
  ano_letivo int not null default extract(year from now())::int,
  criado_em timestamptz not null default now()
);

create table if not exists perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  papel papel not null default 'professor_regente',
  municipio_id uuid references municipios(id),
  escola_id uuid references escolas(id),
  criado_em timestamptz not null default now()
);

create table if not exists estudantes (
  id uuid primary key default gen_random_uuid(),
  escola_id uuid not null references escolas(id) on delete cascade,
  turma_id uuid references turmas(id) on delete set null,
  codigo text not null unique default '',
  ano_turma text,
  arquivado boolean not null default false,
  criado_por uuid references perfis(id),
  criado_em timestamptz not null default now()
);

create table if not exists estudantes_identidade (
  estudante_id uuid primary key references estudantes(id) on delete cascade,
  nome text not null,
  data_nascimento date,
  responsavel_nome text,
  responsavel_contato text,
  atualizado_em timestamptz not null default now()
);

create table if not exists formularios (
  id text not null,
  versao int not null,
  titulo text not null,
  descricao text,
  esquema jsonb not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  primary key (id, versao)
);

create table if not exists respostas (
  id uuid primary key default gen_random_uuid(),
  estudante_id uuid not null references estudantes(id) on delete cascade,
  formulario_id text not null,
  formulario_versao int not null,
  respondido_por uuid references perfis(id),
  status text not null default 'rascunho' check (status in ('rascunho', 'concluido')),
  dados jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  foreign key (formulario_id, formulario_versao) references formularios(id, versao)
);
create index if not exists respostas_estudante_idx on respostas(estudante_id);

create table if not exists sinteses_ia (
  id uuid primary key default gen_random_uuid(),
  estudante_id uuid not null references estudantes(id) on delete cascade,
  respostas_ids uuid[] not null default '{}',
  modelo text,
  prompt_versao text,
  saida jsonb not null default '{}'::jsonb,
  revisao jsonb not null default '{}'::jsonb,
  status text not null default 'gerada' check (status in ('gerada', 'revisada', 'descartada')),
  criado_por uuid references perfis(id),
  criado_em timestamptz not null default now()
);

create table if not exists estudos_caso (
  id uuid primary key default gen_random_uuid(),
  estudante_id uuid not null references estudantes(id) on delete cascade,
  versao int not null default 1,
  conteudo jsonb not null default '{}'::jsonb,
  status text not null default 'rascunho' check (status in ('rascunho', 'validado')),
  criado_por uuid references perfis(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists auditoria (
  id bigserial primary key,
  quem uuid,
  acao text not null,
  alvo text,
  detalhe jsonb,
  quando timestamptz not null default now()
);

-- atualizado_em automático
create or replace function toca_atualizado_em() returns trigger language plpgsql as $$
begin new.atualizado_em = now(); return new; end $$;
drop trigger if exists respostas_atualizado on respostas;
create trigger respostas_atualizado before update on respostas for each row execute function toca_atualizado_em();
drop trigger if exists estudos_atualizado on estudos_caso;
create trigger estudos_atualizado before update on estudos_caso for each row execute function toca_atualizado_em();

-- perfil criado junto com o usuário (PROVISÓRIO: entra no primeiro município cadastrado)
create or replace function cria_perfil() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into perfis (id, nome, papel, municipio_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'papel')::papel, 'professor_regente'),
    (select id from municipios order by criado_em limit 1)
  ) on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario after insert on auth.users for each row execute function cria_perfil();

-- código pseudônimo do estudante
create or replace function gera_codigo_estudante() returns trigger language plpgsql as $$
begin
  if new.codigo is null or new.codigo = '' then
    new.codigo := 'EST-' || upper(substr(encode(gen_random_bytes(3), 'hex'), 1, 6));
  end if;
  return new;
end $$;
drop trigger if exists estudantes_codigo on estudantes;
create trigger estudantes_codigo before insert on estudantes for each row execute function gera_codigo_estudante();

-- helpers de RLS
create or replace function meu_municipio() returns uuid language sql stable security definer set search_path = public as $$
  select municipio_id from perfis where id = auth.uid()
$$;
create or replace function meu_papel() returns papel language sql stable security definer set search_path = public as $$
  select papel from perfis where id = auth.uid()
$$;
create or replace function estudante_do_meu_municipio(eid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from estudantes e join escolas s on s.id = e.escola_id
    where e.id = eid and s.municipio_id = meu_municipio()
  )
$$;

-- RLS
alter table municipios enable row level security;
alter table escolas enable row level security;
alter table turmas enable row level security;
alter table perfis enable row level security;
alter table estudantes enable row level security;
alter table estudantes_identidade enable row level security;
alter table formularios enable row level security;
alter table respostas enable row level security;
alter table sinteses_ia enable row level security;
alter table estudos_caso enable row level security;
alter table auditoria enable row level security;

drop policy if exists municipios_ver on municipios;
create policy municipios_ver on municipios for select to authenticated using (id = meu_municipio());

drop policy if exists escolas_ver on escolas;
create policy escolas_ver on escolas for select to authenticated using (municipio_id = meu_municipio());
drop policy if exists escolas_gerir on escolas;
create policy escolas_gerir on escolas for all to authenticated
  using (municipio_id = meu_municipio() and meu_papel() in ('gestao', 'coordenacao'))
  with check (municipio_id = meu_municipio() and meu_papel() in ('gestao', 'coordenacao'));

drop policy if exists turmas_ver on turmas;
create policy turmas_ver on turmas for select to authenticated
  using (exists (select 1 from escolas s where s.id = escola_id and s.municipio_id = meu_municipio()));
drop policy if exists turmas_gerir on turmas;
create policy turmas_gerir on turmas for all to authenticated
  using (exists (select 1 from escolas s where s.id = escola_id and s.municipio_id = meu_municipio()))
  with check (exists (select 1 from escolas s where s.id = escola_id and s.municipio_id = meu_municipio()));

drop policy if exists perfis_ver on perfis;
create policy perfis_ver on perfis for select to authenticated using (id = auth.uid() or municipio_id = meu_municipio());
drop policy if exists perfis_editar on perfis;
create policy perfis_editar on perfis for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists estudantes_ver on estudantes;
create policy estudantes_ver on estudantes for select to authenticated
  using (exists (select 1 from escolas s where s.id = escola_id and s.municipio_id = meu_municipio()));
drop policy if exists estudantes_gerir on estudantes;
create policy estudantes_gerir on estudantes for all to authenticated
  using (exists (select 1 from escolas s where s.id = escola_id and s.municipio_id = meu_municipio()))
  with check (exists (select 1 from escolas s where s.id = escola_id and s.municipio_id = meu_municipio()));

drop policy if exists identidade_gerir on estudantes_identidade;
create policy identidade_gerir on estudantes_identidade for all to authenticated
  using (estudante_do_meu_municipio(estudante_id)) with check (estudante_do_meu_municipio(estudante_id));

drop policy if exists formularios_ver on formularios;
create policy formularios_ver on formularios for select to authenticated using (true);

drop policy if exists respostas_gerir on respostas;
create policy respostas_gerir on respostas for all to authenticated
  using (estudante_do_meu_municipio(estudante_id)) with check (estudante_do_meu_municipio(estudante_id));

drop policy if exists sinteses_gerir on sinteses_ia;
create policy sinteses_gerir on sinteses_ia for all to authenticated
  using (estudante_do_meu_municipio(estudante_id)) with check (estudante_do_meu_municipio(estudante_id));

drop policy if exists estudos_gerir on estudos_caso;
create policy estudos_gerir on estudos_caso for all to authenticated
  using (estudante_do_meu_municipio(estudante_id)) with check (estudante_do_meu_municipio(estudante_id));

drop policy if exists auditoria_inserir on auditoria;
create policy auditoria_inserir on auditoria for insert to authenticated with check (quem = auth.uid());
drop policy if exists auditoria_ver on auditoria;
create policy auditoria_ver on auditoria for select to authenticated using (meu_papel() in ('gestao', 'coordenacao'));

-- semente do piloto
insert into municipios (id, nome, uf) values ('00000000-0000-0000-0000-000000000001', 'Município Piloto', 'SP') on conflict do nothing;
insert into escolas (id, municipio_id, nome) values ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'EMEF Piloto') on conflict do nothing;
insert into turmas (id, escola_id, nome) values ('00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-000000000011', '3º ano A') on conflict do nothing;
