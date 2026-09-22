import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import { getEnv } from "../config/env.js";

/**
 * Criptografia simétrica (AES-256-GCM) para segredos guardados no banco — hoje
 * os tokens do Google OAuth. Ativa só com TOKEN_ENC_KEY definida; sem ela os
 * valores seguem em claro (compatível com o legado). Valores cifrados levam o
 * prefixo "enc:v1:", então linhas antigas (em claro) continuam legíveis.
 */

const PREFIXO = "enc:v1:";

function chave(): Buffer | null {
  const k = getEnv().TOKEN_ENC_KEY;
  if (!k) return null;
  // Aceita qualquer string: deriva 32 bytes por SHA-256.
  return crypto.createHash("sha256").update(k).digest();
}

export function cifrar(valor: string): string {
  const k = chave();
  if (!k) return valor;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([c.update(valor, "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return PREFIXO + Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decifrar(valor: string): string {
  if (!valor.startsWith(PREFIXO)) return valor; // legado em claro
  const k = chave();
  if (!k) throw new Error("TOKEN_ENC_KEY ausente: não dá para ler um token cifrado.");
  const raw = Buffer.from(valor.slice(PREFIXO.length), "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ct = raw.subarray(28);
  const d = crypto.createDecipheriv("aes-256-gcm", k, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}
