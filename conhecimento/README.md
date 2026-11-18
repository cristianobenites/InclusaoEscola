# Base de conhecimento da IA

Tudo que a IA do sistema usa para analisar formulários e sugerir ações vem daqui, em ordem de força:

| Prioridade | Grupo | O que é | Onde está |
|---|---|---|---|
| 10 | regra | Os 4 guias "passo a passo" do Instituto (Ficha de Observação, Entrevista com a Família, Estudo de Caso, Documento Unificado PAEE e PEI) + referências bibliográficas | `conhecimento/regras/*.md` (versionado no git) |
| 15 | curso | Material do curso "Profissional de Apoio na Prática" (Instituto Autismo do Bem: aulas dos módulos 1 a 8 em roteiro, projeto pedagógico enviado ao MEC, arquitetura, relatório, slides do módulo 1), trilha "Decola AEE - Professor de AEE" (roteiro de 4 h e slides) e módulo 1 do "Domine o PEI". Recebido em 07/11/2026 | texto extraído em `C:/Users/Benites/Desktop/Vinicius/base-conhecimento-2/texto-extraido` (fora do git); trechos no banco |
| 20 | caderno | Os 14 Cadernos Pedagógicos da Política Nacional de Educação Especial Inclusiva (MEC, 2026) | texto extraído em `C:\Users\Benites\Desktop\Vinicius\base-conhecimento\texto-extraido` (fora do git); trechos no banco |
| 25 | modelo | Modelos de documentos de preenchimento: PDI (Educação Infantil, Ensino Fundamental, Ensino Médio) e sua estrutura, Modelo de Estudo de Caso, Anedotário (Rota do PEI/PDI), Protocolo de Conduta do AEE, Inventário Portage (580 itens + 5 áreas + tabela de registro) e os prompts para gerar objetivos, habilidades BNCC e estratégias do PEI. Recebido em 07/11/2026 | idem (fora do git); trechos no banco |
| 30 | exemplo | Respostas reais de professores em formação do Instituto (discussão de caso "Sofia", 13/10/2026), transcritas | `conhecimento/exemplos-professores/*.md` |
| 40 | artigo | 14 artigos científicos (CAA, TEA, TDAH, TA, processamento sensorial, formação docente, livro acessível) | texto extraído fora do git; trechos no banco |

## Como a IA consulta

- Tabelas `conhecimento_fontes` e `conhecimento_trechos` (migração 0006). Cada trecho tem ~1.400 caracteres, página de origem e `tsvector` em português sem acentos.
- `busca_conhecimento(consulta, limite, grupos)`: busca por texto completo, ponderada pela prioridade (regra pesa mais que artigo).
- `busca_conhecimento_vetor(vetor, limite, grupos)`: busca semântica, quando a coluna `embedding` (768 dims, Gemini) estiver preenchida.
- A síntese com IA deve: (1) aplicar as regras na íntegra no prompt (são curtas, ~30 mil caracteres); (2) buscar trechos relevantes dos cadernos, exemplos e artigos para a situação do estudante; (3) citar a fonte e a página em toda sugestão.

## Como atualizar

1. Colocar o PDF/DOCX novo na pasta do acervo e rodar a extração (script em `scripts/extrai-texto.py`), ou editar/criar um `.md` em `conhecimento/`.
2. `python scripts/ingere-conhecimento.py` (com `GEMINI_API_KEY` no ambiente para gerar embeddings).

## Observações sobre o acervo recebido em 30/10/2026

- "Expectativas aprendizagem implante coclear.pdf" é uma cópia idêntica de "CAA escola TEA.pdf" (mesmo arquivo). O artigo sobre implante coclear ainda precisa ser enviado.
- "Referências de livros.docx" só lista títulos (sem PDF): entram como referência, não como conteúdo.

## Observações sobre o acervo recebido em 07/11/2026 (6 zips do Drive)

- Extração com `scripts/extrai-texto-2.py` (PDF, DOCX, PPTX, XLSX) e carga com `CONHECIMENTO_TEXTO=<pasta> python scripts/ingere-conhecimento.py --so-texto`. Migração 0010 liberou os grupos `curso` e `modelo`.
- Não entraram: as 5 gravações de tela (.mp4, 5 GB; precisariam de transcrição), "PROTOCOLO DE CONDUTA PREENCHIDO.docx" (dados de saúde de uma criança real, mesmo sem nome), a agenda de gravação, os roteiros por instrutora (Camila Abrão, Silvia Ferraresi, Vanessa Cologis: mesmo conteúdo dos cadernos de teleprompter), "Roteiros IDP SP" (só a distribuição de módulos) e os PDFs só com imagens ("1_DOMINE-O-PEI.pdf", "Nossa-Jornada-de-Hoje-5h.pdf"; precisariam de OCR).
- As funções `feedback` e `sintese` passaram a buscar também em `curso` e `modelo`.
