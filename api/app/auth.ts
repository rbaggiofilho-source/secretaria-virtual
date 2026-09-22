import { sessionFromRequest, signSession } from "../../src/auth/session.js";
import { requestLoginCode, verifyLoginCode } from "../../src/auth/codes.js";
import { verifyLogin, setPassword, validarSenha } from "../../src/auth/password.js";
import { getUsuario, type UsuarioRow } from "../../src/memory/context.js";
import { json, preflight, readJson } from "../../src/auth/http.js";

/**
 * Roteador único de AUTENTICAÇÃO do painel (`?acao=...`), para caber no limite
 * de funções serverless do plano Hobby da Vercel.
 *   GET  ?acao=session
 *   POST ?acao=login | request-code | set-password | change-password
 */

function usuarioPublico(u: UsuarioRow) {
  return { nome: u.nome, dono: u.dono, contextos: u.contextos, profissao: u.profissao };
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return preflight(request);
    const acao = new URL(request.url).searchParams.get("acao") ?? "";

    try {
      // ---- session (GET) ----
      if (request.method === "GET") {
        if (acao !== "session") return json(request, { error: "acao_desconhecida" }, 400);
        const wa = sessionFromRequest(request);
        if (!wa) return json(request, { ok: false }, 401);
        const usuario = await getUsuario(wa);
        if (!usuario || !usuario.ativo) return json(request, { ok: false }, 401);
        return json(request, { ok: true, usuario: usuarioPublico(usuario) });
      }

      if (request.method !== "POST") return json(request, { error: "method_not_allowed" }, 405);
      const body = await readJson(request);
      const whatsapp = typeof body.whatsapp === "string" ? body.whatsapp : "";

      // ---- login (número + senha) ----
      if (acao === "login") {
        const senha = typeof body.senha === "string" ? body.senha : "";
        if (!whatsapp.replace(/\D/g, "") || !senha) return json(request, { ok: false, error: "faltam_dados" }, 400);
        const r = await verifyLogin(whatsapp, senha);
        if (!r.ok) return json(request, { ok: false, error: r.reason }, r.reason === "bloqueado" ? 429 : 401);
        return json(request, { ok: true, token: signSession(r.usuario.user_wa), usuario: usuarioPublico(r.usuario) });
      }

      // ---- request-code (OTP para criar/redefinir senha) ----
      if (acao === "request-code") {
        if (!whatsapp.replace(/\D/g, "")) return json(request, { error: "numero_invalido" }, 400);
        const r = await requestLoginCode(whatsapp);
        if (r.ok) return json(request, { ok: true, nome: r.nome });
        if (r.reason === "muito_cedo") return json(request, { ok: false, error: "muito_cedo" }, 429);
        if (r.reason === "envio_falhou") return json(request, { ok: false, error: "envio_falhou" }, 502);
        return json(request, { ok: false, error: "nao_autorizado" }, 403);
      }

      // ---- set-password (com código do WhatsApp) ----
      if (acao === "set-password") {
        const code = typeof body.code === "string" ? body.code : "";
        const senha = typeof body.senha === "string" ? body.senha : "";
        if (!whatsapp || !code || !senha) return json(request, { error: "faltam_dados" }, 400);
        const problema = validarSenha(senha);
        if (problema) return json(request, { ok: false, error: "senha_fraca", detalhe: problema }, 400);
        const check = await verifyLoginCode(whatsapp, code);
        if (!check.ok) return json(request, { ok: false, error: check.reason }, check.reason === "nao_autorizado" ? 403 : 401);
        await setPassword(check.usuario.user_wa, senha);
        return json(request, { ok: true, token: signSession(check.usuario.user_wa), usuario: usuarioPublico(check.usuario) });
      }

      // ---- change-password (logado, exige senha atual) ----
      if (acao === "change-password") {
        const wa = sessionFromRequest(request);
        if (!wa) return json(request, { ok: false, error: "nao_autenticado" }, 401);
        const senhaAtual = typeof body.senhaAtual === "string" ? body.senhaAtual : "";
        const novaSenha = typeof body.novaSenha === "string" ? body.novaSenha : "";
        if (!senhaAtual || !novaSenha) return json(request, { error: "faltam_dados" }, 400);
        const problema = validarSenha(novaSenha);
        if (problema) return json(request, { ok: false, error: "senha_fraca", detalhe: problema }, 400);
        const r = await verifyLogin(wa, senhaAtual);
        if (!r.ok) {
          const reason = r.reason === "bloqueado" ? "bloqueado" : "senha_atual_incorreta";
          return json(request, { ok: false, error: reason }, r.reason === "bloqueado" ? 429 : 401);
        }
        await setPassword(r.usuario.user_wa, novaSenha);
        return json(request, { ok: true });
      }

      return json(request, { error: "acao_desconhecida" }, 400);
    } catch (err) {
      console.error(`[auth] router(${acao}):`, err instanceof Error ? err.message : err);
      return json(request, { error: "erro_interno" }, 500);
    }
  },
};
