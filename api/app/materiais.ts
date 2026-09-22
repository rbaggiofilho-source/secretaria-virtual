import { sessionFromRequest } from "../../src/auth/session.js";
import { consultarMateriais, type MaterialStatus } from "../../src/memory/context.js";
import { json, preflight } from "../../src/auth/http.js";

/** GET /api/app/materiais?obra=&status= (Bearer) — materiais/compras do usuário. */
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return preflight(request);
    if (request.method !== "GET") return json(request, { error: "method_not_allowed" }, 405);
    const wa = sessionFromRequest(request);
    if (!wa) return json(request, { ok: false, error: "nao_autenticado" }, 401);
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    try {
      const materiais = await consultarMateriais(wa, {
        obra: url.searchParams.get("obra"),
        status: (status as MaterialStatus | null) || null,
      });
      return json(request, { ok: true, materiais });
    } catch (err) {
      console.error("[app] materiais:", err instanceof Error ? err.message : err);
      return json(request, { error: "erro_interno" }, 500);
    }
  },
};
