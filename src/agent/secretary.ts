import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "../config/env.js";
import type { OwnerContext, UsuarioRow } from "../memory/context.js";
import { custoChamadaUsd } from "../memory/uso.js";
import type { Direito } from "../pay/cota.js";
import type { EscopoPainel } from "../corp/escopo.js";
import type { BotaoResposta } from "../whatsapp/client.js";
import { buildSystemPrompt } from "./system-prompt.js";
import { runTool, toolsCorporativas, toolsDoPlano } from "./tools.js";

/** Botões de resposta rápida que o agente pediu para enviar (tool enviar_opcoes). */
export interface BotoesPendentes {
  body: string;
  opcoes: BotaoResposta[];
}

/**
 * Loop de tool use com o Claude (Haiku mais recente por padrão).
 * Recebe a mensagem do usuário (texto já transcrito) + histórico + contexto,
 * executa as tool calls que o modelo pedir e devolve a resposta final em texto.
 */

const MAX_TURNS = 6; // guarda contra loop infinito de tool use

let anthropic: Anthropic | null = null;
function getClient(): Anthropic {
  if (!anthropic) anthropic = new Anthropic({ apiKey: getEnv().ANTHROPIC_API_KEY });
  return anthropic;
}

export async function runSecretary(params: {
  usuario: UsuarioRow;
  userText: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  context: OwnerContext;
  /** Imagens enviadas com a mensagem atual (foto de obra, nota fiscal, etc.). */
  images?: Array<{ base64: string; mimeType: string }>;
  /** Caminhos das imagens já arquivadas no Storage, na ordem de `images`. */
  imagePaths?: string[];
  /** A mensagem atual veio de um áudio (foi transcrita antes de chegar aqui). */
  wasAudio?: boolean;
  /** Primeira interação deste usuário (sem histórico) — dispara onboarding. */
  primeiroContato?: boolean;
  /** Plano/direitos do usuário: filtra as tools e orienta o prompt. */
  direito: Direito;
  /** Escopo de empresa (engenheiro): lê/mostra as obras da empresa. null = pessoal. */
  escopoEmpresa?: EscopoPainel | null;
}): Promise<{
  text: string;
  consumo: ConsumoIa;
  botoes: BotoesPendentes | null;
  sugestaoBotoes: BotoesPendentes | null;
  /** Caminhos de imagem que o modelo NÃO registrou (não chamou registrar_foto).
   *  O pipeline registra automaticamente p/ a foto nunca se perder. */
  imagensNaoRegistradas: string[];
  /** O turno criou um compromisso/lembrete (imagem tratada como agenda, não foto). */
  agendouAlgo: boolean;
}> {
  const env = getEnv();
  const client = getClient();
  // Quando a entrada veio de áudio, sinaliza para o modelo aplicar a seção
  // "Áudio e transcrição" do system prompt (modo comando vs. modo transcrição).
  const audioHint = params.wasAudio
    ? "\n\nA mensagem atual do usuário foi TRANSCRITA de um áudio. Aplique a " +
      'seção "Áudio e transcrição" para decidir entre AGIR sobre o pedido ou ' +
      "apenas devolver a transcrição."
    : "";
  // No primeiro contato (sem histórico), dispara as boas-vindas guiadas da
  // seção "Primeiro acesso" — de forma determinística, sem depender do modelo
  // perceber que é a estreia.
  const onboardingHint =
    params.primeiroContato && !params.usuario.dono
      ? "\n\nESTA É A PRIMEIRA MENSAGEM deste usuário (sem histórico). Conduza o " +
        'ONBOARDING da seção "Primeiro acesso e boas-vindas guiadas": apresente-se, ' +
        "diga em visão geral tudo que você faz, deixe claro que também ensina a te " +
        "usar (é só perguntar), proponha 2–3 primeiras ações com exemplo pronto, e " +
        "COMECE a conhecer o usuário com poucas perguntas (empresa, obras, fases, " +
        "responsáveis) — em CONVERSA, sem textão, salvando na memória o que aprender."
      : "";
  const prompt = buildSystemPrompt(
    params.context,
    params.usuario,
    params.direito.ilimitado ? null : params.direito.plano,
  );
  // Cache de prompt: tools (1h, compartilhado por plano) → parte estática do
  // system (por usuário) → mensagens (ponto móvel no fim, reaproveitado a cada
  // volta do loop de tools). Ver custo em src/memory/uso.ts.
  // Engenheiro de uma empresa: a Rosana trabalha no contexto da EMPRESA e só nas
  // obras atribuídas a ele. Lançamentos devem usar EXATAMENTE esses nomes de obra.
  const esc = params.escopoEmpresa;
  const empresaHint =
    esc && esc.obras.length > 0
      ? `\n\nEMPRESA: este usuário é da equipe da *${esc.empresaNome}*. As obras dele são: ${esc.obras.join(", ")}. ` +
        "Trabalhe SÓ nessas obras e use EXATAMENTE esses nomes ao lançar custo/RDO/foto/material/documento (é o que mantém tudo junto no painel da empresa). Não crie obras novas; se ele citar uma obra que não está na lista, confirme com ele."
      : esc
        ? `\n\nEMPRESA: este usuário é da equipe da *${esc.empresaNome}*, mas ainda não há obras atribuídas a ele. Peça para o administrador atribuí-lo a uma obra no painel.`
        : "";
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: prompt.estatico, cache_control: { type: "ephemeral" } },
    { type: "text", text: prompt.dinamico + audioHint + onboardingHint + empresaHint },
  ];
  // Rede de segurança: a API rejeita o request inteiro se houver nome de tool
  // repetido ("Tool names must be unique"). Dedup por nome (mantém a 1ª) pra que
  // um futuro descuido na montagem nunca derrube o atendimento silenciosamente.
  const tools = dedupTools([...toolsDoPlano(params.direito), ...toolsCorporativas(params.usuario)]);
  const consumo: ConsumoIa = {
    chamadas: 0,
    tokensEntrada: 0,
    tokensSaida: 0,
    tokensCacheLeitura: 0,
    tokensCacheEscrita: 0,
    custoUsd: 0,
  };

  // Monta o conteúdo da mensagem atual. Com imagem, usa blocos (visão);
  // sem imagem, mantém a string simples de sempre.
  const imgs = params.images ?? [];
  let currentContent: Anthropic.MessageParam["content"];
  if (imgs.length > 0) {
    const blocks: Anthropic.ContentBlockParam[] = imgs.map((img) => ({
      type: "image",
      source: {
        type: "base64",
        media_type: normalizarMediaType(img.mimeType),
        data: img.base64,
      },
    }));
    blocks.push({
      type: "text",
      text: params.userText?.trim() ? params.userText : "(imagem enviada sem legenda)",
    });
    currentContent = blocks;
  } else {
    currentContent = params.userText;
  }

  const messages: Anthropic.MessageParam[] = [
    ...params.history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: currentContent },
  ];

  // Contexto do turno passado às tools: fila de caminhos das imagens já
  // arquivadas, que o registrar_foto consome para ligar a foto ao arquivo.
  const toolCtx: {
    imagePaths: string[];
    direito: Direito;
    botoes: BotoesPendentes | null;
    sugestaoBotoes: BotoesPendentes | null;
    escopoEmpresa?: EscopoPainel | null;
  } = {
    imagePaths: [...(params.imagePaths ?? [])],
    direito: params.direito,
    botoes: null,
    sugestaoBotoes: null,
    escopoEmpresa: params.escopoEmpresa ?? null,
  };

  // Acumula o texto do assistente ao longo do loop. Importante quando o modelo
  // escreve a resposta E chama enviar_opcoes no MESMO turno: sem isso, o texto
  // daquele turno (ex.: a explicação) se perderia ao extrair só o último.
  const textoPartes: string[] = [];
  // Alguma tool de AGENDA/lembrete foi chamada? (imagem = compromisso, não foto)
  let agendouAlgo = false;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 2048,
      system,
      tools,
      messages: comCacheNoFim(messages),
    });
    somarConsumo(consumo, env.ANTHROPIC_MODEL, response.usage);

    // Guarda o turno do assistente (com blocos de tool_use, se houver).
    messages.push({ role: "assistant", content: response.content });
    const textoDoTurno = extractText(response);
    if (textoDoTurno) textoPartes.push(textoDoTurno);

    if (response.stop_reason === "tool_use") {
      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        // Sinaliza que a imagem foi tratada como COMPROMISSO (agenda/lembrete),
        // não como foto — o pipeline então NÃO força o arquivamento como foto.
        if (tu.name === "create_calendar_event" || tu.name === "criar_lembrete") agendouAlgo = true;
        const result = await runTool(
          params.usuario,
          tu.name,
          (tu.input ?? {}) as Record<string, unknown>,
          toolCtx,
        );
        toolResults.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: result.text,
          is_error: result.isError,
        });
      }

      // Todos os resultados voltam numa única mensagem de user.
      messages.push({ role: "user", content: toolResults });
      continue; // deixa o modelo reagir aos resultados
    }

    // Sem mais tool use: junta o texto acumulado no loop. Se o agente pediu
    // botões (enviar_opcoes), o texto pode vir vazio — a mensagem vai nos botões.
    const final = textoPartes.join("\n\n").trim();
    return {
      text: final || (toolCtx.botoes ? "" : "Ok."),
      consumo,
      botoes: toolCtx.botoes,
      sugestaoBotoes: toolCtx.sugestaoBotoes,
      imagensNaoRegistradas: toolCtx.imagePaths,
      agendouAlgo,
    };
  }

  // Estourou o limite de turnos — avisa em vez de silenciar.
  return {
    text:
      textoPartes.join("\n\n").trim() ||
      "Processei sua mensagem, mas precisei de muitos passos e parei por segurança. Pode repetir de forma mais direta?",
    consumo,
    botoes: toolCtx.botoes,
    sugestaoBotoes: toolCtx.sugestaoBotoes,
    imagensNaoRegistradas: toolCtx.imagePaths,
    agendouAlgo,
  };
}

