import crypto from "node:crypto";
import process from "node:process";
import { Buffer } from "node:buffer";
import { getEnv } from "../config/env.js";
import { getSupabase } from "../memory/supabase.js";
import { hashPassword, checkPassword } from "./hash.js";

/**
 * Autenticação do ADMIN da Rosana — independente do número de WhatsApp (é um
 * login por e-mail + senha, guardado em `secretaria_admins`). O token de sessão
 * é assinado por HMAC (mesmo segredo do resto) MAS com um prefixo/rótulo próprio
 * (`role:"admin"`), então um token de usuário comum NUNCA vale como admin e
 * vice-versa.
 *
 * Bootstrap do 1º acesso: protegido por `ADMIN_BOOTSTRAP_TOKEN` (env). Você
 * define esse token na Vercel, cria seu acesso admin uma vez e pode até remover
 * o token depois. Sem segredo no chat.
 */

const ADMIN_TTL_MS = 12 * 60 * 60 * 1000; // 12h (área sensível)
const TOKEN_PREFIX = "adm1"; // rótulo do token admin

function secret(): string {
  return getEnv().WHATSAPP_APP_SECRET;
}
function hmac(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function signAdminToken(email: string): string {
  const payload = Buffer.from(
    JSON.stringify({ e: email, r: "admin", ts: Date.now() }),
  ).toString("base64url");
  return `${TOKEN_PREFIX}.${payload}.${hmac(TOKEN_PREFIX + payload)}`;
}

export function verifyAdminToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) return null;
  const [, payload, sig] = parts;
  const expected = hmac(TOKEN_PREFIX + payload);
  const a = Buffer.from(sig!);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload!, "base64url").toString("utf8")) as {
      e?: unknown;
      r?: unknown;
      ts?: unknown;
    };
    if (parsed.r !== "admin" || typeof parsed.e !== "string" || typeof parsed.ts !== "number") {
      return null;
    }
    if (Date.now() - parsed.ts > ADMIN_TTL_MS) return null;
    return parsed.e;
  } catch {
    return null;
  }
}

export function adminFromRequest(request: Request): string | null {
  const auth = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return verifyAdminToken(m?.[1] ?? null);
}

export interface AdminRow {
  email: string;
  nome: string;
  senha_hash: string;
  ultimo_login: string | null;
}

function normalizaEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function getAdmin(email: string): Promise<AdminRow | null> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("secretaria_admins")
    .select("email, nome, senha_hash, ultimo_login")
    .eq("email", normalizaEmail(email))
    .maybeSingle();
  return (data as AdminRow | null) ?? null;
}

/** Cria (ou redefine) o admin — exige o ADMIN_BOOTSTRAP_TOKEN correto. */
export async function bootstrapAdmin(input: {
  email: string;
  nome?: string;
  senha: string;
  token: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const esperado = (process.env.ADMIN_BOOTSTRAP_TOKEN ?? "").trim();
  if (!esperado) return { ok: false, reason: "bootstrap_desativado" };
  if (input.token.trim() !== esperado) return { ok: false, reason: "token_invalido" };

  const supabase = getSupabase();
  const { error } = await supabase.from("secretaria_admins").upsert(
    {
      email: normalizaEmail(input.email),
      nome: input.nome?.trim() || "Administrador",
      senha_hash: hashPassword(input.senha),
    },
    { onConflict: "email" },
  );
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

export type AdminLoginResult =
  | { ok: true; email: string; nome: string }
  | { ok: false; reason: "credenciais" };

export async function verifyAdminLogin(email: string, senha: string): Promise<AdminLoginResult> {
  const admin = await getAdmin(email);
  if (!admin) return { ok: false, reason: "credenciais" };
  if (!checkPassword(senha, admin.senha_hash)) return { ok: false, reason: "credenciais" };
  const supabase = getSupabase();
  await supabase
    .from("secretaria_admins")
    .update({ ultimo_login: new Date().toISOString() })
    .eq("email", admin.email);
  return { ok: true, email: admin.email, nome: admin.nome };
}

export async function changeAdminPassword(
  email: string,
  senhaAtual: string,
  novaSenha: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const admin = await getAdmin(email);
  if (!admin || !checkPassword(senhaAtual, admin.senha_hash)) {
    return { ok: false, reason: "credenciais" };
  }
  const supabase = getSupabase();
  const { error } = await supabase
    .from("secretaria_admins")
    .update({ senha_hash: hashPassword(novaSenha) })
    .eq("email", admin.email);
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}
