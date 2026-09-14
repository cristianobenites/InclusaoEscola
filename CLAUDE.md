# InclusaoEscola

> Responda sempre em português brasileiro (pt-BR).
> O usuário é diretor de arte / pesquisador, não técnico: todo trabalho técnico é feito pelo Claude via scripts, com evidência visual (prints 1440 e 375) para aprovação.

## Estado

- Projeto criado em 2026-09-14. Escopo e stack ainda a definir com o usuário.
- Pasta: `C:\Users\Benites\Desktop\Projetos em Andamento\InclusaoEscola` (1 pasta = 1 repositório GitHub = 1 projeto Vercel, na conta Vercel DO usuário).
- Repositório GitHub: ainda não criado.

## Banco de dados (decisão 2026-09-14)

- Supabase CRIADO em 2026-09-14: projeto **inclusao-escola**, ref `cmuynbifmywajjtbktpw`, URL `https://cmuynbifmywajjtbktpw.supabase.co`, região `sa-east-1` (São Paulo), plano gratuito, RLS automático ligado em tabelas novas.
- Fica na organização **cristiano.terrazul@gmail.com** (slug `zumkdorzldecnzisddtw`), cuja dona é a conta cristiano.terrazul@gmail.com. A conta benites_silva@hotmail.com (a do CLI `npx supabase`) é só Developer nessa org: consegue migrar e publicar funções, mas não cria nem apaga projetos.
- A senha do banco foi gerada pelo painel e NÃO está guardada; se precisar, redefinir em Project Settings → Database. Chaves anon/service ficam no painel (API Keys).
- Migrações: pela Management API / CLI (`supabase link --project-ref cmuynbifmywajjtbktpw`), nunca editar o banco na mão.

## Regras

- Conventional Commits em pt-BR; toda mudança nasce em branch, `main` = produção (push = deploy na Vercel).
- Nunca usar travessão (—) em texto voltado ao público.
- Nenhuma mudança visual sem print.

## Contexto do produto

Ler `docs/visao-do-sistema.md` antes de qualquer trabalho. Resumo: app para o Programa Decola AEE (Instituto Inclusão na Escola / Vinicius Costa) que digitaliza a Ficha de Observação e a Conversa com a Família, usa IA em modo rascunho para sintetizar e sugerir ações, e gera o Estudo de Caso (depois PAEE e PEI). Formulários são JSON versionado, nunca código. Dados de crianças: pseudonimizar antes de chamar IA.

## Como rodar e testar (estado em 2026-09-14)

- `npm run dev` sobe em http://localhost:8090 (no painel de preview do Claude, o servidor `inclusao-dev` usa a porta 8140).
- `.env` local tem VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (chave anon é pública; nunca colocar service_role no front).
- Migrações: `python scripts/migra.py` aplica `supabase/migrations/*.sql` pela Management API com o token do CLI; `--sql "select ..."` faz consulta avulsa. Formulários novos também precisam ser inseridos na tabela `formularios` (ver script no histórico do commit ae22fa5).
- Conta de teste (fictícia, só no protótipo): coordenacao@teste.inclusao.local / Piloto-2026-teste (papel coordenação). Estudante de exemplo EST-393FC7. Apagar antes de qualquer piloto real.
- Confirmação de e-mail do Auth está DESLIGADA (protótipo sem SMTP). Religar antes do piloto.
- Prints de aprovação em `reports/prints/`.
