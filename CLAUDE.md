# InclusaoEscola

> Responda sempre em português brasileiro (pt-BR).
> O usuário é diretor de arte / pesquisador, não técnico: todo trabalho técnico é feito pelo Claude via scripts, com evidência visual (prints 1440 e 375) para aprovação.

## Estado

- Projeto criado em 2026-09-14. Escopo e stack ainda a definir com o usuário.
- Pasta: `C:\Users\Benites\Desktop\Projetos em Andamento\InclusaoEscola` (1 pasta = 1 repositório GitHub = 1 projeto Vercel, na conta Vercel DO usuário).
- Repositório GitHub: ainda não criado.

## Banco de dados (decisão 2026-09-14)

- Supabase, organização **cristiano.terrazul@gmail.com** (slug `zumkdorzldecnzisddtw`). Ela tem 0 projetos ativos (benites-academico, newsletter-stefani e Sinaly-homologacao estão PAUSADOS), então cabe um projeto novo no plano gratuito.
- A organização **cristianobenites's Org** está CHEIA (sinaly + prospect ativos, limite de 2 do plano gratuito). Não criar projeto nela.
- Região: `sa-east-1` (São Paulo), como os demais.
- O CLI do Supabase (`npx supabase`) está logado e enxerga as duas organizações. Migrações: preferir a Management API / CLI, nunca editar o banco na mão.

## Regras

- Conventional Commits em pt-BR; toda mudança nasce em branch, `main` = produção (push = deploy na Vercel).
- Nunca usar travessão (—) em texto voltado ao público.
- Nenhuma mudança visual sem print.

## Contexto do produto

Ler `docs/visao-do-sistema.md` antes de qualquer trabalho. Resumo: app para o Programa Decola AEE (Instituto Inclusão na Escola / Vinicius Costa) que digitaliza a Ficha de Observação e a Conversa com a Família, usa IA em modo rascunho para sintetizar e sugerir ações, e gera o Estudo de Caso (depois PAEE e PEI). Formulários são JSON versionado, nunca código. Dados de crianças: pseudonimizar antes de chamar IA.
