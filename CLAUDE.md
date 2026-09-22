# Rosana — Secretária Virtual por WhatsApp (memória do projeto)

> Backend serverless (Node + TypeScript) de uma secretária virtual por WhatsApp,
> evoluindo para **plataforma vertical do setor de obras/construção**. Recebe
> **texto, áudio e imagem**; a IA organiza e executa (agenda, custos, diário de
> obra, transcrição). Última atualização deste doc: 22/08/2026.

## Regra sagrada
Eventos SEMPRE no Google Agenda **pessoal do usuário da conversa** (resolvido
pelo servidor via `secretaria_usuarios`; dono usa `GOOGLE_CALENDAR_ID` da env),
NUNCA em calendário de empresa e NUNCA no calendário de outro usuário. O modelo
não escolhe calendarId — forçado no código.

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
- **Vercel:** time `baggio-s-projects2` (`team_oYrVOPPoKBfN3L8T5IzQyPbJ`), projeto `secretaria-virtual`.
  - Production Branch = `claude/virtual-secretary-whatsapp-r360w0` (deploy automático a cada push).
  - URL webhook (prod): `https://secretaria-virtual-seven.vercel.app/api/webhook`
  - `vercel.json`: `api/webhook.ts` com `maxDuration: 60`.
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
`CRON_SECRET` (protege o cron do "bom dia"; a Vercel manda como `Authorization: Bearer`).
Validadas via `zod` em `src/config/env.ts` (faz `trim`; STT_PROVIDER tolerante a maiúsculas).

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
- `src/calendar/google.ts` — Google Agenda (conta de serviço OU OAuth por usuário; `CalendarAuth`).
- `src/oauth/google.ts` — OAuth Google (URL de consentimento, troca de code, state assinado).
- `src/oauth/page.ts` — páginas HTML de fim do fluxo OAuth (sucesso/erro).
- `api/cadastro.ts` — site de cadastro do beta. `api/oauth/{start,callback}.ts` — fluxo OAuth.
- `api/cron/bomdia.ts` — "bom dia" diário (Vercel Cron `0 11 * * 1-5` = 8h BRT, seg–sex).
  Envia SÓ para quem mandou mensagem nas últimas 24h (janela da Meta) e com
  `nudge_diario=true`. Protegido por `CRON_SECRET`. Não recupera quem sumiu (fora da janela).
- `api/privacidade.ts` (/privacidade) e `api/termos.ts` (/termos) — páginas legais (LGPD).
- Exclusão de conta: `excluirDadosUsuario` (context.ts) apaga tudo por wa_id + arquivos do Storage (`removeFotos`).
- `src/whatsapp/{client,signature,types}.ts` — envio (texto/documento/upload de mídia), HMAC, tipos.
- `src/pdf/rdo.ts` — geração do PDF do RDO (pdf-lib).
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
- `secretaria_custos` — custos por obra (categoria: material/mao_de_obra/equipamento/servico/outro; valor; descrição; data).
- `secretaria_rdo` — Diário de Obra (unique por user_wa+obra+data; clima, efetivo jsonb, atividades, ocorrências, materiais).
- `secretaria_fotos` — registro fotográfico (tipo: foto_obra/nota_fiscal/outro; descrição da IA; obra; data; caminho).
- `secretaria_usuarios` — usuários autorizados (PK user_wa; nome, calendar_id,
  contextos, dono, ativo, nudge_diario; + nome_completo, cpf, endereco, profissao,
  status do cadastro do beta). Fonte da verdade da autorização.
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
`create_calendar_event`, `update_calendar_event`, `search_calendar_events`,
`dia_da_semana` (dia da semana correto de uma data — modelo não calcula de cabeça),
`conectar_agenda` (gera link OAuth p/ o usuário conectar a própria agenda),
`save_memory`, `get_pending`, `atualizar_memoria` (atualiza fato/obra que mudou —
evita duplicar/contradizer), `concluir_pendencia` (marca pendência resolvida),
`resumo_geral` (panorama/export de tudo salvo),
`excluir_meus_dados` (exclusão de conta LGPD; exige a frase "EXCLUIR MEUS DADOS";
dono é blindado), `configurar_lembrete_diario` (liga/desliga o "bom dia"),
`registrar_custo`, `relatorio_custos`,
`registrar_rdo`, `consultar_rdo`, `registrar_foto`, `consultar_fotos`,
`enviar_foto` (reenvia imagem arquivada), `gerar_rdo_pdf`,
`registrar_documento`, `consultar_documentos`,
`registrar_material`, `consultar_materiais`,
`consultar_preco` (orçamentos: devolve `seus_precos` — preços REAIS do próprio
usuário, do histórico de `secretaria_materiais` via `buscarPrecosDoUsuario`, com
prioridade — + `referencia` — base de mercado, 433 insumos).

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

## Funcionalidades (todas no ar)
- **Base:** agenda/lembretes no Google Agenda pessoal; memória (obras/apelidos/pendências); texto e voz.
- **Voz:** transcrição automática (Groq) + **modo transcrição** (devolve o texto
  fiel de áudios longos/encaminhados, com resumo) vs. **modo comando**.
- **Vertical obras:** custo por obra + relatório por categoria; cálculos de campo
  (peso de aço `0,00617×d²`; quantitativos como estimativa, com ressalva de
  responsabilidade técnica ART/RRT); Diário de Obra (RDO) por voz → PDF enviado
  no WhatsApp; visão (foto de obra descrita/arquivada; nota fiscal lida → lança custo).
- **Teia de conhecimento (1ª fibra):** a Rosana aprende os preços/fornecedores
  REAIS de cada usuário do histórico dele (compras + cotações em
  `secretaria_materiais`) e os usa nos orçamentos DELE, com prioridade sobre a
  base genérica de mercado. Quanto mais ele usa, mais preciso fica o orçamento —
  dado isolado por `user_wa`, sem treinar modelo (é recuperação, não fine-tuning).

---

## Armadilhas já resolvidas (NÃO repetir)
- **ESM na Vercel:** `"type":"module"`, imports relativos terminam em `.js`,
  tsconfig `NodeNext`, **sem** script `build`. Não mexer.
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

## Pendências abertas
1. ✅ (17/09) Chaves Anthropic + Groq rotacionadas (novas na Vercel, validadas em
   texto+áudio via banco); revogar as antigas nos painéis. ATENÇÃO: créditos
   Anthropic baixos (~US$ 8 em 17/09) — ativar recarga automática.
2. Testar no WhatsApp os fluxos da vertical (custos, RDO, foto/NF, PDF).
3. Configurar alertas de crédito baixo nos painéis Anthropic + Groq (não há API de
   saldo; a Rosana não consegue avisar sozinha).
4. (Opcional) Verificação da empresa na Meta + número brasileiro próprio (produção).
5. (Backlog) DDS/EPI. (Feito: arquivo da foto no Storage + reenvio; prazos de
   documentos alvará/ART/ASO com lembrete; materiais/compras/cotações.)
6. (Grande) Virada multi-inquilino para virar SaaS (contas, login, Google via
   OAuth por cliente, cobrança, onboarding self-service, roteamento multi-número).
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
