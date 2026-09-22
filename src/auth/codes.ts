import crypto from "node:crypto";
import { getSupabase } from "../memory/supabase.js";
import { canonicalWa, getUsuario, waIdVariants, type UsuarioRow } from "../memory/context.js";
import { sendTextMessage } from "../whatsapp/client.js";
import { consumirLimite } from "./ratelimit.js";
import { hmacB64, iguaisSeguro } from "./tokens.js";

/**
 * Login por código no WhatsApp (OTP). Fluxo:
 *   1) requestLoginCode(numero): confere que o número é um usuário AUTORIZADO
 *      e ATIVO (secretaria_usuarios), gera um código de 6 dígitos, guarda só o
 *      HASH (nunca o código puro) com validade curta e manda o código pela
 *      Rosana no WhatsApp.
 *   2) verifyLoginCode(numero, codigo): confere hash + validade + tentativas e,
 *      se bater, CONSOME o código (uso único) e devolve o usuário.
 *
 * A tabela secretaria_auth_codes tem PK = user_wa (um código ativo por pessoa;
 * pedir de novo substitui o anterior).
 */

const CODE_TTL_MS = 10 * 60 * 1000; // 10 min de validade
const RESEND_COOLDOWN_MS = 60 * 1000; // 1 min entre reenvios
const MAX_ATTEMPTS = 5; // tentativas erradas antes de invalidar
const MAX_CODIGOS_DIA = 5; // códigos enviados por número em 24h
const MAX_TENTATIVAS_DIA = 15; // tentativas de código por número em 24h
const DIA_MS = 24 * 60 * 60 * 1000;

export type RequestResult =
  | { ok: true; nome: string }
  | { ok: false; reason: "nao_autorizado" | "muito_cedo" | "limite_diario" | "envio_falhou" };

export type VerifyResult =
  | { ok: true; usuario: UsuarioRow }
  | {
      ok: false;
      reason: "nao_autorizado" | "sem_codigo" | "expirado" | "excedeu" | "invalido" | "limite_diario";
    };

/** Hash do código atrelado ao wa_id (nunca guardamos o código puro). */
function hashCode(waId: string, code: string): string {
  // Chave derivada própria do OTP (separada da sessão e do state do OAuth).
  return hmacB64("otp", `${waId}:${code}`);
}

/**
 * Resolve o usuário autorizado ATIVO a partir do número digitado, tolerando as
 * variantes do nono dígito. Retorna a linha (com o user_wa canônico) ou null.
 */
/**
 * Candidatos de wa_id a partir do que o usuário digitou, sendo TOLERANTE ao
 * formato: aceita com/sem código do país 55 e com/sem o nono dígito. Assim a
 * pessoa pode digitar "(48) 98808-8057" (sem o 55) e ainda casar com o número
 * salvo no formato da Meta ("554888088057"). Usado só na resolução de login —
 * não afeta a gravação (cadastro/tokens continuam usando waIdVariants).
 */
function candidatosWa(input: string): string[] {
  const d = input.replace(/\D/g, "");
  const bases = new Set<string>();
  if (d) bases.add(d);
  // Número BR sem código do país (10 = fixo/sem 9; 11 = com 9): tenta com 55.
  if ((d.length === 10 || d.length === 11) && !d.startsWith("55")) bases.add("55" + d);
  const out = new Set<string>();
  for (const b of bases) for (const v of waIdVariants(b)) out.add(v);
  return [...out];
}

export async function resolveUsuarioAtivo(input: string): Promise<UsuarioRow | null> {
  for (const wa of candidatosWa(input)) {
    const u = await getUsuario(wa);
    if (u && u.ativo) return u;
  }
  return null;
}

