import { getSupabase } from "../memory/supabase.js";
import { canonicalWa, getUsuarioVariantes, waIdVariants, type UsuarioRow } from "../memory/context.js";
import { signToken, verifyToken } from "./tokens.js";

/**
 * Sessão da plataforma web. Após o login (número + senha), o usuário recebe um
 * token assinado com finalidade "session" (ver ./tokens.ts) que carrega o wa_id
 * CANÔNICO e a VERSÃO da sessão. A versão mora em secretaria_senhas
 * (sessao_versao) e sobe a cada troca/redefinição de senha: todos os tokens
 * antigos deixam de valer (revogação). Cada requisição também confere se o
 * usuário continua ATIVO — conta desativada/excluída perde o acesso na hora.
 */

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

/** Emite um token de sessão para o wa_id (após validar a senha). */
export function signSession(waId: string, versao: number): string {
  return signToken("session", { wa: canonicalWa(waId), v: versao });
}

/** Verifica só a assinatura/validade (sem banco). Retorna { wa, v } ou null. */
export function verifySession(token: string | null | undefined): { wa: string; v: number } | null {
  const p = verifyToken("session", token, SESSION_TTL_MS);
  if (!p || typeof p.wa !== "string" || typeof p.v !== "number") return null;
  return { wa: p.wa, v: p.v };
}

function tokenDaRequisicao(request: Request): string | null {
  const auth = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return m?.[1] ?? null;
}

/** Versão atual da sessão do usuário (null se ele não tem senha cadastrada). */
export async function versaoSessao(waId: string): Promise<number | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("secretaria_senhas")
    .select("sessao_versao")
    .in("user_wa", waIdVariants(waId));
  if (error) throw new Error(`Falha ao ler versão da sessão: ${error.message}`);
  if (!data || data.length === 0) return null;
  return Math.max(...data.map((r) => Number((r as { sessao_versao: number }).sessao_versao) || 0));
}

/**
 * Autentica a requisição: token válido + versão atual + usuário ativo.
 * Retorna o wa_id canônico (chave dos dados) e a linha do usuário, ou null.
 */
export async function autenticar(
  request: Request,
): Promise<{ wa: string; usuario: UsuarioRow } | null> {
  const s = verifySession(tokenDaRequisicao(request));
  if (!s) return null;
  const [versao, usuario] = await Promise.all([versaoSessao(s.wa), getUsuarioVariantes(s.wa)]);
  if (versao === null || versao !== s.v) return null;
  if (!usuario || !usuario.ativo) return null;
  return { wa: s.wa, usuario };
}
