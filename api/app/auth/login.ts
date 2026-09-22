import { verifyLogin } from "../../../src/auth/password.js";
import { signSession } from "../../../src/auth/session.js";
import { json, preflight, readJson } from "../../../src/auth/http.js";

/**
 * POST /api/app/auth/login  { whatsapp, senha }
 * Login por número do WhatsApp + senha. Devolve o token de sessão + usuário.
 * Se o usuário existe mas ainda não criou senha, responde 'sem_senha' (a tela
 * oferece criar a senha via código no WhatsApp).
 */
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return preflight(request);
    if (request.method !== "POST") return json(request, { error: "method_not_allowed" }, 405);

    const body = await readJson(request);
    const whatsapp = typeof body.whatsapp === "string" ? body.whatsapp : "";
    const senha = typeof body.senha === "string" ? body.senha : "";
    if (!whatsapp.replace(/\D/g, "") || !senha) {
      return json(request, { ok: false, error: "faltam_dados" }, 400);
    }

    try {
      const result = await verifyLogin(whatsapp, senha);
      if (!result.ok) {
        const status = result.reason === "bloqueado" ? 429 : 401;
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
      console.error("[auth] login:", err instanceof Error ? err.message : err);
      return json(request, { error: "erro_interno" }, 500);
    }
  },
};
