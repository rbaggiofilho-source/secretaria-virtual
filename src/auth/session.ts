import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import { getEnv } from "../config/env.js";

/**
 * Sessão da plataforma web. O usuário faz login com um código enviado no
 * WhatsApp (ver ./codes.ts) e, ao validar, recebe este "crachá": um token
 * assinado (HMAC) que carrega o wa_id + timestamp de emissão. O servidor
 * verifica a assinatura e a validade a cada requisição — nada de sessão em
 * banco, nada de segredo no cliente.
 *
 * Reusa exatamente a mesma técnica do state do OAuth (src/oauth/google.ts):
 * base64url(payload).base64url(hmac), com o WHATSAPP_APP_SECRET como segredo.
 */

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

function secret(): string {
  // Segredo já existente no servidor; jamais vai para o cliente.
  return getEnv().WHATSAPP_APP_SECRET;
}

function hmac(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** Emite um token de sessão para o wa_id (após validar o código do WhatsApp). */
export function signSession(waId: string): string {
  const payload = Buffer.from(JSON.stringify({ wa: waId, ts: Date.now() })).toString(
    "base64url",
  );
  return `${payload}.${hmac(payload)}`;
}

/** Verifica assinatura + validade do token. Retorna o wa_id ou null. */
export function verifySession(token: string | null | undefined): string | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = hmac(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      wa?: unknown;
      ts?: unknown;
    };
    if (typeof parsed.wa !== "string" || typeof parsed.ts !== "number") return null;
    if (Date.now() - parsed.ts > SESSION_TTL_MS) return null;
    return parsed.wa;
  } catch {
    return null;
  }
}

/** Extrai o wa_id de uma requisição autenticada (header Authorization: Bearer). */
export function sessionFromRequest(request: Request): string | null {
  const auth = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return verifySession(m?.[1] ?? null);
}
