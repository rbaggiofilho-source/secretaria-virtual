import { verifyLoginCode } from "../../../src/auth/codes.js";
import { setPassword, validarSenha } from "../../../src/auth/password.js";
import { signSession } from "../../../src/auth/session.js";
import { json, preflight, readJson } from "../../../src/auth/http.js";

/**
 * POST /api/app/auth/set-password  { whatsapp, code, senha }
 * Cria (1º acesso) ou redefine (esqueci a senha) a senha. Exige o código
 * enviado no WhatsApp (prova de posse do número, via /api/app/auth/request-code).
 * Em caso de sucesso, consome o código, grava a senha e já devolve a sessão.
 */
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return preflight(request);
    if (request.method !== "POST") return json(request, { error: "method_not_allowed" }, 405);

    const body = await readJson(request);
    const whatsapp = typeof body.whatsapp === "string" ? body.whatsapp : "";
    const code = typeof body.code === "string" ? body.code : "";
    const senha = typeof body.senha === "string" ? body.senha : "";
    if (!whatsapp || !code || !senha) return json(request, { error: "faltam_dados" }, 400);

    const problema = validarSenha(senha);
    if (problema) return json(request, { ok: false, error: "senha_fraca", detalhe: problema }, 400);

    try {
      const check = await verifyLoginCode(whatsapp, code);
      if (!check.ok) {
        const status = check.reason === "nao_autorizado" ? 403 : 401;
        return json(request, { ok: false, error: check.reason }, status);
      }

      const { usuario } = check;
      await setPassword(usuario.user_wa, senha);
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
      console.error("[auth] set-password:", err instanceof Error ? err.message : err);
      return json(request, { error: "erro_interno" }, 500);
    }
  },
};
