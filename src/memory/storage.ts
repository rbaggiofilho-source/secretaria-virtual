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

/**
 * Gera uma URL temporária (assinada) para exibir a imagem no painel web sem
 * tornar o bucket público. Expira em `segundos` (padrão 1h). Retorna null se
 * o caminho for vazio ou a assinatura falhar.
 */
export async function signedFotoUrl(
  path: string | null | undefined,
  segundos = 3600,
): Promise<string | null> {
  if (!path) return null;
  const supabase = getSupabase();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, segundos);
  if (error || !data) return null;
  return data.signedUrl;
}

/** Remove arquivos do bucket (usado na exclusão de conta / LGPD). */
export async function removeFotos(paths: string[]): Promise<number> {
  const limpos = paths.filter((p) => typeof p === "string" && p.length > 0);
  if (limpos.length === 0) return 0;
  const supabase = getSupabase();
  const { error } = await supabase.storage.from(BUCKET).remove(limpos);
  if (error) throw new Error(`Falha ao remover arquivos do Storage: ${error.message}`);
  return limpos.length;
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
