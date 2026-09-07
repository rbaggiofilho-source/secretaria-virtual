import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import { google } from "googleapis";
import { getEnv } from "../config/env.js";

/**
 * Google OAuth por usuário (beta). Cada usuário conecta a PRÓPRIA conta Google
 * e a Rosana passa a escrever no calendário "primary" dele — usando o
 * refresh_token guardado. Isto NÃO substitui a conta de serviço do dono; é o
 * caminho para os demais usuários, que não compartilham calendário à mão.
 *
 * O `state` do fluxo é assinado (HMAC) com um segredo do servidor e carrega o
 * wa_id + timestamp, para o callback saber com segurança quem está conectando
 * e recusar links adulterados ou expirados.
 */

const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];
const STATE_TTL_MS = 30 * 60 * 1000; // 30 min de validade do link

export function oauthConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET);
}

function redirectUri(): string {
  const base = getEnv().PUBLIC_BASE_URL.replace(/\/+$/, "");
  return `${base}/api/oauth/callback`;
}

function client() {
  const env = getEnv();
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    throw new Error(
      "GOOGLE_OAUTH_CLIENT_ID/GOOGLE_OAUTH_CLIENT_SECRET não configurados na Vercel.",
    );
  }
  return new google.auth.OAuth2(
    env.GOOGLE_OAUTH_CLIENT_ID,
    env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri(),
  );
}

/* ---------- State assinado (base64url(payload).base64url(hmac)) ---------- */

function stateSecret(): string {
  // Reusa um segredo já existente no servidor (não vai para o cliente).
  return getEnv().WHATSAPP_APP_SECRET;
}

function hmac(payload: string): string {
  return crypto.createHmac("sha256", stateSecret()).update(payload).digest("base64url");
}

export function signState(waId: string): string {
  const payload = Buffer.from(JSON.stringify({ wa: waId, ts: Date.now() })).toString(
    "base64url",
  );
  return `${payload}.${hmac(payload)}`;
}

/** Verifica a assinatura e a validade do state. Retorna o wa_id ou null. */
export function verifyState(state: string): string | null {
  const dot = state.indexOf(".");
  if (dot < 0) return null;
  const payload = state.slice(0, dot);
  const sig = state.slice(dot + 1);
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
    if (Date.now() - parsed.ts > STATE_TTL_MS) return null;
    return parsed.wa;
  } catch {
    return null;
  }
}

/** URL de consentimento do Google (leg do Google, com state fresco). */
export function buildAuthUrl(waId: string): string {
  return client().generateAuthUrl({
    access_type: "offline", // pede refresh_token
    prompt: "consent", // força vir refresh_token mesmo em reconexão
    include_granted_scopes: true,
    scope: SCOPES,
    state: signState(waId),
  });
}

export interface ExchangedTokens {
  refreshToken: string | null;
  accessToken: string | null;
  expiry: string | null; // ISO
  scope: string | null;
  email: string | null;
}

/** Troca o `code` do callback por tokens. Best-effort para extrair o email. */
export async function exchangeCode(code: string): Promise<ExchangedTokens> {
  const { tokens } = await client().getToken(code);
  let email: string | null = null;
  if (tokens.id_token) {
    try {
      const part = tokens.id_token.split(".")[1] ?? "";
      const decoded = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as {
        email?: unknown;
      };
      if (typeof decoded.email === "string") email = decoded.email;
    } catch {
      /* sem email — segue sem ele */
    }
  }
  return {
    refreshToken: tokens.refresh_token ?? null,
    accessToken: tokens.access_token ?? null,
    expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
    scope: tokens.scope ?? null,
    email,
  };
}

/** Cliente OAuth já com o refresh_token, pronto para chamar a API do Calendar. */
export function authorizedClient(refreshToken: string) {
  const c = client();
  c.setCredentials({ refresh_token: refreshToken });
  return c;
}
