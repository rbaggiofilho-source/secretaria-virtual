import { getEnv } from "../config/env.js";
import { fileNameForMime, type TranscribeInput } from "./index.js";

/**
 * Transcrição via OpenAI Whisper. Modelo padrão: whisper-1.
 */
export async function transcribeWithOpenAI(input: TranscribeInput): Promise<string> {
  const env = getEnv();
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY ausente (STT_PROVIDER=openai).");
  }

  const form = new FormData();
  const blob = new Blob([new Uint8Array(input.buffer)], { type: input.mimeType });
  form.append("file", blob, fileNameForMime(input.mimeType));
  form.append("model", env.OPENAI_STT_MODEL);
  form.append("language", "pt");
  form.append("response_format", "json");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: form,
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 500);
    throw new Error(`OpenAI STT falhou (${res.status}): ${detail}`);
  }

  const data = (await res.json()) as { text?: string };
  const text = data.text?.trim();
  if (!text) {
    throw new Error("OpenAI STT retornou transcrição vazia.");
  }
  return text;
}
