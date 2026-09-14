-- Entradas no sistema também a partir de auth.sessions (cobre acessos que o app não registrou,
-- por exemplo antes do registro existir ou por outro cliente). Evita duplicar quando o app já gravou
-- um acesso.login no mesmo minuto.

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
  sessoes as (
    select s.created_at as quando, s.user_id as quem, 'acesso.sessao'::text as acao,
           coalesce(s.ip::text, '') as alvo,
           jsonb_build_object('navegador', left(s.user_agent, 120), 'ip', s.ip::text, 'ultimo_uso', s.updated_at) as detalhe,
           'auth'::text as origem
    from auth.sessions s
    where s.user_id in (select id from permitido)
      and not exists (
        select 1 from auditoria a
        where a.quem = s.user_id and a.acao = 'acesso.login'
          and a.quando between s.created_at - interval '2 minutes' and s.created_at + interval '2 minutes'
      )
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
  tudo as (select * from app union all select * from sessoes union all select * from acesso)
  select t.quando, t.quem, p.nome, coalesce(p.email, t.detalhe->>'email'), t.acao, t.alvo, t.detalhe, t.origem
  from tudo t left join perfis p on p.id = t.quem
  where t.quando between p_desde and p_ate and (p_quem is null or t.quem = p_quem)
    and (sou_superadmin() or meu_papel() = 'gestao')
  order by t.quando desc
  limit p_limite
$$;
