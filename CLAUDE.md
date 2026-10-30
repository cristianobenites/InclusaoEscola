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
- Migrações: `python scripts/migra.py` aplica `supabase/migrations/*.sql` pela Management API com o token do CLI; `--sql "select ..."` faz consulta avulsa. Formulários novos ou versões novas: rodar `python scripts/cadastra-formularios.py` (a tabela `respostas` tem FK para formularios(id, versao)).
- Conta de teste (fictícia, só no protótipo): coordenacao@teste.inclusao.local / Piloto-2026-teste (papel coordenação). Estudante de exemplo EST-393FC7. Apagar antes de qualquer piloto real.
- Confirmação de e-mail do Auth está DESLIGADA (protótipo sem SMTP). Religar antes do piloto.
- Prints de aprovação em `reports/prints/`.

## Identidade visual (REGRA, pedido de 2026-09-14)

O app segue o site do cliente, https://www.inclusaonaescola.com.br/ (Wix). Extraído do site em 14/09:
- **Fonte**: Ubuntu (Medium 500 nos títulos, Regular no corpo). Google Fonts no index.html. Poppins aparece pouco no site; não usar.
- **Cores**: texto e títulos azul-marinho `#233a55`; ação azul `#125dda` (botões em pílula, raio total); logo em azul `#2b5cd2`, verde `#47c249`, amarelo `#ffc803`; pastéis de bloco rosa `#ffd8d9`, amarelo `#ffe26c`, verde `#d0f7d9`, azul-claro `#d5e5ff`; fundo `#f6f8fc`; cinza de apoio `#5a6b80`. Tokens em `tailwind.config.js` (tinta, marca, verde, sol, rosa, papel).
- **Logo**: `public/logo-instituto.svg` (completo, extraído do SVG do site) e `public/marca-instituto.svg` (só o símbolo, usado como favicon e no celular).
- **Formas**: cantos bem arredondados (cards `rounded-3xl`, campos `rounded-2xl`), bolinhas coloridas como decoração de fundo (classe `.bolha`), cabeçalho branco com o logo à esquerda.
- Pesos: usar `font-medium`, nunca `font-bold`/`font-extrabold` (o site é leve).

## Administração e auditoria (2026-09-14)

- Rota `/admin` (só superadmin e gestão). Abas: Usuários (criar, editar, redefinir senha, bloquear), Atividade (tudo que cada pessoa fez, com filtro por período e pessoa, detalhe abre em sanfona na própria linha), Municípios e escolas (estrutura).
- Criação de usuário é por RPC `admin_cria_usuario` (SECURITY DEFINER, grava direto em auth.users + auth.identities com bcrypt, igual ao GoTrue). Não usa service_role nem edge function. Gestão só cria no próprio município; superadmin em qualquer um.
- Auditoria: gatilhos em todas as tabelas de dados gravam em `auditoria` (quem, ação `tabela.insert|update|delete`, antes/depois). Ações de tela (abriu estudante, abriu formulário, imprimiu, login, logout) são gravadas pelo app via `registrar()` em `src/lib/auditoria.ts`. O log do Auth (`auth.audit_log_entries`) está VAZIO neste projeto, por isso login/logout são registrados pelo app.
- Rótulos em pt-BR das ações em `rotuloAcao()`.
- Usuário de teste criado pelo painel: professora.teste@teste.inclusao.local / Teste-2026-aee (apagar antes do piloto).
- Página `/perfil` (botão com o nome da pessoa no cabeçalho, ao lado do Sair): edita o próprio nome, mostra e-mail/papel/município/escola e troca a senha conferindo a senha atual (re-login) antes de `auth.updateUser`. Registra `acesso.user_updated_password` na auditoria.
- Usuário do parceiro: vinicius@inclusaoescola.com.br (coordenação, Município Piloto), senha fraca escolhida por ele; criado direto no banco em 14/09.
- Ao abrir um usuário na aba Usuários, aparece "Histórico desta pessoa": entradas/saídas e ações com horário (RPC `admin_atividade` com `p_quem`). As entradas vêm do `acesso.login` do app e também de `auth.sessions` (migração 0005), sem duplicar.

