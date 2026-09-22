import { sessionFromRequest } from "../../src/auth/session.js";
import { relatorioCustos } from "../../src/memory/context.js";
import { json, preflight } from "../../src/auth/http.js";

/** GET /api/app/custos?obra=&desde=&ate= (Bearer) — relatório de custos. */
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return preflight(request);
    if (request.method !== "GET") return json(request, { error: "method_not_allowed" }, 405);
    const wa = sessionFromRequest(request);
    if (!wa) return json(request, { ok: false, error: "nao_autenticado" }, 401);
    const url = new URL(request.url);
    try {
      const rel = await relatorioCustos(wa, {
        obra: url.searchParams.get("obra"),
        desde: url.searchParams.get("desde"),
        ate: url.searchParams.get("ate"),
      });
      return json(request, { ok: true, ...rel });
    } catch (err) {
      console.error("[app] custos:", err instanceof Error ? err.message : err);
      return json(request, { error: "erro_interno" }, 500);
    }
  },
};
