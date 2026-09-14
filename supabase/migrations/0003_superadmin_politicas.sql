-- superadmin passa por todas as políticas de município.

create or replace function sou_superadmin() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select papel = 'superadmin' from perfis where id = auth.uid()), false)
$$;

-- estudante_do_meu_municipio passa a valer para superadmin também
create or replace function estudante_do_meu_municipio(eid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select sou_superadmin() or exists (
    select 1 from estudantes e join escolas s on s.id = e.escola_id
    where e.id = eid and s.municipio_id = meu_municipio()
  )
$$;

drop policy if exists municipios_ver on municipios;
create policy municipios_ver on municipios for select to authenticated using (sou_superadmin() or id = meu_municipio());
drop policy if exists municipios_gerir on municipios;
create policy municipios_gerir on municipios for all to authenticated using (sou_superadmin()) with check (sou_superadmin());

drop policy if exists escolas_ver on escolas;
create policy escolas_ver on escolas for select to authenticated using (sou_superadmin() or municipio_id = meu_municipio());
drop policy if exists escolas_gerir on escolas;
create policy escolas_gerir on escolas for all to authenticated
  using (sou_superadmin() or (municipio_id = meu_municipio() and meu_papel() in ('gestao', 'coordenacao')))
  with check (sou_superadmin() or (municipio_id = meu_municipio() and meu_papel() in ('gestao', 'coordenacao')));

drop policy if exists turmas_ver on turmas;
create policy turmas_ver on turmas for select to authenticated
  using (sou_superadmin() or exists (select 1 from escolas s where s.id = escola_id and s.municipio_id = meu_municipio()));
drop policy if exists turmas_gerir on turmas;
create policy turmas_gerir on turmas for all to authenticated
  using (sou_superadmin() or exists (select 1 from escolas s where s.id = escola_id and s.municipio_id = meu_municipio()))
  with check (sou_superadmin() or exists (select 1 from escolas s where s.id = escola_id and s.municipio_id = meu_municipio()));

drop policy if exists perfis_ver on perfis;
create policy perfis_ver on perfis for select to authenticated using (sou_superadmin() or id = auth.uid() or municipio_id = meu_municipio());
drop policy if exists perfis_editar on perfis;
create policy perfis_editar on perfis for update to authenticated using (sou_superadmin() or id = auth.uid()) with check (sou_superadmin() or id = auth.uid());

drop policy if exists estudantes_ver on estudantes;
create policy estudantes_ver on estudantes for select to authenticated
  using (sou_superadmin() or exists (select 1 from escolas s where s.id = escola_id and s.municipio_id = meu_municipio()));
drop policy if exists estudantes_gerir on estudantes;
create policy estudantes_gerir on estudantes for all to authenticated
  using (sou_superadmin() or exists (select 1 from escolas s where s.id = escola_id and s.municipio_id = meu_municipio()))
  with check (sou_superadmin() or exists (select 1 from escolas s where s.id = escola_id and s.municipio_id = meu_municipio()));

drop policy if exists auditoria_ver on auditoria;
create policy auditoria_ver on auditoria for select to authenticated using (sou_superadmin() or meu_papel() in ('gestao', 'coordenacao'));