## Base de conhecimento da IA (2026-10-30)

- Acervo recebido do Vinicius (14 Cadernos MEC, 14 artigos, 4 guias passo a passo, 25 fotos de respostas de professores). Original fica FORA do git em `C:\Users\Benites\Desktop\Vinicius\base-conhecimento`; texto extraído em `texto-extraido/` ali.
- Local (ignorado pelo git, porque o repositório é PÚBLICO e o material é do Instituto): `conhecimento/regras/*.md` (os 4 guias = REGRAS DE NEGÓCIO, prioridade máxima) e `conhecimento/exemplos-professores/*.md` (transcrições das fotos). No git só `conhecimento/README.md`, scripts e migração.
- Banco: migração 0006 (`conhecimento_fontes`, `conhecimento_trechos` com tsvector pt-BR + coluna `embedding vector(768)`), RPCs `busca_conhecimento` (texto) e `busca_conhecimento_vetor` (semântica). Carga: `python scripts/ingere-conhecimento.py` (com `GEMINI_API_KEY` no ambiente gera embeddings via gemini-embedding-001).
- REGRA: toda resposta da IA cita fonte e página; regras do Instituto > Cadernos MEC > exemplos > artigos. Nunca linguagem clínica.
- ARMADILHA: o plano gratuito PAUSA o projeto após 7 dias sem uso (aconteceu entre 14/09 e 30/10; religar exige login como terrazul no painel, o token do CLI é Developer e não pode). Falta um ping periódico para evitar; decidir com o usuário.
- Formulários v2 (30/10): Ficha de Observação v2 e Entrevista com a Família v2 reescritos a partir dos guias passo a passo do Instituto (checklists, exemplos em cada campo, "apoio permanente", 5 barreiras); NOVOS: `estudo-de-caso.v1.json` (4 etapas + validação) e `documento-unificado.v1.json` (PAEE + PEI, 6 seções). Versões antigas continuam no `TODAS_VERSOES` para abrir respostas já feitas.

## Feedback ao professor (2026-10-30)

- Edge function `supabase/functions/feedback` (deploy: `npx supabase functions deploy feedback --project-ref cmuynbifmywajjtbktpw`). Recebe `resposta_id`, roda com o JWT de quem pediu (RLS vale), pseudonimiza (troca o nome do estudante por "o estudante"), resume as respostas por seção, chama `busca_conhecimento` por seção (cadernos, exemplos, artigos) e lê `regras_do_instituto()`.
- Sem `GEMINI_API_KEY` nos segredos da função: modo **busca** (trechos relevantes por seção, com fonte e página). Com a chave: modo **ia** (gemini-2.5-flash, JSON com resumo, pontos fortes, alertas, sugestões e perguntas, cada item com fonte/página; regras: barreira é do contexto, nunca linguagem clínica, indicadores observáveis). Trocar modelo com `GEMINI_MODELO`.
- Resultado gravado em `feedbacks` (migração 0007) e mostrado pelo `PainelFeedback` na tela de preenchimento (aparece depois de salvar o rascunho). Ação auditada como `feedback.gerou`.
- Guia Prático "Estudo de Caso na Prática" (artefato claude.ai CH7YGDzsHa9UY2Uap8y4cS, feito pela filha do Vinicius): página interativa com as mesmas 4 etapas do guia passo a passo, que gera um texto para colar no relatório. O `estudo-de-caso.v2.json` tem EXATAMENTE as opções desse guia, e `src/lib/importaGuiaPratico.ts` + `ImportarGuia.tsx` ("Colar do Guia Prático", só no Estudo de Caso v2) convertem o texto copiado em respostas do formulário. Exemplo de texto no formato em `reports/exemplo-guia-pratico-sofia.txt`.
