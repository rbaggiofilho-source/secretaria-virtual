import crypto from "node:crypto";
import { Buffer } from "node:buffer";

/**
 * Hashing de senha reutilizável (scrypt do Node, sem dependência externa).
 * Formato: "scrypt:<saltB64>:<hashB64>". Usado pelo login do painel e pelo
 * admin. Comparação em tempo constante.
 */

const MIN_SENHA = 8;

export function hashPassword(senha: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(senha, salt, 64);
  return `scrypt:${salt.toString("base64")}:${hash.toString("base64")}`;
}

export function checkPassword(senha: string, stored: string): boolean {
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
