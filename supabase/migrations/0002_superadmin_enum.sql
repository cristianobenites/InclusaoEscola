-- Papel de administrador da plataforma (enxerga todos os municípios).
-- Fica num arquivo separado: ADD VALUE não pode ser usado na mesma transação em que é criado.
alter type papel add value if not exists 'superadmin';
