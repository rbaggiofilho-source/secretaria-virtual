import { sessionFromRequest } from "../../src/auth/session.js";
import { consultarRDO } from "../../src/memory/context.js";
import { json, preflight } from "../../src/auth/http.js";

/** GET /api/app/rdo?obra= (Bearer) — Diários de Obra do usuário. */
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return preflight(request);
    if (request.method !== "GET") return json(request, { error: "method_not_allowed" }, 405);
    const wa = sessionFromRequest(request);
    if (!wa) return json(request, { ok: false, error: "nao_autenticado" }, 401);
    const url = new URL(request.url);
    try {
      const rdos = await consultarRDO(wa, { obra: url.searchParams.get("obra") });
      return json(request, { ok: true, rdos });
    } catch (err) {
      console.error("[app] rdo:", err instanceof Error ? err.message : err);
      return json(request, { error: "erro_interno" }, 500);
    }
  },
};
