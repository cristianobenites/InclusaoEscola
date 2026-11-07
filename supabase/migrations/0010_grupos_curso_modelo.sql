-- Segundo acervo (07/11/2026): material do curso Decola AEE do Instituto (roteiros, slides,
-- projeto pedagógico) e modelos de documentos de preenchimento (PDI, Estudo de Caso, Anedotário,
-- Protocolo de Conduta, Inventário Portage, prompts). Dois grupos novos na base de conhecimento:
--   curso  (prioridade 15): entre as regras do Instituto e os Cadernos do MEC
--   modelo (prioridade 25): entre os Cadernos e os exemplos de professores
alter table conhecimento_fontes drop constraint if exists conhecimento_fontes_grupo_check;
alter table conhecimento_fontes add constraint conhecimento_fontes_grupo_check
  check (grupo in ('regra', 'curso', 'caderno', 'modelo', 'exemplo', 'artigo', 'referencia'));
