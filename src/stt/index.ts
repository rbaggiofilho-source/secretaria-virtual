import { getEnv } from "../config/env";
import { transcribeWithGroq } from "./groq";
import { transcribeWithOpenAI } from "./openai";

/**
 * Interface única de transcrição. Troque de provedor pela env STT_PROVIDER
 * sem tocar no resto do código. Novos provedores entram aqui.
 */
export interface TranscribeInput {
  buffer: Buffer;
  mimeType: string;
}

export async function transcribe(input: TranscribeInput): Promise<string> {
  const env = getEnv();
  switch (env.STT_PROVIDER) {
    case "groq":
      return transcribeWithGroq(input);
    case "openai":
      return transcribeWithOpenAI(input);
    default:
      // Inalcançável por causa do schema, mas mantém exaustividade.
      throw new Error(`STT_PROVIDER desconhecido: ${env.STT_PROVIDER}`);
  }
}

/** Deriva um nome de arquivo plausível a partir do mime type (o STT usa a extensão). */
export function fileNameForMime(mimeType: string): string {
  const base = mimeType.split(";")[0]?.trim() ?? "audio/ogg";
  const map: Record<string, string> = {
    "audio/ogg": "audio.ogg",
    "audio/opus": "audio.ogg",
    "audio/mpeg": "audio.mp3",
    "audio/mp4": "audio.mp4",
    "audio/m4a": "audio.m4a",
    "audio/wav": "audio.wav",
    "audio/webm": "audio.webm",
  };
  return map[base] ?? "audio.ogg";
}
