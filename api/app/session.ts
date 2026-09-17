import { sessionFromRequest } from "../../src/auth/session.js";
import { getUsuario } from "../../src/memory/context.js";
import { json, preflight } from "../../src/auth/http.js";

/**
 * GET /api/app/session  (Authorization: Bearer <token>)
 * Confirma se a sessão é válida e devolve os dados básicos do usuário. A tela
 * chama isto ao carregar para saber se já está logada.
 */
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return preflight(request);
    if (request.method !== "GET") return json(request, { error: "method_not_allowed" }, 405);

    const wa = sessionFromRequest(request);
    if (!wa) return json(request, { ok: false }, 401);

    try {
      const usuario = await getUsuario(wa);
      if (!usuario || !usuario.ativo) return json(request, { ok: false }, 401);
      return json(request, {
        ok: true,
        usuario: {
          nome: usuario.nome,
          dono: usuario.dono,
          contextos: usuario.contextos,
          profissao: usuario.profissao,
        },
      });
    } catch (err) {
      console.error("[auth] session:", err instanceof Error ? err.message : err);
      return json(request, { error: "erro_interno" }, 500);
    }
  },
};
