-- Feedback ao professor sobre um formulário preenchido, fundamentado na base de conhecimento.

create table if not exists feedbacks (
  id uuid primary key default gen_random_uuid(),
  resposta_id uuid not null references respostas(id) on delete cascade,
  estudante_id uuid not null references estudantes(id) on delete cascade,
  modo text not null check (modo in ('busca', 'ia')),
  modelo text,
  saida jsonb not null,
  pedido_por uuid references perfis(id),
  criado_em timestamptz not null default now()
);
create index if not exists feedbacks_resposta_idx on feedbacks (resposta_id, criado_em desc);

alter table feedbacks enable row level security;
drop policy if exists feedbacks_gerir on feedbacks;
create policy feedbacks_gerir on feedbacks for all to authenticated
  using (estudante_do_meu_municipio(estudante_id)) with check (estudante_do_meu_municipio(estudante_id));

-- Texto integral das regras do Instituto (para o prompt), em ordem.
create or replace function regras_do_instituto()
returns text language sql stable security definer set search_path = public as $$
  select string_agg(t.texto, E'\n\n' order by f.titulo, t.ordem)
  from conhecimento_trechos t join conhecimento_fontes f on f.id = t.fonte_id
  where f.grupo = 'regra' and f.ativo
$$;