/** Gera e envia um código de login para o número, se ele for autorizado. */
export async function requestLoginCode(input: string): Promise<RequestResult> {
  const usuario = await resolveUsuarioAtivo(input);
  if (!usuario) return { ok: false, reason: "nao_autorizado" };
  const wa = canonicalWa(usuario.user_wa);

  const supabase = getSupabase();

  // Cooldown de reenvio: evita spam no WhatsApp.
  const { data: existing } = await supabase
    .from("secretaria_auth_codes")
    .select("last_sent_at")
    .eq("user_wa", wa)
    .maybeSingle();
  if (existing?.last_sent_at) {
    const since = Date.now() - new Date(existing.last_sent_at as string).getTime();
    if (since < RESEND_COOLDOWN_MS) return { ok: false, reason: "muito_cedo" };
  }
  // Teto diário: sem ele, dava para pedir um código novo por minuto e somar
  // ~7.000 palpites/dia (5 por código).
  if (!(await consumirLimite(`otp_envio:${wa}`, MAX_CODIGOS_DIA, DIA_MS))) {
    return { ok: false, reason: "limite_diario" };
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const now = new Date();
  const { error } = await supabase.from("secretaria_auth_codes").upsert(
    {
      user_wa: wa,
      code_hash: hashCode(wa, code),
      expires_at: new Date(now.getTime() + CODE_TTL_MS).toISOString(),
      attempts: 0,
      last_sent_at: now.toISOString(),
    },
    { onConflict: "user_wa" },
  );
  if (error) throw new Error(`Falha ao gravar código de login: ${error.message}`);

  try {
    // Responde ao número como cadastrado (a Meta entrega na forma sem o 9).
    await sendTextMessage(
      wa,
      `Seu código de acesso ao painel da Rosana é ${code}.\n\n` +
        `Ele vale por 10 minutos. Se não foi você que pediu, ignore esta mensagem — ninguém entra sem o código.`,
    );
  } catch (err) {
    console.error(
      `[auth] falha ao enviar código: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { ok: false, reason: "envio_falhou" };
  }

  return { ok: true, nome: usuario.nome };
}

/**
 * Verifica o código digitado. Em caso de acerto, consome-o (uso único).
 *
 * A tentativa é RESERVADA antes da comparação, com update condicional
 * (attempts = n → n+1): requisições simultâneas não conseguem usar a mesma
 * "vaga", então uma rajada paralela não fura o limite de 5 tentativas (antes
 * era ler → comparar → gravar, e 1000 requisições juntas liam attempts=0).
 */
export async function verifyLoginCode(input: string, code: string): Promise<VerifyResult> {
  const usuario = await resolveUsuarioAtivo(input);
  if (!usuario) return { ok: false, reason: "nao_autorizado" };
  const wa = canonicalWa(usuario.user_wa);

  if (!(await consumirLimite(`otp_tentativa:${wa}`, MAX_TENTATIVAS_DIA, DIA_MS))) {
    return { ok: false, reason: "limite_diario" };
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("secretaria_auth_codes")
    .select("code_hash, expires_at, attempts")
    .eq("user_wa", wa)
    .maybeSingle();
  if (error) throw new Error(`Falha ao ler código de login: ${error.message}`);
  if (!data) return { ok: false, reason: "sem_codigo" };

  if (new Date(data.expires_at as string).getTime() < Date.now()) {
    await supabase.from("secretaria_auth_codes").delete().eq("user_wa", wa);
    return { ok: false, reason: "expirado" };
  }
  const tentativas = data.attempts as number;
  if (tentativas >= MAX_ATTEMPTS) {
    await supabase.from("secretaria_auth_codes").delete().eq("user_wa", wa);
    return { ok: false, reason: "excedeu" };
  }

  // Reserva a tentativa (atômico). Se outra requisição levou a vaga, nega.
  const { data: reservado, error: rErr } = await supabase
    .from("secretaria_auth_codes")
    .update({ attempts: tentativas + 1 })
    .eq("user_wa", wa)
    .eq("attempts", tentativas)
    .select("user_wa");
  if (rErr) throw new Error(`Falha ao registrar tentativa: ${rErr.message}`);
  if (!reservado || reservado.length === 0) return { ok: false, reason: "invalido" };

  const provided = hashCode(wa, (code ?? "").replace(/\D/g, ""));
  if (!iguaisSeguro(provided, String(data.code_hash))) return { ok: false, reason: "invalido" };

  // Acertou: consome o código (uso único). Se já tinha sido consumido por uma
  // requisição concorrente, não vale de novo.
  const { data: apagado } = await supabase
    .from("secretaria_auth_codes")
    .delete()
    .eq("user_wa", wa)
    .eq("code_hash", String(data.code_hash))
    .select("user_wa");
  if (!apagado || apagado.length === 0) return { ok: false, reason: "sem_codigo" };
  return { ok: true, usuario };
}
