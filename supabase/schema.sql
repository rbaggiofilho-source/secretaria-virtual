-- ==========================================================================
-- Secretária Virtual — schema Supabase (Postgres)
-- Rode isto no SQL Editor do Supabase (uma vez).
--
-- As tabelas usam o prefixo `secretaria_` para conviverem, isoladas, num
-- banco que também tenha outras tabelas (ex.: um ERP). Nunca colidem com
-- tabelas de negócio.
-- ==========================================================================

-- Memória de longo prazo: fatos, obras, apelidos, pendências, preferências.
create table if not exists public.secretaria_memories (
  id          bigint generated always as identity primary key,
  user_wa     text        not null,                 -- número do dono (E.164 sem +)
  kind        text        not null check (kind in ('fato','obra','apelido','pendencia','preferencia')),
  content     text        not null,                 -- conteúdo livre da memória
  obra        text,                                 -- rótulo de obra/local (usado em pendências)
  status      text        not null default 'aberta' -- só relevante p/ pendencia: 'aberta' | 'concluida'
              check (status in ('aberta','concluida')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists secretaria_memories_user_kind_idx
  on public.secretaria_memories (user_wa, kind);

create index if not exists secretaria_memories_user_obra_idx
  on public.secretaria_memories (user_wa, obra);

-- Histórico recente de conversa (para dar contexto ao modelo).
create table if not exists public.secretaria_conversations (
  id          bigint generated always as identity primary key,
  user_wa     text        not null,
  role        text        not null check (role in ('user','assistant')),
  content     text        not null,
  created_at  timestamptz not null default now()
);

create index if not exists secretaria_conversations_user_created_idx
  on public.secretaria_conversations (user_wa, created_at desc);

-- Tokens do Google OAuth por usuário (beta): cada usuário conecta a PRÓPRIA
-- conta Google e a Rosana escreve no calendário "primary" dele. Uma linha por
-- variante de wa_id (com/sem o nono dígito). Acesso só pelo backend.
create table if not exists public.secretaria_oauth_tokens (
  user_wa       text        primary key,
  provider      text        not null default 'google',
  google_email  text,
  refresh_token text        not null,
  access_token  text,
  expiry        timestamptz,
  scope         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.secretaria_oauth_tokens enable row level security;

-- Documentos e prazos da obra (alvará, ART/RRT, ASO, licença, seguro, etc.),
-- com vencimento e o id do evento de lembrete criado na agenda do usuário.
create table if not exists public.secretaria_documentos (
  id                bigint generated always as identity primary key,
  user_wa           text        not null,
  obra              text,
  tipo              text        not null default 'outro'
                    check (tipo in ('alvara','art','rrt','aso','licenca','seguro','contrato','certidao','outro')),
  descricao         text        not null,
  numero            text,
  emissao           date,
  vencimento        date,
  responsavel       text,
  status            text        not null default 'ativo' check (status in ('ativo','arquivado')),
  lembrete_event_id text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.secretaria_documentos enable row level security;

-- Materiais/compras por obra: cada item com seu ciclo (a_comprar -> cotando ->
-- comprado -> entregue) e cotações de fornecedores em jsonb.
create table if not exists public.secretaria_materiais (
  id               bigint generated always as identity primary key,
  user_wa          text        not null,
  obra             text,
  item             text        not null,
  quantidade       numeric,
  unidade          text,
  status           text        not null default 'a_comprar'
                   check (status in ('a_comprar','cotando','comprado','entregue','cancelado')),
  fornecedor       text,
  valor_unitario   numeric,
  valor_total      numeric,
  cotacoes         jsonb       not null default '[]'::jsonb,
  previsao_entrega date,
  data_compra      date,
  observacoes      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.secretaria_materiais enable row level security;

-- Storage: as imagens (fotos/notas fiscais) ficam no bucket PRIVADO
-- 'secretaria-fotos' (não em tabela). Criar uma vez:
--   insert into storage.buckets (id, name, public)
--   values ('secretaria-fotos','secretaria-fotos', false) on conflict do nothing;
-- O caminho de cada arquivo começa pelo user_wa (isolamento). Acesso só pelo
-- backend com a service key (que ignora as policies de Storage).

-- Códigos de login da plataforma web (OTP por WhatsApp). Guardamos só o HASH
-- do código (nunca o código puro), com validade curta e contador de tentativas.
-- PK = user_wa: um código ativo por pessoa (pedir de novo substitui o anterior).
-- Acesso só pelo backend com a service key.
create table if not exists public.secretaria_auth_codes (
  user_wa      text        primary key,
  code_hash    text        not null,
  expires_at   timestamptz not null,
  attempts     integer     not null default 0,
  last_sent_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

alter table public.secretaria_auth_codes enable row level security;

-- Senhas do painel web. Login = número do WhatsApp + senha; a senha é criada/
-- redefinida por fluxo verificado por OTP (secretaria_auth_codes). Guardamos só
-- o HASH (scrypt com salt). Uma linha por variante de wa_id. `falhas` +
-- `bloqueado_ate` protegem contra força bruta.
create table if not exists public.secretaria_senhas (
  user_wa       text        primary key,
  senha_hash    text        not null,
  falhas        integer     not null default 0,
  bloqueado_ate timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.secretaria_senhas enable row level security;

-- Cadastro estruturado das obras (nome, cliente, endereço, contexto, datas).
-- Fonte editável pelo painel; os lançamentos (custos/RDO/materiais/docs/fotos)
-- continuam referenciando a obra pelo NOME (string), então renomear uma obra
-- faz cascata no código (renameObraLinks). unique(user_wa, nome) evita duplicar.
create table if not exists public.secretaria_obras (
  id            bigint generated always as identity primary key,
  user_wa       text        not null,
  nome          text        not null,
  cliente       text,
  endereco      text,
  contexto      text,
  data_inicio   date,
  data_fim_alvo date,
  status        text        not null default 'ativa'
                check (status in ('ativa','pausada','concluida')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_wa, nome)
);

create index if not exists secretaria_obras_user_idx on public.secretaria_obras (user_wa);

alter table public.secretaria_obras enable row level security;

-- Observação sobre RLS:
-- O backend acessa o Postgres com a SERVICE ROLE KEY, que ignora Row Level
-- Security. Estas tabelas nunca são expostas ao cliente/browser, então RLS
-- não é necessário aqui. Se um dia expor via anon key, habilite RLS e
-- políticas por user_wa antes.

-- ---------------------------------------------------------------------------
-- Planos em 3 níveis + limites de uso + pacotes extras (28/09/2026)
-- ---------------------------------------------------------------------------
-- secretaria_planos ganha os LIMITES (editáveis no /admin). limite_obras null =
-- ilimitado. Os RECURSOS de cada plano (quais funções) ficam no código
-- (src/pay/planos.ts). Ids antigos essencial/profissional ficam ignorados pelo
-- código novo (mapeados para obra/construtora em quem já os tem gravado).
alter table public.secretaria_planos
  add column if not exists limite_mensagens integer,
  add column if not exists limite_fotos     integer,
  add column if not exists limite_audio_min integer,
  add column if not exists limite_obras     integer;

insert into public.secretaria_planos
  (id, nome, valor, descricao, ativo, ordem, limite_mensagens, limite_fotos, limite_audio_min, limite_obras)
values
  ('agenda', 'Agenda', 49.00, 'Agenda, lembretes, memória e custos de 1 obra.', true, 1, 250, 0, 30, 1),
  ('obra', 'Obra', 119.00, 'Diário de Obra em PDF, notas fiscais por foto e prazos de documentos.', true, 2, 400, 50, 180, 5),
  ('construtora', 'Construtora', 229.00, 'Obras ilimitadas, compras e cotações, orçamento com os seus preços.', true, 3, 700, 300, 600, null)
on conflict (id) do nothing;

-- Uso por usuário/mês: contadores das cotas + custo REAL (tokens da API).
-- extra_* = pacotes comprados no mês (somam ao limite do plano).
create table if not exists public.secretaria_uso (
  user_wa               text        not null,
  mes                   text        not null, -- 'YYYY-MM' no fuso do usuário
  mensagens             integer     not null default 0,
  fotos                 integer     not null default 0,
  audio_seg             integer     not null default 0,
  chamadas_ia           integer     not null default 0,
  tokens_entrada        bigint      not null default 0,
  tokens_saida          bigint      not null default 0,
  tokens_cache_leitura  bigint      not null default 0,
  tokens_cache_escrita  bigint      not null default 0,
  custo_usd             numeric(12,6) not null default 0,
  extra_mensagens       integer     not null default 0,
  extra_fotos           integer     not null default 0,
  extra_audio_seg       integer     not null default 0,
  updated_at            timestamptz not null default now(),
  primary key (user_wa, mes)
);

create index if not exists secretaria_uso_mes_idx on public.secretaria_uso (mes);
alter table public.secretaria_uso enable row level security;

-- Incremento ATÔMICO (mensagens simultâneas não se atropelam).
create or replace function public.secretaria_uso_incrementar(
  p_user_wa text, p_mes text,
  p_mensagens integer default 0, p_fotos integer default 0, p_audio_seg integer default 0,
  p_chamadas_ia integer default 0, p_tokens_entrada bigint default 0, p_tokens_saida bigint default 0,
  p_tokens_cache_leitura bigint default 0, p_tokens_cache_escrita bigint default 0,
  p_custo_usd numeric default 0,
  p_extra_mensagens integer default 0, p_extra_fotos integer default 0, p_extra_audio_seg integer default 0
) returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.secretaria_uso as u (
    user_wa, mes, mensagens, fotos, audio_seg, chamadas_ia, tokens_entrada, tokens_saida,
    tokens_cache_leitura, tokens_cache_escrita, custo_usd, extra_mensagens, extra_fotos, extra_audio_seg
  ) values (
    p_user_wa, p_mes, p_mensagens, p_fotos, p_audio_seg, p_chamadas_ia, p_tokens_entrada, p_tokens_saida,
    p_tokens_cache_leitura, p_tokens_cache_escrita, p_custo_usd, p_extra_mensagens, p_extra_fotos, p_extra_audio_seg
  )
  on conflict (user_wa, mes) do update set
    mensagens            = u.mensagens + excluded.mensagens,
    fotos                = u.fotos + excluded.fotos,
    audio_seg            = u.audio_seg + excluded.audio_seg,
    chamadas_ia          = u.chamadas_ia + excluded.chamadas_ia,
    tokens_entrada       = u.tokens_entrada + excluded.tokens_entrada,
    tokens_saida         = u.tokens_saida + excluded.tokens_saida,
    tokens_cache_leitura = u.tokens_cache_leitura + excluded.tokens_cache_leitura,
    tokens_cache_escrita = u.tokens_cache_escrita + excluded.tokens_cache_escrita,
    custo_usd            = u.custo_usd + excluded.custo_usd,
    extra_mensagens      = u.extra_mensagens + excluded.extra_mensagens,
    extra_fotos          = u.extra_fotos + excluded.extra_fotos,
    extra_audio_seg      = u.extra_audio_seg + excluded.extra_audio_seg,
    updated_at           = now();
$$;

revoke all on function public.secretaria_uso_incrementar(
  text, text, integer, integer, integer, integer, bigint, bigint, bigint, bigint, numeric, integer, integer, integer
) from public, anon, authenticated;

-- Compras de pacotes extras. mp_payment_id ÚNICO = idempotência do webhook
-- (o MP reenvia notificações). origem 'admin' = concessão manual.
create table if not exists public.secretaria_pacotes_compras (
  id             bigint generated always as identity primary key,
  user_wa        text        not null,
  mes            text        not null,
  pacote_id      text        not null,
  valor          numeric(10,2) not null default 0,
  origem         text        not null check (origem in ('mercadopago','admin')),
  mp_payment_id  text        unique,
  created_at     timestamptz not null default now()
);

create index if not exists secretaria_pacotes_user_idx on public.secretaria_pacotes_compras (user_wa, mes);
alter table public.secretaria_pacotes_compras enable row level security;

-- Agenda INTERNA da Rosana (compromissos). Fonte da verdade da agenda; funciona
-- SEM Google. Quando o usuário conecta o Google, o evento é ESPELHADO lá
-- (google_event_id). Isolado por user_wa.
create table if not exists public.secretaria_eventos (
  id               bigint generated always as identity primary key,
  user_wa          text        not null,
  titulo           text        not null,
  inicio           timestamptz not null,
  fim              timestamptz,
  local            text,
  descricao        text,
  obra             text,
  lembrete_em      timestamptz,
  lembrete_enviado boolean     not null default false,
  google_event_id  text,
  status           text        not null default 'ativo'
                   check (status in ('ativo','cancelado')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists secretaria_eventos_user_inicio_idx
  on public.secretaria_eventos (user_wa, inicio);
create index if not exists secretaria_eventos_lembrete_idx
  on public.secretaria_eventos (lembrete_em)
  where lembrete_enviado = false and status = 'ativo';

alter table public.secretaria_eventos enable row level security;

-- Config interna (chave/valor), só backend (service key). Guarda, por exemplo,
-- cron_lembretes_token (auth do pg_cron que dispara os lembretes).
create table if not exists public.secretaria_config (
  chave      text primary key,
  valor      text not null,
  created_at timestamptz not null default now()
);
alter table public.secretaria_config enable row level security;

-- Agendador dos lembretes (minuto a minuto), via pg_cron + pg_net:
--   create extension if not exists pg_cron;  create extension if not exists pg_net;
--   insert into secretaria_config(chave,valor)
--     values('cron_lembretes_token', encode(gen_random_bytes(24),'hex')) on conflict do nothing;
--   select cron.schedule('disparar_lembretes','* * * * *', $$
--     select net.http_post(
--       url := 'https://secretaria-virtual-seven.vercel.app/api/cron/bomdia?acao=lembretes',
--       headers := jsonb_build_object('Authorization','Bearer '||
--         (select valor from public.secretaria_config where chave='cron_lembretes_token'),
--         'Content-Type','application/json'),
--       body := '{}'::jsonb);
--   $$);

-- Preferências do usuário (resumo diário + lembrete automático de compromisso):
alter table public.secretaria_usuarios
  add column if not exists resumo_hora text not null default '08:00',
  add column if not exists lembrete_antecedencia_min integer not null default 30,
  add column if not exists resumo_ultimo date;

-- Log das ações PROATIVAS da Rosana (lembretes/resumos enviados), p/ a aba
-- "O que a Rosana fez por você". Os "Programados" vêm de secretaria_eventos.
create table if not exists public.secretaria_acoes (
  id         bigint generated always as identity primary key,
  user_wa    text not null,
  tipo       text not null,                         -- 'lembrete' | 'resumo'
  titulo     text not null,
  detalhe    text,
  status     text not null default 'entregue',      -- 'entregue' | 'falha'
  ref        text,                                  -- id do evento/recurso (opcional)
  created_at timestamptz not null default now()
);
create index if not exists secretaria_acoes_user_idx
  on public.secretaria_acoes (user_wa, created_at desc);
alter table public.secretaria_acoes enable row level security;

-- Versão CORPORATIVA (Fase 0/1): empresa agrupa vários WhatsApps; acesso por obra.
create table if not exists public.secretaria_empresas (
  id           bigint generated always as identity primary key,
  nome         text not null,
  dono_wa      text not null,                 -- wa do admin (canônico 13 díg.)
  plano        text not null default 'equipe',
  teto_membros integer not null default 3,    -- limite de membros (ativos+convidados)
  created_at   timestamptz not null default now()
);
alter table public.secretaria_empresas enable row level security;

create table if not exists public.secretaria_empresa_membros (
  id            bigint generated always as identity primary key,
  empresa_id    bigint not null references public.secretaria_empresas(id) on delete cascade,
  user_wa       text not null,
  nome          text,
  papel         text not null default 'engenheiro',  -- admin | engenheiro
  status        text not null default 'convidado',   -- convidado | ativo | recusado | removido
  convidado_em  timestamptz not null default now(),
  respondido_em timestamptz,
  unique (empresa_id, user_wa)
);
create index if not exists secretaria_empresa_membros_wa_idx on public.secretaria_empresa_membros (user_wa);
alter table public.secretaria_empresa_membros enable row level security;

create table if not exists public.secretaria_obra_membros (
  id         bigint generated always as identity primary key,
  obra_id    bigint not null references public.secretaria_obras(id) on delete cascade,
  user_wa    text not null,
  created_at timestamptz not null default now(),
  unique (obra_id, user_wa)
);
create index if not exists secretaria_obra_membros_wa_idx on public.secretaria_obra_membros (user_wa);
alter table public.secretaria_obra_membros enable row level security;

-- Obra pode pertencer a uma empresa (null = obra pessoal, como hoje).
alter table public.secretaria_obras
  add column if not exists empresa_id bigint references public.secretaria_empresas(id) on delete set null;

-- Billing da empresa (Fase 4): assinatura do plano-empresa por teto de membros.
alter table public.secretaria_empresas
  add column if not exists assinatura_status text not null default 'nenhuma', -- nenhuma|aguardando|pendente|authorized|paused|cancelled
  add column if not exists mp_preapproval_id text,
  add column if not exists assinatura_em timestamptz;
