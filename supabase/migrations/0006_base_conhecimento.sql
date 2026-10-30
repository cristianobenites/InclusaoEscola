-- Base de conhecimento que rege a IA: Cadernos Pedagógicos do MEC, artigos, regras (passo a passo)
-- e exemplos reais. Busca por texto completo em português já funciona sem IA; a coluna embedding
-- fica pronta para busca semântica quando houver chave de embeddings.

create extension if not exists unaccent with schema extensions;
create extension if not exists vector with schema extensions;

-- unaccent não é IMMUTABLE; este envelope fixa o dicionário e permite usar em coluna gerada e índice.
create or replace function sem_acento(t text) returns text
language sql immutable parallel safe strict as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, t)
$$;

create table if not exists conhecimento_fontes (
  id uuid primary key default gen_random_uuid(),
  grupo text not null check (grupo in ('regra', 'caderno', 'artigo', 'exemplo', 'referencia')),
  titulo text not null,
  arquivo text not null unique,
  autoria text,
  ano int,
  paginas int,
  prioridade int not null default 50, -- menor = mais forte (regra 10, caderno 20, exemplo 30, artigo 40)
  ativo boolean not null default true,
  observacao text,
  criado_em timestamptz not null default now()
);

create table if not exists conhecimento_trechos (
  id bigserial primary key,
  fonte_id uuid not null references conhecimento_fontes(id) on delete cascade,
  ordem int not null,
  pagina int,
  secao text,
  texto text not null,
  tsv tsvector generated always as (to_tsvector('portuguese', sem_acento(texto))) stored,
  embedding extensions.vector(768),
  criado_em timestamptz not null default now(),
  unique (fonte_id, ordem)
);
create index if not exists conhecimento_trechos_tsv_idx on conhecimento_trechos using gin (tsv);
create index if not exists conhecimento_trechos_fonte_idx on conhecimento_trechos (fonte_id, ordem);

alter table conhecimento_fontes enable row level security;
alter table conhecimento_trechos enable row level security;
drop policy if exists fontes_ver on conhecimento_fontes;
create policy fontes_ver on conhecimento_fontes for select to authenticated using (true);
drop policy if exists trechos_ver on conhecimento_trechos;
create policy trechos_ver on conhecimento_trechos for select to authenticated using (true);
drop policy if exists fontes_gerir on conhecimento_fontes;
create policy fontes_gerir on conhecimento_fontes for all to authenticated using (sou_superadmin()) with check (sou_superadmin());
drop policy if exists trechos_gerir on conhecimento_trechos;
create policy trechos_gerir on conhecimento_trechos for all to authenticated using (sou_superadmin()) with check (sou_superadmin());

-- Busca por texto completo (português, sem acentos), ponderada pela prioridade da fonte.
create or replace function busca_conhecimento(p_consulta text, p_limite int default 8, p_grupos text[] default null)
returns table (trecho_id bigint, fonte_id uuid, grupo text, titulo text, pagina int, secao text, texto text, relevancia real)
language sql stable security definer set search_path = public as $$
  -- qualquer palavra da consulta pode casar (OU); o ranking privilegia quem casa mais palavras
  with q as (
    select to_tsquery('portuguese', coalesce(string_agg(lexeme, ' | '), '')) as tsq
    from unnest(to_tsvector('portuguese', sem_acento(p_consulta)))
  )
  select t.id, f.id, f.grupo, f.titulo, t.pagina, t.secao, t.texto,
         (ts_rank_cd(t.tsv, q.tsq, 1) * (100.0 / f.prioridade))::real as relevancia
  from conhecimento_trechos t
  join conhecimento_fontes f on f.id = t.fonte_id
  cross join q
  where f.ativo and q.tsq::text <> '' and t.tsv @@ q.tsq
    and (p_grupos is null or f.grupo = any(p_grupos))
  order by relevancia desc
  limit p_limite
$$;

-- Busca semântica (quando os embeddings estiverem preenchidos).
create or replace function busca_conhecimento_vetor(p_vetor extensions.vector(768), p_limite int default 8, p_grupos text[] default null)
returns table (trecho_id bigint, fonte_id uuid, grupo text, titulo text, pagina int, secao text, texto text, similaridade real)
language sql stable security definer set search_path = public, extensions as $$
  select t.id, f.id, f.grupo, f.titulo, t.pagina, t.secao, t.texto,
         (1 - (t.embedding operator(extensions.<=>) p_vetor))::real as similaridade
  from conhecimento_trechos t
  join conhecimento_fontes f on f.id = t.fonte_id
  where f.ativo and t.embedding is not null
    and (p_grupos is null or f.grupo = any(p_grupos))
  order by t.embedding operator(extensions.<=>) p_vetor
  limit p_limite
$$;
