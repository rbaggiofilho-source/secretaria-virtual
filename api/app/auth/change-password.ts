import { sessionFromRequest } from "../../../src/auth/session.js";
import { setPassword, validarSenha, verifyLogin } from "../../../src/auth/password.js";
import { json, preflight, readJson } from "../../../src/auth/http.js";

/**
 * POST /api/app/auth/change-password  { senhaAtual, novaSenha }  (Bearer)
 * Troca a senha estando logado. Exige a senha ATUAL (evita que uma sessão
 * sequestrada troque a senha e tranque o dono).
 */
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return preflight(request);
    if (request.method !== "POST") return json(request, { error: "method_not_allowed" }, 405);
    const wa = sessionFromRequest(request);
    if (!wa) return json(request, { ok: false, error: "nao_autenticado" }, 401);

    const body = await readJson(request);
    const senhaAtual = typeof body.senhaAtual === "string" ? body.senhaAtual : "";
    const novaSenha = typeof body.novaSenha === "string" ? body.novaSenha : "";
    if (!senhaAtual || !novaSenha) return json(request, { error: "faltam_dados" }, 400);

    const problema = validarSenha(novaSenha);
    if (problema) return json(request, { ok: false, error: "senha_fraca", detalhe: problema }, 400);

    try {
      const check = await verifyLogin(wa, senhaAtual);
      if (!check.ok) {
        // senha atual errada / bloqueado / sem senha
        const reason = check.reason === "bloqueado" ? "bloqueado" : "senha_atual_incorreta";
        return json(request, { ok: false, error: reason }, check.reason === "bloqueado" ? 429 : 401);
      }
      await setPassword(check.usuario.user_wa, novaSenha);
      return json(request, { ok: true });
    } catch (err) {
      console.error("[auth] change-password:", err instanceof Error ? err.message : err);
      return json(request, { error: "erro_interno" }, 500);
    }
  },
};
