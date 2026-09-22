import crypto from "node:crypto";
import { getSupabase } from "../memory/supabase.js";
import { waIdVariants, type UsuarioRow } from "../memory/context.js";
import { resolveUsuarioAtivo } from "./codes.js";

/**
 * Senha da plataforma web. Login do dia a dia = número do WhatsApp + senha.
 * A senha é criada/redefinida por um fluxo verificado por OTP no WhatsApp
 * (ver codes.ts + api/app/auth/set-password), então só o dono do número define.
 *
 * Guardamos apenas o HASH (scrypt do Node — sem dependência externa), com salt
 * aleatório por senha. Tabela `secretaria_senhas` (uma linha por variante de
 * wa_id, igual aos tokens OAuth, pra tolerar o nono dígito).
 */

const MIN_SENHA = 8;
const MAX_FALHAS = 8; // tentativas erradas antes de bloquear
const BLOQUEIO_MS = 15 * 60 * 1000; // 15 min de bloqueio

/** Gera "scrypt:<saltB64>:<hashB64>" a partir da senha em texto. */
function hashPassword(senha: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(senha, salt, 64);
  return `scrypt:${salt.toString("base64")}:${hash.toString("base64")}`;
}

/** Confere a senha contra o hash guardado (comparação em tempo constante). */
function checkPassword(senha: string, stored: string): boolean {
  const [algo, saltB64, hashB64] = stored.split(":");
  if (algo !== "scrypt" || !saltB64 || !hashB64) return false;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  const actual = crypto.scryptSync(senha, salt, expected.length);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/** Regras mínimas da senha. Retorna null se ok, ou a mensagem de erro. */
export function validarSenha(senha: string): string | null {
  if (typeof senha !== "string" || senha.length < MIN_SENHA) {
    return `A senha precisa ter pelo menos ${MIN_SENHA} caracteres.`;
  }
  if (senha.length > 200) return "Senha longa demais.";
  return null;
}

/** Define/redefine a senha do usuário em TODAS as variantes de wa_id. */
export async function setPassword(userWa: string, senha: string): Promise<void> {
  const supabase = getSupabase();
  const senha_hash = hashPassword(senha);
  const now = new Date().toISOString();
  const rows = waIdVariants(userWa).map((wa) => ({
    user_wa: wa,
    senha_hash,
    falhas: 0,
    bloqueado_ate: null,
    updated_at: now,
  }));
  const { error } = await supabase
    .from("secretaria_senhas")
    .upsert(rows, { onConflict: "user_wa" });
  if (error) throw new Error(`Falha ao salvar senha: ${error.message}`);
}

/** Verdadeiro se o usuário já tem senha definida (qualquer variante). */
export async function temSenha(userWa: string): Promise<boolean> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("secretaria_senhas")
    .select("user_wa")
    .in("user_wa", waIdVariants(userWa))
    .limit(1);
  return Boolean(data && data.length > 0);
}

export type LoginResult =
  | { ok: true; usuario: UsuarioRow }
  | { ok: false; reason: "credenciais" | "sem_senha" | "bloqueado" };

/**
 * Verifica número + senha. Protege contra força bruta: após MAX_FALHAS erros,
 * bloqueia por BLOQUEIO_MS. Acerto zera o contador.
 */
export async function verifyLogin(input: string, senha: string): Promise<LoginResult> {
  const usuario = await resolveUsuarioAtivo(input);
  if (!usuario) return { ok: false, reason: "credenciais" }; // não revela se o número existe

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("secretaria_senhas")
    .select("user_wa, senha_hash, falhas, bloqueado_ate")
    .eq("user_wa", usuario.user_wa)
    .maybeSingle();
  if (error) throw new Error(`Falha ao ler senha: ${error.message}`);
  if (!data) return { ok: false, reason: "sem_senha" };

  if (data.bloqueado_ate && new Date(data.bloqueado_ate as string).getTime() > Date.now()) {
    return { ok: false, reason: "bloqueado" };
  }

  if (checkPassword(senha, String(data.senha_hash))) {
    if ((data.falhas as number) > 0) {
      await supabase
        .from("secretaria_senhas")
        .update({ falhas: 0, bloqueado_ate: null })
        .eq("user_wa", usuario.user_wa);
    }
    return { ok: true, usuario };
  }

  const falhas = (data.falhas as number) + 1;
  const bloqueado_ate =
    falhas >= MAX_FALHAS ? new Date(Date.now() + BLOQUEIO_MS).toISOString() : null;
  await supabase
    .from("secretaria_senhas")
    .update({ falhas, bloqueado_ate })
    .eq("user_wa", usuario.user_wa);
  return { ok: false, reason: bloqueado_ate ? "bloqueado" : "credenciais" };
}
