import { sessionFromRequest } from "../../src/auth/session.js";
import { buildDashboard } from "../../src/app/dashboard.js";
import { getEnv } from "../../src/config/env.js";
import { json, preflight } from "../../src/auth/http.js";

/**
 * GET /api/app/dashboard  (Authorization: Bearer <token>)
 * Devolve o panorama REAL do usuário logado (custos, obras, RDOs, prazos).
 * Todo o escopo por user_wa é resolvido no SERVIDOR a partir do token — o
 * cliente nunca escolhe de quem são os dados.
 */
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return preflight(request);
    if (request.method !== "GET") return json(request, { error: "method_not_allowed" }, 405);

    const wa = sessionFromRequest(request);
    if (!wa) return json(request, { ok: false, error: "nao_autenticado" }, 401);

    try {
      const data = await buildDashboard(wa, getEnv().TIMEZONE);
      return json(request, { ok: true, data });
    } catch (err) {
      console.error("[app] dashboard:", err instanceof Error ? err.message : err);
      return json(request, { error: "erro_interno" }, 500);
    }
  },
};
