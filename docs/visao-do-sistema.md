# InclusaoEscola: visão do sistema (leitura dos documentos de 14/09/2026)

Fonte: pasta `C:\Users\Benites\Desktop\Vinicius` (6 arquivos de Vinicius Costa, Instituto Inclusão na Escola). Os arquivos NÃO estão no repositório de propósito (material de terceiros).

## Contexto

- **Programa Decola AEE**: programa de política pública para municípios, executado pelo Instituto Inclusão na Escola (Silvia Ferraresi, 40 anos em educação inclusiva) e Instituto Autismo do Bem. Ciclo de implantação de 10 meses em 5 fases: habilitação legal e diagnóstico, formação, estruturação de processos (Estudo de Caso, PAEE, PEI), geração de evidências e cadastro no Educacenso, plano de continuidade.
- **Tese financeira**: matrícula de educação especial registrada no Censo + AEE em conformidade ativam a dupla matrícula e o fator 1,4 do Fundeb (mais 140% de recurso por aluno). O município paga R$ 3 a 8 mil por mês e parceiros de fomento aportam 1x a 3x.
- **Marco legal**: Decreto 12.686/2025, Portaria MEC 421/2026 (RENEEI), 14 Cadernos Pedagógicos da PNEEI. Sem exigência de laudo médico: a avaliação pedagógica do **Estudo de Caso** é o documento central. O Caderno 3 trata de Estudo de Caso, PEI e PAEE.
- **Onde o app entra**: fases 3 e 4 do programa. Ele é a ferramenta digital que padroniza a coleta e acelera a construção do Estudo de Caso com apoio de IA, e gera evidência para o Censo.

## O que Vinicius pediu (mensagens de 01/09 e 11/09)

1. Os dois formulários do Caderno 3 já foram reescritos em Linguagem Simples (ISO 24495-1): Ficha de Observação Pedagógica (professor / AEE) e Roteiro de Conversa com a Família.
2. O formato da coleta AINDA VAI MUDAR (há pessoa de prefeitura no grupo trazendo feedback de adoção). Não travar as perguntas no código.
3. Principal trabalho da IA agora: receber as respostas dos dois formulários e devolver síntese + insights de ações para a equipe. Passo seguinte: o Estudo de Caso em si.
4. Ele quer rodar o app dentro do programa (municípios reais) para acumular casos. Está conversando com USP e EMBRAPII, mas prefere explorar com o Cristiano primeiro.

## Processo do especialista (mapa mental)

Fluxo macro em 11 passos: demanda da escola → coleta inicial → evidências → análise pedagógica → barreiras → classificação de necessidades → estratégias e apoios → Estudo de Caso → validação → apresentação à equipe → monitoramento 30/60/90 dias.

Estudo de Caso padronizado em 8 seções: identificação, caracterização da situação, potencialidades, barreiras, necessidades educacionais, estratégias, recursos, plano de acompanhamento. Cada estratégia liga necessidade → objetivo → estratégia → responsável → prazo.

Barreiras (7 categorias na Ficha): comunicação, metodológicas, tecnológicas, atitudinais, arquitetônicas, urbanísticas, transporte. Pergunta central: a dificuldade está no aluno ou no contexto escolar?

## Proposta de produto (MVP)

1. **Cadastro mínimo**: município → escola → turma → estudante; papéis: professor regente, professor de AEE, coordenação, gestão municipal.
2. **Ficha de Observação digital** (guiada, por ambiente, pode ser preenchida várias vezes ao longo do período).
3. **Conversa com a Família digital** (mesmo motor de formulário).
4. **IA em modo rascunho**: cruza as duas coletas e devolve, em JSON, síntese por dimensão, potencialidades, barreiras classificadas nas 7 categorias, contradições entre escola e família, lacunas de informação e sugestões de ações (necessidade → objetivo → estratégia → responsável → prazo). A equipe edita e aprova; a IA nunca decide sozinha e nunca diagnostica.
5. **Estudo de Caso** em 8 seções gerado como minuta a partir do que foi aprovado, com o checklist de validação do especialista.
6. **Acompanhamento 30/60/90** com as 4 perguntas do especialista.
7. **Exportar** PDF e DOCX (o município precisa do documento oficial).

Depois: gerador de PAEE e PEI ligado à BNCC, PEI-Painel (quadro colaborativo), painel do município com os indicadores do programa (cobertura de Estudos de Caso, PAEE homologados, PEI implementados), campos do Educacenso.

## Decisões técnicas

- **Formulários como dados**, não como código: cada formulário é um JSON versionado (perguntas, tipos, escalas). Muda a pergunta sem redeploy, e cada resposta guarda a versão usada.
- **Stack** igual ao Sinaly: React + Vite + TypeScript + Tailwind, Supabase (auth, Postgres com RLS por município/escola, edge functions), Vercel.
- **IA**: modelo de linguagem com prompts estruturados e saída em JSON, ancorado no texto do Caderno 3 (RAG). Não é "treinar um modelo" agora: os casos acumulados (anonimizados) servem para avaliação e, no futuro, ajuste fino. Linguagem educacional, jamais clínica.
- **LGPD**: dados de crianças e dados sensíveis (deficiência, saúde). Pseudonimizar antes de chamar a IA (nunca enviar nome do estudante), minimização, registro de acesso, consentimento da família na entrevista, termo com o município como controlador.
- **Banco**: Supabase. Em 14/09 a criação falhou porque o limite de 2 projetos gratuitos ativos é POR USUÁRIO administrador (vale nas duas organizações). Ver memória do projeto.

## Próximos passos

1. Decidir o banco (pausar Prospect, assinar Pro, ou outro provedor).
2. Uma conversa com Silvia no formato "conte o último caso do início ao fim" para extrair critérios de decisão.
3. Protótipo navegável com os dois formulários + IA em rascunho, para testar com a pessoa de prefeitura.
4. Piloto num município do programa.
