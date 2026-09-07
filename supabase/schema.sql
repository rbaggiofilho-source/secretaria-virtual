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

-- Observação sobre RLS:
-- O backend acessa o Postgres com a SERVICE ROLE KEY, que ignora Row Level
-- Security. Estas tabelas nunca são expostas ao cliente/browser, então RLS
-- não é necessário aqui. Se um dia expor via anon key, habilite RLS e
-- políticas por user_wa antes.
