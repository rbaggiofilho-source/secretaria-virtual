import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import { getSupabase } from "./supabase.js";

/**
 * Armazenamento das imagens (fotos de obra / notas fiscais) no Supabase
 * Storage, bucket PRIVADO `secretaria-fotos`. Guardamos o ARQUIVO (não só a
 * descrição), isolado por user_wa no caminho. Acesso só pelo backend
 * (service key); nada é público.
 */

const BUCKET = "secretaria-fotos";

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function extFromMime(mimeType: string): string {
  return MIME_TO_EXT[mimeType.toLowerCase()] ?? "bin";
}

/** Infere o mime a partir da extensão do caminho salvo (para o reenvio). */
export function mimeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const found = Object.entries(MIME_TO_EXT).find(([, e]) => e === ext);
  return found ? found[0] : "image/jpeg";
}

/**
 * Sobe uma imagem para o Storage e devolve o caminho salvo. O caminho começa
 * pelo user_wa para manter o isolamento por usuário também no arquivo.
 */
export async function uploadFoto(
  userWa: string,
  bytes: Buffer,
  mimeType: string,
): Promise<string> {
  const supabase = getSupabase();
  const now = new Date();
  const yyyymm = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const path = `${userWa}/${yyyymm}/${crypto.randomUUID()}.${extFromMime(mimeType)}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) throw new Error(`Falha ao arquivar imagem no Storage: ${error.message}`);
  return path;
}

/** Baixa os bytes de uma imagem arquivada (para reenviar no WhatsApp). */
export async function downloadFoto(
  path: string,
): Promise<{ bytes: Buffer; mimeType: string }> {
  const supabase = getSupabase();
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) {
    throw new Error(`Falha ao baixar imagem arquivada: ${error?.message ?? "sem dados"}`);
  }
  const arrayBuffer = await data.arrayBuffer();
  return { bytes: Buffer.from(arrayBuffer), mimeType: mimeFromPath(path) };
}
