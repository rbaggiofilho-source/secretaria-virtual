import crypto from "node:crypto";
import { getSupabase } from "../memory/supabase.js";
import { getEnv } from "../config/env.js";
import { getUsuario, waIdVariants, type UsuarioRow } from "../memory/context.js";
import { sendTextMessage } from "../whatsapp/client.js";

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

export type RequestResult =
  | { ok: true; nome: string }
  | { ok: false; reason: "nao_autorizado" | "muito_cedo" | "envio_falhou" };

export type VerifyResult =
  | { ok: true; usuario: UsuarioRow }
  | { ok: false; reason: "nao_autorizado" | "sem_codigo" | "expirado" | "excedeu" | "invalido" };

/** Hash do código atrelado ao wa_id (nunca guardamos o código puro). */
function hashCode(waId: string, code: string): string {
  return crypto
    .createHmac("sha256", getEnv().WHATSAPP_APP_SECRET)
    .update(`${waId}:${code}`)
    .digest("base64url");
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
  const out = new Set<string>();
  if (!d) return [];
  out.add(d);

  // Descobre a parte NACIONAL (DDD + local), removendo o 55 se veio junto.
  let nac = d;
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) nac = d.slice(2);

  // nac válido = DDD(2) + local (8 sem o nono dígito, ou 9 com ele). A partir dele
  // geramos TODAS as formas: nacional/internacional × com/sem o nono dígito. Assim
  // "5548988088057", "48988088057" e "4888088057" caem todos no mesmo usuário.
  if (nac.length === 10 || nac.length === 11) {
    const ddd = nac.slice(0, 2);
    const local = nac.slice(2);
    const locais = new Set<string>([local]);
    if (local.length === 9 && local[0] === "9") locais.add(local.slice(1)); // tira o 9
    if (local.length === 8) locais.add("9" + local); // põe o 9
    for (const l of locais) {
      out.add(ddd + l); // nacional (sem 55)
      out.add("55" + ddd + l); // internacional (com 55)
    }
  }

  // Rede de segurança: passa o que foi digitado pelas variantes oficiais também.
  for (const v of waIdVariants(d)) out.add(v);
  return [...out];
}

export async function resolveUsuarioAtivo(input: string): Promise<UsuarioRow | null> {
  for (const wa of candidatosWa(input)) {
    const u = await getUsuario(wa);
    if (u && u.ativo) return u;
  }
  return null;
}

/**
 * Escolhe PRA QUAL variante do wa_id mandar o OTP. A pessoa pode estar cadastrada
 * em duas formas (com/sem o nono dígito) e a Meta só ENTREGA numa delas — mandar
 * pra errada dá 200 mas não chega (armadilha do nono dígito). Então preferimos a
 * variante com mensagem recebida mais recente (prova de que entrega E está na
 * janela de 24h). Sem histórico, cai na própria user_wa.
 */
async function destinoDeEntrega(userWa: string): Promise<string> {
  const variantes = waIdVariants(userWa);
  if (variantes.length <= 1) return userWa;
  try {
    const supabase = getSupabase();
    const { data } = await supabase
      .from("secretaria_conversations")
      .select("user_wa, created_at")
      .in("user_wa", variantes)
      .eq("role", "user")
      .order("created_at", { ascending: false })
      .limit(1);
    const melhor = (data?.[0] as { user_wa: string } | undefined)?.user_wa;
    return melhor ?? userWa;
  } catch {
    return userWa;
  }
}

/** Gera e envia um código de login para o número, se ele for autorizado. */
export async function requestLoginCode(input: string): Promise<RequestResult> {
  const usuario = await resolveUsuarioAtivo(input);
  if (!usuario) return { ok: false, reason: "nao_autorizado" };

  const supabase = getSupabase();

  // Cooldown de reenvio: evita spam no WhatsApp.
  const { data: existing } = await supabase
    .from("secretaria_auth_codes")
    .select("last_sent_at")
    .eq("user_wa", usuario.user_wa)
    .maybeSingle();
  if (existing?.last_sent_at) {
    const since = Date.now() - new Date(existing.last_sent_at as string).getTime();
    if (since < RESEND_COOLDOWN_MS) return { ok: false, reason: "muito_cedo" };
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const now = new Date();
  const { error } = await supabase.from("secretaria_auth_codes").upsert(
    {
      user_wa: usuario.user_wa,
      code_hash: hashCode(usuario.user_wa, code),
      expires_at: new Date(now.getTime() + CODE_TTL_MS).toISOString(),
      attempts: 0,
      last_sent_at: now.toISOString(),
    },
    { onConflict: "user_wa" },
  );
  if (error) throw new Error(`Falha ao gravar código de login: ${error.message}`);

  try {
    await sendTextMessage(
      await destinoDeEntrega(usuario.user_wa),
      `Seu código de acesso ao painel da Rosana é ${code}.\n\n` +
        `Ele vale por 10 minutos. Se não foi você que pediu, ignore esta mensagem — ninguém entra sem o código.`,
    );
  } catch (err) {
    console.error(
      `[auth] falha ao enviar código para ${usuario.user_wa}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { ok: false, reason: "envio_falhou" };
  }

  return { ok: true, nome: usuario.nome };
}

/** Verifica o código digitado. Em caso de acerto, consome-o (uso único). */
export async function verifyLoginCode(input: string, code: string): Promise<VerifyResult> {
  const usuario = await resolveUsuarioAtivo(input);
  if (!usuario) return { ok: false, reason: "nao_autorizado" };

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("secretaria_auth_codes")
    .select("code_hash, expires_at, attempts")
    .eq("user_wa", usuario.user_wa)
    .maybeSingle();
  if (error) throw new Error(`Falha ao ler código de login: ${error.message}`);
  if (!data) return { ok: false, reason: "sem_codigo" };

  if (new Date(data.expires_at as string).getTime() < Date.now()) {
    await supabase.from("secretaria_auth_codes").delete().eq("user_wa", usuario.user_wa);
    return { ok: false, reason: "expirado" };
  }
  if ((data.attempts as number) >= MAX_ATTEMPTS) {
    await supabase.from("secretaria_auth_codes").delete().eq("user_wa", usuario.user_wa);
    return { ok: false, reason: "excedeu" };
  }

  const provided = hashCode(usuario.user_wa, (code ?? "").replace(/\D/g, ""));
  const a = Buffer.from(provided);
  const b = Buffer.from(String(data.code_hash));
  const match = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!match) {
    await supabase
      .from("secretaria_auth_codes")
      .update({ attempts: (data.attempts as number) + 1 })
      .eq("user_wa", usuario.user_wa);
    return { ok: false, reason: "invalido" };
  }

  // Acertou: consome o código (uso único).
  await supabase.from("secretaria_auth_codes").delete().eq("user_wa", usuario.user_wa);
  return { ok: true, usuario };
}
