-- A tabela sinteses_ia passa a guardar dois tipos de saída do sistema:
--   'documento'      = proposta do Documento Unificado (PAEE e PEI), já existente
--   'estudo-de-caso' = insights e sugestões para a reunião do Estudo de Caso (pedido de 18/11/2026)
alter table sinteses_ia add column if not exists tipo text not null default 'documento'
  check (tipo in ('documento', 'estudo-de-caso'));
create index if not exists sinteses_ia_estudante_tipo_idx on sinteses_ia (estudante_id, tipo, criado_em desc);
