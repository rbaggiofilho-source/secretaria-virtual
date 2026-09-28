-- O fluxo de pagamento grava status 'pendente_pagamento' e o painel admin grava
-- 'inativo' ao desativar um usuário, mas o CHECK da coluna só aceitava
-- ('pendente','ativo','bloqueado') — essas gravações eram RECUSADAS pelo banco
-- (cadastro pago dava erro 500; "desativar" no admin falhava). Amplia o CHECK.
alter table public.secretaria_usuarios drop constraint if exists secretaria_usuarios_status_check;
alter table public.secretaria_usuarios
  add constraint secretaria_usuarios_status_check
  check (status in ('pendente','pendente_pagamento','ativo','inativo','bloqueado'));
