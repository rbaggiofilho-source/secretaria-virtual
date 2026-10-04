import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "../config/env.js";
import type { OwnerContext, UsuarioRow } from "../memory/context.js";
import { custoChamadaUsd } from "../memory/uso.js";
import type { Direito } from "../pay/cota.js";
import type { BotaoResposta } from "../whatsapp/client.js";
import { buildSystemPrompt } from "./system-prompt.js";
import { runTool, toolsDoPlano } from "./tools.js";

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
}): Promise<{
  text: string;
  consumo: ConsumoIa;
  botoes: BotoesPendentes | null;
  sugestaoBotoes: BotoesPendentes | null;
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
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: prompt.estatico, cache_control: { type: "ephemeral" } },
    { type: "text", text: prompt.dinamico + audioHint + onboardingHint },
  ];
  const tools = toolsDoPlano(params.direito);
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
        media_type: img.mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
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
  } = {
    imagePaths: [...(params.imagePaths ?? [])],
    direito: params.direito,
    botoes: null,
    sugestaoBotoes: null,
  };

  // Acumula o texto do assistente ao longo do loop. Importante quando o modelo
  // escreve a resposta E chama enviar_opcoes no MESMO turno: sem isso, o texto
  // daquele turno (ex.: a explicação) se perderia ao extrair só o último.
  const textoPartes: string[] = [];

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

function extractText(response: Anthropic.Message): string {
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
