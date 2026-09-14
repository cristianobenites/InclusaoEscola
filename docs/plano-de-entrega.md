# Plano de entrega: o que precisa ser feito para atender o cliente

Cliente: Instituto Inclusão na Escola (Silvia Ferraresi) via Vinicius Costa, dentro do Programa Decola AEE.
Pedido real: uma ferramenta que receba as respostas da Ficha de Observação e da Conversa com a Família, use IA para sintetizar e sugerir ações à equipe, e leve ao Estudo de Caso. Rodar em município real para acumular casos.

## Etapa 0: Alinhamento (semana 1)
- Reunião com Vinicius e Silvia: "conte o último caso do início ao fim" (extrai os critérios de decisão).
- Fechar escopo do MVP e o que fica para depois (PAEE, PEI, Educacenso).
- Receber o Caderno Pedagógico 3 (PDF) e 2 ou 3 casos reais anonimizados.
- LGPD: definir controlador (município ou instituto), base legal, consentimento da família, termo de uso. Dados de criança e de deficiência são sensíveis.
- Decidir quem paga a IA e a hospedagem, e a quem pertencem código e dados.
Entrega: documento de escopo aprovado pelos dois lados.

## Etapa 1: Coleta (semanas 2 e 3)
- App web com login (Supabase Auth), papéis: professor regente, professor de AEE, coordenação.
- Cadastro mínimo: município, escola, turma, estudante (nome guardado separado do resto, pseudônimo para o restante do sistema).
- Ficha de Observação e Conversa com a Família como formulários gerados a partir de JSON versionado. Salvar rascunho, várias observações por estudante, marcar ambiente.
- Exportar o formulário preenchido em PDF (a escola precisa do papel).
Entrega: professor consegue preencher os dois formulários no celular e no computador.

## Etapa 2: IA de síntese (semanas 3 e 4)
- Edge function que pseudonimiza, monta o contexto com as duas coletas e o Caderno 3, e devolve JSON: síntese por dimensão, potencialidades, barreiras nas 7 categorias, contradições entre escola e família, lacunas de informação, ações sugeridas (necessidade, objetivo, estratégia, responsável, prazo).
- Tela de revisão: a equipe edita, aceita ou descarta cada item. Nada vai para o Estudo de Caso sem aprovação humana.
- Registro de auditoria: prompt, versão do modelo, quem aprovou, quando.
- Linguagem educacional, jamais clínica; a IA nunca sugere diagnóstico.
Entrega: a partir das duas coletas, a equipe recebe a síntese e as ações em minutos.

## Etapa 3: Estudo de Caso (semanas 5 e 6)
- Minuta nas 8 seções do especialista, montada com o que foi aprovado.
- Checklist de validação (informações coletadas, evidências, barreiras classificadas, estratégias ligadas às necessidades, plano de acompanhamento, aprovação da equipe).
- Exportar PDF e DOCX.
- Acompanhamento em 30, 60 e 90 dias com as 4 perguntas do especialista.
Entrega: Estudo de Caso completo, exportável, com trilha de aprovação.

## Etapa 4: Piloto (semanas 7 e 8)
- Um município do programa, 5 a 10 estudantes, com a pessoa da prefeitura dando feedback.
- Medir: tempo por caso, itens da IA aceitos x descartados, dúvidas dos professores.
- Ajustar formulários (só troca o JSON) e prompts.
Entrega: relatório do piloto e lista de ajustes.

## Fase 2 (depois do piloto)
Gerador de PAEE e PEI ligado à BNCC, PEI-Painel colaborativo, painel do município com os indicadores do programa (cobertura de Estudos de Caso, PAEE homologados, PEI implementados), campos para o Educacenso, vários municípios na mesma instalação.

## O que depende do cliente
1. Caderno 3 em PDF e casos anonimizados.
2. Agenda com Silvia para a extração de conhecimento.
3. Decisão de LGPD e contrato.
4. Município e escola do piloto.
5. Validação pedagógica de cada tela e de cada saída da IA (Silvia ou equipe).

## Papéis
- Cristiano: direção de arte e produto, relação com o cliente, aprovação das telas e do tom.
- Claude Code: todo o técnico (código, banco, IA, deploy, evidências visuais para aprovação).
- Vinicius e Silvia: conteúdo pedagógico, validação, acesso ao município.
