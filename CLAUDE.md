# Rosana — Secretária Virtual por WhatsApp (memória do projeto)

> Backend serverless (Node + TypeScript) de uma secretária virtual por WhatsApp,
> evoluindo para **plataforma vertical do setor de obras/construção**. Recebe
> **texto, áudio e imagem**; a IA organiza e executa (agenda, custos, diário de
> obra, transcrição). Última atualização deste doc: 22/08/2026.

## Regra sagrada
Compromissos são **isolados por `user_wa`** — NUNCA aparecem pra outro usuário
nem num calendário de empresa. A **agenda interna da Rosana** (`secretaria_eventos`)
é a fonte da verdade e funciona SEM Google (desde 04/10/2026). Quando o usuário
conecta o Google, o evento é ESPELHADO no Google Agenda **pessoal dele** (dono =
`GOOGLE_CALENDAR_ID`; beta = `primary` via OAuth) — nunca de empresa, nunca de
outro usuário. O modelo não escolhe calendarId nem user_wa — forçado no código.

## Usuários (multi-usuário desde 22/08/2026)
- Autorização pela tabela **`secretaria_usuarios`** (linha ativa = número
  autorizado; `ALLOWED_WHATSAPP_NUMBER` é só rede de segurança legada do dono).
- **Ricardo Baggio** (dono) — wa `554888088057`; `dono=true` ⇒ calendário via
  env `GOOGLE_CALENDAR_ID`; contextos "ENGETEC, Certive ou Pessoal".
- **Malu** (esposa; obras próprias, independentes) — cadastrada nas DUAS formas
  do wa_id (`554891470656` e `5548991470656`, nono dígito incerto). Com o OAuth
  no ar, ela NÃO precisa mais compartilhar calendário: é só mandar "conectar
  agenda" pra Rosana e autorizar o próprio Gmail (escreve no `primary` dela).
  Falta: adicionar o número dela na lista de destinatários da Meta.
- Prompt/persona parametrizados por usuário (nome + contextos da tabela);
  dados totalmente isolados por `user_wa` em todas as tabelas.
- App em **modo desenvolvimento** na Meta: além da tabela, o número precisa
  estar na lista de destinatários do painel (Etapa 1 → Destinatário).

---

## Infraestrutura e contas (identificadores — NÃO são segredos)
- **GitHub:** `rbaggiofilho-source/secretaria-virtual`
  - Branch de desenvolvimento e de produção: **`claude/virtual-secretary-whatsapp-r360w0`**
    (espelhada em `claude/whatsapp-webhook-delivery-15qtaz`).
