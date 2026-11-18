-- Chave do Gemini guardada no Vault do Supabase (criptografada), lida só pelas edge functions
-- (service_role). A conta do CLI é Developer na organização e não pode gravar Secrets de
-- função pelo painel; o Vault é o lugar oficial para segredos dentro do banco.
create or replace function public.segredo(p_nome text)
returns text
language sql
security definer
set search_path = vault, public
as $$
  select decrypted_secret from vault.decrypted_secrets where name = p_nome limit 1;
$$;
revoke all on function public.segredo(text) from public, anon, authenticated;
grant execute on function public.segredo(text) to service_role;
