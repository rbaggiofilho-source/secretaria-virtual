import { verifyLoginCode } from "../../../src/auth/codes.js";
import { signSession } from "../../../src/auth/session.js";
import { json, preflight, readJson } from "../../../src/auth/http.js";

/**
 * POST /api/app/auth/verify-code  { whatsapp, code }
 * Confere o código. Se bater, devolve o token de sessão (crachá) + dados
 * básicos do usuário para a tela montar o cabeçalho.
 */
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return preflight(request);
    if (request.method !== "POST") return json(request, { error: "method_not_allowed" }, 405);

    const body = await readJson(request);
    const whatsapp = typeof body.whatsapp === "string" ? body.whatsapp : "";
    const code = typeof body.code === "string" ? body.code : "";
    if (!whatsapp || !code) return json(request, { error: "faltam_dados" }, 400);

    try {
      const result = await verifyLoginCode(whatsapp, code);
      if (!result.ok) {
        const status = result.reason === "nao_autorizado" ? 403 : 401;
        return json(request, { ok: false, error: result.reason }, status);
      }

      const { usuario } = result;
      return json(request, {
        ok: true,
        token: signSession(usuario.user_wa),
        usuario: {
          nome: usuario.nome,
          dono: usuario.dono,
          contextos: usuario.contextos,
          profissao: usuario.profissao,
        },
      });
    } catch (err) {
      console.error("[auth] verify-code:", err instanceof Error ? err.message : err);
      return json(request, { error: "erro_interno" }, 500);
    }
  },
};
