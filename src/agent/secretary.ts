import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "../config/env.js";
import type { OwnerContext } from "../memory/context.js";
import { buildSystemPrompt } from "./system-prompt.js";
import { runTool, TOOLS } from "./tools.js";

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
  userWa: string;
  userText: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  context: OwnerContext;
  /** Imagens enviadas com a mensagem atual (foto de obra, nota fiscal, etc.). */
  images?: Array<{ base64: string; mimeType: string }>;
  /** A mensagem atual veio de um áudio (foi transcrita antes de chegar aqui). */
  wasAudio?: boolean;
}): Promise<string> {
  const env = getEnv();
  const client = getClient();
  // Quando a entrada veio de áudio, sinaliza para o modelo aplicar a seção
  // "Áudio e transcrição" do system prompt (modo comando vs. modo transcrição).
  const audioHint = params.wasAudio
    ? "\n\nA mensagem atual do usuário foi TRANSCRITA de um áudio. Aplique a " +
      'seção "Áudio e transcrição" para decidir entre AGIR sobre o pedido ou ' +
      "apenas devolver a transcrição."
    : "";
  const system = buildSystemPrompt(params.context) + audioHint;

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

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 2048,
      system,
      tools: TOOLS,
      messages,
    });

    // Guarda o turno do assistente (com blocos de tool_use, se houver).
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "tool_use") {
      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        const result = await runTool(
          params.userWa,
          tu.name,
          (tu.input ?? {}) as Record<string, unknown>,
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

    // Sem mais tool use: extrai o texto final.
    const text = extractText(response);
    if (text) return text;

    // Resposta sem texto (raro): encerra com aviso.
    return "Ok.";
  }

  // Estourou o limite de turnos — avisa em vez de silenciar.
  return "Processei sua mensagem, mas precisei de muitos passos e parei por segurança. Pode repetir de forma mais direta?";
}

function extractText(response: Anthropic.Message): string {
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}
