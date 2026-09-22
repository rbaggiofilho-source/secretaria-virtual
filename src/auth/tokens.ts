import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import { getEnv } from "../config/env.js";

/**
 * Tokens assinados (HMAC) com SEPARAÇÃO DE FINALIDADE. Cada tipo de token
 * (sessão do painel, state do OAuth, hash do OTP) usa uma chave DERIVADA
 * própria e carrega o campo `typ`: um token emitido para uma finalidade nunca
 * é aceito em outra. Antes, sessão e state do OAuth tinham o mesmo formato e a
 * mesma chave — o link "conectar agenda" funcionava como login no painel.
 *
 * Formato: base64url(JSON payload).base64url(hmac(chave_derivada, payload)).
 */

export type Finalidade = "session" | "oauth_state" | "otp";

function segredoMestre(): string {
  const env = getEnv();
  return env.SESSION_SECRET || env.WHATSAPP_APP_SECRET;
}

/** Chave derivada por finalidade (HMAC do segredo-mestre com um rótulo). */
export function chaveDerivada(finalidade: Finalidade): Buffer {
  return crypto.createHmac("sha256", segredoMestre()).update(`rosana:v2:${finalidade}`).digest();
}

export function hmacB64(finalidade: Finalidade, dado: string): string {
  return crypto.createHmac("sha256", chaveDerivada(finalidade)).update(dado).digest("base64url");
}

/** Comparação em tempo constante de duas strings. */
export function iguaisSeguro(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

export function signToken(finalidade: Finalidade, dados: Record<string, unknown>): string {
  const payload = Buffer.from(
    JSON.stringify({ ...dados, typ: finalidade, ts: Date.now() }),
  ).toString("base64url");
  return `${payload}.${hmacB64(finalidade, payload)}`;
}

/**
 * Verifica assinatura, finalidade e validade. Retorna o payload (com `ts`) ou
 * null. `ttlMs` é a idade máxima aceita.
 */
export function verifyToken(
  finalidade: Finalidade,
  token: string | null | undefined,
  ttlMs: number,
): (Record<string, unknown> & { ts: number }) | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!iguaisSeguro(sig, hmacB64(finalidade, payload))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    if (parsed.typ !== finalidade) return null;
    if (typeof parsed.ts !== "number") return null;
    const idade = Date.now() - parsed.ts;
    if (idade < -60_000 || idade > ttlMs) return null;
    return parsed as Record<string, unknown> & { ts: number };
  } catch {
    return null;
  }
}
