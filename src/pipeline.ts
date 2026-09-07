import { runSecretary } from "./agent/secretary.js";
import { getEnv } from "./config/env.js";
import {
  appendConversation,
  getUsuario,
  loadOwnerContext,
  loadRecentHistory,
  type UsuarioRow,
} from "./memory/context.js";
import { uploadFoto } from "./memory/storage.js";
import { transcribe } from "./stt/index.js";
import { downloadMedia, sendTextMessage } from "./whatsapp/client.js";
import type { WhatsAppMessage } from "./whatsapp/types.js";

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

  // Autorização: a tabela secretaria_usuarios é a fonte da verdade (uma linha
  // ativa = número autorizado). ALLOWED_WHATSAPP_NUMBER fica como rede de
  // segurança legada: se a tabela não tiver a linha mas a env bater, atende
  // como dono (evita lockout do Ricardo por falha de seed).
  let usuario: UsuarioRow | null = null;
  try {
    usuario = await getUsuario(from);
  } catch (err) {
    logError("buscar usuário", err);
  }
  if (!usuario || !usuario.ativo) {
    const allowed = getEnv().ALLOWED_WHATSAPP_NUMBER;
    if (allowed && from === allowed) {
      usuario = {
        user_wa: from,
        nome: "Ricardo",
        calendar_id: null,
        contextos: null,
        dono: true,
        ativo: true,
      };
    } else {
      console.warn(`Mensagem ignorada de número não autorizado: ${from}`);
      return;
    }
  }

  let userText: string;
  let images: Array<{ base64: string; mimeType: string }> = [];
  // Caminhos dos arquivos já arquivados no Storage (para o registrar_foto ligar
  // a foto ao arquivo). Vazio quando não há imagem ou o arquivamento falhou.
  const imagePaths: string[] = [];

  try {
    if (message.type === "image") {
      // Imagem (foto de obra / nota fiscal): baixa os bytes e manda para o
      // Claude com visão. A legenda da foto vira o texto do usuário.
      const img = (message as { image: { id: string; caption?: string } }).image;
      console.log(`[image] Baixando imagem ${img.id}...`);
      const { buffer, mimeType } = await downloadMedia(img.id);
      console.log(`[image] Imagem baixada: ${buffer.length} bytes (${mimeType}).`);
      images = [{ base64: buffer.toString("base64"), mimeType }];
      userText = img.caption ?? "";
      // Arquiva o arquivo no Storage (não crítico): se falhar, seguimos com a
      // visão/descrição normalmente, só sem guardar o arquivo.
      try {
        imagePaths.push(await uploadFoto(from, buffer, mimeType));
      } catch (err) {
        logError("arquivar imagem no Storage", err);
      }
    } else {
      userText = await resolveUserText(message);
    }
  } catch (err) {
    logError("resolver entrada (STT/imagem/tipo)", err);
    await safeReply(
      from,
      "Não consegui entender sua mensagem (falha ao processar o áudio/imagem). Pode mandar de novo, por favor?",
    );
    return;
  }

  if (!userText.trim() && images.length === 0) {
    await safeReply(from, "Recebi sua mensagem, mas veio vazia. Pode repetir?");
    return;
  }

  try {
    const [context, history] = await Promise.all([
      loadOwnerContext(from),
      loadRecentHistory(from),
    ]);

    const reply = await runSecretary({
      usuario,
      userText,
      images,
      imagePaths,
      history,
      context,
      wasAudio: message.type === "audio",
    });

    // Persiste histórico (não crítico) e responde (crítico). Para imagem sem
    // legenda, registra um marcador legível no histórico.
    await appendConversation(
      from,
      "user",
      userText.trim() || (images.length ? "[imagem enviada]" : userText),
    );
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
    console.log(`[audio] Baixando mídia ${audioId}...`);
    const { buffer, mimeType } = await downloadMedia(audioId);
    console.log(
      `[audio] Mídia baixada: ${buffer.length} bytes (${mimeType}). Transcrevendo...`,
    );
    const text = await transcribe({ buffer, mimeType });
    // Nunca logamos o conteúdo transcrito (é dado do dono) — só o tamanho.
    console.log(`[audio] Transcrição concluída (${text.length} caracteres).`);
    return text;
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
