# Secretária Virtual (WhatsApp) — Backend

Secretária virtual pessoal que funciona por **WhatsApp**: você manda **áudio ou texto** e recebe de volta suas tarefas organizadas e compromissos lançados na sua **agenda pessoal do Google**.

- **Stack:** Node.js + TypeScript, funções serverless na **Vercel**
- **WhatsApp:** Meta WhatsApp Cloud API (Graph API)
- **STT (transcrição):** Groq (`whisper-large-v3`) ou OpenAI Whisper — trocável por env
- **Cérebro:** Claude (Haiku mais recente) com _tool use_ (function calling)
- **Memória:** Supabase (Postgres)
- **Agenda:** Google Calendar via Service Account

## Regras de negócio embutidas

1. **Todo evento vai no calendário PESSOAL** (ID via `GOOGLE_CALENDAR_ID`). Nunca no da ENGETEC — isso é forçado no código (`src/calendar/google.ts`), não dá pra cair no calendário errado por engano.
2. Fuso sempre **America/Sao_Paulo** (configurável em `TIMEZONE`).
3. Classifica cada instrução por contexto: **ENGETEC / Certive / Pessoal**.
4. Transforma áudio desorganizado (gravado dirigindo) em tarefas e compromissos claros.
5. Se faltar horário/endereço, **pergunta curto**; se vago ("amanhã de manhã"), **assume e confirma** o horário assumido.
6. **Nada em silêncio:** se a criação de um evento falhar, você é avisado para repetir.
7. Reconhece **apelidos de obra** (ex.: `CCC` = Centro Comercial Campinas) sem pedir explicação toda vez.
8. Respostas curtas e práticas.

---

## Estrutura do projeto

```
secretaria-virtual/
├── api/
│   └── webhook.ts            # Função Vercel: GET (verificação) + POST (mensagens)
├── src/
│   ├── config/env.ts         # Carrega e valida TODAS as env vars (Zod)
│   ├── whatsapp/
│   │   ├── signature.ts      # Valida X-Hub-Signature-256 (HMAC do app secret)
│   │   ├── client.ts         # Enviar mensagem / baixar mídia (Graph API)
│   │   └── types.ts          # Tipos + extração da mensagem do payload
│   ├── stt/
│   │   ├── index.ts          # Interface transcribe() + escolha por STT_PROVIDER
│   │   ├── groq.ts
│   │   └── openai.ts
│   ├── memory/
│   │   ├── supabase.ts       # Cliente Supabase (service role)
│   │   └── context.ts        # Carregar contexto, salvar memória, pendências, histórico
│   ├── agent/
│   │   ├── system-prompt.ts  # System prompt da secretária (PT-BR) + contexto
│   │   ├── tools.ts          # Definição das 5 tools + dispatcher
│   │   └── secretary.ts      # Loop de tool use com o Claude
│   ├── calendar/google.ts    # create / update / search (SEMPRE calendário pessoal)
│   ├── util/datetime.ts      # Helpers de fuso horário
│   └── pipeline.ts           # Orquestra o fluxo ponta a ponta
├── supabase/schema.sql       # Tabelas: memories, conversations
├── .env.example
└── vercel.json
```

---

## Fluxo (o que acontece a cada mensagem)

1. `GET /webhook` responde o handshake da Meta (`hub.challenge`/`hub.verify_token`).
2. `POST /webhook` valida a assinatura `X-Hub-Signature-256` **antes** de processar.
3. Identifica se é texto ou áudio.
4. **Áudio:** baixa a mídia pela Graph API (`media_id` → URL → bytes) e transcreve no STT.
5. Carrega seu contexto/memória do Supabase (fatos, obras, apelidos, pendências, histórico).
6. Chama o Claude com system prompt + contexto + histórico + as tools.
7. Executa as tool calls (criar evento, salvar memória, etc.).
8. Persiste memória/histórico novos no Supabase.
9. Responde no WhatsApp dentro da janela de 24h.

---

## Passo a passo de setup

### 0. Pré-requisitos

- Node.js 20+
- Contas: Meta for Developers, Supabase, Google Cloud, Anthropic, e Groq **ou** OpenAI.
- `npm install`

### 1. Supabase (memória)

