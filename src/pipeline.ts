import { runSecretary } from "./agent/secretary";
import { getEnv } from "./config/env";
import {
  appendConversation,
  loadOwnerContext,
  loadRecentHistory,
} from "./memory/context";
import { transcribe } from "./stt/index";
import { downloadMedia, sendTextMessage } from "./whatsapp/client";
import type { WhatsAppMessage } from "./whatsapp/types";

/**
 * Orquestra o fluxo ponta a ponta de UMA mensagem recebida:
 *   áudio? -> baixa mídia -> STT -> texto
 *   texto  -> usa direto
 *   carrega contexto/memória + histórico
 *   roda o agente (Claude + tools)
 *   persiste histórico
 *   responde no WhatsApp
 *
 * Cada etapa tem tratamento de erro para NÃO derrubar o processo e para
 * garantir que o dono seja avisado (nada é descartado em silêncio).
 */
export async function handleIncomingMessage(message: WhatsAppMessage): Promise<void> {
  const from = message.from;

  // Filtro opcional: só atende o número do dono, se configurado.
  const allowed = getEnv().ALLOWED_WHATSAPP_NUMBER;
  if (allowed && from !== allowed) {
    console.warn(`Mensagem ignorada de número não autorizado: ${from}`);
    return;
  }

  let userText: string;

  try {
    userText = await resolveUserText(message);
  } catch (err) {
    logError("resolver texto (STT/tipo)", err);
    await safeReply(
      from,
      "Não consegui entender sua mensagem (falha ao processar o áudio). Pode mandar de novo, por favor?",
    );
    return;
  }

  if (!userText.trim()) {
    await safeReply(from, "Recebi sua mensagem, mas veio vazia. Pode repetir?");
    return;
  }

  try {
    const [context, history] = await Promise.all([
      loadOwnerContext(from),
      loadRecentHistory(from),
    ]);

    const reply = await runSecretary({
      userWa: from,
      userText,
      history,
      context,
    });

    // Persiste histórico (não crítico) e responde (crítico).
    await appendConversation(from, "user", userText);
    await appendConversation(from, "assistant", reply);
    await sendTextMessage(from, reply);
  } catch (err) {
    logError("agente/calendar/resposta", err);
    await safeReply(
      from,
      "Tive um problema ao processar sua solicitação e talvez nada tenha sido agendado. Pode repetir a última mensagem?",
    );
  }
}

/** Converte a mensagem em texto: usa o corpo (texto) ou transcreve (áudio). */
async function resolveUserText(message: WhatsAppMessage): Promise<string> {
  if (message.type === "text") {
    return (message as { text: { body: string } }).text.body ?? "";
  }

  if (message.type === "audio") {
    const audioId = (message as { audio: { id: string } }).audio.id;
    const { buffer, mimeType } = await downloadMedia(audioId);
    return transcribe({ buffer, mimeType });
  }

  // Tipos não suportados (imagem, documento, etc.)
  throw new Error(`Tipo de mensagem não suportado: ${message.type}`);
}

/** Envia uma resposta sem deixar um erro de envio derrubar o handler. */
async function safeReply(to: string, body: string): Promise<void> {
  try {
    await sendTextMessage(to, body);
  } catch (err) {
    logError("envio de resposta de fallback", err);
  }
}

function logError(step: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  // Nunca logamos tokens ou conteúdo sensível — apenas etapa + mensagem de erro.
  console.error(`[pipeline] Erro em "${step}": ${message}`);
}
