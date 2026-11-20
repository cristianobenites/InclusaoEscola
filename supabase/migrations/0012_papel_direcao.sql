-- Papel de direção da escola (enxerga a própria escola).
-- Fica num arquivo separado: ADD VALUE não pode ser usado na mesma transação em que é criado.
alter type papel add value if not exists 'direcao';
