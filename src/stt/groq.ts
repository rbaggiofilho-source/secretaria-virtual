import { getEnv } from "../config/env.ts";
import { fileNameForMime, type TranscribeInput } from "./index.ts";

/**
 * Transcrição via Groq (API compatível com o endpoint de áudio da OpenAI).
 * Modelo padrão: whisper-large-v3.
 */
export async function transcribeWithGroq(input: TranscribeInput): Promise<string> {
  const env = getEnv();
  if (!env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY ausente (STT_PROVIDER=groq).");
  }

  const form = new FormData();
  const blob = new Blob([new Uint8Array(input.buffer)], { type: input.mimeType });
  form.append("file", blob, fileNameForMime(input.mimeType));
  form.append("model", env.GROQ_STT_MODEL);
  form.append("language", "pt");
  form.append("response_format", "json");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
    body: form,
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 500);
    throw new Error(`Groq STT falhou (${res.status}): ${detail}`);
  }

  const data = (await res.json()) as { text?: string };
  const text = data.text?.trim();
  if (!text) {
    throw new Error("Groq STT retornou transcrição vazia.");
  }
  return text;
}
