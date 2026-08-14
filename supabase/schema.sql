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

-- Observação sobre RLS:
-- O backend acessa o Postgres com a SERVICE ROLE KEY, que ignora Row Level
-- Security. Estas tabelas nunca são expostas ao cliente/browser, então RLS
-- não é necessário aqui. Se um dia expor via anon key, habilite RLS e
-- políticas por user_wa antes.