/** Tokens e custo (US$) somados de todas as chamadas à IA de uma mensagem. */
export interface ConsumoIa {
  chamadas: number;
  tokensEntrada: number;
  tokensSaida: number;
  tokensCacheLeitura: number;
  tokensCacheEscrita: number;
  custoUsd: number;
}

function somarConsumo(c: ConsumoIa, model: string, u: Anthropic.Usage): void {
  c.chamadas += 1;
  c.tokensEntrada += u.input_tokens;
  c.tokensSaida += u.output_tokens;
  c.tokensCacheLeitura += u.cache_read_input_tokens ?? 0;
  c.tokensCacheEscrita += u.cache_creation_input_tokens ?? 0;
  c.custoUsd += custoChamadaUsd(model, u);
}

/**
 * Cópia das mensagens com um ponto de cache no ÚLTIMO bloco: na volta seguinte
 * do loop de tools (e na próxima mensagem, se vier em até 5 min) todo o
 * histórico já enviado é lido do cache (0,1× o preço) em vez de pago de novo.
 * Não altera `messages` (o ponto anda para o fim a cada chamada).
 */
function comCacheNoFim(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  if (messages.length === 0) return messages;
  const copia = messages.slice();
  const ultima = copia[copia.length - 1]!;
  const blocos: Anthropic.ContentBlockParam[] =
    typeof ultima.content === "string"
      ? [{ type: "text", text: ultima.content }]
      : ultima.content.slice();
  const i = blocos.length - 1;
  if (i >= 0) {
    blocos[i] = { ...blocos[i], cache_control: { type: "ephemeral" } } as Anthropic.ContentBlockParam;
  }
  copia[copia.length - 1] = { ...ultima, content: blocos };
  return copia;
}

