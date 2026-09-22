-- ==========================================================================
-- Correções da auditoria de 22/09/2026. APLICAR ANTES do deploy do código
-- desta versão (o código novo depende destas colunas/tabelas).
-- Idempotente.
-- ==========================================================================

-- 1) Dedup com estado: a mensagem fica 'processing' até terminar; se a função
--    morrer no meio (timeout), uma reentrega da Meta pode retomá-la.
alter table public.secretaria_processed_messages
  add column if not exists status text not null default 'done',
  add column if not exists claimed_at timestamptz not null default now();
do $$ begin
  alter table public.secretaria_processed_messages
    add constraint secretaria_processed_messages_status_chk check (status in ('processing','done'));
exception when duplicate_object then null; end $$;
create index if not exists secretaria_processed_messages_created_idx
  on public.secretaria_processed_messages (created_at);

-- 2) Sessão revogável: a versão sobe a cada troca/redefinição de senha e
--    invalida os tokens antigos.
alter table public.secretaria_senhas
  add column if not exists sessao_versao integer not null default 0;

-- 3) Material → custo já lançado (evita lançar o mesmo material duas vezes).
alter table public.secretaria_materiais
  add column if not exists custo_id bigint;

-- 4) Anti-duplicata de custo (busca por valor recente).
create index if not exists secretaria_custos_user_created_idx
  on public.secretaria_custos (user_wa, created_at desc);

-- 5) Limites de tentativas (login, OTP, cadastro, alertas).
create table if not exists public.secretaria_rate_limits (
  chave         text        primary key,
  janela_inicio timestamptz not null default now(),
  contagem      integer     not null default 0
);
alter table public.secretaria_rate_limits enable row level security;

-- 6) Nonce de uso único do link "conectar agenda" (OAuth).
create table if not exists public.secretaria_oauth_nonces (
  nonce     text        primary key,
  user_wa   text        not null,
  criado_em timestamptz not null default now(),
  usado_em  timestamptz
);
create index if not exists secretaria_oauth_nonces_user_idx on public.secretaria_oauth_nonces (user_wa);
alter table public.secretaria_oauth_nonces enable row level security;

-- 7) Trava por usuário (uma mensagem por vez).
create table if not exists public.secretaria_locks (
  user_wa text        primary key,
  ate     timestamptz not null
);
alter table public.secretaria_locks enable row level security;

-- 8) Leads do site (cadastro antes do pagamento existir).
create table if not exists public.secretaria_leads (
  id         bigint generated always as identity primary key,
  nome       text        not null,
  telefone   text        not null,
  email      text,
  cpf        text,
  endereco   text,
  profissao  text,
  plano      text,
  criado_em  timestamptz not null default now()
);
alter table public.secretaria_leads enable row level security;

-- 9) wa_id CANÔNICO nas tabelas de DADOS: celular BR sempre SEM o nono dígito
--    (12 dígitos), que é como a Meta entrega e como os dados históricos já
--    estão. Tabelas de lookup (usuarios, oauth_tokens, senhas) mantêm uma
--    linha por variante e não entram aqui. Em 22/09/2026 nenhuma linha de
--    dados estava no formato de 13 dígitos (no-op), mas fica garantido.
do $$
declare
  t text;
begin
  foreach t in array array[
    'secretaria_memories','secretaria_conversations','secretaria_custos',
    'secretaria_fotos','secretaria_documentos','secretaria_materiais'
  ] loop
    execute format(
      'update public.%I set user_wa = substr(user_wa,1,4) || substr(user_wa,6) where user_wa ~ ''^55[0-9]{2}9[0-9]{8}$''',
      t);
  end loop;
end $$;

-- Tabelas com unique envolvendo user_wa: só migra onde não colide.
update public.secretaria_obras o
   set user_wa = substr(o.user_wa,1,4) || substr(o.user_wa,6)
 where o.user_wa ~ '^55[0-9]{2}9[0-9]{8}$'
   and not exists (
     select 1 from public.secretaria_obras x
      where x.user_wa = substr(o.user_wa,1,4) || substr(o.user_wa,6) and x.nome = o.nome);
update public.secretaria_rdo r
   set user_wa = substr(r.user_wa,1,4) || substr(r.user_wa,6)
 where r.user_wa ~ '^55[0-9]{2}9[0-9]{8}$'
   and not exists (
     select 1 from public.secretaria_rdo x
      where x.user_wa = substr(r.user_wa,1,4) || substr(r.user_wa,6)
        and x.obra = r.obra and x.data = r.data);

-- 10) Forma do número que a Meta ENTREGA (último `from` visto). Mensagens que
--     partem de nós (código de login, "bom dia", aviso de agenda) vão para ela:
--     enviar para a forma errada do nono dígito dá 200 mas não entrega.
alter table public.secretaria_usuarios
  add column if not exists wa_envio text;
-- Preenche com o número das conversas já existentes (gravadas com o from cru).
update public.secretaria_usuarios u
   set wa_envio = (
     select c.user_wa
       from public.secretaria_conversations c
      where c.user_wa in (
              u.user_wa,
              case when u.user_wa ~ '^55[0-9]{2}9[0-9]{8}$'
                   then substr(u.user_wa,1,4) || substr(u.user_wa,6)
                   when u.user_wa ~ '^55[0-9]{10}$'
                   then substr(u.user_wa,1,4) || '9' || substr(u.user_wa,5)
                   else u.user_wa end)
      order by c.created_at desc
      limit 1)
 where u.wa_envio is null;