1. Crie um projeto em [supabase.com](https://supabase.com).
2. **SQL Editor** → cole e rode o conteúdo de `supabase/schema.sql`.
3. **Settings → API**: copie `Project URL` (→ `SUPABASE_URL`) e a **`service_role` key** (→ `SUPABASE_SERVICE_KEY`). A service key fica **só no backend**.

### 2. Google Calendar (Service Account) — recomendado

Por que Service Account: não expira (sem refresh token pra renovar). Você compartilha seu calendário pessoal com o e-mail da conta de serviço.

1. [Google Cloud Console](https://console.cloud.google.com) → crie/escolha um projeto.
2. **APIs & Services → Library** → habilite **Google Calendar API**.
3. **APIs & Services → Credentials → Create credentials → Service account**. Dê um nome e crie.
4. Abra a service account → aba **Keys → Add key → Create new key → JSON**. Baixa um arquivo JSON.
5. Copie o campo **`client_email`** desse JSON (algo como `...@...iam.gserviceaccount.com`).
6. No **Google Calendar** (web) → Configurações do seu calendário **pessoal** → **Compartilhar com pessoas específicas** → adicione o `client_email` com permissão **"Fazer alterações nos eventos"**.
7. Ainda nas configurações do calendário → copie o **"ID do calendário"** (→ `GOOGLE_CALENDAR_ID`; no calendário principal costuma ser seu e-mail).
8. Cole o **JSON inteiro em uma linha** em `GOOGLE_SERVICE_ACCOUNT_JSON`.

> Alternativa (OAuth refresh token) existe, mas exige gerar/renovar token. A Service Account é mais simples para uso pessoal.

### 3. Anthropic (Claude)

- [console.anthropic.com](https://console.anthropic.com) → crie uma API key → `ANTHROPIC_API_KEY`.
- Modelo padrão: `claude-haiku-4-5` (Haiku mais recente). Ajuste com `ANTHROPIC_MODEL` se quiser.

### 4. STT (transcrição)

- **Groq** (padrão): [console.groq.com](https://console.groq.com) → API key → `GROQ_API_KEY`, `STT_PROVIDER=groq`.
- **ou OpenAI:** `OPENAI_API_KEY`, `STT_PROVIDER=openai`.

### 5. WhatsApp Cloud API (Meta)

1. [developers.facebook.com](https://developers.facebook.com) → crie um app do tipo **Business** → adicione o produto **WhatsApp**.
2. Em **WhatsApp → API Setup**: pegue o **Phone number ID** (→ `WHATSAPP_PHONE_NUMBER_ID`).
3. **App Secret:** App **Settings → Basic** (→ `WHATSAPP_APP_SECRET`).
4. **Token permanente:** **Business Settings → Users → System users** → crie um system user, gere um token com permissão `whatsapp_business_messaging` e `whatsapp_business_management` (→ `WHATSAPP_TOKEN`).
5. Escolha um texto qualquer para `WHATSAPP_VERIFY_TOKEN` (você define; será usado no handshake).
6. (Opcional) `ALLOWED_WHATSAPP_NUMBER` = seu número (E.164 sem `+`, ex.: `5519999999999`) para o bot só te atender.

### 6. Deploy na Vercel

1. Suba este repositório para o GitHub.
2. Em [vercel.com](https://vercel.com) → **New Project** → importe o repo.
3. **Settings → Environment Variables:** preencha tudo do `.env.example` (Production).
4. Deploy. A URL do webhook será `https://SEU-PROJETO.vercel.app/api/webhook`.

### 7. Conectar o webhook à Meta

1. Em **WhatsApp → Configuration → Webhook** → **Edit**:
   - **Callback URL:** `https://SEU-PROJETO.vercel.app/api/webhook`
   - **Verify token:** o mesmo valor de `WHATSAPP_VERIFY_TOKEN`
   - Clique em **Verify and save** (a Meta faz o `GET` de verificação).
2. Em **Webhook fields** → assine **`messages`**.

---

## Testar ponta a ponta

1. **Verificação (GET):**
   ```bash
   curl "https://SEU-PROJETO.vercel.app/api/webhook?hub.mode=subscribe&hub.verify_token=SEU_VERIFY_TOKEN&hub.challenge=12345"
   # Deve responder: 12345
   ```
2. **Texto:** mande no WhatsApp do bot: _"Reunião na CCC amanhã às 9h"_. Espere a confirmação com o evento criado e o horário assumido.
3. **Áudio:** grave um áudio ("Amanhã de manhã preciso passar na obra da CCC e comprar cimento"). O bot transcreve, agenda e registra a pendência.
4. **Agenda:** confira o evento no seu Google Calendar **pessoal**.
5. **Pendências:** _"o que tá pendente na CCC?"_ deve listar o que você registrou.

Rode `npm run typecheck` localmente para validar o build antes de subir.

---

## ✅ Checklist de credenciais (o que você precisa preencher)

| Variável | Onde pegar |
| --- | --- |
| `WHATSAPP_TOKEN` | Meta → Business Settings → System users → token permanente |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta → WhatsApp → API Setup |
| `WHATSAPP_VERIFY_TOKEN` | Você inventa (usado no handshake) |
| `WHATSAPP_APP_SECRET` | Meta → App Settings → Basic |
| `ALLOWED_WHATSAPP_NUMBER` | (opcional) seu número E.164 sem `+` |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `ANTHROPIC_MODEL` | (opcional) padrão `claude-haiku-4-5` |
| `STT_PROVIDER` | `groq` ou `openai` |
| `GROQ_API_KEY` / `OPENAI_API_KEY` | do provedor escolhido |
| `GOOGLE_CALENDAR_ID` | Config. do calendário pessoal → ID do calendário |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | JSON da service account (em 1 linha) |
| `SUPABASE_URL` | Supabase → Settings → API |
| `SUPABASE_SERVICE_KEY` | Supabase → Settings → API → `service_role` |
| `TIMEZONE` | (opcional) padrão `America/Sao_Paulo` |

---

## Segurança

- Assinatura do webhook validada **antes** de processar qualquer payload.
- Nenhum token ou conteúdo sensível é logado (só etapa + mensagem de erro).
- Cada etapa (download, STT, Claude, calendar, envio) tem tratamento de erro; em falha de criação de evento, você é avisado.
- A `service_role` do Supabase e o JSON da service account ficam **só** nas env vars do backend.

## Notas / limitações

- O processamento (STT + Claude) roda dentro da função e só então devolve `200` à Meta (`maxDuration` de 60s cobre isso). Para volume alto, o próximo passo seria enfileirar (ex.: Supabase Queue / QStash) e responder `200` na hora.
- Memória e histórico são escopados pelo seu número de WhatsApp.
