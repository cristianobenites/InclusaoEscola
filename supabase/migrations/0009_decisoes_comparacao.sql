-- Decisões da equipe na comparação "equipe x sistema" do Documento Unificado:
-- para cada campo, quem acertou (equipe, sistema, combinar) e o porquê. Fica gravado
-- para o histórico do caso e para medir, com o tempo, o quanto a proposta do sistema ajuda.

create table if not exists decisoes_comparacao (
  id uuid primary key default gen_random_uuid(),
  sintese_id uuid not null references sinteses_ia(id) on delete cascade,
  resposta_id uuid not null references respostas(id) on delete cascade,
  estudante_id uuid not null references estudantes(id) on delete cascade,
  campo text not null,
  decisao text not null check (decisao in ('equipe', 'sistema', 'combinar')),
  comentario text,
  decidido_por uuid references perfis(id),
  decidido_em timestamptz not null default now(),
  unique (sintese_id, resposta_id, campo)
);
create index if not exists decisoes_comparacao_par_idx on decisoes_comparacao (sintese_id, resposta_id);

alter table decisoes_comparacao enable row level security;
drop policy if exists decisoes_gerir on decisoes_comparacao;
create policy decisoes_gerir on decisoes_comparacao for all to authenticated
  using (estudante_do_meu_municipio(estudante_id)) with check (estudante_do_meu_municipio(estudante_id));

drop trigger if exists auditoria_decisoes_comparacao on decisoes_comparacao;
create trigger auditoria_decisoes_comparacao after insert or update or delete on decisoes_comparacao
  for each row execute function registra_auditoria();
