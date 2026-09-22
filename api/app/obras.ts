import { sessionFromRequest } from "../../src/auth/session.js";
import { buildObras } from "../../src/app/obras.js";
import { json, preflight } from "../../src/auth/http.js";

/** GET /api/app/obras (Bearer) — lista consolidada de obras do usuário. */
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return preflight(request);
    if (request.method !== "GET") return json(request, { error: "method_not_allowed" }, 405);
    const wa = sessionFromRequest(request);
    if (!wa) return json(request, { ok: false, error: "nao_autenticado" }, 401);
    try {
      return json(request, { ok: true, obras: await buildObras(wa) });
    } catch (err) {
      console.error("[app] obras:", err instanceof Error ? err.message : err);
      return json(request, { error: "erro_interno" }, 500);
    }
  },
};