- **Vercel:** time `baggio-s-projects2` (`team_oYrVOPPoKBfN3L8T5IzQyPbJ`). DOIS projetos, mesmo repo/branch:
  - **`secretaria-virtual`** (backend/motor) — Root = raiz. Production Branch =
    `claude/virtual-secretary-whatsapp-r360w0` (deploy automático a cada push).
    URL webhook (prod): `https://secretaria-virtual-seven.vercel.app/api/webhook`.
    `vercel.json`: `api/webhook.ts` com `maxDuration: 60`. **A home `/` mostra
    "page doesn't exist" — normal, o motor não é site.**
  - **`rosana-web`** (plataforma/painel) — Root = **`web/`** (Vite+React), mesma
    branch de produção. Domínio próprio **`userosana.com.br`** (registrado no
    registro.br; DNS grátis do registro.br → registro **A** do apex apontando
    pro IP da Vercel `216.198.79.1`; apex e `www` como "Connect to environment →
    Production", servem direto). Consome o backend por `VITE_API_BASE`.
- **Supabase:** projeto `secretaria-virtual`, ref `cwixwbimdogyshwjwyhv`.
- **Meta/WhatsApp:** app "Secretaria virtual", App ID `1023509723789911` (tipo Empresa, modo desenvolvimento).
  - WABA ID: `1996415661077852` (inscrita no app via `subscribed_apps`).
  - Phone Number ID: `1316983884826562`.
  - Número de teste (remetente): +1 555 661-2977 (número **americano** — ver Armadilhas).
  - Número autorizado (dono): +55 48 **98808**-8057 (é 98808, não 98908; wa_id chega como `554888088057`).
  - Token: usuário do sistema "AgendaPessoal" (validade **Nunca**), com `whatsapp_business_management` + `whatsapp_business_messaging`.
- **IA:** Anthropic Claude **Haiku 4.5** (`claude-haiku-4-5`). **STT:** Groq (`whisper-large-v3`).
- **Google Agenda:** conta de serviço `secretaria-calendar@secretaria-virtual-505820.iam.gserviceaccount.com` gravando em `rbaggiofilho@gmail.com`.

## Variáveis de ambiente (nomes; valores só na Vercel/Production)
`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`,
`WHATSAPP_APP_SECRET`, `ALLOWED_WHATSAPP_NUMBER`, `ANTHROPIC_API_KEY`,
`ANTHROPIC_MODEL` (default `claude-haiku-4-5`), `STT_PROVIDER` (default `groq`),
`GROQ_API_KEY`, `GROQ_STT_MODEL`, `OPENAI_API_KEY`/`OPENAI_STT_MODEL` (alternativos),
`GOOGLE_CALENDAR_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON`,
`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` (OAuth por usuário do
beta; opcionais — sem eles só o caminho da conta de serviço funciona),
`PUBLIC_BASE_URL` (default `https://secretaria-virtual-seven.vercel.app`),
`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `TIMEZONE` (default `America/Sao_Paulo`),
`CRON_SECRET` (protege o cron do "bom dia"; a Vercel manda como `Authorization: Bearer`),
`WEB_APP_ORIGIN` (opcional; trava o CORS de `/api/app/*` numa origem — sem ele é `*`),
`MERCADOPAGO_ACCESS_TOKEN` (opcional; Access Token de PRODUÇÃO do Mercado Pago —
sem ele o cadastro/checkout fica inerte: grava o lead e mostra "em breve", sem cobrar),
`ADMIN_BOOTSTRAP_TOKEN` (opcional; segredo p/ criar o 1º acesso do admin em
`/admin` → "Criar meu login". Sem ele o bootstrap fica desativado; depois de criar
o admin pode remover),
`NFSE_API_KEY`, `NFSE_COMPANY_ID`, `NFSE_CITY_SERVICE_CODE` (+ opcionais
`NFSE_FEDERAL_SERVICE_CODE`, `NFSE_CNAE_CODE`, `NFSE_ENVIAR_EMAIL`) — emissor de
NFS-e NFE.io; sem eles as notas ficam na fila (ver "Nota fiscal automática").
Validadas via `zod` em `src/config/env.ts` (faz `trim`; STT_PROVIDER tolerante a maiúsculas).
- **Projeto `rosana-web` (site):** `VITE_API_BASE` = `https://secretaria-virtual-seven.vercel.app`
  (URL do backend; lida em build pelo `web/src/lib/api.ts`, com fallback pra essa mesma URL).

---

## Arquitetura (fluxo de uma mensagem)
`api/webhook.ts` (handler Web `Request`→`Response`) → valida assinatura
`X-Hub-Signature-256` sobre o **corpo bruto** (`request.text()`) → dedup por
`message.id` (`claimMessageOnce`) → `handleIncomingMessage` (`src/pipeline.ts`) →
resolve entrada (texto / áudio→STT Groq / imagem→base64 p/ visão) → carrega
contexto+histórico do Supabase → `runSecretary` (`src/agent/secretary.ts`: loop
de tool-use com Claude, máx 6 turnos) → persiste histórico → responde no
WhatsApp. Eventos de status (sent/delivered/read/failed) são logados.

## Arquivos-chave
- `api/webhook.ts` — webhook (GET verificação, POST mensagens), dedup, log de status.
- `src/pipeline.ts` — orquestra texto/áudio/imagem → agente → resposta.
- `src/agent/secretary.ts` — loop tool-use com Claude; conteúdo multimodal (imagem+texto).
- `src/agent/system-prompt.ts` — persona + regras (obra, RDO, visão, áudio/transcrição, responsabilidade técnica).
- `src/agent/tools.ts` — definição + dispatch das ferramentas.
- `src/memory/context.ts` + `supabase.ts` — acesso a dados (memória, histórico, custos, RDO, fotos, documentos, dedup).
- `src/memory/storage.ts` — arquivos das fotos no Supabase Storage (bucket privado `secretaria-fotos`; upload no ingest, download p/ reenvio).
- `src/stt/{index,groq,openai}.ts` — transcrição.
- `src/memory/eventos.ts` — AGENDA INTERNA (CRUD de `secretaria_eventos`): criar,
  listar (janela), atualizar, cancelar, getEvento. Fonte da verdade da agenda.
- `src/calendar/google.ts` — Google Agenda (conta de serviço OU OAuth por usuário;
  `CalendarAuth`). Usado só como ESPELHO opcional da agenda interna.
- `src/oauth/google.ts` — OAuth Google (URL de consentimento, troca de code, state assinado).
- `src/oauth/page.ts` — páginas HTML de fim do fluxo OAuth (sucesso/erro).
- `api/cadastro.ts` — site de cadastro do beta. `api/oauth/{start,callback}.ts` — fluxo OAuth.
- `api/cron/bomdia.ts` — tique de minuto + resumo diário. `?acao=lembretes` (o que
  o pg_cron chama 1×/min) faz DUAS coisas: (a) dispara os lembretes vencidos
  (últimas ~2h, marca `lembrete_enviado` só no sucesso) e (b) envia o RESUMO diário
  ("bom dia" + **agenda de hoje** de `secretaria_eventos`) no HORÁRIO escolhido por
  cada usuário (`resumo_hora`, dedup por `resumo_ultimo`, só dias úteis, só quem
  está na janela de 24h + `nudge_diario`). O cron DIÁRIO fixo da Vercel foi REMOVIDO
  (o resumo agora é por horário via pg_cron); a rota sem `?acao` continua existindo
  só p/ teste manual. É chamado de MINUTO EM MINUTO pelo **pg_cron do Supabase** (job `disparar_lembretes`,
  jobid 1, schedule `* * * * *`) via **pg_net** → POST no endpoint com um token
  guardado em `secretaria_config` (chave `cron_lembretes_token`, gerado DENTRO do
  banco; o endpoint lê o mesmo token pela service key — sem Vault, sem config
  manual). Validado (HTTP 200). O cron DIÁRIO do "bom dia" segue sendo da Vercel
  (`0 11 * * 1-5`). Extensões `pg_cron` + `pg_net` já habilitadas no projeto.
- `api/privacidade.ts` (/privacidade) e `api/termos.ts` (/termos) — páginas legais (LGPD).
- **Plataforma web (painel):**
  - `src/auth/session.ts` — token de sessão assinado (HMAC com `WHATSAPP_APP_SECRET`,
    TTL 30d; `sessionFromRequest` lê `Authorization: Bearer`).
  - `src/auth/codes.ts` — OTP por WhatsApp (6 díg.; só HASH; TTL 10min; cooldown
    1min; máx 5 tentativas; uso único), p/ criar/redefinir senha. `resolveUsuarioAtivo`
    + `candidatosWa` (tolerante ao formato do número).
  - `src/auth/password.ts` — senha (hash scrypt, `verifyLogin` com anti-brute-force,
    `setPassword`, `validarSenha`).
  - `src/auth/http.ts` — CORS + helpers JSON dos endpoints `/api/app/*`.
  - `src/app/dashboard.ts` — agrega o panorama real por `user_wa` (obras derivadas,
    custos por categoria, RDOs, prazos, contadores).
  - **Dois roteadores** (p/ caber no limite de 12 funções do Hobby — ver Armadilhas):
    - `api/app/auth.ts` — `?acao=login|request-code|set-password|change-password` (POST)
      e `?acao=session` (GET).
    - `api/app/data.ts` — `?recurso=dashboard|obras|custos|rdo|documentos|materiais|fotos|plano|conta|atividade|empresa`
      (GET) e POST `?recurso=empresa` (painel do admin da empresa: acao=criar|
      convidar|remover|criar_obra|atribuir, valida `empresaComoAdmin`) /
      `?recurso=obras` (cria/edita obra) / `?recurso=conta` (salva
      cadastro + preferências da aba "Minha conta": nome/nome_completo/email/
      profissão + resumo_hora/antecedência + nudge_diario; número conectado e
      assinatura são só leitura). `src/app/{dashboard,obras}.ts` agregam;
      `getPerfil`/`atualizarPerfil`/`setPreferencias`/`setNudgeDiario` (context.ts).
      GET `?recurso=atividade` = aba "O que a Rosana fez por você": `programados`
      (lembretes futuros de `secretaria_eventos` via `lembretesProgramados`) +
      `entregues` (ações enviadas de `secretaria_acoes` via `listarAcoes`).
      `signedFotoUrl` (storage.ts) = URL temporária p/ exibir foto sem abrir o bucket.
    - `api/app/rdo-pdf.ts` — download do PDF do RDO por obra (função à parte, binário).
    - `api/app/pay.ts` — pagamento/assinatura (Mercado Pago), PÚBLICO (sem token):
      `?acao=assinar` (POST: grava lead em `secretaria_usuarios` como pendente +
      cria preapproval no MP + devolve `init_point`; sem token do MP devolve
      `aguardandoIntegracao`) e `?acao=webhook` (notificação do MP → ativa/desativa
      o usuário). Módulos: `src/pay/planos.ts` (preços), `src/pay/mercadopago.ts`
      (API preapproval), `src/memory/assinaturas.ts` (`registrarLeadPagamento`,
      `atualizarAssinatura`, `normalizarWaBR`; dono é blindado). Preço cobrado vem
      do BANCO (`src/pay/planos-db.ts`), não do estático.
    - `api/app/admin.ts` — PAINEL DE ADMINISTRAÇÃO (endpoint único; público só em
      `?recurso=planos-public` e `?acao=bootstrap|login`; o resto exige token admin).
      Auth admin em `src/auth/admin.ts` (login por e-mail+senha em
      `secretaria_admins`, token HMAC com rótulo `adm1`/role admin, TTL 12h,
      bootstrap via `ADMIN_BOOTSTRAP_TOKEN`) — INDEPENDENTE do número de WhatsApp.
      `src/auth/hash.ts` (scrypt reutilizável). Métricas em `src/admin/metrics.ts`
      (overview/KPIs, lista de usuários dedup por email/wa, ativar/desativar;
      "consumo" = PROXY por nº de mensagens em `secretaria_conversations`, não há
      API de saldo dos provedores). Planos editáveis em `secretaria_planos`.
      **São 12 funções serverless — no LIMITE do Hobby; não criar mais arquivos em
      /api (estender roteadores).**
  - `web/` — SPA Vite+React+react-router (deploy no projeto `rosana-web`).
    `web/src/App.tsx` (rotas + portão de sessão), `components/PanelLayout.tsx`
    (moldura + `Outlet`), `components/Sidebar.tsx` (NavLink), `lib/api.ts` (cliente +
    token no localStorage), `pages/{Landing,Cadastro,Login,VisaoGeral,Obras,Custos,
    Diario,Fotos,Documentos,Materiais,Atividade,Empresa,MinhaConta,Configuracoes}.tsx`, `styles/{global,landing}.css`.
    A aba **"Minha empresa"** (`pages/Empresa.tsx`, rota `/painel/empresa`) é o
    painel do admin da versão corporativa: cabeçalho (nome + Ativo, renomear só
    master), **Plano e vagas** (só leitura; gerido em Minha conta), **Equipe**
    (nome/telefone/**cargo**/papel + convidar/remover/**promover a admin** — só
    master; `promoverMembro`/`definirCargoMembro`/`renomearEmpresa`), **Obras da
    empresa** (criar + atribuir colaboradores, botão "Todos"). **Papéis:** MASTER
    (dono, `ehMaster` compara `dono_wa`) mexe em nome/plano/equipe; ADMIN
    (promovido) vê tudo + gerencia obras/clientes/contexto, mas NÃO equipe/plano/
    nome. Permissões no servidor (data?recurso=empresa, `soMaster()`).
    **Minha conta** virou o lugar de **gerir a assinatura da empresa** (seletor de
    plano, só master) + link p/ Configurações. **Configurações** (saiu do menu
    lateral; acessada por Minha conta) = trocar senha + **tema claro/escuro**
    (`lib/theme.ts`, `data-theme` no `<html>`, bloco `[data-theme="dark"]` no CSS).
    A aba **"Atividade"** (`pages/Atividade.tsx`, rota `/painel/atividade`) mostra
    "Programados" (lembretes futuros) + "Entregues" (lembretes/resumos enviados,
    com status) via GET `data?recurso=atividade`.
    A aba **"Minha conta"** (`pages/MinhaConta.tsx`, rota `/painel/conta`) edita o
    cadastro (nome/e-mail/profissão), mostra o número conectado (só leitura) e a
    assinatura, e ajusta as preferências (horário do resumo + antecedência do
    lembrete + liga/desliga o resumo diário) via POST `data?recurso=conta`.
    `web/vercel.json` = SPA fallback + cache.
- Exclusão de conta: `excluirDadosUsuario` (context.ts) apaga tudo por wa_id + arquivos do Storage (`removeFotos`).
- `src/whatsapp/{client,signature,types}.ts` — envio (texto/documento/upload de mídia), HMAC, tipos.
- `src/pdf/rdo.ts` — geração do PDF do RDO (pdf-lib). Layout profissional:
  faixa de cabeçalho com a marca "Rosana" (repetida em toda página), bloco de
  identificação da obra (cliente/endereço/período/dias — cliente+endereço vêm do
  cadastro `secretaria_obras` via `buscarObraPorNome`), seções por dia com barra
  de data+dia-da-semana e tabela de efetivo (função×qtd+total), bloco de
  assinatura do **responsável técnico (ART/RRT)** + fiscalização/cliente, e
  rodapé com numeração "Página X de Y" + emissão. Entrada `RdoPdfInput` aceita
  `cliente/endereco/responsavel/emitidoPor` opcionais (preenchidos pelos callers
  `gerar_rdo_pdf` em tools.ts e `api/app/rdo-pdf.ts`).
- `src/data/precos-referencia.ts` — base de preços de REFERÊNCIA (433 insumos,
  média de mercado; gerada do xlsx do Ricardo). `src/precos/index.ts` = busca
  (`buscarPrecos`). Para ATUALIZAR: reimportar a planilha e regerar o arquivo +
  deploy (é dado estático versionado no git, não no banco).
- `src/util/datetime.ts` — fuso e formatação de datas.
- `supabase/schema.sql` — schema.
- `package.json`: `"type":"module"`, deps: `@anthropic-ai/sdk, @supabase/supabase-js, googleapis, pdf-lib, zod`; **sem** script `build`.

## Modelo de dados (Supabase — todas com RLS ligado)
- `secretaria_memories` — fatos, obras, apelidos, pendências, preferências (por `user_wa`).
- `secretaria_conversations` — histórico (role user/assistant).
- `secretaria_processed_messages` — dedup (PK `wa_message_id`).
- `secretaria_config` — config interna (chave/valor; só backend). Guarda
  `cron_lembretes_token` (auth do pg_cron de lembretes). `src/memory/config.ts`.
- `secretaria_eventos` — AGENDA INTERNA (compromissos) por `user_wa`. Fonte da
  verdade da agenda; funciona SEM Google. Campos: titulo, inicio/fim (timestamptz),
  local, descricao, obra, lembrete_em/lembrete_enviado (preparado p/ lembrete-minuto
  futuro), google_event_id (espelho no Google, quando conectado), status
  (ativo/cancelado). Funções em `src/memory/eventos.ts`.
- `secretaria_auth_codes` — códigos OTP do painel web, usados p/ criar/redefinir
  senha (PK `user_wa`; `code_hash`, `expires_at`, `attempts`, `last_sent_at`).
- `secretaria_senhas` — senhas do painel (PK `user_wa`; `senha_hash` scrypt,
  `falhas`, `bloqueado_ate`). Uma linha por variante de wa_id.
- `secretaria_obras` — cadastro ESTRUTURADO e editável da obra (id; nome; cliente;
  endereco; contexto; data_inicio; data_fim_alvo; status ativa/pausada/concluida).
  unique(user_wa,nome). Os lançamentos referenciam a obra pelo NOME, então
  renomear faz cascata (`renameObraLinks` em `src/memory/obras.ts`). Editado pelo
  painel; obras vindas só do WhatsApp aparecem como "não organizadas" até editar.
- `secretaria_etapas` — ETAPAS/fases de uma obra (a "sub-matriz" dentro da obra),
  desde 05/10 (Fase 1). id; user_wa; obra (por NOME); nome; ordem; status
  (planejada/em_andamento/concluida); unique(user_wa,obra,nome). `src/memory/etapas.ts`
  (`listarEtapas`, `criarEtapa` [find-or-create por nome, case-insensitive],
  `resolverOuCriarEtapa` [devolve o nome canônico pra gravar no lançamento]). Os
  lançamentos carregam a COLUNA `etapa` (texto, nome da etapa dentro da obra) em
  custos/rdo/fotos/documentos/materiais/eventos. Rename/exclusão de obra cascateia
  etapas junto. OBS (Fase 1): o registro das etapas é por `user_wa` de quem cria
  (compartilhar etapa entre a equipe da empresa e o DRILL obra→etapa→itens no
  painel = Fase 2).
- `secretaria_custos` — custos por obra (categoria: material/mao_de_obra/equipamento/servico/outro; valor; descrição; data). + coluna `etapa`.
- `secretaria_rdo` — Diário de Obra (unique por user_wa+obra+data; clima, efetivo jsonb, atividades, ocorrências, materiais).
- `secretaria_fotos` — registro fotográfico (tipo: foto_obra/nota_fiscal/outro; descrição da IA; obra; data; caminho).
- `secretaria_usuarios` — usuários autorizados (PK user_wa; nome, calendar_id,
  contextos, dono, ativo, nudge_diario; + nome_completo, cpf, endereco, profissao,
  status do cadastro do beta; + email, plano, assinatura_status (nenhuma/pendente/
  authorized/paused/cancelled), mp_preapproval_id, assinatura_em — onboarding pago;
  + resumo_hora ('HH:MM', default 08:00), lembrete_antecedencia_min (default 30),
  resumo_ultimo (date, dedup do resumo diário) — preferências).
  Fonte da verdade da autorização. Lead pago entra com ativo=false/status
  'pendente_pagamento'; o webhook do MP liga ativo=true quando 'authorized'.
- `secretaria_acoes` — LOG das ações proativas da Rosana (lembretes/resumos que
  ela ENVIOU) por `user_wa`: tipo, titulo, detalhe, status (entregue/falha), ref
  (id do evento), created_at. Alimenta a aba "Atividade" (seção "Entregues");
  gravado em `src/memory/acoes.ts` (`registrarAcao`/`listarAcoes`), nunca derruba
  o envio. Os "Programados" vêm de `secretaria_eventos` (lembrete futuro).
- **Versão corporativa (Fase 0/1 — 05/10):**
  - `secretaria_empresas` — empresa que agrupa vários WhatsApps (PK id; nome;
    dono_wa = admin canônico; plano; teto_membros; created_at).
  - `secretaria_empresa_membros` — membros (empresa_id; user_wa; nome; papel
    admin|engenheiro; status convidado|ativo|recusado|removido; convidado_em;
    respondido_em). unique(empresa_id,user_wa). Funções em `src/memory/empresa.ts`
    (`criarEmpresa` [ADOTA as obras pessoais do admin → empresa_id, pra não
    "sumir" obras ao criar a empresa e já virar o contexto da empresa],
    `empresaComoAdmin`, `empresaDoMembro`, `convitePendente`,
    `convidarMembro` [checa teto], `responderConvite`, `listarMembros`, `canonWa`).
  - `secretaria_obra_membros` — quais engenheiros entram em cada obra (obra_id;
    user_wa). Base do acesso POR OBRA (aplicação do escopo = Fase 3).
  - `secretaria_obras.empresa_id` — obra pode ser da empresa (null = pessoal).
- `secretaria_admins` — administradores do painel `/admin` (PK email; nome,
  senha_hash scrypt, ultimo_login). INDEPENDENTE de `secretaria_usuarios`/wa.
- `secretaria_planos` — planos vendáveis (PK id essencial/profissional; nome,
  valor, descricao, ativo, ordem). Fonte da verdade dos PREÇOS (pay + landing +
  cadastro + admin leem daqui; fallback estático em `src/pay/planos.ts`).
- `secretaria_uso` — uso/custo por usuário+mês (PK user_wa,mes; contadores das
  cotas, tokens, custo_usd, extra_* dos pacotes). RPC `secretaria_uso_incrementar`.
- `secretaria_pacotes_compras` — compras/concessões de pacotes extras
  (mp_payment_id único = idempotência do webhook; origem mercadopago|admin).
- `secretaria_oauth_tokens` — tokens do Google OAuth por usuário (PK user_wa;
  refresh_token, access_token, expiry, scope, google_email). Uma linha por
  variante de wa_id.
- `secretaria_documentos` — documentos/prazos da obra (alvará, ART/RRT, ASO,
  licença, seguro, contrato, certidão; vencimento; lembrete_event_id do evento
  na agenda). `registrar_documento` cria o lembrete (padrão 30 dias antes).
- `secretaria_materiais` — materiais/compras por obra (item; ciclo a_comprar→
  cotando→comprado→entregue; cotações jsonb [{fornecedor,valor_unitario,obs}];
  fornecedor/valores; previsão/entrega). `registrar_material` faz find-or-create
  por item+obra e pode lançar no custo (lancar_custo).

## Ferramentas do agente
`create_calendar_event`/`update_calendar_event`/`search_calendar_events` (AGENDA
INTERNA `secretaria_eventos` como fonte da verdade — FUNCIONA SEM Google; se o
Google estiver conectado, espelha/lê de lá também. event_id interno = `i<n>`;
ids sem prefixo = evento legado só no Google),
`dia_da_semana` (dia da semana correto de uma data — modelo não calcula de cabeça),
`resolver_data` (calcula data futura exata + dia da semana a partir de deslocamento
dias/semanas/meses — p/ "daqui um mês", "daqui 45 dias", além da tabela de 16 dias),
`criar_lembrete` (lembrete por HORÁRIO: a Rosana manda msg no WhatsApp na hora
marcada; relativo via em_minutos/em_horas/em_dias ou absoluto via quando_iso;
grava lembrete_em em `secretaria_eventos`; disparado pelo pg_cron 1×/min →
`bomdia?acao=lembretes`; só entrega dentro da janela de 24h do WhatsApp),
`conectar_agenda` (OPCIONAL — link OAuth p/ ESPELHAR a agenda no Google do usuário;
agendar/ver já funciona sem Google),
`enviar_opcoes` (responde com BOTÕES de resposta rápida do WhatsApp — até 3; o
modelo põe o texto no corpo e as opções viram botões; o toque volta como se o
usuário tivesse digitado o rótulo; usado p/ onboarding/primeiras experiências),
`revisar_conversa` (puxa sob demanda um trecho maior do histórico — últimos N dias,
padrão 7 — p/ revisar a semana e caçar compromissos não agendados; o contexto de
toda requisição carrega só as últimas 30 msgs, por custo),
`save_memory`, `get_pending`, `atualizar_memoria` (atualiza fato/obra que mudou —
evita duplicar/contradizer), `concluir_pendencia` (marca pendência resolvida),
`resumo_geral` (panorama/export de tudo salvo),
`excluir_meus_dados` (exclusão de conta LGPD; exige a frase "EXCLUIR MEUS DADOS";
dono é blindado), `configurar_lembrete_diario` (liga/desliga o resumo diário),
`configurar_preferencias` (horário do resumo `resumo_hora` HH:MM + antecedência
padrão do lembrete automático `lembrete_antecedencia_min`),
`registrar_custo`, `relatorio_custos`,
`registrar_rdo`, `consultar_rdo`, `registrar_foto`, `consultar_fotos`,
`enviar_foto` (reenvia imagem arquivada), `gerar_rdo_pdf`,
`registrar_documento`, `consultar_documentos`,
`abrir_gps` (rota/GPS p/ o endereço de uma obra cadastrada — acha a obra por nome
em `secretaria_obras` e devolve link `userosana.com.br/mapa?dest=...` que abre um
chooser Google Maps/Waze/Apple Maps),
`consultar_obras` (lista o CADASTRO estruturado — `listObrasStruct` — nome/cliente/
endereço/status/`tem_endereco` de todas as obras; FONTE DA VERDADE p/ "quais obras
tenho", endereços de TODAS as obras, clientes — a memória não tem endereços e pode
ter nomes duplicados/errados),
`criar_etapa`/`listar_etapas` (ETAPAS/fases de uma obra — Fase 1, 05/10; as tools
de registro — registrar_foto/custo/rdo/documento/material + create_calendar_event —
ganharam um campo `etapa` opcional que faz find-or-create da etapa na obra e grava
o nome na coluna `etapa` do lançamento; "registra essa foto na etapa de restauração
da obra X" → obra=X, etapa=restauração),
`registrar_material`, `consultar_materiais`,
`consultar_preco` (orçamentos: devolve `seus_precos` — preços REAIS do próprio
usuário, do histórico de `secretaria_materiais` via `buscarPrecosDoUsuario`, com
prioridade — + `referencia` — base de mercado, 433 insumos; `seus_precos` só no
plano Construtora),
`comprar_pacote` (saldo do plano no mês + link de pagamento de pacote extra;
o link vai em mensagem separada),
`criar_empresa` / `convidar_colaborador` (versão corporativa, SÓ admin/dono —
`toolsCorporativas(usuario)` só libera p/ `usuario.dono` na Fase 1: cria a
empresa e convida engenheiros pelo número; o convite + aceite rodam pelo
WhatsApp via `src/corp/convites.ts`).

## Onboarding do beta (site + OAuth) — desde 07/09/2026
- **Site de cadastro:** `GET/POST /cadastro` (`api/cadastro.ts`, rewrite no
  `vercel.json`). Coleta nome/CPF/endereço/profissão/WhatsApp + código de convite
  (`BETA_INVITE_CODE`, default `ENGETEC2026`); grava em `secretaria_usuarios`
  (uma linha por variante de wa_id, `waIdVariants`); devolve o número da Rosana +
  manual. **Ainda exige** adicionar o número à mão na lista de destinatários da
  Meta (modo dev, teto 5).
- **Conexão de agenda por usuário (Google OAuth):** cada usuário (não-dono)
  conecta a PRÓPRIA conta Google e a Rosana escreve no `primary` dele.
  - Tool `conectar_agenda` → link `PUBLIC_BASE_URL/api/oauth/start?s=<state>`.
  - `api/oauth/start.ts` valida o `state` (HMAC com `WHATSAPP_APP_SECRET`, TTL 30min)
    e redireciona pro consentimento do Google (`src/oauth/google.ts`).
  - `api/oauth/callback.ts` troca o `code` por tokens e salva o refresh_token
    (`saveOAuthToken`, em `secretaria_oauth_tokens`). Página de fim em `src/oauth/page.ts`.
  - `runTool` resolve a auth de calendário pelo SERVIDOR: OAuth (se houver token) →
    `primary`; senão dono/`calendar_id` → conta de serviço; senão avisa e oferece
    conectar. Escopo OAuth: `calendar.events`.
  - Console Google: publicar o app em **Produção** evita a expiração de ~7 dias do
    refresh_token do modo Testing (usuário vê aviso "app não verificado" — ok p/ ≤5).

## Plataforma web (painel) — desde 22/09/2026
Companheira do WhatsApp: o WhatsApp ALIMENTA (áudio/foto/texto), o painel
VISUALIZA (obras, custos por categoria, RDOs, prazos). Mesmo cérebro e mesmo
banco; nada de novo produto. Rodando em **userosana.com.br** (projeto Vercel
`rosana-web`, pasta `web/`).
- **Login = número do WhatsApp + senha (desde 22/09):** `auth?acao=login`
  (`verifyLogin` em `src/auth/password.ts`) confere número+senha e devolve o token
  de sessão. Senha guardada só como HASH **scrypt** (com salt; sem dependência
  externa), em `secretaria_senhas` (uma linha por variante de wa_id). Proteção a
  força bruta: 8 falhas → bloqueio de 15min; acerto zera. O número é a chave do
  banco, então o mapeamento identidade→dados é exato.
- **Criar (1º acesso) / redefinir senha ("esqueci"):** MESMO fluxo, verificado por
  OTP no WhatsApp — `request-code` (reusa `secretaria_auth_codes`) → `set-password`
  (`verifyLoginCode` + `setPassword`), que já devolve a sessão. Removido o antigo
  `verify-code` (login sem senha) pra não haver bypass.
- **Formato do número tolerante:** `resolveUsuarioAtivo` (codes.ts, helper
  `candidatosWa`) aceita com/sem o 55 e com/sem o nono dígito — o usuário digita
  "(48) 98808-8057" e casa com o `554888088057` salvo. Só na resolução de login;
  gravações (cadastro/tokens/senha) seguem usando `waIdVariants`.
- **Funil de vendas (desde 22/09):** SPA com `react-router-dom` — `/` landing de
  vendas, `/cadastro` (cadastro+pagamento real via Mercado Pago; ver seção
  Pagamento), `/entrar` login, `/painel` dashboard (protegido). SEO:
  landing indexável; `/entrar` e `/painel` recebem `noindex` via efeito.
- **Isolamento:** todo endpoint `/api/app/*` resolve o `user_wa` no SERVIDOR a
  partir do token assinado; o cliente nunca escolhe de quem são os dados. Mantém
  o modelo seguro (service key só no backend, nunca no browser).
- **Arquitetura:** SPA (`rosana-web`) e backend (`secretaria-virtual`) são DOIS
  projetos Vercel do MESMO repo/branch. A SPA fala com o backend por
  `VITE_API_BASE` + Bearer token; CORS liberado (sem cookie → sem CSRF).
- **⚠️ Entrega do OTP (modo dev):** mensagem de negócio fora da janela de 24h não
  entrega sem TEMPLATE aprovado na Meta. Hoje, pra testar, o usuário manda algo
  pra Rosana primeiro (abre a janela) e então pede o código. Pendência: criar o
  **template de autenticação** na Meta pra o login funcionar "do nada".
- **Telas do painel (todas no ar):** menu navegável (react-router, rotas aninhadas
  sob `/painel`) — Visão geral, Obras, Custos, Diário (RDO), Fotos (URL assinada do
  Storage), Documentos, Materiais, Configurações. Leem `/api/app/data?recurso=...`
  escopado pelo token. AÇÕES já no painel: busca + filtros por obra/status
  (client-side), **cadastro estruturado de obra** criar/editar/**excluir**
  (nome/cliente/endereço/contexto/datas/status — POST/DELETE `data?recurso=obras`
  → `secretaria_obras`, renomear faz cascata; **excluir faz CASCATA (05/10)**: o
  cadastro é a MATRIZ do sistema (as sub-abas espelham as obras de Obras), então
  excluir uma obra apaga TUDO dela — custos/RDO/materiais/documentos/fotos (+
  arquivos no Storage) e os eventos/lembretes da agenda da obra — em todas as
  abas de uma vez (`excluirObra` cascateia por NOME; quando o ADMIN exclui uma
  obra da empresa, a cascata dos LANÇAMENTOS alcança também o que a EQUIPE lançou
  — `recorders` = wa de todos os membros, resolvido no endpoint via
  `resolverEscopoPainel` quando `papel==='admin'`; pessoal/engenheiro = só o
  próprio wa. O CADASTRO em si é sempre o do admin/dono da obra);
  `web/src/components/ObraForm.tsx` avisa que apaga tudo. **Excluir FOTO
  individual (05/10):** botão de lixeira no cartão + no lightbox de Fotos →
  DELETE `data?recurso=fotos` {id} → `excluirFoto` (apaga linha + arquivo no
  Storage, escopado por recorders/variantes do wa; `web/src/pages/Fotos.tsx` com
  lightbox). **rota/GPS** pelo endereço (link do card e
  tool `abrir_gps` abrem `web/src/pages/Mapa.tsx` = `/mapa?dest=` → chooser Google
  Maps/Waze/Apple Maps),
  **baixar PDF do RDO** por obra (`/api/app/rdo-pdf`, fetch com token → download),
  **trocar senha logado** (`auth?acao=change-password`, exige senha atual).
  A ENTRADA principal de dados segue no WhatsApp.
- **Navegação "obra primeiro" (05/10):** as sub-abas Documentos, Fotos, Custos,
  Diário e Materiais abrem PRIMEIRO os cartões das obras (do cadastro
  `secretaria_obras`, via `getObras`), e só ao clicar numa obra mostram o
  conteúdo DAQUELA obra (com "voltar pra todas as obras"). O cadastro de obras é,
  assim, a estrutura de organização de todas as seções. Componente reutilizável
  `web/src/components/Obras.tsx` (`cardsDeObras` monta os cartões = obras do
  cadastro, mesmo com 0 itens, + obras só-nos-itens + balde "Sem obra";
  `ObrasDrill` a grade; `ObraCrumb` o cabeçalho). Tudo client-side sobre os dados
  já carregados por seção + `getObras`.
- **Pagamento (Mercado Pago) — feito, inerte até a chave (22/09):** o `/cadastro`
  (SPA) agora GRAVA o lead no backend e inicia a ASSINATURA recorrente via
  `api/app/pay?acao=assinar` → cria preapproval no MP → redireciona pro `init_point`
  (checkout). O webhook `?acao=webhook` ativa o usuário (`ativo=true`) quando o MP
  confirma ('authorized'). SEM `MERCADOPAGO_ACCESS_TOKEN` na Vercel, o fluxo grava
  o lead e mostra "em breve" (não cobra). Falta: criar a conta MP + colar o Access
  Token de produção na Vercel; back_url manda pro `/entrar` (o usuário cria a senha
  pelo fluxo de OTP — que ainda depende da janela de 24h da Meta).
- **Painel de CONTROLE (`/admin`) — desde 22/09, reformulado 05/10:** área
  separada com LOGIN PRÓPRIO (e-mail+senha, `secretaria_admins`), INDEPENDENTE do
  número de WhatsApp do dono como usuário. SPA em `web/src/pages/Admin.tsx` (rota
  `/admin/*`, noindex, token próprio `rosana.admin.token`), cliente em
  `web/src/lib/admin.ts`. Renomeado de "Admin" para **"Painel de controle"**. Abas:
  - **Visão geral** — KPIs (usuários/ativos/inativos/pendentes/novos/saídas) com
    **filtro de janela de período** (7/30/90 dias ou 12 meses; `getOverview(periodo)`
    → `buildOverview(periodoDias)`), série de novos cadastros na janela (agregada
    por dia/semana/mês conforme o período), usuários por plano, assinaturas por
    situação, e custo real de IA no mês (proxy por mensagens).
  - **Usuários & mercado** — **mapa do Brasil em ladrilhos** (`web/src/components/
    BrasilMapa.tsx`; tile grid/statebin, cada UF um quadrado rotulado, escala
    sequencial AZUL clara→forte por nº de usuários, toggle Todos/Ativos) +
    presença por UF + **cidades/regiões aproximadas** (praça do DDD) + distribuição
    por **profissão** (texto livre normalizado) + **engajamento** (proxy de "tempo
    de uso": média de mensagens/mês-semana-dia e dias ativos nos últimos 30d) +
    gestão (busca, filtro todos/ativos/inativos, ativar/desativar, trocar plano, +
    pacote; dono blindado). A geografia vem do **DDD do `user_wa`**
    (`src/admin/geo.ts`: `dddDoWa`/`ufDoWa`/`pracaDoWa` — UF é confiável, cidade é
    só aproximada pela praça do DDD). Profissões agrupadas por heurística em
    `metrics.ts` (`normalizarProfissao`).
  - **Planos & lucro** — editar nome/valor/descrição/ativo/limites (muda o preço
    cobrado E o site) + **calculadora de custo e lucro** (pior caso = cota de
    mensagens cheia; usa o custo/msg MEDIDO da API — `custoMedioMensagemUsd` —, ou
    referência US$ 0,018; inputs de cotação do dólar, taxa do gateway e meta de
    lucro; mostra lucro/margem por plano, marca +/− lucro, e "quantas vendas p/
    bater a meta"). Regra do projeto: margem ≥ 48% no pior caso.
  - **Conta** — trocar senha. 1º acesso via `ADMIN_BOOTSTRAP_TOKEN`.
  OBS: "tempo de uso" e "consumo" são PROXYS (não há cronômetro de sessão nem API
  de saldo dos provedores). O backend (`src/admin/metrics.ts`) deduplica variantes
  de wa, exclui o dono das métricas de negócio, e expõe tudo por `buildOverview`.
- **Ainda mock/pendente:** edição/registro fino no painel do usuário (RDO/custo/
  material são criados via WhatsApp); "orçamento/progresso" de obra (não existe no
  modelo); "consumo de créditos" real em R$ (hoje é proxy por volume de mensagens —
  não há API de saldo Anthropic/Groq); e o `www` (só o apex no registro.br).

## Planos, limites e pacotes (desde 28/09/2026)
- **3 planos** (`src/pay/planos.ts`): **Agenda R$ 49** (agenda, memória, custos de
  1 obra; 250 msgs, sem fotos, 30 min áudio), **Obra R$ 119** (+ RDO/PDF, fotos/NF,
  documentos, revisar conversa, preço de referência; 400 msgs, 50 fotos, 3h, 5
  obras), **Construtora R$ 229** (+ materiais/cotações, orçamento com os PRÓPRIOS
  preços; 700 msgs, 300 fotos, 10h, obras ilimitadas). RECURSOS (quais funções)
  são fixos no código; PREÇO e LIMITES são editáveis no /admin (colunas
  `limite_*` em `secretaria_planos`, cache de 5 min). Ids antigos
  `essencial`→obra, `profissional`→construtora. Sem plano (beta) = Construtora.
  Dono = sem limite.
- **Por que os limites:** custo medido ~US$ 0,015–0,02/mensagem COM cache de
  prompt (sem cache era ~US$ 0,04). REGRA DE PREÇO (28/09): margem ≥ 48% no
  PIOR caso (cota inteira usada), já descontando ~11% de taxas ⇒ preço ≥ custo
  máx / 0,41 (custo máx: Agenda ~R$ 20, Obra ~R$ 48, Construtora ~R$ 93).
- **Aplicação:** `src/pay/cota.ts` (`resolverDireito`, `saldoDoUsuario`,
  `checarObra`). O pipeline checa a cota ANTES de chamar a IA (mensagens, fotos,
  áudio estimado por bytes ~2 KB/s) e responde sem gastar IA; o agente só recebe
  as tools do plano (`toolsDoPlano`) e o `runTool` confere de novo + limite de
  obras. Aviso ao cruzar 80%. Fail-open: erro ao ler plano/uso não trava.
- **Medição real:** `secretaria_uso` (user_wa+mês): mensagens, fotos, áudio,
  tokens (entrada/saída/cache) e `custo_usd` calculado do `usage` da API
  (`src/memory/uso.ts`). Incremento atômico via RPC `secretaria_uso_incrementar`.
  O admin mostra o custo REAL por usuário/mês.
- **Cache de prompt:** system dividido em `estatico` (cacheado) + `dinamico`
  (data/tabela/memória); cache_control nas tools (1h, compartilhado por plano),
  no system estático e no fim das mensagens (loop de tools lê do cache).
- **Pacotes extras** (`PACOTES`, valem até o fim do mês): +100 msgs R$ 27,90;
  +300 R$ 82,90; +50 fotos R$ 9,90; +2h áudio R$ 9,90. Compra: usuário manda
  "PACOTE 100/300/FOTOS/AUDIO" (tratado no pipeline SEM IA, funciona com o limite
  estourado) ou a tool `comprar_pacote` → Checkout Pro do MP (pagamento único) →
  webhook `pay?acao=webhook` com type=payment → `processarPagamentoPacote` credita
  (idempotente por `mp_payment_id` em `secretaria_pacotes_compras`) e avisa no
  WhatsApp. Sem `MERCADOPAGO_ACCESS_TOKEN`: responde "em breve"; o admin pode
  conceder pacote manualmente (Usuários → "+ pacote").

## Funcionalidades (todas no ar)
- **Base:** agenda/lembretes no Google Agenda pessoal; memória (obras/apelidos/pendências); texto e voz.
- **Voz:** transcrição automática (Groq) + **modo transcrição** (devolve o texto
  fiel de áudios longos/encaminhados, com resumo) vs. **modo comando**.
- **Vertical obras:** custo por obra + relatório por categoria; cálculos de campo
  (peso de aço `0,00617×d²`; quantitativos como estimativa, com ressalva de
  responsabilidade técnica ART/RRT); Diário de Obra (RDO) por voz → PDF enviado
  no WhatsApp; visão (foto de obra descrita/arquivada; nota fiscal lida → lança custo).
- **Painel web (userosana.com.br):** landing de vendas + login (número+senha,
  senha criada/redefinida por código no WhatsApp) + dashboard com os dados reais
  do usuário (custos por categoria, RDOs, obras, prazos).
- **Teia de conhecimento (1ª fibra):** a Rosana aprende os preços/fornecedores
  REAIS de cada usuário do histórico dele (compras + cotações em
  `secretaria_materiais`) e os usa nos orçamentos DELE, com prioridade sobre a
  base genérica de mercado. Quanto mais ele usa, mais preciso fica o orçamento —
  dado isolado por `user_wa`, sem treinar modelo (é recuperação, não fine-tuning).

---

## Armadilhas já resolvidas (NÃO repetir)
- **Tool duplicada derrubava 100% do atendimento do DONO (05/10):** sintoma =
  toda mensagem do dono (texto E foto) respondia "Tive um problema ao processar"
  (o fallback genérico do `catch` no pipeline). Causa real (capturada gravando o
  erro exato na config `ultimo_erro_visao`): a API da Anthropic rejeitava o
  request inteiro com **400 "tools: Tool names must be unique."**. `criar_empresa`/
  `convidar_colaborador` estão no array `TOOLS` SEM entrada em `TOOL_RECURSO` →
  caíam no default "base" e entravam em `toolsDoPlano` p/ todos; aí
  `toolsCorporativas(dono)` anexava as MESMAS duas de novo → duplicata só p/ o
  dono (engenheiro não-dono recebia `[]` e funcionava — por isso parecia "só
  foto"). Regressão desde a Fase 1 corporativa. Correção: `toolsDoPlano` exclui
  `NOMES_CORP`; as corporativas saem SÓ de `toolsCorporativas`; + `dedupTools` no
  `secretary.ts` como rede de segurança. LIÇÃO: tool nova que também é condicional
  por usuário NÃO pode cair no filtro de plano; o fallback genérico do pipeline
  esconde o erro real — por isso existe o gravador `ultimo_erro_visao` (setConfig)
  p/ ver a causa raiz de falhas no WhatsApp.
- **Foto "salva" mas não aparecia no painel (05/10):** DUAS causas. (1) O Haiku
  respondia "salvei na pasta do catamarã" SEM chamar `registrar_foto` (mesma
  classe do bug de save_memory) → `secretaria_fotos` ficava vazia. Correção:
  REGRA DURA no prompt (nunca dizer "salvei a foto" sem gravar; "pasta"=obra) +
  **fallback determinístico** no `pipeline.ts`: a imagem já sobe pro Storage no
  ingest; `runSecretary` devolve `imagensNaoRegistradas` (caminhos que o modelo
  NÃO registrou) e o pipeline chama `registrarFoto` automaticamente (obra
  inferida da legenda via `inferirObraDaLegenda`, descrição = resposta da Rosana)
  — a foto NUNCA se perde. (2) Escopo do ADMIN no painel filtrava `obra IN
  obras_da_empresa`, então foto em obra ad-hoc ("catamarã", não cadastrada) ou
  sem obra sumia. Correção: `LeituraEscopo.obras` virou OPCIONAL; `aplicarEscopo`
  só filtra por obra quando definido; `resolverEscopoAdmin` passa `leitura:
  { recorders }` (SEM filtro de obra) → o admin vê TUDO que a equipe registrou,
  inclusive ad-hoc/sem obra. O ENGENHEIRO segue restrito às obras atribuídas
  (`leitura: { recorders, obras }`). Fotos antigas que falharam ficaram órfãs no
  Storage (sem linha no banco) — reenviar.
- **ESM na Vercel:** `"type":"module"`, imports relativos terminam em `.js`,
  tsconfig `NodeNext`, **sem** script `build`. Não mexer.
- **Limite de 12 funções serverless (Vercel Hobby) (22/09):** cada arquivo em
  `/api` vira uma função; passando de 12 o DEPLOY FALHA silenciosamente (fica na
  versão anterior). Aconteceu ao criar um endpoint por seção do painel (chegou a
  20). Sintoma: painel novo no ar (projeto `rosana-web` é estático, sem limite),
  mas as chamadas às rotas novas davam erro (a versão antiga do backend não as
  tinha). Correção: **consolidar** em roteadores por querystring — `api/app/auth.ts`
  (`?acao=`) e `api/app/data.ts` (`?recurso=`) — voltando a 10 funções. Ao criar
  endpoint novo do painel, ESTENDER esses roteadores, NÃO criar arquivo novo em
  `/api` (a menos que precise ser binário como `rdo-pdf.ts`, ou público/sem token
  como `pay.ts`/`admin.ts`). Contagem atual: 12 funções — NO LIMITE. Próximo
  endpoint OBRIGA consolidar num roteador existente ou migrar pra Vercel Pro.
- **Corpo bruto do webhook:** usar handler Web (`Request` + `request.text()`).
  `config.api.bodyParser` é do Next.js e NÃO vale em funções `/api` — foi a causa
  do 401 de assinatura inválida.
- **Nono dígito BR:** responder ao `wa_id` EXATAMENTE como recebido (sem inserir
  o 9). Inserir o 9 fazia a API aceitar (200) mas não entregar.
- **Erro 130497 (EUA→Brasil):** o número de teste é americano; enviar pro Brasil
  é cross-country restrito. Resolvido ao completar o **perfil da empresa** na Meta.
- **Dedup:** a Meta reenvia o mesmo evento se não recebe 200 a tempo →
  `secretaria_processed_messages` evita duplicado.
- **Segurança:** RLS foi ligado em todas as tabelas (antes exposto via anon key).
  App usa só a `service_key`.
- **Dia da semana alucinado (17/09):** o modelo dizia o dia da semana errado de
  uma data (ex.: 13/10/2026 = terça, ele disse domingo→segunda→segunda) e, ao ser
  corrigido, só CONCORDAVA sem verificar. A data salva no evento estava certa —
  o erro era só o texto. Correção: `weekdayBr` (código) calcula o dia; a tool de
  agenda devolve `dia_semana`; tool `dia_da_semana` p/ perguntas; regra dura no
  prompt: nunca deduzir dia da semana de cabeça, conferir ao ser corrigido.
- **Dono perdia a agenda a cada ~7 dias (22/09):** o dono tinha CONECTADO via
  OAuth (linha em `secretaria_oauth_tokens`), então `resolveCalAuth` usava OAuth
  pra ele. Em modo Testing do Google o refresh_token expira em ~7 dias → "a
  agenda vive desconectando" e eventos não eram criados. Como a conta de serviço
  já grava na MESMA agenda do dono e NUNCA expira, `resolveCalAuth` agora força
  `service` para `usuario.dono` (OAuth só para beta/não-dono). Tokens OAuth
  antigos do dono foram apagados. Beta ainda depende de publicar o app em
  Produção pra não expirar.
- **Data relativa errada — "amanhã" virava outro dia (22/09):** ex.: hoje terça
  22/09, "agenda amanhã 14h" e a Rosana respondia "quarta, dia 25". O modelo
  calculava a DATA de "amanhã/sexta" de cabeça (mesma classe do bug de dia da
  semana) e errava. Correção: `datasReferencia()` injeta no prompt uma TABELA de
  16 dias já calculados (YYYY-MM-DD + dia da semana, com hoje/amanhã/depois de
  amanhã marcados); regra dura manda pegar a data da tabela pra montar
  start_iso/end_iso e citar data/dia exatamente como na tabela.
- **"Disse que salvou mas não salvou" (15/09):** o modelo confirmava "registrei a
  pendência" SEM chamar save_memory; conseguia até "mostrar a lista" porque ela
  ainda estava no histórico recente — que depois rola pra fora da janela e o item
  se perde (nunca virou memória). Caso real: pendências da Certive (18/08) só
  foram parar no banco em 15/09. Correção: (a) save_memory aceita lote (`itens`)
  p/ salvar listas numa chamada; (b) regra dura no prompt: NUNCA confirmar
  "registrei/anotei" sem chamar save_memory no mesmo turno, e listar sempre a
  partir de get_pending, não "de cabeça".

- **Obras "sumiram" ao criar a empresa (05/10):** quando o dono criou a empresa,
  o painel passou a tratá-lo como admin (`resolverEscopoAdmin`) e a montagem de
  obras deixou de incluir as obras PESSOAIS (que têm `empresa_id` null) — pareciam
  perdidas (os dados NUNCA foram apagados). Correção: `criarEmpresa` agora ADOTA
  as obras pessoais do admin (seta `empresa_id`), então viram obras da empresa e
  reaparecem; os dados do Ricardo foram adotados manualmente p/ a empresa 1.
- **Sidebar com rolagem própria (05/10):** em telas baixas os botões de baixo do
  menu ficavam fora da tela (obrigava diminuir o zoom). `.sidebar` ganhou
  `overflow-y: auto` (rolagem independente da área branca).

## Convenções
- Commit/push só na branch de produção; deploy é automático ao dar push.
- Nunca pedir/colar segredos no chat — vão direto na Vercel.
- Nada é descartado em silêncio: se uma ação falha, a secretária avisa o dono.
- Fluxo p/ nova capacidade: tool em `src/agent/tools.ts` (definição + dispatch) +
  orientação em `src/agent/system-prompt.ts`; dados novos via migração no Supabase
  + funções em `src/memory/context.ts`. Rodar `npm run typecheck` antes de commitar.

---

## Estado de teste
- Validado localmente: geração de PDF (acentos PT), camada de dados
  (custos/RDO/constraints), `typecheck`.
- Falta teste real no WhatsApp (só o dono consegue): NLU/escolha de ferramenta,
  visão em nota fiscal real, STT em contexto de obra e, principalmente, o envio
  do PDF (`uploadMedia`/`sendDocumentMessage`) — risco de limite no número de teste.

## Formalização / CNPJ (CNPJ ABERTO — 07/10/2026)
Abrir CNPJ pra lançar oficialmente e poder cobrar/emitir NF. Estrutura definida
(confirmar com contador), via Contabilizei:
- **Tipo:** SLU (sem sócio, patrimônio protegido). **Regime:** Simples Nacional,
  atividade "Serviços de TI".
- **CNAE principal:** `6202-3/00` (dev/licenciamento de software customizável =
  SaaS). Secundárias: `6201-5/01`, `6311-9/00` (provedor de aplicação/hospedagem),
  `6209-1/00` (suporte). NÃO deixar Consultoria (`6204-0/00`) como principal.
- **Imposto mínimo:** manter **Fator R ≥ 28%** (via pró-labore) → **Anexo III
  (começa 6%)** em vez do Anexo V (15,5%). Contador calibra o pró-labore.
- ✅ **CNPJ aberto (07/10)** — PIS resolvido, abertura concluída na Contabilizei.
  Próximos passos (nesta ordem; os 3 primeiros podem andar em paralelo):
  1. Inscrição municipal + certificado digital **e-CNPJ A1** (pré-req da NFS-e).
     ✅ Certificado A1 obtido (09/10). Inscrição municipal: confirmar com a
     Contabilizei. O .pfx + senha vão no painel da NFE.io (não no código).
  2. **Verificação da empresa na Meta** (Business Manager → Central de segurança;
     razão social/endereço iguais ao cartão CNPJ; site userosana.com.br com
     razão social + CNPJ no rodapé ajuda a aprovar).
  3. **Conta Mercado Pago PJ no CNPJ** → Access Token de produção na Vercel
     (`MERCADOPAGO_ACCESS_TOKEN`, ambiente Production + REDEPLOY — env nova só
     vale após novo deploy). O código manda `notification_url` em cada cobrança,
     mas CONFIGURAR TAMBÉM o Webhook no painel do MP (URL
     `https://secretaria-virtual-seven.vercel.app/api/app/pay?acao=webhook`,
     eventos Pagamentos + Planos e assinaturas) pra garantir os avisos de
     MENSALIDADE (`subscription_authorized_payment`), que disparam a nota fiscal.
     Teste ponta a ponta: comprar o PACOTE FOTOS (R$ 9,90) e estornar.
  4. Após a verificação: **número BR próprio** (chip novo, sem WhatsApp) na WABA →
     app em Production → templates (código de login, boas-vindas, lembretes >24h).
  5. ✅ Emissor decidido (07/10): **(A) Mercado Pago + NFE.io** — código pronto,
     inerte até as variáveis NFSE_* (ver "Nota fiscal automática" abaixo).
  - Site: incluir razão social + CNPJ no rodapé e nos /termos e /privacidade
    (exigência do Decreto 7.962/2013 p/ venda online).
- ✅ **Nota fiscal automática (DECIDIDO 07/10: Mercado Pago + NFE.io):** a cada
  pagamento APROVADO (assinatura mensal ou pacote extra) sai uma NFS-e pro e-mail
  do cliente. Pré-req: inscrição municipal + certificado e-CNPJ A1 (cadastrados
  no painel da NFE.io, que fala com a prefeitura).
  - **Gatilhos:** pacote → `processarPagamentoPacote` (tópico `payment`);
    mensalidade → tópico `subscription_authorized_payment` no `pay?acao=webhook`
    → `consultarCobrancaAssinatura` (GET /authorized_payments/{id}; campos do SDK
    oficial) → só se `payment.status=approved`. Ambos chamam
    `registrarNotaDePagamento` (`src/nf/notas.ts`).
  - **Fila:** `secretaria_notas_fiscais` (mp_payment_id ÚNICO = nunca 2 notas do
    mesmo pagamento). Status: pendente → processando → emitida | erro;
    `aguardando_emissor` (sem variáveis NFSE_*); `dados_faltando` (tomador sem
    CPF/CNPJ ou e-mail — o dono é avisado no WhatsApp). O tique de minuto
    (`bomdia?acao=lembretes`, pg_cron) chama `processarNotasPendentes`: emite,
    consulta o `flowStatus` e, quando `Issued`, manda o e-mail (PUT sendemail).
    Recusa da prefeitura (`IssueFailed`) → status erro + aviso ao dono.
  - **Cliente NFE.io:** `src/nf/nfeio.ts` (REST v1, header `X-NFE-APIKEY`,
    emissão assíncrona 202+Location; campos conferidos no SDK oficial `nfe-io`).
    Tomador = o usuário que pagou (nome_completo, cpf, email de
    secretaria_usuarios); assinatura de EMPRESA usa os dados do dono da empresa
    (não há CNPJ da empresa-cliente no cadastro ainda).
  - **Admin:** aba "Notas fiscais" (lista + "Tentar de novo" em erro/sem dados).
  - **Env (Vercel, opcionais):** `NFSE_API_KEY`, `NFSE_COMPANY_ID` (id da empresa
    na NFE.io), `NFSE_CITY_SERVICE_CODE` (código do serviço na prefeitura — pedir
    ao contador; SaaS costuma ser item 1.05 ou 1.03 da LC 116),
    `NFSE_FEDERAL_SERVICE_CODE` e `NFSE_CNAE_CODE` (só se a cidade exigir),
    `NFSE_ENVIAR_EMAIL` (default true; pôr false se o painel da NFE.io já envia,
    pra não mandar 2 e-mails).
- **Reforma tributária:** 2026 = alíquotas-teste (0,1% IBS + 0,9% CBS); vale pra
  valer em 2027 (escolha de recolher IBS/CBS no regime regular, fora do DAS —
  relevante pro B2B querer crédito). Decisão de 2027.

## Roadmap de onboarding (inspirado no Meu Assessor) — 04/10/2026
Benchmark do concorrente **Meu Assessor** (produto validado, Felipe Titto, ~170k
seguidores). Copiar só o útil; manter onde a Rosana já é melhor.
- **Fundação (bloqueia o self-serve):** o MA está em **Meta Production** (qualquer
  número entra); a Rosana está em **modo dev** (teto 5 + allow-list manual). Todo
  o onboarding self-service abaixo só vale DEPOIS do CNPJ → verificação na Meta.
- **① Conexão por código (wa.me):** pós-pagamento, mandar um deep link `wa.me`
  com um código pré-preenchido; o USUÁRIO envia → abre a janela de 24h sozinho e
  vincula o número. Resolve o gargalo do OTP preso na janela. (pós-Meta)
- **② Botões interativos — ✅ FEITO (04/10):** tool `enviar_opcoes` +
  `sendInteractiveButtons` (client.ts) + parsing de resposta interativa no
  pipeline (`interactiveReplyText`). Como o Haiku teimava em "fingir" botões com
  👇 em texto, os botões viraram DETERMINÍSTICOS no pipeline: (a) botões de
  INÍCIO quando a msg é "o que você faz / por onde começo" ou no 1º contato
  (`queremBotoesDeInicio`/`botoesIniciais`); (b) botões de CONTINUAÇÃO após uma
  ação concluída (criar evento → "Ver a semana"/"Marcar outro"; lançar custo →
  "Ver relatório"/"Lançar outro"; RDO → "Gerar o PDF"/"Ver o diário"), via
  `ctx.sugestaoBotoes` em runTool. Precedência: enviar_opcoes do modelo > início
  > sugestão. Validado no WhatsApp do dono.
- **③ Boas-vindas proativa:** 1ª mensagem automática logo após vincular o número
  (hoje a Rosana espera o usuário falar). (pós-Meta / junto do ①)
- **④ Agenda interna desacoplada — ✅ NÚCLEO FEITO (04/10):** `secretaria_eventos`
  é a fonte da verdade; `create/search/update_calendar_event` usam ela e FUNCIONAM
  SEM Google (que virou espelho opcional, ida: create espelha; volta: search mescla
  eventos do Google sem duplicar). Prompt não exige mais conectar. "Bom dia" diário
  inclui a agenda de hoje. **Lembrete por HORÁRIO — ✅ FEITO (04/10):** tool
  `criar_lembrete` + endpoint `bomdia?acao=lembretes` + **pg_cron do Supabase 1×/min**
  (não precisou Vercel Pro — o agendador é o pg_cron/pg_net). Entrega dentro da
  janela de 24h do WhatsApp (lembretes de hoje/amanhã funcionam; os de +24h com o
  usuário sumido precisam de template da Meta — essa parte segue bloqueada).
- **Manter (Rosana já ganha):** vertical de obras (RDO/custos/NF→custo/materiais/
  preço real), memória mais precisa, visão+voz no contexto de obra.
- **Pular:** amplitude horizontal (finanças/open finance), Meet/Contatos, time de
  personas com vídeo — não são o nosso diferencial.
- **Ligado à NF:** o billing é Mercado Pago (não emite NFS-e). Decisão aberta na
  seção "Formalização / CNPJ".

## Insights do APP do Meu Assessor + melhorias (05/10/2026)
Benchmark do APP (não só WhatsApp). Copiar só o útil; manter a aposta VERTICAL.
- **Sinal estratégico:** o MA vai MUITO horizontal + fintech (Finanças completo,
  Recebimentos/saldo/transferências, Links de cobrança, Open Finance, Gmail lê
  boletos, "Área do contador", Pesquisas, Projetos, time de 6 personas). Quanto
  mais eles incham, mais espaço sobra pra uma ferramenta FOCADA em obra. NÃO imitar
  a largura — aprofundar no canteiro.
- **Modelo de negócio (adaptar):** plano **anual** (eles empurram "Pro Anual");
  **multi-usuário por conta** (convites/códigos de acesso → ARPU por assento, ex.:
  construtora com vários engenheiros); **"Área do contador"** → análogo vertical =
  **dossiê/ponte com o CLIENTE da obra** (transparência). PULAR: recebíveis/fintech.
- **Melhorias aprovadas (ordem):**
  1. ✅ **Preferências + lembrete automático (05/10)** — colunas `resumo_hora` e
     `lembrete_antecedencia_min` em secretaria_usuarios; `create_calendar_event` já
     agenda lembrete automático na antecedência padrão; resumo diário no horário
     escolhido (minute pg_cron, `bomdia?acao=lembretes` faz lembretes + resumos);
     Vercel cron diário removido. Tool `configurar_preferencias`. As prefs também
     são editáveis na aba "Minha conta" do painel (item 2).
  2. ✅ **Aba "Minha conta" no painel (05/10)** — `pages/MinhaConta.tsx` (rota
     `/painel/conta`, link no Sidebar). Edita cadastro (nome/nome_completo/e-mail/
     profissão); mostra o número de WhatsApp conectado FORMATADO (só leitura —
     trocar depende do fluxo Meta) e a assinatura (plano + situação + desde, só
     leitura — gerir é pela Rosana no WhatsApp); e ajusta preferências (horário do
     resumo + antecedência do lembrete + liga/desliga o resumo diário). Backend:
     roteador `api/app/data.ts` `?recurso=conta` (GET + POST) — SEM novo arquivo em
     /api (limite de 12 funções); `getPerfil`/`atualizarPerfil` em context.ts.
  3. ✅ **Aba "O que a Rosana fez por você" (05/10)** — `pages/Atividade.tsx`
     (rota `/painel/atividade`, link no menu). Duas colunas: **Programados**
     (lembretes futuros de `secretaria_eventos`) e **Entregues** (lembretes +
     resumos enviados, com status, de `secretaria_acoes`). Log gravado em
     `bomdia.ts` no sucesso do envio (`registrarAcao`, tabela nova
     `secretaria_acoes`). Backend: `data?recurso=atividade` (estende o roteador,
     SEM novo arquivo em /api). FUTURO: logar também ações do agente (custo/RDO/
     evento criado) — hoje só os envios proativos.
  4. **Dossiê/relatório da obra pro cliente** — versão vertical da "área do
     contador"; argumento de venda.
- **Versão corporativa (decidida 05/10):** empresa agrupa vários WhatsApps;
  acesso **POR OBRA** (engenheiro só vê as obras em que o admin o incluiu; dados
  da obra compartilhados entre os membros dela); papéis **admin + engenheiro**;
  entrada = admin cadastra o número (se há vaga no **teto do plano**) → Rosana
  convida no WhatsApp → engenheiro **aceita/recusa**; o **contexto das obras quem
  monta é o admin**. Cobrança = plano com teto de membros.
  - **✅ Fase 0 + 1 (05/10):** tabelas `secretaria_empresas` /
    `_empresa_membros` / `_obra_membros` + `empresa_id` em obras
    (`src/memory/empresa.ts`); convite/aceite pelo WhatsApp
    (`src/corp/convites.ts` + intercepto no `pipeline.ts` ANTES do portão de
    autorização; botões Aceitar/Agora não; aceite → `ativarMembro`; recusa →
    agradece + site). Tools `criar_empresa`/`convidar_colaborador` (só dono por
    ora). O convite é enviado às DUAS variantes do número (nono dígito).
    **Dev-mode da Meta: o número do engenheiro precisa estar na allow-list p/ o
    convite chegar.**
  - **✅ Fase 2 (05/10):** painel do admin em `web/src/pages/Empresa.tsx` (rota
    `/painel/empresa`, link "Minha empresa" no Sidebar). Sem empresa → oferece
    criar; com empresa → vagas usadas/teto, **equipe** (convidar por nome+número
    respeitando o teto, status do convite, remover), e **obras da empresa**
    (criar + atribuir engenheiros ativos por checkbox — cada engenheiro só nas
    obras em que foi incluído). Backend: `data?recurso=empresa` GET (empresa +
    membros + obras c/ membros) e POST por `acao` (criar|convidar|remover|
    criar_obra|atribuir), tudo validando `empresaComoAdmin` no servidor —
    estende o roteador, SEM novo arquivo em /api. Funções novas em
    `src/memory/empresa.ts` (removerMembro, listarObrasEmpresa, criarObraEmpresa,
    membrosDaObra, definirMembrosDaObra, obraDaEmpresa, getMembro).
  - **✅ Fase 3a (05/10) — leitura do engenheiro no PAINEL:** o engenheiro
    (membro ativo não-admin) passa a ver no painel SÓ as obras atribuídas a ele,
    com os dados COMPARTILHADOS da empresa (lançamentos de qualquer membro).
    Como: as 5 leituras de `context.ts` (relatorioCustos/consultarRDO/
    consultarDocumentos/consultarMateriais/consultarFotos) ganharam um
    `escopo?: LeituraEscopo` opcional ({recorders, obras}) — quando ausente, a
    leitura segue pessoal (zero regressão). `src/corp/escopo.ts`
    (`resolverEscopoPainel`) resolve o engenheiro → {obras atribuídas, recorders
    = wa de todos os membros}; `src/app/empresaView.ts` (`buildObrasEmpresa`,
    `buildDashboardEmpresa`) agrega os cartões e o dashboard escopados.
    `api/app/data.ts` (GET) usa o escopo nos recursos dashboard/obras/custos/rdo/
    documentos/materiais/fotos; admin e usuário pessoal seguem no fluxo pessoal.
    OBS: o engenheiro loga no painel criando senha por OTP ("primeiro acesso").
  - **✅ Fase 3b (05/10) — Rosana do engenheiro + agregação do admin:**
    - **WhatsApp (engenheiro):** o pipeline resolve `resolverEscopoEngenheiro(from)`
      e passa p/ `runSecretary`→`runTool`; as LEITURAS do agente (relatorio_custos,
      consultar_rdo, consultar_documentos, consultar_materiais, consultar_fotos,
      gerar_rdo_pdf) usam o escopo, e `consultar_obras` devolve as obras da EMPRESA
      atribuídas a ele. O system-prompt ganha um aviso (`empresaHint`) com o nome
      da empresa + as obras dele, mandando usar EXATAMENTE esses nomes nos
      lançamentos (é o que casa com o painel). Escrita continua sob o `user_wa`
      dele (agrega por nome). Admin/pessoal no WhatsApp seguem pessoais.
    - **Painel (admin):** `resolverEscopoPainel` agora cobre o ADMIN também
      (`resolverEscopoAdmin`: obras = todas da empresa + as pessoais dele;
      recorders = todos os membros), então o admin vê no painel o que a EQUIPE
      lançou nas obras da empresa + os próprios dados. (Dados pessoais sem obra
      não entram na visão agregada — raro na vertical.)
  - **✅ Fase 4 (05/10) — cobrança por teto (planos-empresa):**
    `PLANOS_EMPRESA` em `src/pay/planos.ts` (equipe_3/5/10 → teto + preço;
    **PREÇOS PLACEHOLDER — confirmar com o dono**, editáveis no código). Colunas
    de billing em `secretaria_empresas` (assinatura_status, mp_preapproval_id,
    assinatura_em). Admin assina/muda de plano no painel (card "Plano da empresa"
    em `Empresa.tsx`) → `data?recurso=empresa` `acao=assinar`: com
    `MERCADOPAGO_ACCESS_TOKEN` cria preapproval (externalReference `empresa:<id>`,
    payer_email = e-mail do admin) e devolve init_point; SEM o token aplica o
    plano/teto e marca 'aguardando' (inerte, sem cobrar). O webhook do MP
    (`pay?acao=webhook`) roteia `empresa:<id>` → `atualizarAssinaturaEmpresa`
    (ativa/pausa). `definirPlanoEmpresa` ajusta teto+plano; o teto já barra
    convites (Fase 1). Reaproveita MP recorrente (`criarAssinatura`).
- **Portáveis menores:** link público de agendamento (visita/vistoria, estilo
  Calendly); "análise personalizada" (relatório sob medida); PWA instalável em vez
  de app nativo; tema claro/escuro. **Pular:** finanças/Open Finance, Meet/Contatos,
  time de personas, central de ajuda gigante.

## Pendências abertas
1. ✅ (17/09) Chaves Anthropic + Groq rotacionadas (novas na Vercel, validadas em
   texto+áudio via banco); revogar as antigas nos painéis. ATENÇÃO: créditos
   Anthropic baixos (~US$ 8 em 17/09) — ativar recarga automática (SEM API de
   saldo: lembrete manual recorrente, trigger trig_01HsEwrnm8JxVdeskexyT7b8).
2. Testar no WhatsApp os fluxos da vertical (custos, RDO, foto/NF, PDF).
3. Configurar alertas de crédito baixo nos painéis Anthropic + Groq (não há API de
   saldo; a Rosana não consegue avisar sozinha).
4. (Opcional) Verificação da empresa na Meta + número brasileiro próprio (produção).
5. (Backlog) DDS/EPI. (Feito: arquivo da foto no Storage + reenvio; prazos de
   documentos alvará/ART/ASO com lembrete; materiais/compras/cotações.)
6. (Grande) Virada multi-inquilino para virar SaaS. PARCIAL (22/09): já há
   **landing de vendas + login por senha + painel** (userosana.com.br) com dados
   reais por usuário, e **cadastro + assinatura Mercado Pago** ligados ao backend
   (inertes até colar `MERCADOPAGO_ACCESS_TOKEN` na Vercel — criar a conta MP é o
   próximo passo). Falta: template de auth na Meta (OTP p/ criar senha "do nada",
   hoje depende da janela de 24h); pós-pagamento fluir pra criação de senha;
   multi-número na Meta (teto de 5 no modo dev).
7. (Backlog memória) CONSOLIDAÇÃO da memória de longo prazo (resumir/fundir
   quando o volume crescer — o análogo de "compactar contexto"). Hoje já dá p/
   ATUALIZAR (atualizar_memoria) e CONCLUIR pendência; falta o resumo em massa.

---

## Contexto de negócio
- **Estratégia:** ir vertical (obras/engenharia), cobrar premium (R$ 79–199, não
  R$ 29,90 de consumo), operar enxuto (só o dono + IA; contratados sob demanda no
  lugar de CLT).
- **Fosso:** esconder o inferno de configuração do WhatsApp + profundidade de
  nicho + automação de onboarding. A ideia não é o fosso (há clones).
- **Concorrente:** Meu Assessor (meuassessor.com, Felipe Titto) — assistente
  WhatsApp de finanças+agenda, Open Finance, Google Agenda 2 vias, ~R$ 29,90/mês
  (anual). Forte em distribuição (celebridade) e amplitude; fraco em vertical.
  Não competir de frente.
- **Economia unitária (medida):** custo/cliente ~US$ 3,50 (leve) a ~US$ 16
  (pesado); Claude domina o custo; WhatsApp de resposta grátis (janela 24h);
  Vercel/Supabase no free. Margem magra → precisa ARPU alto + cotas + escala.
- **Artefatos (documentos vivos):**
  - Plano de negócios v2: https://claude.ai/code/artifact/b3ff7244-bca0-40db-9290-0b5610bb39c2
  - Calculadora de cenários: https://claude.ai/code/artifact/edccb352-a9fd-4e77-8e0e-745e9dc4356a
