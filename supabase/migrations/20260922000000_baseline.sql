-- ==========================================================================
-- Rosana — BASELINE do schema (espelho do banco de produção em 22/09/2026).
--
-- Antes só existia supabase/schema.sql, DESATUALIZADO (faltavam usuarios,
-- custos, rdo, fotos e processed_messages): não dava para recriar o banco.
-- Daqui em diante, toda mudança vira uma migração nova nesta pasta.
-- Idempotente (if not exists): rodar em cima do banco atual não muda nada.
-- ==========================================================================

create extension if not exists pg_trgm;

-- Usuários autorizados (fonte da verdade da autorização). Uma linha por
-- variante de wa_id (com/sem o nono dígito).
create table if not exists public.secretaria_usuarios (
  user_wa       text        primary key,
  nome          text        not null,
  calendar_id   text,
  contextos     text,
  dono          boolean     not null default false,
  ativo         boolean     not null default true,
  created_at    timestamptz not null default now(),
  nome_completo text,
  cpf           text,
  endereco      text,
  profissao     text,
  status        text        not null default 'ativo'
                check (status in ('pendente','ativo','bloqueado')),
  nudge_diario  boolean     not null default true
);

-- Memória de longo prazo: fatos, obras, apelidos, pendências, preferências.
create table if not exists public.secretaria_memories (
  id          bigint generated always as identity primary key,
  user_wa     text        not null,
  kind        text        not null check (kind in ('fato','obra','apelido','pendencia','preferencia')),
  content     text        not null,
  obra        text,
  status      text        not null default 'aberta' check (status in ('aberta','concluida')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists secretaria_memories_user_kind_idx on public.secretaria_memories (user_wa, kind);
create index if not exists secretaria_memories_user_obra_idx on public.secretaria_memories (user_wa, obra);

-- Histórico de conversa.
create table if not exists public.secretaria_conversations (
  id          bigint generated always as identity primary key,
  user_wa     text        not null,
  role        text        not null check (role in ('user','assistant')),
  content     text        not null,
  created_at  timestamptz not null default now()
);
create index if not exists secretaria_conversations_user_created_idx
  on public.secretaria_conversations (user_wa, created_at desc);

-- Dedup de mensagens do WhatsApp (a Meta reenvia eventos).
create table if not exists public.secretaria_processed_messages (
  wa_message_id text        primary key,
  created_at    timestamptz not null default now()
);

-- Custos por obra.
create table if not exists public.secretaria_custos (
  id          bigint generated always as identity primary key,
  user_wa     text        not null,
  obra        text,
  categoria   text        not null default 'outro'
              check (categoria in ('material','mao_de_obra','equipamento','servico','outro')),
  valor       numeric     not null check (valor >= 0),
  descricao   text,
  data        date        not null default (now() at time zone 'America/Sao_Paulo'),
  created_at  timestamptz not null default now()
);
create index if not exists secretaria_custos_user_obra_idx on public.secretaria_custos (user_wa, obra);

-- Diário de Obra (RDO): um por obra por dia.
create table if not exists public.secretaria_rdo (
  id          bigint generated always as identity primary key,
  user_wa     text        not null,
  obra        text        not null,
  data        date        not null default (now() at time zone 'America/Sao_Paulo'),
  clima       text,
  efetivo     jsonb       not null default '[]'::jsonb,
  atividades  text,
  ocorrencias text,
  materiais   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_wa, obra, data)
);
create index if not exists secretaria_rdo_user_obra_data_idx on public.secretaria_rdo (user_wa, obra, data desc);

-- Registro fotográfico (arquivo no bucket privado 'secretaria-fotos').
create table if not exists public.secretaria_fotos (
  id          bigint generated always as identity primary key,
  user_wa     text        not null,
  obra        text,
  data        date        not null default (now() at time zone 'America/Sao_Paulo'),
  tipo        text        not null default 'foto_obra' check (tipo in ('foto_obra','nota_fiscal','outro')),
  descricao   text,
  caminho     text,
  created_at  timestamptz not null default now()
);
create index if not exists secretaria_fotos_user_obra_idx on public.secretaria_fotos (user_wa, obra, data desc);

-- Tokens do Google OAuth por usuário.
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

-- Documentos e prazos da obra.
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
create index if not exists secretaria_documentos_user_obra_idx on public.secretaria_documentos (user_wa, obra);
create index if not exists secretaria_documentos_user_venc_idx on public.secretaria_documentos (user_wa, vencimento);

-- Materiais / compras / cotações.
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
create index if not exists secretaria_materiais_user_obra_idx on public.secretaria_materiais (user_wa, obra);
create index if not exists secretaria_materiais_user_status_idx on public.secretaria_materiais (user_wa, status);

-- Códigos OTP do painel (só o hash).
create table if not exists public.secretaria_auth_codes (
  user_wa      text        primary key,
  code_hash    text        not null,
  expires_at   timestamptz not null,
  attempts     integer     not null default 0,
  last_sent_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

-- Senhas do painel (hash scrypt). Uma linha por variante de wa_id.
create table if not exists public.secretaria_senhas (
  user_wa       text        primary key,
  senha_hash    text        not null,
  falhas        integer     not null default 0,
  bloqueado_ate timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Cadastro estruturado das obras.
create table if not exists public.secretaria_obras (
  id            bigint generated always as identity primary key,
  user_wa       text        not null,
  nome          text        not null,
  cliente       text,
  endereco      text,
  contexto      text,
  data_inicio   date,
  data_fim_alvo date,
  status        text        not null default 'ativa' check (status in ('ativa','pausada','concluida')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (user_wa, nome)
);
create index if not exists secretaria_obras_user_idx on public.secretaria_obras (user_wa);

-- RLS ligado em TODAS as tabelas, sem policies: anon/authenticated não leem
-- nada. O backend usa a service key (que ignora RLS).
alter table public.secretaria_usuarios            enable row level security;
alter table public.secretaria_memories            enable row level security;
alter table public.secretaria_conversations       enable row level security;
alter table public.secretaria_processed_messages  enable row level security;
alter table public.secretaria_custos              enable row level security;
alter table public.secretaria_rdo                 enable row level security;
alter table public.secretaria_fotos               enable row level security;
alter table public.secretaria_oauth_tokens        enable row level security;
alter table public.secretaria_documentos          enable row level security;
alter table public.secretaria_materiais           enable row level security;
alter table public.secretaria_auth_codes          enable row level security;
alter table public.secretaria_senhas              enable row level security;
alter table public.secretaria_obras               enable row level security;

-- Bucket privado das fotos.
insert into storage.buckets (id, name, public)
values ('secretaria-fotos', 'secretaria-fotos', false)
on conflict (id) do nothing;