/**
 * Normaliza o mime da imagem para um dos 4 tipos aceitos pela visão do Claude.
 * O WhatsApp manda "image/jpeg" (foto comprimida no app), mas blindamos contra
 * maiúsculas, parâmetros ("image/jpeg; codecs=…") e sinônimos (jpg → jpeg).
 * Tipo não suportado (ex.: HEIC enviado como arquivo) vira erro claro.
 */
function normalizarMediaType(mime: string): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  const base = (mime || "").split(";")[0]!.trim().toLowerCase();
  if (base === "image/jpg" || base === "image/jpeg") return "image/jpeg";
  if (base === "image/png") return "image/png";
  if (base === "image/gif") return "image/gif";
  if (base === "image/webp") return "image/webp";
  throw new Error(`mime_de_imagem_nao_suportado:${base || "desconhecido"}`);
}

/** Remove tools com nome repetido (mantém a 1ª ocorrência). */
function dedupTools(tools: Anthropic.Tool[]): Anthropic.Tool[] {
  const vistos = new Set<string>();
  const out: Anthropic.Tool[] = [];
  for (const t of tools) {
    if (vistos.has(t.name)) continue;
    vistos.add(t.name);
    out.push(t);
  }
  return out;
}

function extractText(response: Anthropic.Message): string {
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
