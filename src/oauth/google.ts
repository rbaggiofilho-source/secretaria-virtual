import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import { google } from "googleapis";
import { getEnv } from "../config/env.js";
import { signToken, verifyToken } from "../auth/tokens.js";
import { getSupabase } from "../memory/supabase.js";

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

/* ---------- State assinado + nonce de uso único ---------- */

/**
 * O state é um token com finalidade "oauth_state" (chave derivada própria —
 * NÃO serve como sessão do painel, e vice-versa; ver src/auth/tokens.ts) e
 * carrega um NONCE registrado no banco. O callback CONSOME o nonce: cada link
 * conecta uma agenda UMA vez. Antes o link valia 30 min para quantas conexões
 * quisesse — quem o obtivesse podia ligar a PRÓPRIA conta Google ao número da
 * vítima e receber os compromissos dela.
 */

/** Gera um state novo (e registra o nonce). */
export async function signState(waId: string): Promise<string> {
  const nonce = crypto.randomBytes(16).toString("base64url");
  const { error } = await getSupabase()
    .from("secretaria_oauth_nonces")
    .insert({ nonce, user_wa: waId });
  if (error) throw new Error(`Falha ao registrar link de conexão: ${error.message}`);
  return signToken("oauth_state", { wa: waId, n: nonce });
}

/** Re-assina um state para o MESMO nonce (perna do Google, com ts fresco). */
function resignState(waId: string, nonce: string): string {
  return signToken("oauth_state", { wa: waId, n: nonce });
}

/** Verifica assinatura, finalidade e validade do state. Retorna { wa, n } ou null. */
export function verifyState(state: string): { wa: string; n: string } | null {
  const p = verifyToken("oauth_state", state, STATE_TTL_MS);
  if (!p || typeof p.wa !== "string" || typeof p.n !== "string") return null;
  return { wa: p.wa, n: p.n };
}

/**
 * Consome o nonce (atômico: só a primeira chamada vence). Retorna false se já
 * foi usado, expirou ou não existe.
 */
export async function consumirNonce(nonce: string, waId: string): Promise<boolean> {
  const limite = new Date(Date.now() - STATE_TTL_MS).toISOString();
  const { data, error } = await getSupabase()
    .from("secretaria_oauth_nonces")
    .update({ usado_em: new Date().toISOString() })
    .eq("nonce", nonce)
    .eq("user_wa", waId)
    .is("usado_em", null)
    .gt("criado_em", limite)
    .select("nonce");
  if (error) throw new Error(`Falha ao validar link de conexão: ${error.message}`);
  return Boolean(data && data.length > 0);
}

/** Nonce ainda não usado (checagem sem consumir — usada no /start). */
export async function nonceDisponivel(nonce: string, waId: string): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("secretaria_oauth_nonces")
    .select("nonce")
    .eq("nonce", nonce)
    .eq("user_wa", waId)
    .is("usado_em", null)
    .limit(1);
  if (error) throw new Error(`Falha ao validar link de conexão: ${error.message}`);
  return Boolean(data && data.length > 0);
}

/** URL de consentimento do Google (leg do Google, mesmo nonce, ts fresco). */
export function buildAuthUrl(waId: string, nonce: string): string {
  return client().generateAuthUrl({
    access_type: "offline", // pede refresh_token
    prompt: "consent", // força vir refresh_token mesmo em reconexão
    include_granted_scopes: true,
    scope: SCOPES,
    state: resignState(waId, nonce),
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

/**
 * Erro do Google que significa "token morto" (revogado pelo usuário, expirado
 * no modo Testing, senha trocada...). Nesses casos o refresh_token não serve
 * mais e o usuário precisa reconectar.
 */
export function isTokenRevogado(err: unknown): boolean {
  const e = err as { message?: unknown; response?: { data?: { error?: unknown } } } | null;
  const codigo = e?.response?.data?.error;
  if (codigo === "invalid_grant" || codigo === "unauthorized_client") return true;
  const msg = String(e?.message ?? "");
  return /invalid_grant|Token has been expired or revoked|unauthorized_client/i.test(msg);
}
