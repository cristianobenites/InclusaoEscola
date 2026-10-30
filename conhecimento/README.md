# Base de conhecimento da IA

Tudo que a IA do sistema usa para analisar formulários e sugerir ações vem daqui, em ordem de força:

| Prioridade | Grupo | O que é | Onde está |
|---|---|---|---|
| 10 | regra | Os 4 guias "passo a passo" do Instituto (Ficha de Observação, Entrevista com a Família, Estudo de Caso, Documento Unificado PAEE e PEI) + referências bibliográficas | `conhecimento/regras/*.md` (versionado no git) |
| 20 | caderno | Os 14 Cadernos Pedagógicos da Política Nacional de Educação Especial Inclusiva (MEC, 2026) | texto extraído em `C:\Users\Benites\Desktop\Vinicius\base-conhecimento\texto-extraido` (fora do git); trechos no banco |
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
